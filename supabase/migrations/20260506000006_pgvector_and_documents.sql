-- ─────────────────────────────────────────────
-- LLM-Powered Property Intelligence (Phase 1.1)
-- ─────────────────────────────────────────────
-- Stores raw source documents (developer brochures, scraped pages) and their
-- chunk embeddings so the chat API can answer queries with citations.
--
-- Source-of-truth ownership:
--   * documents.content_text   ← scraper extracts (PDF text, cleaned HTML)
--   * document_chunks.embedding ← Azure OpenAI text-embedding-3-small (1536-d)
--
-- Read access is public (these are public marketing assets); writes require
-- the service role.

create extension if not exists vector;

-- ─── documents ───────────────────────────────────────────────
create table documents (
  id              uuid primary key default gen_random_uuid(),
  developer_id    uuid references developers(id) on delete cascade,
  project_id      uuid references projects(id)   on delete set null,

  source_url      text not null,
  doc_type        text not null check (doc_type in ('brochure','website','factsheet','press_release','floorplan','other')),
  title           text,                     -- derived from <title> or filename

  storage_path    text,                     -- e.g. 'developer-assets/emaar/creek-haven-brochure.pdf'
  content_hash    text,                     -- sha256(content_text) — change-detection
  content_text    text,                     -- extracted/cleaned plain text
  language        text default 'en',
  page_count      integer,

  metadata        jsonb default '{}'::jsonb,
  scraped_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null,

  -- One canonical row per (source_url, developer). Re-runs upsert by hash.
  unique (developer_id, source_url)
);

create index idx_documents_developer on documents(developer_id);
create index idx_documents_project   on documents(project_id);
create index idx_documents_doc_type  on documents(doc_type);
create index idx_documents_hash      on documents(content_hash);

-- ─── document_chunks ─────────────────────────────────────────
create table document_chunks (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references documents(id) on delete cascade,
  chunk_index     integer not null,

  chunk_text      text not null,
  token_count     integer,
  embedding       vector(1536),             -- text-embedding-3-small

  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz default now() not null,

  unique (document_id, chunk_index)
);

create index idx_chunks_document on document_chunks(document_id);

-- IVFFlat cosine similarity index. Tune `lists` ~= sqrt(rows) once we have data.
create index idx_chunks_embedding on document_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ─── updated_at trigger (reuses existing helper) ─────────────
create trigger trg_documents_updated
  before update on documents
  for each row execute function touch_updated_at();

-- ─── Row-level security ──────────────────────────────────────
alter table documents       enable row level security;
alter table document_chunks enable row level security;

create policy "documents_public_read"        on documents       for select using (true);
create policy "document_chunks_public_read"  on document_chunks for select using (true);

-- ─── RAG search RPC ──────────────────────────────────────────
-- Single-call vector search the web app uses. Caller passes embedded query;
-- server returns top-K chunks with their parent document context.
create or replace function search_document_chunks(
  query_embedding vector(1536),
  match_count     integer default 8,
  similarity_threshold float default 0.0
)
returns table (
  chunk_id      uuid,
  document_id   uuid,
  chunk_text    text,
  similarity    float,
  source_url    text,
  doc_type      text,
  title         text,
  developer_id  uuid,
  project_id    uuid
)
language sql stable
as $$
  select
    dc.id                                 as chunk_id,
    dc.document_id,
    dc.chunk_text,
    1 - (dc.embedding <=> query_embedding) as similarity,
    d.source_url,
    d.doc_type,
    d.title,
    d.developer_id,
    d.project_id
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
  order by dc.embedding <=> query_embedding
  limit match_count
$$;

-- ─── Developer crawl tracker ─────────────────────────────────
-- Lightweight column on developers so the scheduler can pick stale rows.
alter table developers
  add column if not exists official_url       text,
  add column if not exists last_crawled_at    timestamptz,
  add column if not exists crawl_status       text default 'pending'
    check (crawl_status in ('pending','crawling','ok','error','blocked')),
  add column if not exists crawl_error        text;

create index if not exists idx_developers_last_crawled on developers(last_crawled_at);

-- ─── Storage bucket: developer-assets ────────────────────────
-- Public-read so the web app can <iframe>/preview brochures directly.
-- Service-role writes only.
insert into storage.buckets (id, name, public)
  values ('developer-assets', 'developer-assets', true)
on conflict (id) do nothing;

-- Bucket-level policies. Anyone may read; only service-role may modify.
create policy "developer_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'developer-assets');

create policy "developer_assets_service_write"
  on storage.objects for insert
  with check (bucket_id = 'developer-assets' and auth.role() = 'service_role');

create policy "developer_assets_service_update"
  on storage.objects for update
  using (bucket_id = 'developer-assets' and auth.role() = 'service_role');

create policy "developer_assets_service_delete"
  on storage.objects for delete
  using (bucket_id = 'developer-assets' and auth.role() = 'service_role');
