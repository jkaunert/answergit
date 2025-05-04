import { NextRequest, NextResponse } from 'next/server';
import { fetchDirectoryContents, fetchFileContent } from '@/lib/github';
import { storeDocumentEmbeddings, combineAndStoreDocument, checkDocumentProcessed } from '@/lib/supabase';

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
    
    console.log(`[${new Date().toISOString()}] Starting data collection for repository: ${repoId}`);
    
    // 1. Fetch repository structure
    console.log(`[${new Date().toISOString()}] Fetching repository structure...`);
    const files = await fetchDirectoryContents(username, repo, '');
    console.log(`[${new Date().toISOString()}] Found ${files.length} total files in repository`);
    
    // 2. Filter and prioritize files to analyze
    const filesToAnalyze = filterAndPrioritizeFiles(files);
    console.log(`[${new Date().toISOString()}] Selected ${filesToAnalyze.length} relevant files for analysis`);
    
    // 3. Process files for embedding storage
    const processedFiles = [];
    const errors = [];
    
    // Store repository overview as main document
    try {
      const repoOverview = generateRepositoryOverview(files, username, repo);
      await storeDocumentEmbeddings(repoId, repoOverview, {
        repo,
        owner: username,
        type: 'overview'
      }, true);
      console.log(`[${new Date().toISOString()}] Stored repository overview embedding`);
    } catch (error) {
      console.error('Error storing repository overview:', error);
    }
    
    // Process individual files (limited to MAX_FILES_TO_PROCESS)
    for (const file of filesToAnalyze.slice(0, MAX_FILES_TO_PROCESS)) {
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
              fileType: getFileType(file.path),
              chunkIndex: i,
              totalChunks: chunks.length
            }
          });
        }
        
        // Combine and store chunks as a single document
        const documentId = `${repoId}/${file.path}`;
        await combineAndStoreDocument(documentId, fileChunks);
        console.log(`[${new Date().toISOString()}] Stored combined embeddings for ${file.path}`);
        
        processedFiles.push({
          path: file.path,
          chunksProcessed: chunks.length
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing file ${file.path}:`, errorMessage);
        errors.push({
          path: file.path,
          error: errorMessage
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      processedFiles,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error collecting repository data:', error);
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