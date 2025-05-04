import { Octokit } from '@octokit/rest';

// Validate GitHub token before creating Octokit instance
if (!process.env.GITHUB_TOKEN) {
  throw new Error('GitHub token is not configured. Please set GITHUB_TOKEN in your environment variables.');
}

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  request: {
    timeout: 60000 // 60 seconds timeout
  }
});

// Validate token by making a test API call
async function validateGitHubToken() {
  try {
    await octokit.users.getAuthenticated();
  } catch (error) {
    throw new Error('Invalid GitHub token. Please check your token and ensure it has the necessary permissions.');
  }
}

// Cache configuration
const CACHE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Cache for repository data to avoid repeated API calls
const repoCache = new Map<string, CacheEntry<Promise<any>>>();
const fileCache = new Map<string, CacheEntry<Promise<FileNode[]>>>();

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileNode[];
}

interface GitHubError extends Error {
  response?: {
    headers?: { [key: string]: string };
    data?: any;
  };
}

async function retryWithBackoff<T>(operation: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === retries || !(error instanceof Error && error.message.includes('rate limit'))) {
        throw error;
      }
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
      console.log(`Rate limit hit, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

function isCacheValid<T>(entry?: CacheEntry<T>): entry is CacheEntry<T> {
  return !!entry && (Date.now() - entry.timestamp) < CACHE_EXPIRATION_MS;
}

export async function fetchRepoData(username: string, repo: string) {
  // Ensure token is valid before making any requests
  await validateGitHubToken();
  
  const cacheKey = `${username}/${repo}`;
  
  // Check cache validity
  const cachedEntry = repoCache.get(cacheKey);
  if (isCacheValid(cachedEntry)) {
    return cachedEntry.data;
  }
  
  const promise = retryWithBackoff(async () => {
    try {
      // Fetch repository metadata
      const response = await octokit.repos.get({
        owner: username,
        repo: repo
      });
      
      const repoData = response.data;

      // Fetch repository contents
      const files = await fetchDirectoryContents(username, repo, '');

      return {
        name: repoData.name,
        owner: repoData.owner.login,
        description: repoData.description,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        language: repoData.language,
        files
      };
    } catch (error) {
      if (error instanceof Error) {
        const githubError = error as GitHubError;
        if (error.message.includes('Not Found')) {
          throw new Error(`Repository ${username}/${repo} not found. Please check if the repository exists and is accessible.`);
        } else if (error.message.includes('Bad credentials') || error.message.includes('Unauthorized')) {
          throw new Error('GitHub API authentication failed. Please check your GitHub token.');
        } else if (error.message.includes('rate limit')) {
          const resetTime = new Date(Number(githubError.response?.headers?.['x-ratelimit-reset'] || 0) * 1000);
          const waitTime = Math.ceil((resetTime.getTime() - Date.now()) / 1000 / 60);
          throw new Error(`GitHub API rate limit exceeded. Rate limit will reset in ${waitTime} minutes. Please try again later.`);
        } else if (error.message.includes('API rate limit exceeded')) {
          throw new Error('GitHub API rate limit exceeded. Please authenticate or try again later.');
        }
      }
      console.error('Error fetching repo data:', error);
      throw new Error(`Failed to fetch repository data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });
  
  repoCache.set(cacheKey, { data: promise, timestamp: Date.now() });
  return promise;
}

export async function fetchDirectoryContents(owner: string, repo: string, path: string, fetchContent = false, depth = 0): Promise<FileNode[]> {
  try {
    const cacheKey = `${owner}/${repo}/${path}`;
    
    const cachedEntry = fileCache.get(cacheKey);
    if (isCacheValid(cachedEntry)) {
      return cachedEntry.data;
    }
    
    const promise = retryWithBackoff(async () => {
      const { data: contents } = await octokit.repos.getContent({
        owner,
        repo,
        path: path || '',
        per_page: 100 // Limit items per request
      });

      const contentsData = contents as string | { type: string; path: string; sha: string }[];
      if (typeof contentsData === 'string' && contentsData.startsWith('<!DOCTYPE')) {
        throw new Error('GitHub API returned HTML response. This usually indicates an authentication or rate limit issue.');
      }

      if (!Array.isArray(contents)) {
        throw new Error('Expected directory contents');
      }

      const nodes: FileNode[] = [];
      const batchSize = 3; // Reduced batch size for better stability
      const batches: Array<Array<{ item: any; node: FileNode }>> = [];
      let currentBatch: Array<{ item: any; node: FileNode }> = [];

      // First pass: create all nodes
      for (const item of contents) {
        const node: FileNode = {
          name: item.name,
          path: item.path,
          type: item.type === 'dir' ? 'directory' : 'file'
        };
        nodes.push(node);

        if (item.type === 'dir' && depth < 2) {
          currentBatch.push({ item, node });
          if (currentBatch.length === batchSize) {
            batches.push(currentBatch);
            currentBatch = [];
          }
        }
      }

      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      // Process batches with delay between each batch
      for (const batch of batches) {
        const batchPromises = batch.map(async ({ item, node }) => {
          try {
            const children = await fetchDirectoryContents(owner, repo, item.path, fetchContent, depth + 1);
            node.children = children;
          } catch (error) {
            console.error(`Error fetching contents for ${item.path}:`, error);
            node.children = []; // Set empty children on error
          }
        });

        await Promise.all(batchPromises);
        // Add delay between batches to avoid rate limits
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return nodes;
    });
    
    fileCache.set(cacheKey, { data: promise, timestamp: Date.now() });
    return promise;
  } catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      throw new Error(`Request timed out while fetching directory contents. The repository might be too large or the network connection is slow.`);
    }
    console.error(`Error fetching directory contents for ${path}:`, error);
    throw new Error(`Failed to fetch directory contents: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function fetchFileContent(filePath: string, username: string, repo: string) {
  try {
    // Ensure token is valid before making any requests
    await validateGitHubToken();
    
    return await retryWithBackoff(async () => {
      const response = await octokit.repos.getContent({
        owner: username,
        repo,
        path: filePath
      });

      const { data } = response;

      // Check if response is HTML (indicating an error)
      if (typeof data === 'string') {
        const responseData = data as string;
        if (responseData && responseData.startsWith('<!DOCTYPE')) {
          throw new Error('GitHub API authentication failed. Please check your token.');
        }
        throw new Error('Invalid API response format');
      }

      // Check if we got a directory instead of a file
      if (Array.isArray(data)) {
        throw new Error('Requested path is a directory, not a file');
      }

      // Verify we have a file with content
      if (data.type !== 'file' || !('content' in data)) {
        throw new Error('Invalid file data received from GitHub API');
      }

      // GitHub API returns base64 encoded content
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return content;
    });
  } catch (error) {
    console.error(`Error fetching file content for ${filePath}:`, error);
    throw new Error(`Failed to fetch file content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

