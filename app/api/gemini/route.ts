import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchFileContent, fetchDirectoryContents } from "@/lib/github";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export async function POST(req: Request) {
  try {
    const { username, repo, query, filePath, fetchOnlyCurrentFile } = await req.json();

    let context = `Repository: ${username}/${repo}\n\n`;
    
    // Fetch file content if a specific file is requested
    if (filePath) {
      const fileContent = await fetchFileContent(filePath, username, repo);
      context += `Current file: ${filePath}\n${fileContent}\n\n`;
    }

    // Fetch repository structure for general queries or when needed
    if (!fetchOnlyCurrentFile) {
      const files = await fetchDirectoryContents(username, repo, '');
      const fileList = files
        .filter(file => file.type === 'file')
        .slice(0, 10)
        .map(file => `File: ${file.path}`)
        .join('\n');
      
      context += 'Repository structure:\n\n' + fileList;
    }

    // Generate response using Gemini
    const prompt = `You are an AI assistant helping to understand a GitHub repository.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nProvide a detailed, technical response based on the repository context.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      }
    });

    const response = await result.response.text();

    return NextResponse.json({
      success: true,
      response
    });
  } catch (error) {
    console.error("Error processing Gemini request:", error);
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

