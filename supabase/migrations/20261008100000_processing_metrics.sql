-- Processing metrics and clause extraction.
--   pdf_type      'digital' (selectable text), 'scanned' (no text) or 'mixed' (some pages without text)
--   text_pages    pages that contain selectable text
--   *_ms          time spent uploading, extracting text in the browser, and analyzing with Claude
--   clauses       notable clauses Claude found: [{ "type", "title", "summary", "page", "quote" }]

alter table public.leases
  add column pdf_type text check (pdf_type in ('digital', 'scanned', 'mixed')),
  add column text_pages integer,
  add column upload_ms integer,
  add column extraction_ms integer,
  add column analysis_ms integer,
  add column clauses jsonb not null default '[]'::jsonb;

alter table public.lease_amendments
  add column pdf_type text check (pdf_type in ('digital', 'scanned', 'mixed')),
  add column text_pages integer,
  add column upload_ms integer,
  add column extraction_ms integer,
  add column analysis_ms integer;

-- Backfill the file type for documents processed before this change, from their saved page text.
-- A page counts as having text when it holds at least 30 non-blank characters (page numbers and
-- stray marks alone do not count). Digital = at least 90% of pages; scanned = none.
with stats as (
  select lease_id as id, count(*) as pages, count(*) filter (where length(btrim(text)) >= 30) as with_text
  from public.lease_pages group by lease_id
)
update public.leases l
set text_pages = s.with_text,
    pdf_type = case
      when s.with_text = 0 then 'scanned'
      when s.with_text >= ceil(s.pages * 0.9) then 'digital'
      else 'mixed'
    end
from stats s
where l.id = s.id and l.pdf_type is null;

with stats as (
  select amendment_id as id, count(*) as pages, count(*) filter (where length(btrim(text)) >= 30) as with_text
  from public.amendment_pages group by amendment_id
)
update public.lease_amendments a
set text_pages = s.with_text,
    pdf_type = case
      when s.with_text = 0 then 'scanned'
      when s.with_text >= ceil(s.pages * 0.9) then 'digital'
      else 'mixed'
    end
from stats s
where a.id = s.id and a.pdf_type is null;

-- Earlier "no text" failures were scanned PDFs whose pages were never saved.
update public.leases set pdf_type = 'scanned' where pdf_type is null and error_code = 'no_text';
update public.lease_amendments set pdf_type = 'scanned' where pdf_type is null and error_code = 'no_text';
