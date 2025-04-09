import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiEmbeddings {
  private model: any;

  constructor() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.model = genAI.getGenerativeModel({ model: 'embedding-001' });
  }

  async embedQuery(text: string): Promise<number[]> {
    try {
      // Split text into chunks if it's too large (max 36000 bytes)
      const textBytes = new TextEncoder().encode(text).length;
      if (textBytes <= 36000) {
        const result = await this.model.embedContent(text);
        // Extract embedding from the response
        const embeddingData = result?.embedding;
        if (!embeddingData || typeof embeddingData.values === 'undefined') {
          throw new Error('Invalid embedding response structure');
        }
        // Ensure values is an array and contains valid numbers
        if (!Array.isArray(embeddingData.values)) {
          throw new Error('Embedding values is not an array');
        }
        // Return the 768-dimensional vector directly
        const embedding = embeddingData.values.map(Number);
        return embedding;
      }

      // Split text into chunks of roughly equal size
      const chunkSize = Math.floor(36000 / 2); // Use half of max size for safety
      const chunks = [];
      let currentChunk = '';
      let currentSize = 0;

      for (const char of text) {
        const charBytes = new TextEncoder().encode(char).length;
        if (currentSize + charBytes > chunkSize && currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
          currentSize = 0;
        }
        currentChunk += char;
        currentSize += charBytes;
      }
      if (currentChunk) chunks.push(currentChunk);

      // Get embeddings for each chunk
      const chunkEmbeddings = await Promise.all(
        chunks.map(chunk => this.model.embedContent(chunk).then((r) => {
          const embeddingData = r?.embedding;
          if (!embeddingData || typeof embeddingData.values === 'undefined') {
            throw new Error('Invalid chunk embedding response structure');
          }
          if (!Array.isArray(embeddingData.values)) {
            throw new Error('Chunk embedding values is not an array');
          }
          // Return the 768-dimensional vector directly
          const embedding = embeddingData.values.map(Number);
          return embedding;
        }))
      );

      // Average the embeddings
      const embeddingLength = chunkEmbeddings[0].length;
      const averageEmbedding = new Array(embeddingLength).fill(0);
      for (const embedding of chunkEmbeddings) {
        for (let i = 0; i < embeddingLength; i++) {
          averageEmbedding[i] += embedding[i] / chunkEmbeddings.length;
        }
      }

      return averageEmbedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    try {
      const embeddings = await Promise.all(
        documents.map(doc => this.embedQuery(doc))
      );
      return embeddings;
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw error;
    }
  }
}