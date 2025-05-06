import { NextRequest, NextResponse } from "next/server";

// POST handler that forwards the request to your Render-hosted backend
export async function POST(req: NextRequest) {
  try {
    const { username, repo } = await req.json();

    const apiUrl = process.env.GITINGEST_API_URL;
    if (!apiUrl) {
      return NextResponse.json({ success: false, error: "GITINGEST_API_URL not set in environment." }, { status: 500 });
    }

    const response = await fetch(`${apiUrl}/api/analyze-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, repo })
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json({ success: false, error: error.error || 'Failed to analyze repository.' }, {
        status: response.status
      });
    }

    const data = await response.json();
    return NextResponse.json({ success: true, ...data });
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
