import { ChromaClient, Collection } from 'chromadb';

interface EmbeddingData {
  content: string;
  file: string;
  type: string;
}

interface RepoData {
  name: string;
  owner: string;
}

interface QueryResult {
  id: string;
  document: string;
  metadata: {
    file: string;
    score?: number;
    [key: string]: any;
  };
}

let client: ChromaClient;
let collection: Collection;

async function initChroma() {
  if (!client) {
    client = new ChromaClient({
      path: process.env.CHROMA_API_URL || 'http://localhost:8000'
    });
    collection = await client.getOrCreateCollection('repository-embeddings');
  }
  return { client, collection };
}

export async function storeEmbeddings(repoData: RepoData, embeddings: EmbeddingData[]) {
  try {
    const { collection } = await initChroma();
    
    // Format the embeddings for ChromaDB
    const documents = embeddings.map(e => e.content);
    const metadatas = embeddings.map(e => ({
      file: e.file,
      repo: repoData.name,
      owner: repoData.owner,
      type: e.type,
      timestamp: new Date().toISOString()
    }));
    const ids = embeddings.map((_, i) => `${repoData.owner}-${repoData.name}-${i}`);
    
    // Store embeddings in ChromaDB
    await collection.add({
      ids,
      documents,
      metadatas
    });

    return {
      success: true,
      message: "Embeddings stored successfully"
    };
  } catch (error) {
    console.error("Error storing embeddings:", error);
    throw new Error(`Failed to store embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function queryEmbeddings(query: string, username: string, repo: string): Promise<{ results: QueryResult[] }> {
  try {
    const { collection } = await initChroma();
    
    // Query ChromaDB for relevant documents
    const results = await collection.query({
      queryTexts: [query],
      nResults: 5,
      where: { repo, owner: username }
    });

    // Format and return results
    return {
      results: results.documents[0].map((document, i) => ({
        id: results.ids[0][i],
        document,
        metadata: {
          ...results.metadatas[0][i],
          score: results.distances ? 1 - (results.distances[0][i] || 0) : undefined
        }
      }))
    };
  } catch (error) {
    console.error("Error querying embeddings:", error);
    throw new Error(`Failed to query embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

