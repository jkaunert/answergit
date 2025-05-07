import { NextRequest, NextResponse } from "next/server";

// POST handler that forwards the request to your Render-hosted backend
export async function POST(req: NextRequest) {
    try {
        const { username, repo } = await req.json();

        const apiUrl = process.env.GITINGEST_API_URL;
        if (!apiUrl) {
            return NextResponse.json({ success: false, error: "GITINGEST_API_URL not set in environment." }, { status: 500 });
        }

        const response = await fetch(`${apiUrl}/ingest/`, { // Changed the endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ github_link: `${username}/${repo}` }) // Adjusted request body
        });

        if (!response.ok) {
            const error = await response.json();
            const status = response.status;
            return NextResponse.json({ success: false, error: error.detail || 'Failed to analyze repository' }, { status });
        }

        const data = await response.json();
        return NextResponse.json({ success: true, data: data }); // Adjusted response handling
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
