-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a table for storing document embeddings
create table if not exists document_embeddings (
  id bigint primary key generated always as identity,
  document_id text not null unique,
  content text not null,
  embedding vector(768), -- Gemini embeddings are 768 dimensions
  metadata jsonb,
  is_processed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create an index for faster similarity search
create index on document_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Function to match similar documents
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  max_matches int,
  username text default null,
  repo text default null
)
returns table (
  id bigint,
  document_id text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    document_embeddings.id,
    document_embeddings.document_id,
    document_embeddings.content,
    document_embeddings.metadata,
    1 - (document_embeddings.embedding <=> query_embedding) as similarity
  from document_embeddings
  where (
    username is null or
    (metadata->>'username')::text = username
  ) and (
    repo is null or
    (metadata->>'repo')::text = repo
  )
  order by document_embeddings.embedding <=> query_embedding
  limit max_matches;
end;
$$;