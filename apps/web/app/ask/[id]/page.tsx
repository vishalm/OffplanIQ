// apps/web/app/ask/[id]/page.tsx
// Phase 5.3 — Conversation route. Loads thread + ordered messages server-side,
// hands off to a client component that renders the conversation and runs the
// next assistant turn (which calls /api/threads/:id POST).

import { redirect, notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { looseSupabase } from '@/lib/supabase/loose'
import { Conversation } from '@/components/ai/Conversation'

export const dynamic = 'force-dynamic'

export default async function AskPage({ params }: Readonly<{ params: { id: string } }>) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const next = encodeURIComponent(`/ask/${params.id}`)
    redirect(`/auth/login?next=${next}`)
  }

  const sb = looseSupabase(supabase)
  const { data: thread } = await sb
    .from('chat_threads')
    .select('id, title, user_id, created_at, updated_at')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!thread) notFound()

  const { data: messages } = await sb
    .from('chat_messages')
    .select('id, role, content, sources, tool_name, tool_args, tool_result, iterations, created_at')
    .eq('thread_id', params.id)
    .order('created_at', { ascending: true })

  return (
    <div className="min-h-screen bg-white">
      <Conversation
        threadId={thread.id}
        threadTitle={thread.title || 'New conversation'}
        initialMessages={messages ?? []}
      />
    </div>
  )
}
