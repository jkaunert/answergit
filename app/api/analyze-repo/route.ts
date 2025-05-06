import { NextRequest, NextResponse } from "next/server";

// POST handler that forwards the request to your Render-hosted backend
export async function POST(req: NextRequest) {
  try {
    const { username, repo, force_refresh = false } = await req.json();

    const apiUrl = process.env.GITINGEST_API_URL;
    if (!apiUrl) {
      return NextResponse.json({ success: false, error: "GITINGEST_API_URL not set in environment." }, { status: 500 });
    }

    const response = await fetch(`${apiUrl}/api/analyze-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, repo, force_refresh })
    });

    if (!response.ok) {
      const error = await response.json();
      const status = response.status;
      
      // Map specific error cases from the backend
      switch (error.detail) {
        case "Repository not found":
          return NextResponse.json({ success: false, error: "Repository not found" }, { status: 404 });
        case "Private repository or rate limit exceeded":
          return NextResponse.json({ success: false, error: "Repository is private or rate limit exceeded" }, { status: 403 });
        case "Repository is too large to process":
          return NextResponse.json({ success: false, error: "Repository is too large to process" }, { status: 400 });
        default:
          return NextResponse.json({ success: false, error: error.detail || 'Failed to analyze repository' }, { status });
      }
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data: data.data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}