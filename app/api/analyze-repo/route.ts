import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';
import path from "path";
import fs from 'fs';

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

    logger.repoAnalysis.start(repoId);

    // Get repository data from GitIngest cache
    const cacheDir = path.join(process.cwd(), 'cache');
    const cachePath = path.join(cacheDir, `${username}_${repo}_gitingest.json`);

    if (!fs.existsSync(cachePath)) {
      return NextResponse.json({
        success: false,
        error: 'Repository data not found. Please analyze the repository first.'
      }, { status: 404 });
    }

    const repoData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const { summary, tree, content } = repoData;

    // Process files for analysis
    const processedFiles = filterRelevantFiles(repoData.files || []);

    // Prepare context for Gemini
    const context = `Repository: ${username}/${repo}\n\n` +
      'Repository structure:\n' +
      tree + '\n\n' +
      'Repository contents:\n\n' +
      content;

    // Generate repository summary using Gemini
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

    logger.success('Repository analysis completed successfully', { prefix: 'Analysis' });

    return NextResponse.json({
      success: true,
      summary: response,
      processedFiles,
      errors: Error.length > 0 ? Error : undefined
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