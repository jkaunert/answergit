import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchFileContent } from "@/lib/github";
import { logger } from '@/lib/logger';
import { generatePrompt, getRepoDataForPrompt } from '@/lib/prompt-generator';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Define interfaces for data structures
interface ContextStats {
  files: number;
  totalChars: number;
}

interface GitIngestData {
  tree: string;
  content: string;
  success?: boolean;
  error?: string;
}

interface ConversationMessage {
  role: string;
  content: string;
}

let timeoutId: string | number | NodeJS.Timeout | undefined;

export async function POST(req: Request) {
  try {
    const { username, repo, query, filePath, fetchOnlyCurrentFile = false, history = [] } = await req.json();
    const repoKey = `${username}/${repo}`;
    
    // Set a longer timeout for Vercel
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 50000); // 50 second timeout

    logger.info(`[${new Date().toISOString()}] Starting query processing for repository: ${repoKey}`, { prefix: 'Query' });
    
    let prompt: string;
    let contextStats: ContextStats = { files: 0, totalChars: 0 };
    
    // Start context preparation
    logger.context.start();

    if (filePath && fetchOnlyCurrentFile) {
      // For specific file queries, fetch only that file's content
      const fileContent = await fetchFileContent(filePath, username, repo);
      prompt = `You are a helpful assistant that can answer questions about the given code file.

FILE: ${filePath}

${fileContent}

QUESTION: ${query}

Provide a detailed, technical response that directly addresses the question about this specific file.`;
      
      contextStats.files = 1;
      contextStats.totalChars = fileContent.length;
    } else {
      // For general queries, use GitIngest data
      logger.info(`Collecting repository data for ${repoKey} using GitIngest...`, { prefix: 'Query' });
      
      try {
        // Trigger background content loading if needed
        try {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/collect-repo-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, repo })
          });
        } catch (error) {
          logger.error('Error triggering background content loading: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
        
        // Get repository data from GitIngest
        const repoData: GitIngestData = await getRepoDataForPrompt(username, repo);
        
        if (repoData && !repoData.error) {
          logger.info(`Retrieved GitIngest data for repository: ${repoKey}`, { prefix: 'GitIngest' });
          
          // Log GitIngest metrics
          const treeLines = repoData.tree.split('\n').length;
          const contentChars = repoData.content.length;
          const estimatedTokens = Math.round(contentChars / 4); // Rough estimate
          
          logger.info(`GitIngest metrics - Tree lines: ${treeLines}, Content chars: ${contentChars}, Est. tokens: ${estimatedTokens}`, { prefix: 'GitIngest' });
          
          // Generate prompt using the prompt generator
          prompt = await generatePrompt(
            query,
            history.map((msg: ConversationMessage) => ({ role: msg.role, content: msg.content })),
            repoData.tree,
            repoData.content
          );
          
          contextStats.files = treeLines; // Approximation
          contextStats.totalChars = contentChars;
          
          logger.info(`Generated prompt for query using GitIngest data`, { prefix: 'Prompt' });
        } else {
          // Fallback if GitIngest data is not available
          logger.warn(`GitIngest data not available for ${repoKey}, using fallback prompt`, { prefix: 'GitIngest' });
          prompt = `You are a knowledgeable AI assistant with deep understanding of software development and GitHub repositories. 

Repository: ${repoKey}

Question: ${query}

Provide an insightful, technical response that demonstrates your expertise about this repository.`;
        }
      } catch (error) {
        logger.error('Error generating prompt with GitIngest: ' + (error instanceof Error ? error.message : 'Unknown error'));
        prompt = `You are a knowledgeable AI assistant with deep understanding of software development and GitHub repositories. 

Repository: ${repoKey}

Question: ${query}

Provide an insightful, technical response that demonstrates your expertise about this repository.`;
      }
    }

    // After all context is prepared
    logger.context.stats(contextStats);

    // Generate response using Gemini
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
      }
    });

    const response = await result.response.text();

    clearTimeout(timeoutId);
    return NextResponse.json({
      success: true,
      response
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage.includes('aborted') || errorMessage.includes('timeout');
    
    logger.error(`Error processing Gemini request: ${errorMessage}`);
    return NextResponse.json(
      {
        success: false,
        error: isTimeout ? 
          'Request timed out. Please try with a smaller repository or specific file query.' :
          `Failed to process request: ${errorMessage}`
      },
      {
        status: isTimeout ? 504 : 500
      }
    );
  }
}
