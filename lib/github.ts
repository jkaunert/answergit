import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// Cache for repository data to avoid repeated API calls
const repoCache = new Map<string, Promise<any>>();
const fileCache = new Map<string, Promise<FileNode[]>>();

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileNode[];
}

export async function fetchRepoData(username: string, repo: string) {
  const cacheKey = `${username}/${repo}`;
  
  // Return cached promise if available
  if (repoCache.has(cacheKey)) {
    return repoCache.get(cacheKey);
  }
  
  const promise = (async () => {
    try {
      // Fetch repository metadata
      const response = await octokit.repos.get({
        owner: username,
        repo: repo
      });
      
      // Check if response is valid JSON
      if (typeof response.data === 'string' && response.data.startsWith('<!DOCTYPE')) {
        throw new Error('GitHub API returned HTML response. This usually indicates an authentication or rate limit issue.');
      }
      
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
    console.error('Error fetching repo data:', error);
    throw new Error(`Failed to fetch repository data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  })();
  
  repoCache.set(cacheKey, promise);
  return promise;
}

export async function fetchDirectoryContents(owner: string, repo: string, path: string, fetchContent = false): Promise<FileNode[]> {
  try {
    const cacheKey = `${owner}/${repo}/${path}`;
    
    // Return cached promise if available
    if (fileCache.has(cacheKey)) {
      return fileCache.get(cacheKey);
    }
    
    const promise = (async () => {
      const { data: contents } = await octokit.repos.getContent({
        owner,
        repo,
        path: path || ''
      });

      if (typeof contents === 'string' && contents.startsWith('<!DOCTYPE')) {
        throw new Error('GitHub API returned HTML response. This usually indicates an authentication or rate limit issue.');
      }

      if (!Array.isArray(contents)) {
        throw new Error('Expected directory contents');
      }

      const nodes: FileNode[] = [];
      const directoryPromises: Promise<FileNode[]>[] = [];
      const filePromises: Promise<void>[] = [];

      // First pass: create all nodes
      for (const item of contents) {
        const node: FileNode = {
          name: item.name,
          path: item.path,
          type: item.type === 'dir' ? 'directory' : 'file'
        };

        if (item.type === 'dir') {
          directoryPromises.push(fetchDirectoryContents(owner, repo, item.path, fetchContent));
        } else if (item.type === 'file' && fetchContent) {
          filePromises.push(
            octokit.repos.getContent({
              owner,
              repo,
              path: item.path
            })
              .then(({ data: fileData }) => {
                if (typeof fileData === 'string' && fileData.startsWith('<!DOCTYPE')) {
                  throw new Error('GitHub API returned HTML response. This usually indicates an authentication or rate limit issue.');
                }

                if (!Array.isArray(fileData) && fileData.type === 'file' && 'content' in fileData) {
                  node.content = Buffer.from(fileData.content, 'base64').toString('utf-8');
                }
              })
              .catch(error => {
                console.error(`Error fetching content for ${item.path}:`, error);
                node.content = '';
              })
          );
        }

        nodes.push(node);
      }

      // Only wait for file content if requested
      if (fetchContent) {
        await Promise.all(filePromises);
      }
      
      // Process directory results and assign children
      const directoryResults = await Promise.all(directoryPromises);
      let dirIndex = 0;
      for (const node of nodes) {
        if (node.type === 'directory') {
          node.children = directoryResults[dirIndex++];
        }
      }

      return nodes;
    })();
    
    fileCache.set(cacheKey, promise);
    return promise;
  } catch (error) {
    console.error(`Error fetching directory contents for ${path}:`, error);
    throw new Error(`Failed to fetch directory contents: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function fetchFileContent(filePath: string, username: string, repo: string) {
  try {
    const { data } = await octokit.repos.getContent({
      owner: username,
      repo,
      path: filePath
    });

    if (typeof data === 'string' && data.startsWith('<!DOCTYPE')) {
      throw new Error('GitHub API returned HTML response. This usually indicates an authentication or rate limit issue.');
    }

    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
      throw new Error('Expected file content');
    }

    // GitHub API returns base64 encoded content
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return content;
  } catch (error) {
    console.error(`Error fetching file content for ${filePath}:`, error);
    throw new Error(`Failed to fetch file content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

