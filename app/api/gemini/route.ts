import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchFileContent, fetchDirectoryContents } from "@/lib/github";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export async function POST(req: Request) {
  try {
    const { username, repo, query, filePath } = await req.json();
    const repoKey = `${username}/${repo}`;

    let context = `Repository: ${repoKey}\n\n`;
    
    if (filePath) {
      // For specific file queries, fetch only that file's content
      const fileContent = await fetchFileContent(filePath, username, repo);
      context += `Current file: ${filePath}\n${fileContent}\n\n`;
    } else {
      // For general queries, collect comprehensive repository data
      console.log(`[${new Date().toISOString()}] Collecting repository data for ${repoKey}...`);
      
      try {
        // Trigger immediate background content loading
        fetch('/api/analyze-repo/context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, repo })
        }).catch(error => console.error('Background content loading error:', error));

        // Get repository structure
        const files = await fetchDirectoryContents(username, repo, '');
        const fileList = files
          .filter(file => file.type === 'file')
          .slice(0, 10)
          .map(file => `File: ${file.path}`)
          .join('\n');
        
        context += 'Repository structure:\n\n' + fileList;

        // Try to get any already processed content
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/analyze-repo/context`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, repo })
        });

        if (!response.ok) {
          throw new Error(`Failed to collect repository data: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.success && data.context && data.context.files.length > 0) {
          // Add any available processed content
          context += '\n\nRepository contents:\n\n';
          data.context.files.forEach(({ path, content }: { path: string; content: string }) => {
            if (content) {
              context += `File: ${path}\n${content}\n\n`;
            }
          });
        }
      } catch (error) {
        console.error('Error collecting repository data:', error);
      }
    }

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

