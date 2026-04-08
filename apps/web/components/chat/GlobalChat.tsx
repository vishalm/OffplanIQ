import { createServerClient } from '@/lib/supabase/server'
import { ChatProvider } from './ChatProvider'

export async function GlobalChat() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) return null

  // Fetch project summaries for chat context
  const { data: projects } = await supabase
    .from('projects')
    .select('name, slug, area, score, current_psf, launch_psf, sellthrough_pct, min_price, handover_delay_days, current_handover_date, developer:developer_id(name)')
    .in('status', ['active', 'pre_launch'])
    .order('score', { ascending: false })

  const chatData = (projects ?? []).map((p: any) => ({
    name: p.name, area: p.area, score: p.score, psf: p.current_psf,
    sold: p.sellthrough_pct, developer: p.developer?.name,
    minPrice: p.min_price,
    growth: p.launch_psf && p.current_psf ? Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100) : null,
    delayed: p.handover_delay_days > 0, slug: p.slug,
  }))

  return <ChatProvider projectData={JSON.stringify(chatData)} />
}
