import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { spawn } from 'child_process';
import path from 'path';
import { CacheManager } from '@/lib/cache-manager';

// Maximum chunk size for text processing
const MAX_CHUNK_SIZE = 1000;

// File extensions to prioritize for code understanding
const PRIORITY_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.rb', '.swift', '.kt', '.scala', '.html', '.css', '.scss', '.md', '.json'
];

// File extensions to exclude from analysis
const EXCLUDED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz', '.lock', '.bin', '.exe',
  '.dll', '.so', '.dylib', '.class', '.o', '.obj', '.a', '.lib', '.pyc', '.pyo'
];

// Directories to exclude from analysis
const EXCLUDED_DIRECTORIES = [
  'node_modules', '.git', '.github', 'dist', 'build', '.next', 'public/assets',
  'coverage', '.vscode', '.idea', 'vendor', 'bin', 'obj', 'target', 'out'
];

// Maximum number of files to process
const MAX_FILES_TO_PROCESS = 50;

export async function POST(req: NextRequest) {
  try {
    const { username, repo, force = false } = await req.json();
    const repoId = `${username}/${repo}`;
    
    // Check if repository has already been processed
    if (!force) {
      const isProcessed = await checkDocumentProcessed(repoId);
      if (isProcessed) {
        return NextResponse.json({
          success: true,
          message: 'Repository has already been processed'
        });
      }
    }
    
    logger.info(`Starting data collection for repository: ${repoId} using GitIngest`, { prefix: 'GitIngest' });
    
    // Use GitIngest to process the repository
    try {
      // Path to the Python bridge script
      const scriptPath = path.join(process.cwd(), 'lib', 'gitingest_bridge.py');
      
      // Create a promise to handle the async process
      const gitIngestData = await new Promise((resolve, reject) => {
        // Spawn Python process with force refresh flag if needed
        const args = ['--username', username, '--repo', repo];
        if (force) args.push('--force');
        
        const pythonProcess = spawn('python', [scriptPath, ...args]);
        
        let dataString = '';
        let errorString = '';
        
        // Collect data from script
        pythonProcess.stdout.on('data', (data: Buffer) => {
          dataString += data.toString();
        });
        
        // Handle errors
        pythonProcess.stderr.on('data', (data: Buffer) => {
          const errorData = data.toString();
          errorString += errorData;
          logger.error(`Process error: ${errorData}`, { prefix: 'GitIngest' });
        });
        
        // Process has completed
        pythonProcess.on('close', (code: number) => {
          // Log raw output for debugging
          logger.debug(`GitIngest raw output:\n${dataString}`, { prefix: 'GitIngest' });
          
          if (code !== 0 || !dataString) {
            const errorMsg = `Process exited with code ${code}: ${errorString}`;
            logger.error(errorMsg, { prefix: 'GitIngest' });
            reject(new Error(errorMsg));
            return;
          }
          
          try {
            // Validate JSON structure before parsing
            if (!dataString.trim().startsWith('{')) {
              throw new Error('Invalid JSON structure from GitIngest');
            }
            
            const result = JSON.parse(dataString);
            
            // Validate required fields in response
            if (!result?.data?.summary || !result?.data?.tree || !result?.data?.content) {
              throw new Error('GitIngest response missing required fields');
            }
            
            resolve(result);
          } catch (error) {
            const errMsg = `Failed to parse GitIngest output: ${error instanceof Error ? error.message : 'Unknown error'}`;
            logger.error(errMsg, { prefix: 'GitIngest' });
            reject(new Error(`${errMsg}\nRaw output: ${dataString.substring(0, 200)}...`));
          }
        });
      });
      
      // Process and cache the GitIngest data
      const result = gitIngestData as any;
      if (!result.success) {
        throw new Error(result.error || 'Unknown error from GitIngest');
      }

      // Format and cache the data for analyze-repo endpoint
      const formattedData = formatGitIngestData(result);
      CacheManager.saveToCache(username, repo, formattedData);
      
      // Log GitIngest metrics
      const { summary, tree, content } = result.data;
      const treeLines = tree.split('\n').length;
      const contentChars = content.length;
      const contentLines = content.split('\n').length;
      const estimatedTokens = Math.round(contentChars / 4); // Rough estimate
      
      logger.info(`Repository metrics for ${repoId}:`, { prefix: 'GitIngest' });
      logger.info(`- Tree structure: ${treeLines} lines`, { prefix: 'GitIngest' });
      logger.info(`- Content: ${contentChars} characters, ${contentLines} lines`, { prefix: 'GitIngest' });
      logger.info(`- Estimated tokens: ${estimatedTokens}`, { prefix: 'GitIngest' });
      
      logger.success('Repository data processed successfully', { prefix: 'GitIngest' });
      
      return NextResponse.json({
        success: true,
        message: 'Repository data collected and processed successfully'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to process repository: ${errorMessage}`, { prefix: 'GitIngest' });
      return NextResponse.json(
        {
          success: false,
          error: `Failed to process repository with GitIngest: ${errorMessage}`
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error('Error collecting repository data: ' + (error instanceof Error ? error.message : 'Unknown error'), { prefix: 'GitIngest' });
    return NextResponse.json(
      {
        success: false,
        error: `Failed to collect repository data: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}

// Helper function to filter and prioritize files for analysis
function filterAndPrioritizeFiles(files: any[], currentPath = '') {
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
        relevantFiles = [...relevantFiles, ...filterAndPrioritizeFiles(file.children, path)];
      }
    } else if (file.type === 'file') {
      // Skip excluded file extensions
      if (EXCLUDED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
        continue;
      }
      
      // Calculate priority score
      let priorityScore = 0;
      
      // Prioritize by file extension
      if (PRIORITY_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
        priorityScore += 5;
      }
      
      // Prioritize important files
      const importantFiles = [
        'package.json', 'tsconfig.json', 'README.md', 'next.config.js', 'next.config.mjs',
        'app/layout.tsx', 'app/page.tsx', 'index.ts', 'index.tsx', 'main.ts', 'main.tsx',
        'app.js', 'app.ts', 'server.js', 'server.ts', 'config.js', 'config.ts'
      ];
      
      if (importantFiles.some(name => file.name === name || path.endsWith(name))) {
        priorityScore += 10;
      }
      
      // Prioritize files in important directories
      const importantDirs = ['src', 'app', 'lib', 'utils', 'components', 'pages', 'api'];
      if (importantDirs.some(dir => path.includes(`/${dir}/`))) {
        priorityScore += 3;
      }
      
      relevantFiles.push({
        ...file,
        path,
        priority: priorityScore
      });
    }
  }
  
  // Sort by priority (higher scores first)
  return relevantFiles.sort((a, b) => b.priority - a.priority);
}

// Helper function to generate repository overview
function generateRepositoryOverview(files: any[], username: string, repo: string) {
  const fileTree = generateFileTree(files);
  
  return `Repository: ${username}/${repo}

Repository Structure:
${fileTree}`;
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
      if (EXCLUDED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
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

// Helper function to determine file type from path
function getFileType(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  
  const fileTypeMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'rb': 'ruby',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'md': 'markdown',
    'json': 'json',
    'yml': 'yaml',
    'yaml': 'yaml',
    'xml': 'xml',
    'sql': 'sql'
  };
  
  return fileTypeMap[extension] || 'text';
}

// Helper function to check if repository data exists in cache
async function checkDocumentProcessed(repoId: string): Promise<boolean> {
  return CacheManager.isDocumentProcessed(repoId);
}

// Helper function to format GitIngest data for Gemini
function formatGitIngestData(result: any) {
  const { data } = result;
  return {
    summary: data.summary,
    tree: data.tree,
    content: data.content,
    timestamp: Date.now(),
    files: data.files?.map((f: any) => ({
      name: f.name,
      path: f.path,
      type: f.type,
      priority: f.priority || 0
    })) || []
  };
}
