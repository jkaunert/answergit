import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchFileContent, fetchDirectoryContents } from "@/lib/github";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export async function POST(req: Request) {
  try {
    const { username, repo, query, filePath } = await req.json();

    // 1. Fetch repository contents
    const files = await fetchDirectoryContents(username, repo, '');
    
    // 2. If a specific file is being queried, fetch its content
    let fileContent = '';
    if (filePath) {
      fileContent = await fetchFileContent(filePath, username, repo);
    }

    // 3. Fetch content of all files
    const allFileContents = await Promise.all(
      files
        .filter(file => file.type === 'file')
        .slice(0, 10) // Limit to first 10 files to avoid rate limits
        .map(async file => {
          try {
            const content = await fetchFileContent(file.path, username, repo);
            return `File: ${file.path}\n${content}`;
          } catch (error) {
            console.error(`Error fetching ${file}:`, error);
            return '';
          }
        })
    );

    // 4. Prepare context for Gemini
    const context = `Repository: ${username}/${repo}\n\n` +
      (filePath ? `Current file: ${filePath}\n${fileContent}\n\n` : '') +
      'Repository contents:\n\n' +
      allFileContents.filter(Boolean).join('\n\n');

    // 4. Generate response using Gemini
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

