-- 20260509000001_scrape_jobs.sql
--
-- Async scrape queue. The /admin Operations Copilot writes a row here
-- whenever an admin requests a scraper run; the Python worker (Railway in
-- prod, `python -m apps.scraper.main --poll` locally) drains pending rows
-- and updates status as it goes.
--
-- Status flow:  pending → running → success | failed
--
-- We keep this table small: a 14-day retention cron prunes finished rows.

CREATE TABLE IF NOT EXISTS scrape_jobs (
  id           UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper      TEXT                     NOT NULL,
  args         JSONB                    NOT NULL DEFAULT '{}',
  status       TEXT                     NOT NULL DEFAULT 'pending'
                                                CHECK (status IN ('pending','running','success','failed')),
  output       JSONB,
  error        TEXT,
  attempts     INTEGER                  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ              NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scrape_jobs_status_created_idx
  ON scrape_jobs (status, created_at)
  WHERE status IN ('pending','running');

CREATE INDEX IF NOT EXISTS scrape_jobs_scraper_status_idx
  ON scrape_jobs (scraper, status, created_at DESC);


-- RLS: admin-only via the service role; regular signed-in users see nothing.
-- The admin console talks to this table via the service-role client, so we
-- keep RLS on with no public policy — closed by default.
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;
-- (No CREATE POLICY here. Service role bypasses RLS.)


-- Convenience: claim_next_scrape_job picks one pending row and atomically
-- flips it to 'running'. The worker calls it in a loop. SKIP LOCKED makes it
-- safe even if multiple workers run simultaneously.
CREATE OR REPLACE FUNCTION claim_next_scrape_job()
RETURNS scrape_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job scrape_jobs;
BEGIN
  WITH next_job AS (
    SELECT id
    FROM scrape_jobs
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE scrape_jobs sj
     SET status     = 'running',
         started_at = now(),
         attempts   = sj.attempts + 1
    FROM next_job
   WHERE sj.id = next_job.id
   RETURNING sj.* INTO job;

  RETURN job;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_next_scrape_job() TO service_role;
