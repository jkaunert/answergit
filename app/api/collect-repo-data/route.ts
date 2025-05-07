import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { CacheManager } from '@/lib/cache-manager';

export async function POST(req: NextRequest) {
  try {
    const { username, repo, force_refresh = false } = await req.json();

    const apiUrl = process.env.GITINGEST_API_URL;
    if (!apiUrl) {
      return NextResponse.json({ success: false, error: "GITINGEST_API_URL not set in environment." }, { status: 500 });
    }

    logger.info(`Starting data collection for repository: ${username}/${repo} using GitIngest`, { prefix: 'GitIngest' });
    
    const response = await fetch(`${apiUrl}/ingest/`, { // Changed the endpoint
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_link: `${username}/${repo}` }) // Adjusted request body
    });

    if (!response.ok) {
      const error = await response.json();
      const status = response.status;
      return NextResponse.json({ success: false, error: error.detail || 'Failed to collect repository data' }, { status });
    }

    const data = await response.json();

    return NextResponse.json({ success: true, data: data }); // Adjusted response handling
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
