import { fetchDirectoryContents, fetchFileContent } from './github';
import { checkDocumentProcessed, combineAndStoreDocument } from './supabase';
import { logger } from './logger';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  priority?: number;
  children?: FileNode[];
}

interface ProcessingResult {
  success: boolean;
  processedFiles: Array<{ path: string; chunksProcessed: number }>;
  errors: Array<{ path: string; error: string }>;
}

export class RepositoryAnalyzer {
  private readonly EXCLUDED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot',
    '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz', '.lock'
  ];

  private readonly EXCLUDED_DIRECTORIES = [
    'node_modules', '.git', '.github', 'dist', 'build', '.next', 'public/assets',
    'coverage', '.vscode', '.idea'
  ];

  private readonly PRIORITY_FILES = [
    'package.json', 'tsconfig.json', 'README.md', 'next.config.js', 'next.config.mjs',
    'app/layout.tsx', 'app/page.tsx', 'index.ts', 'index.tsx', 'main.ts', 'main.tsx'
  ];

  constructor(
    private readonly username: string,
    private readonly repo: string,
    private readonly maxFilesToProcess: number = 20
  ) {}

  private get repoId(): string {
    return `${this.username}/${this.repo}`;
  }

  async analyze(): Promise<ProcessingResult> {
    try {
      // Check if repository has already been processed
      const isProcessed = await checkDocumentProcessed(this.repoId);
      if (isProcessed) {
        logger.info('Repository has already been analyzed', { prefix: 'Analysis' });
        return {
          success: true,
          processedFiles: [],
          errors: []
        };
      }

      logger.repoAnalysis.start(this.repoId);

      // Fetch and filter repository files
      const files = await this.fetchAndFilterFiles();
      
      // Process files and generate embeddings
      return await this.processFiles(files);

    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Enhance error messages for common GitHub API issues
      if (error instanceof Error) {
        if (error.message.includes('Not Found')) {
          errorMessage = `Repository ${this.repoId} not found. Please check if the repository exists and is accessible.`;
        } else if (error.message.includes('Bad credentials') || error.message.includes('Unauthorized')) {
          errorMessage = 'GitHub API authentication failed. Please try again later.';
        } else if (error.message.includes('rate limit')) {
          errorMessage = 'GitHub API rate limit exceeded. Please try again later.';
        }
      }

      logger.error(`Repository analysis failed: ${errorMessage}`, { prefix: 'Analysis' });
      return {
        success: false,
        processedFiles: [],
        errors: [{ path: this.repoId, error: errorMessage }]
      };
    }
  }

  private async fetchAndFilterFiles(): Promise<FileNode[]> {
    // Fetch all files in the repository
    const allFiles = await fetchDirectoryContents(this.username, this.repo, '');
    logger.repoAnalysis.fileDiscovered(allFiles.length);

    // Filter and prioritize files
    const relevantFiles = this.filterRelevantFiles(allFiles);
    logger.repoAnalysis.relevantFiles(relevantFiles.length);

    return relevantFiles;
  }

  private filterRelevantFiles(files: FileNode[], currentPath = ''): FileNode[] {
    const relevantFiles: FileNode[] = [];

    for (const file of files) {
      const path = currentPath ? `${currentPath}/${file.name}` : file.name;

      if (file.type === 'directory') {
        // Skip excluded directories
        if (this.EXCLUDED_DIRECTORIES.some(dir => path.includes(dir))) {
          continue;
        }

        // Recursively process subdirectories
        if (file.children) {
          relevantFiles.push(...this.filterRelevantFiles(file.children, path));
        }
      } else if (file.type === 'file') {
        // Skip excluded file extensions
        if (this.EXCLUDED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
          continue;
        }

        // Assign priority to important files
        const isPriority = this.PRIORITY_FILES.includes(file.name);
        relevantFiles.push({
          ...file,
          priority: isPriority ? 1 : 0
        });
      }
    }

    // Sort by priority (important files first)
    return relevantFiles.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  private async processFiles(files: FileNode[]): Promise<ProcessingResult> {
    const processedFiles: Array<{ path: string; chunksProcessed: number }> = [];
    const errors: Array<{ path: string; error: string }> = [];

    // Process only the most important files
    const filesToProcess = files.slice(0, this.maxFilesToProcess);

    for (const file of filesToProcess) {
      try {
        logger.repoAnalysis.processingFile(file.path);
        const content = await fetchFileContent(file.path, this.username, this.repo);
        
        if (!content) {
          throw new Error('Empty file content');
        }

        // Split content into chunks and prepare for embedding
        const chunks = this.chunkContent(content);
        const fileChunks = chunks.map(chunk => ({
          content: chunk,
          metadata: {
            repo: this.repo,
            owner: this.username,
            filePath: file.path,
            fileType: file.type
          }
        }));

        // Store document with embeddings
        const documentId = `${this.repoId}/${file.path}`;
        await combineAndStoreDocument(documentId, fileChunks);

        processedFiles.push({
          path: file.path,
          chunksProcessed: chunks.length
        });

        logger.repoAnalysis.fileProcessed(file.path, chunks.length);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.repoAnalysis.error(file.path, errorMessage);
        errors.push({
          path: file.path,
          error: errorMessage
        });
      }
    }

    logger.repoAnalysis.complete(processedFiles.length, errors.length);

    return {
      success: processedFiles.length > 0,
      processedFiles,
      errors
    };
  }

  private chunkContent(content: string): string[] {
    const MAX_CHUNK_SIZE = 1000;
    const chunks: string[] = [];
    let currentChunk = '';

    // Split content by lines
    const lines = content.split('\n');

    for (const line of lines) {
      // If adding this line would exceed the chunk size, start a new chunk
      if ((currentChunk + line).length > MAX_CHUNK_SIZE && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += line + '\n';
    }

    // Add the last chunk if it's not empty
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}