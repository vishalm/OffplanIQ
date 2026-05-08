// apps/web/lib/supabase/loose.ts
//
// Single chokepoint for Supabase queries that touch tables/columns added in
// migrations not yet reflected in `database.types.ts`. Returns the same
// client cast loosely.
//
// Replace each `looseSupabase(supabase)` call with the typed client (just
// `supabase`) once the corresponding migration ships AND types are
// regenerated:
//
//   npx supabase gen types typescript --project-id edfypqbzetfdorcndhfm \
//     > apps/web/types/database.ts
//
// Affected tables (added by these unapplied migrations):
//   * `documents`, `document_chunks`        (20260506000006)
//   * `project_updates`                     (20260506000007)
//   * `saved_searches`                      (20260506000008)
//   * `chat_threads`, `chat_messages`       (20260506000009)
//   * `developers.tier`/contact metadata    (20260507000001)
//
// New columns shipped earlier but not yet regenerated in types:
//   * `projects.city`                       (20260506000004)
//   * `projects.narrative`, `news`          (20260506000005)
//   * `developers.official_url`/crawl_*     (20260506000006)
//
// Until types are regenerated, all queries that touch these surfaces go
// through this helper. Greppable, documented, single point of truth.

import 'server-only'

import type { createServerClient } from '@/lib/supabase/server'
import type { createServiceClient } from '@/lib/supabase/service'

type AnyClient = ReturnType<typeof createServerClient> | ReturnType<typeof createServiceClient>

/**
 * Returns the Supabase client cast loosely so it can query post-migration
 * tables/columns that aren't in `database.types.ts` yet.
 *
 * Always pass the same client back through — never construct a new one.
 */
export function looseSupabase(client: AnyClient): any {
  return client
}
