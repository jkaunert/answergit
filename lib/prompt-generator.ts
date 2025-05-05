import { logger } from "@/lib/logger";
import { spawn } from 'child_process';
import path from 'path';

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
1. First, analyze the query to understand what the user is asking about the codebase.
2. Use the provided codebase information to formulate your response.
3. If the query relates to specific files or code patterns, reference them directly.
4. If you're unsure about something, acknowledge it rather than making assumptions.
5. Provide code examples when appropriate.
6. Keep your response concise but thorough.

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
      
      // Spawn Python process
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
            logger.info(`[GitIngest] Retrieved data - Tree size: ${data.tree.length}, Content size: ${data.content.length}`);
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