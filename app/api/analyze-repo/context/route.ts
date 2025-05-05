import { NextRequest, NextResponse } from 'next/server';
import { getRepositoryDocuments } from '@/lib/supabase';
import { fetchDirectoryContents, fetchFileContent } from '@/lib/github';

// Maximum number of files to include in context
const MAX_FILES_IN_CONTEXT = 10;

export async function POST(req: NextRequest) {
  try {
    const { username, repo, query } = await req.json();
    const repoId = `${username}/${repo}`;
    
    // Prepare context data structure
    const contextData = {
      files: [] as { path: string; content: string }[],
      structure: '',
    };
    
    // Get repository documents directly without similarity search
    const documents = await getRepositoryDocuments(MAX_FILES_IN_CONTEXT, { username, repo });
    
    if (documents && documents.length > 0) {
      // Extract file paths and contents from the documents
      contextData.files = documents.map((doc: { metadata: { filePath: string; }; content: any; }) => {
        // Extract file path from document metadata if available
        const filePath = doc.metadata?.filePath || '';
        return {
          path: filePath,
          content: doc.content
        };
      });
    }
    
    // If a specific query is provided, get relevant documents from the repository
    if (query) {
      // Get documents from the current repository without similarity search
      const documents = await getRepositoryDocuments(MAX_FILES_IN_CONTEXT, { username, repo });
      
      if (documents && documents.length > 0) {
        // Extract file paths and contents from the documents
        contextData.files = documents.map((doc: { metadata: { filePath: string; }; content: any; }) => {
          // Extract file path from document metadata if available
          const filePath = doc.metadata?.filePath || '';
          return {
            path: filePath,
            content: doc.content
          };
        });
      }
    } else {
      // If no query is provided, fetch repository structure
      try {
        const files = await fetchDirectoryContents(username, repo, '');
        
        // Generate a text representation of the file structure
        contextData.structure = generateFileTree(files);
        
        // Get the most important files based on priority
        const importantFiles = filterRelevantFiles(files)
          .sort((a, b) => b.priority - a.priority)
          .slice(0, MAX_FILES_IN_CONTEXT);
        
        // Fetch content for important files
        for (const file of importantFiles) {
          try {
            const content = await fetchFileContent(file.path, username, repo);
            if (content) {
              contextData.files.push({
                path: file.path,
                content
              });
            }
          } catch (error) {
            console.error(`Error fetching content for ${file.path}:`, error);
          }
        }
      } catch (error) {
        console.error('Error fetching repository structure:', error);
      }
    }
    
    return NextResponse.json({
      success: true,
      context: contextData
    });
  } catch (error) {
    console.error('Error collecting repository context:', error);
    return NextResponse.json(
      {
        success: false,
        error: `Failed to collect repository context: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}

// Helper function to filter relevant files for analysis
function filterRelevantFiles(files: any[], currentPath = '') {
  const EXCLUDED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot',
    '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz', '.lock'
  ];

  const EXCLUDED_DIRECTORIES = [
    'node_modules', '.git', '.github', 'dist', 'build', '.next', 'public/assets',
    'coverage', '.vscode', '.idea'
  ];

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
        path,
        priority: isPriority ? 1 : 0
      });
    }
  }
  
  // Sort by priority (important files first)
  return relevantFiles.sort((a, b) => b.priority - a.priority);
}

// Helper function to generate a text representation of the file tree
function generateFileTree(files: any[], indent = '') {
  const EXCLUDED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot',
    '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz', '.lock'
  ];

  const EXCLUDED_DIRECTORIES = [
    'node_modules', '.git', '.github', 'dist', 'build', '.next', 'public/assets',
    'coverage', '.vscode', '.idea'
  ];

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