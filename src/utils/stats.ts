import type { Bindings } from '../types'

export const VIEW_SAMPLE_RATE = 10

export function shouldSampleView(): boolean {
  return Math.floor(Math.random() * VIEW_SAMPLE_RATE) === 0
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function trackPageView(env: Bindings, tenantId = 1, sampled = false): Promise<void> {
  if (!sampled && !shouldSampleView()) return
  try {
    await env.DB.prepare(
      `INSERT INTO daily_stats (date, views, tenant_id) VALUES (?, 1, ?)
       ON CONFLICT(date) DO UPDATE SET views = views + 1`
    ).bind(todayUTC(), Number(tenantId) || 1).run()
  } catch {}
}

export async function getRecentViewTrend(env: Bindings, days = 7, tenantId = 1): Promise<{ date: string; views: number }[]> {
  try {
    const rows = (await env.DB.prepare(
      `SELECT date, views FROM daily_stats WHERE tenant_id = ? ORDER BY date DESC LIMIT ?`
    ).bind(Number(tenantId) || 1, Math.min(Math.max(days, 1), 31)).all()).results as any[]
    return rows.reverse().map((r) => ({ date: r.date, views: r.views }))
  } catch { return [] }
}
