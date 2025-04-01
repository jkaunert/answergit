import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchDirectoryContents, fetchFileContent } from "@/lib/github";

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

export async function POST(req: Request) {
  try {
    const { username, repo } = await req.json();

    // 1. Fetch repository structure
    const files = await fetchDirectoryContents(username, repo, '');
    
    // 2. Filter files to analyze (exclude binary files, assets, etc.)
    const filesToAnalyze = filterRelevantFiles(files);
    
    // 3. Fetch content of relevant files
    const fileContents = await Promise.all(
      filesToAnalyze.slice(0, 20).map(async (file) => { // Limit to 20 most important files
        try {
          const content = await fetchFileContent(file.path, username, repo);
          return `File: ${file.path}\n${content}`;
        } catch (error) {
          console.error(`Error fetching ${file.path}:`, error);
          return '';
        }
      })
    );

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

    return NextResponse.json({
      success: true,
      summary: response
    });
  } catch (error) {
    console.error("Error analyzing repository:", error);
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