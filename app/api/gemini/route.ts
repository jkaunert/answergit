import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchFileContent, fetchDirectoryContents } from "@/lib/github";
import { getRepositoryDocuments } from "@/lib/supabase";
import { logger } from '@/lib/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Define interface for context statistics
interface ContextStats {
  files: number;
  totalChars: number;
}

export async function POST(req: Request) {
  try {
    const { username, repo, query, filePath, fetchOnlyCurrentFile = false } = await req.json();
    const repoKey = `${username}/${repo}`;

    let context = `Repository: ${repoKey}\n\n`;
    let contextStats: ContextStats = { files: 0, totalChars: 0 };

    if (filePath && fetchOnlyCurrentFile) {
      // For specific file queries, fetch only that file's content
      const fileContent = await fetchFileContent(filePath, username, repo);
      context += `Current file: ${filePath}\n${fileContent}\n\n`;
    } else {
      // For general queries, collect comprehensive repository data
      logger.info(`Collecting repository data for ${repoKey}...`, { prefix: 'Query' });

      try {
        // Fetch all documents from the current repository
        const documents = await getRepositoryDocuments(50, { username, repo });
        
        if (documents && documents.length > 0) {
          logger.info(`Found ${documents.length} documents for repository`, { prefix: 'Query' });
          
          // Start context preparation
          logger.context.start();

          // Prioritize README and package.json first
          const readmeDoc = documents.find((doc: any) => 
            doc.metadata?.filePath?.toLowerCase().includes('readme'));
          const packageDoc = documents.find((doc: any) => 
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

          // Add all other documents
          context += 'Repository files:\n\n';
          for (const doc of documents) {
            // Skip if already included in overview
            if (doc.metadata?.filePath?.toLowerCase().includes('readme') || 
                doc.metadata?.filePath?.toLowerCase().includes('package.json')) {
              continue;
            }
            if (doc.metadata?.filePath && doc.content) {
              context += `File: ${doc.metadata.filePath}\n${doc.content}\n\n`;
              contextStats.files++;
              contextStats.totalChars += doc.content.length;
            }
          }
        }
      } catch (error) {
        logger.error('Error fetching repository documents: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }

      // Trigger background content loading
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/collect-repo-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, repo })
        });
      } catch (error) {
        logger.error('Error triggering background content loading: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }

      // Get repository structure if needed
      try {
        const files = await fetchDirectoryContents(username, repo, '');
        const fileList = files
          .filter(file => file.type === 'file')
          .slice(0, 10)
          .map(file => `File: ${file.path}`)
          .join('\n');

        context += '\nRepository structure:\n\n' + fileList;
      } catch (error) {
        logger.error('Error fetching directory contents: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }

    // After all context is prepared
    logger.context.stats(contextStats);

    // Generate response using Gemini
    const prompt = `You are a knowledgeable AI assistant with deep understanding of software development and GitHub repositories. You have comprehensive knowledge about the ${repoKey} repository.\n\nContext (for reference):\n${context}\n\nQuestion: ${query}\n\nProvide an insightful, technical response that demonstrates your expertise about this repository. Focus on being informative and natural in your explanation, as if you're already familiar with the codebase. Avoid explicitly referencing the provided context or files - instead, incorporate that knowledge naturally into your response.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
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
