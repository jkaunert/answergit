import { logger } from "@/lib/logger";
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Generate a prompt for the LLM to answer a query using the codebase data from GitIngest.
 *
 * @param query The user's query about the codebase
 * @param history The conversation history
 * @param tree The folder structure of the codebase
 * @param content The content of the codebase
 * @returns The prompt for the LLM
 */
export async function generatePrompt(
  query: string,
  history: Array<{ role: string; content: string }>,
  tree: string,
  content: string
): Promise<string> {
  // Format conversation history
  const formattedHistory = history
    .map(message => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n\n');

  // Create the prompt with repository data from GitIngest
  const prompt = `
You are a helpful assistant that can answer questions about the given codebase. You'll analyze both the code structure and content to provide accurate, helpful responses.

CODEBASE INFORMATION:
- Folder Structure:
${tree}

- File Content:
${content}

CONVERSATION HISTORY:
${formattedHistory}

CURRENT QUERY:
${query}

INSTRUCTIONS:
1. Analyze the codebase thoroughly before responding
2. Focus on relevant code sections for the query
3. Explain technical concepts clearly
4. Provide code examples when helpful
5. Reference specific files and line numbers
6. Consider the project's architecture and patterns
7. Explain your reasoning and recommendations
8. Be precise and accurate in technical details

FORMAT GUIDELINES:
1. Use markdown formatting for clarity
2. Structure complex responses with headings
3. Use code blocks with language tags
4. Include bullet points for lists
5. Keep paragraphs concise and focused

RESPONSE LENGTH GUIDELINES:
1. Provide comprehensive but focused answers
2. Break long responses into sections
3. Include only relevant details
4. Use examples sparingly and purposefully

HANDLING UNCERTAINTY:
1. Acknowledge when information is incomplete
2. Explain assumptions made
3. Suggest alternatives when appropriate
4. Ask for clarification if needed

COMMON TASKS:
1. Code explanation and review
2. Architecture analysis
3. Best practice recommendations
4. Bug investigation
5. Feature implementation guidance
6. Performance optimization
7. Security considerations

SECURITY GUIDELINES:
1. Never expose sensitive information
2. Flag potential security issues
3. Recommend secure coding practices
4. Highlight authentication/authorization concerns
5. Identify input validation needs
6. Consider data protection requirements

Your response should be helpful, accurate, and directly address the user's query about this codebase.
`;

  return prompt;
}

/**
 * Get repository data from cache for prompt generation.
 * 
 * @param username GitHub repository owner
 * @param repo GitHub repository name
 * @returns Object containing tree and content data
 */
interface GitIngestData {
  tree: string;
  content: string;
  success?: boolean;
  error?: string;
}

export async function getRepoDataForPrompt(username: string, repo: string): Promise<GitIngestData> {
  try {
    // Use the GitIngest service to get repository data
    // This will either retrieve from cache or fetch using GitIngest
    logger.info(`Retrieving repository data for ${username}/${repo}`, { prefix: 'GitIngest' });
    
    return new Promise((resolve, reject) => {
      // Path to the Python bridge script
      const scriptPath = path.join(process.cwd(), 'lib', 'gitingest_bridge.py');
      
      // Check if cache file exists and is valid
      const cachePath = path.join(process.cwd(), 'cache', `${username}_${repo}_gitingest.json`);
      if (fs.existsSync(cachePath)) {
        try {
          const cacheStats = fs.statSync(cachePath);
          const cacheAge = Date.now() - cacheStats.mtimeMs;
          const cacheExpirationMs = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
          
          if (cacheAge < cacheExpirationMs) {
            // Cache is valid, read from cache
            const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            const data: GitIngestData = {
              tree: cacheData.tree,
              content: cacheData.content,
              success: true
            };
            logger.info(`[GitIngest] Retrieved data from cache - Tree size: ${data.tree.length}, Content size: ${data.content.length}`);
            resolve(data);
            return;
          }
        } catch (error) {
          logger.error(`Error reading cache: ${error}`, { prefix: 'GitIngest' });
          // Continue with fresh data fetch if cache read fails
        }
      }
      
      // Spawn Python process for fresh data
      const pythonProcess = spawn('python', [
        scriptPath,
        '--username', username,
        '--repo', repo
      ]);
      
      let dataString = '';
      
      // Collect data from script
      pythonProcess.stdout.on('data', (data: Buffer) => {
        dataString += data.toString();
      });
      
      // Handle errors
      pythonProcess.stderr.on('data', (data: Buffer) => {
        logger.error(`Process error: ${data}`, { prefix: 'GitIngest' });
      });
      
      // Process has completed
      pythonProcess.on('close', (code: number) => {
        if (code !== 0) {
          logger.error(`Process exited with code ${code}`, { prefix: 'GitIngest' });
          // Return placeholder data as fallback
          resolve({
            tree: "Error retrieving repository structure",
            content: "Error retrieving repository content",
            error: `Process exited with code ${code}`
          });
          return;
        }
        
        try {
          const result = JSON.parse(dataString);
          if (result.success) {
            const data: GitIngestData = {
              tree: result.data.tree,
              content: result.data.content,
              success: true
            };
            logger.info(`[GitIngest] Retrieved fresh data - Tree size: ${data.tree.length}, Content size: ${data.content.length}`);
            resolve(data);
          } else {
            logger.error(`GitIngest error: ${result.error}`, { prefix: 'GitIngest' });
            resolve({
              tree: "Error: " + result.error,
              content: "Error: " + result.error,
              error: result.error
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Error parsing GitIngest output: ${errorMessage}`, { prefix: 'GitIngest' });
          resolve({
            tree: "Error parsing repository data",
            content: "Error parsing repository data",
            error: `Failed to parse output: ${errorMessage}`
          });
        }
      });
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error getting repository data: ${errorMessage}`, { prefix: 'GitIngest' });
    throw error;
  }
}