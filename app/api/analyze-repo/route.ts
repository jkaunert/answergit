import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchDirectoryContents, fetchFileContent } from "@/lib/github";
import { checkDocumentProcessed, combineAndStoreDocument, storeDocumentEmbeddings } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const MAX_CHUNK_SIZE = 1000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// File extensions to exclude from analysis
const EXCLUDED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz', '.lock'
];

// Directories to exclude from analysis
const EXCLUDED_DIRECTORIES = [
  'node_modules', '.git', '.github', 'dist', 'build', '.next', 'public/assets',
  'coverage', '.vscode', '.idea'
];

export async function POST(req: NextRequest) {
  try {
    const { username, repo } = await req.json();
    const repoId = `${username}/${repo}`;

    // Set a longer timeout for Vercel
    req.signal.addEventListener('abort', () => {
      throw new Error('Request aborted due to timeout');
    });

    // Check if repository has already been processed
    const isProcessed = await checkDocumentProcessed(repoId);
    if (isProcessed) {
      return NextResponse.json({
        success: true,
        message: 'Repository has already been analyzed'
      });
    }

    // Configure rate limiting
    const rateLimitDelay = 100; // ms between requests
    const maxConcurrentRequests = 3;
    let activeRequests = 0;

    logger.repoAnalysis.start(repoId);

    // 1. Fetch repository structure
    logger.info('Fetching repository structure...', { prefix: 'Analysis' });
    const files = await fetchDirectoryContents(username, repo, '');
    logger.repoAnalysis.fileDiscovered(files.length);
    
    // 2. Filter files to analyze (exclude binary files, assets, etc.)
    const filesToAnalyze = filterRelevantFiles(files);
    logger.repoAnalysis.relevantFiles(filesToAnalyze.length);
    
    // 3. Fetch content of relevant files with batching and retries
    logger.info('Fetching content of relevant files...', { prefix: 'Analysis' });
    const fileContents = [];
    const batchSize = 5; // Process 5 files at a time
    const maxRetries = 3;

    for (let i = 0; i < Math.min(filesToAnalyze.length, 20); i += batchSize) {
      const batch = filesToAnalyze.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          for (let retry = 0; retry < maxRetries; retry++) {
            try {
              const content = await fetchFileContent(file.path, username, repo);
              logger.info(`Successfully fetched ${file.path}`, { prefix: 'Analysis' });
              return `File: ${file.path}\n${content}`;
            } catch (error) {
              if (retry === maxRetries - 1) {
                logger.repoAnalysis.error(file.path, error instanceof Error ? error.message : 'Unknown error');
                return '';
              }
              // Exponential backoff
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, retry) * 1000));
            }
          }
          return '';
        })
      );
      fileContents.push(...batchResults.filter(Boolean));
      
      // Add delay between batches to avoid rate limits
      if (i + batchSize < filesToAnalyze.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 4. Prepare context for Gemini
    const context = `Repository: ${username}/${repo}\n\n` +
      'Repository structure:\n' +
      generateFileTree(files) + '\n\n' +
      'Repository contents:\n\n' +
      fileContents.filter(Boolean).join('\n\n');

    // 5. Generate repository summary using Gemini
    const prompt = `You are an AI assistant analyzing a GitHub repository.\n\n` +
      `Context:\n${context}\n\n` +
      `Task: Provide a comprehensive summary of this repository. Include:\n` +
      `1. What is the purpose of this project?\n` +
      `2. What technologies/frameworks does it use?\n` +
      `3. What is the architecture/structure of the codebase?\n` +
      `4. What are the key components and how do they interact?\n` +
      `5. Any notable patterns or best practices used?\n\n` +
      `Format your response in markdown with appropriate headings and bullet points.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2, // Lower temperature for more factual responses
        maxOutputTokens: 2048,
      }
    });

    const response = await result.response.text();

    // Process files for RAG
    logger.info('Starting vector embedding generation and storage...', { prefix: 'Embeddings' });
    const processedFiles = [];
    const errors = [];

    for (const file of filesToAnalyze.slice(0, 20)) {
      try {
        const content = await fetchFileContent(file.path, username, repo);
        if (!content) continue;

        // Split content into chunks
        const chunks = chunkContent(content);
        const fileChunks = [];

        // Prepare chunks with metadata
        for (let i = 0; i < chunks.length; i++) {
          fileChunks.push({
            content: chunks[i],
            metadata: {
              repo,
              owner: username,
              filePath: file.path,
              fileType: file.type
            }
          });
        }

        // Combine and store chunks as a single document
        const documentId = `${repoId}/${file.path}`;
        await combineAndStoreDocument(documentId, fileChunks);
        logger.embeddings.stored(documentId);

        processedFiles.push({
          path: file.path,
          chunksProcessed: chunks.length
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.repoAnalysis.error(file.path, errorMessage);
        errors.push({
          path: file.path,
          error: errorMessage
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: response,
      processedFiles,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error("Error analyzing repository: " + (error instanceof Error ? error.message : 'Unknown error'));
    return NextResponse.json(
      {
        success: false,
        error: `Failed to analyze repository: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      {
        status: 500
      }
    );
  }
}

// Helper function to filter relevant files for analysis
function filterRelevantFiles(files: any[], currentPath = '') {
  let relevantFiles: any[] = [];
  
  for (const file of files) {
    const path = currentPath ? `${currentPath}/${file.name}` : file.name;
    
    if (file.type === 'directory') {
      // Skip excluded directories
      if (EXCLUDED_DIRECTORIES.some(dir => path.includes(dir))) {
        continue;
      }
      
      // Recursively process subdirectories
      if (file.children) {
        relevantFiles = [...relevantFiles, ...filterRelevantFiles(file.children, path)];
      }
    } else if (file.type === 'file') {
      // Skip excluded file extensions
      if (EXCLUDED_EXTENSIONS.some(ext => file.name.endsWith(ext))) {
        continue;
      }
      
      // Prioritize important files
      const isPriority = [
        'package.json', 'tsconfig.json', 'README.md', 'next.config.js', 'next.config.mjs',
        'app/layout.tsx', 'app/page.tsx', 'index.ts', 'index.tsx', 'main.ts', 'main.tsx'
      ].includes(file.name);
      
      relevantFiles.push({
        ...file,
        priority: isPriority ? 1 : 0
      });
    }
  }
  
  // Sort by priority (important files first)
  return relevantFiles.sort((a, b) => b.priority - a.priority);
}

// Helper function to generate a text representation of the file tree
function generateFileTree(files: any[], indent = '') {
  let result = '';
  
  for (const file of files) {
    if (file.type === 'directory') {
      // Skip excluded directories
      if (EXCLUDED_DIRECTORIES.some(dir => file.name.includes(dir))) {
        continue;
      }
      
      result += `${indent}📁 ${file.name}/\n`;
      
      if (file.children) {
        result += generateFileTree(file.children, indent + '  ');
      }
    } else {
      // Skip excluded file extensions
      if (EXCLUDED_EXTENSIONS.some(ext => file.name.endsWith(ext))) {
        continue;
      }
      
      result += `${indent}📄 ${file.name}\n`;
    }
  }
  
  return result;
}

// Helper function to chunk text content
function chunkContent(content: string, maxChunkSize: number = MAX_CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  const sentences = content.split(/(?<=[.!?])\s+/);
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxChunkSize) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}