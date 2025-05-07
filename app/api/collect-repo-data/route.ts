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
      const errorText = await response.text();
        let errorJson;
        try {
          errorJson = JSON.parse(errorText);
        } catch (e) {
          // If not JSON, use the text as is
          throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }
        throw new Error(errorJson.detail || `API request failed with status ${response.status}`);
    }

    const result = await response.json();
    logger.info(`Received response with status: ${response.status}`, { prefix: 'GitIngest' });
    logger.info(`Response body: ${JSON.stringify(result)}`, { prefix: 'GitIngest' });
      
    // First, check if the response has the expected structure
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid response format from GitIngest');
    }
        
    // Handle both direct data format and nested data format
    let data;
        
    if (result.data) {
        // Standard format: { success: true, data: { summary, tree, content } }
        data = result.data;
    } else if (result.summary && result.tree && result.content) {
        // Alternative format: the result itself contains the data fields
        data = result;
    } else {
        // Neither format matches
        throw new Error('GitIngest response missing required data fields');
    }

    // Validate required fields exist
    if (!data.summary || !data.tree || !data.content) {
      logger.warn('Some GitIngest fields may be missing, but proceeding with available data', { prefix: 'GitIngest' });
    }

    if (result.success === false) {
      // Handle specific error types
      if (result.error === 'error:repo_not_found') {
        logger.warn(`Repository not found: ${repo}`, { prefix: 'GitIngest' });
        return NextResponse.json(
          {
            success: false,
            error: `Repository not found: ${repo}. Please verify the username and repository name.`
          },
          { status: 404 }
        );
      } else if (result.error === 'error:repo_too_large') {
        logger.warn(`Repository too large: ${repo}`, { prefix: 'GitIngest' });
        return NextResponse.json(
          {
            success: false,
            error: `Repository ${repo} is too large to process. Please try a smaller repository.`
          },
          { status: 413 }
        );
      } else if (result.error === 'error:repo_private') {
        logger.warn(`Repository is private or rate limited: ${repo}`, { prefix: 'GitIngest' });
        return NextResponse.json(
          {
            success: false,
            error: `Repository ${repo} is private or GitHub API rate limit exceeded. Please try again later.`
          },
          { status: 403 }
        );
      }
        
      throw new Error(result.error || 'Unknown error from GitIngest');
    }

    // Ensure files array exists even if not provided by GitIngest
    if (!data.files) {
      data.files = [];  // Initialize empty files array if not present
    }
      
      return NextResponse.json({
        success: true,
        data: { // Now, data key has to include all data
          ...result,  // Include all fields returned by GitIngest
          success: true // Explicitly confirm success
        }
      });
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
