import { createClient } from '@supabase/supabase-js'
import { GeminiEmbeddings } from './gemini-embeddings'
import { logger } from './logger'
import { error } from 'console'

// Initialize Supabase client with environment variables
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true
    }
  }
)

// Initialize Supabase admin client with environment variables
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true
    }
  }
)

// Initialize Gemini embeddings
export const embeddings = new GeminiEmbeddings()

// Function to check if a document has already been processed
export async function checkDocumentProcessed(repoId: string) {
  try {
    const { data, error } = await supabaseClient
      .from('document_embeddings')
      .select('document_id')
      .eq('document_id', repoId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return !!data
  } catch (error) {
    console.error('Error checking document status:', error)
    throw error
  }
}

// Function to store document embeddings
export async function storeDocumentEmbeddings(documentId: string, content: string, metadata: any, isMainDocument = false) {
  try {
    // Check if document already exists
    const { data: existingDoc } = await supabaseClient
      .from('document_embeddings')
      .select('document_id')
      .eq('document_id', documentId)
      .single();

    if (existingDoc) {
      logger.info(`Document ${documentId} already exists, skipping embedding generation`, { prefix: 'Embeddings' });
      return existingDoc;
    }

    const embedding = await embeddings.embedQuery(content)
    
    // Format embedding array for Supabase vector storage
    const formattedEmbedding = `[${embedding.join(',')}]`
    
    const { data, error } = await supabaseClient
      .from('document_embeddings')
      .insert([
        {
          document_id: documentId,
          content,
          embedding: formattedEmbedding,
          metadata,
          is_processed: isMainDocument
        }
      ])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') { // Unique violation
        logger.info(`Document ${documentId} was inserted by another process, skipping`, { prefix: 'Embeddings' });
        return null;
      }
      throw error;
    }
    return data
  } catch (error) {
    console.error('Error storing document embeddings:', error)
    throw error
  }
}

// Function to combine chunks and store as a single document
export async function combineAndStoreDocument(repoId: string, chunks: { content: string, metadata: any }[]) {
  try {
    // Combine all chunks into a single content string
    const combinedContent = chunks.map(chunk => chunk.content).join('\n\n')
    
    // Merge metadata from all chunks
    const mergedMetadata = {
      ...chunks[0].metadata,
      totalChunks: chunks.length,
      combinedDocument: true
    }
    
    // Store the combined document
    return await storeDocumentEmbeddings(repoId, combinedContent, mergedMetadata, true)
  } catch (error) {
    console.error('Error combining and storing document:', error)
    throw error
  }
}

// Function to search similar documents
export async function searchSimilarDocuments(query: string, maxResults = 50, repoFilter?: { username: string; repo: string }) {
  try {
    // Get all documents from the repository without similarity matching
    const { data: documents, error } = await supabaseClient
      .from('document_embeddings')
      .select('*')
      .eq('metadata->owner', repoFilter?.username)
      .eq('metadata->repo', repoFilter?.repo)
      .limit(maxResults)

    if (error) throw error
    return documents
  } catch (error) {
    console.error('Error searching similar documents:', error)
    throw error
  }
}

