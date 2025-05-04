import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchFileContent, fetchDirectoryContents } from "@/lib/github";
import { searchSimilarDocuments } from "@/lib/supabase";
import { logger } from '@/lib/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Define interface and initialize context statistics at top level
interface ContextStats {
  files: number;
  totalChars: number;
}

let contextStats: ContextStats = { files: 0, totalChars: 0 };

export async function POST(req: Request) {
  try {
    const { username, repo, query, filePath, fetchOnlyCurrentFile = false } = await req.json();
    const repoKey = `${username}/${repo}`;

    let context = `Repository: ${repoKey}\n\n`;

    if (filePath && fetchOnlyCurrentFile) {
      // For specific file queries, fetch only that file's content
      const fileContent = await fetchFileContent(filePath, username, repo);
      context += `Current file: ${filePath}\n${fileContent}\n\n`;
    } else {
      // For general queries, collect comprehensive repository data
      logger.info(`Collecting repository data for ${repoKey}...`, { prefix: 'Query' });

      try {
        // First, try to find relevant documents using vector search
        let relevantDocuments = [];
        if (query) {
          logger.search.start(query);
          // Increase similarity threshold for general queries
          const similarityThreshold = query.toLowerCase().includes('about') || 
            query.toLowerCase().includes('what') || 
            query.toLowerCase().includes('explain') ? 
            0.5 : 0.7;
          relevantDocuments = await searchSimilarDocuments(query, similarityThreshold, 12);

          if (relevantDocuments && relevantDocuments.length > 0) {
            logger.search.results(relevantDocuments.length);
            logger.search.details(relevantDocuments.map((doc: { similarity: any; metadata: { filePath: any; }; }) => ({
              similarity: doc.similarity,
              filePath: doc.metadata?.filePath || 'Unknown file'
            })));
          }

          // Start context preparation
          logger.context.start();

          // For general queries, prioritize README and package.json
          if (query.toLowerCase().includes('about') || 
              query.toLowerCase().includes('what') || 
              query.toLowerCase().includes('explain')) {
            const readmeDoc = relevantDocuments.find((doc: any) => 
              doc.metadata?.filePath?.toLowerCase().includes('readme'));
            const packageDoc = relevantDocuments.find((doc: any) => 
              doc.metadata?.filePath?.toLowerCase().includes('package.json'));

            if (readmeDoc || packageDoc) {
              context += 'Project Overview:\n\n';
              if (readmeDoc) {
                context += `README:\n${readmeDoc.content}\n\n`;
                contextStats.files++;
                contextStats.totalChars += readmeDoc.content.length;
              }
              if (packageDoc) {
                context += `Package Information:\n${packageDoc.content}\n\n`;
                contextStats.files++;
                contextStats.totalChars += packageDoc.content.length;
              }
            }
          }

          // Add other relevant documents
          if (relevantDocuments && relevantDocuments.length > 0) {
            context += 'Relevant repository files:\n\n';
            for (const doc of relevantDocuments) {
              // Skip if already included in overview
              if (doc.metadata?.filePath?.toLowerCase().includes('readme') || 
                  doc.metadata?.filePath?.toLowerCase().includes('package.json')) {
                continue;
              }
              const filePath = doc.metadata?.filePath || 'Unknown file';
              context += `File: ${filePath}\n${doc.content}\n\n`;
              contextStats.files++;
              contextStats.totalChars += doc.content.length;
            }
          }
        }

        // Trigger background content loading to ensure repository is processed
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/collect-repo-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, repo })
        }).catch(error => console.error('Background content loading error:', error));

        // If we didn't find relevant documents or if it's a file-specific query, get repository structure
        if (relevantDocuments.length === 0 || filePath) {
          const files = await fetchDirectoryContents(username, repo, '');
          const fileList = files
            .filter(file => file.type === 'file')
            .slice(0, 10)
            .map(file => `File: ${file.path}`)
            .join('\n');

          context += 'Repository structure:\n\n' + fileList;

          // Try to get additional context from the context API
          const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/analyze-repo/context`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, repo, query })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.context && data.context.files.length > 0) {
              context += '\n\nAdditional repository contents:\n\n';
              data.context.files.forEach(({ path, content }: { path: string; content: string }) => {
                if (content) {
                  context += `File: ${path}\n${content}\n\n`;
                }
              });
            }
          }
        }

        // If this is a file-specific query but we want repository context, add the file content
        if (filePath && !fetchOnlyCurrentFile) {
          const fileContent = await fetchFileContent(filePath, username, repo);
          context += `\nCurrent file: ${filePath}\n${fileContent}\n\n`;
        }
      } catch (error) {
        logger.search.error(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // After all context is prepared
    logger.context.stats(contextStats);

    // 4. Generate response using Gemini
    const prompt = `You are a knowledgeable AI assistant with deep understanding of software development and GitHub repositories. You have comprehensive knowledge about the ${repoKey} repository.\n\nContext (for reference):\n${context}\n\nQuestion: ${query}\n\nProvide an insightful, technical response that demonstrates your expertise about this repository. Focus on being informative and natural in your explanation, as if you're already familiar with the codebase. Avoid explicitly referencing the provided context or files - instead, incorporate that knowledge naturally into your response.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8, // Slightly higher temperature for more natural responses
        maxOutputTokens: 2048,
      }
    });

    const response = await result.response.text();

    return NextResponse.json({
      success: true,
      response
    });
  } catch (error) {
    logger.error("Error processing Gemini request: " + (error instanceof Error ? error.message : 'Unknown error'));
    return NextResponse.json(
      {
        success: false,
        error: `Failed to process request: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      {
        status: 500
      }
    );
  }
}
