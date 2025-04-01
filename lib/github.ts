import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileNode[];
}

export async function fetchRepoData(username: string, repo: string) {
  try {
    // Fetch repository metadata
    const { data: repoData } = await octokit.repos.get({
      owner: username,
      repo: repo
    });

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
}

export async function fetchDirectoryContents(owner: string, repo: string, path: string): Promise<FileNode[]> {
  try {
    const { data: contents } = await octokit.repos.getContent({
      owner,
      repo,
      path: path || ''
    });

    if (!Array.isArray(contents)) {
      throw new Error('Expected directory contents');
    }

    const nodes: FileNode[] = [];

    for (const item of contents) {
      const node: FileNode = {
        name: item.name,
        path: item.path,
        type: item.type === 'dir' ? 'directory' : 'file'
      };

      if (item.type === 'dir') {
        node.children = await fetchDirectoryContents(owner, repo, item.path);
      } else if (item.type === 'file') {
        try {
          const { data: fileData } = await octokit.repos.getContent({
            owner,
            repo,
            path: item.path
          });

          if (!Array.isArray(fileData) && fileData.type === 'file' && 'content' in fileData) {
            node.content = Buffer.from(fileData.content, 'base64').toString('utf-8');
          }
        } catch (error) {
          console.error(`Error fetching content for ${item.path}:`, error);
          node.content = ''; // Set empty content on error
        }
      }

      nodes.push(node);
    }

    return nodes;
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

