import { NextApiRequest, NextApiResponse } from 'next';
import { fetchFileContent } from '../../lib/github';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { path, username, repo } = req.query;

  if (!path || !username || !repo || 
      typeof path !== 'string' || 
      typeof username !== 'string' || 
      typeof repo !== 'string') {
    return res.status(400).json({ 
      error: 'Missing required parameters: path, username, and repo must be strings' 
    });
  }

  try {
    const content = await fetchFileContent(path, username, repo);
    res.status(200).json({ content });
  } catch (error) {
    console.error('Error fetching file content:', error);
    res.status(404).json({ 
      error: `Failed to fetch file content: ${error instanceof Error ? error.message : 'Unknown error'}` 
    });
  }
}