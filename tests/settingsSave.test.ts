import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { adminSettingsRoutes } from '../src/routes/admin/settings.ts'
import { tenantMiddleware } from '../src/middleware/tenant.ts'

/**
 * 最小 settings 表 shim：只实现 SettingsStore 真正用到的那几条语句。
 * 目的是验证「后台保存 → 前台读得到」这条链路，而不是复刻 D1。
 * 用同一份 rows 建 app，保证写入能被后续断言看到。
 */
function mountWith(rows: Map<string, string>) {
  const app = new Hono()
  app.use('*', tenantMiddleware() as never)
  app.route('/admin', adminSettingsRoutes)
  const ctx = { waitUntil() {}, passThroughOnException() {} }
  const db = {
    prepare(sql: string) {
      const s = sql.replace(/\s+/g, ' ').trim()
      let binds: any[] = []
      const stmt: any = {
        bind(...v: any[]) { binds = v; return stmt },
        async first() {
          if (/SELECT value FROM settings/i.test(s)) {
            const key = String(binds[binds.length - 1])
            return rows.has(key) ? { value: rows.get(key) } : null
          }
          return null
        },
        async all() {
          if (/FROM settings/i.test(s) && /NOT LIKE/i.test(s)) {
            return { results: [...rows.entries()].map(([key, value]) => ({ key, value })) }
          }
          return { results: [] }
        },
        async run() {
          if (/INSERT INTO settings/i.test(s)) { rows.set(String(binds[0]), String(binds[1])); return { meta: { changes: 1 } } }
          if (/DELETE FROM settings/i.test(s)) { rows.delete(String(binds[binds.length - 1])); return { meta: { changes: 1 } } }
          return { meta: { changes: 0 } }
        },
      }
      return stmt
    },
    async batch(items: any[]) { const out: any[] = []; for (const it of items) out.push(await it.run()); return out },
  }
  return (body: Record<string, string>) =>
    app.fetch(
      new Request('https://x.test/admin/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      }),
      { DB: db } as never,
      ctx as never,
    )
}

test('统一设置表单保存统计脚本 / CTA / UTM 白名单', async () => {
  const rows = new Map<string, string>()
  const post = mountWith(rows)
  const res = await post({
    __site_settings: '1',
    site_analytics_enabled: 'on',
    site_analytics_snippet: '<script>ga()</script>',
    site_cta_enabled: 'on',
    site_cta_title: '马上咨询',
    site_cta_subtitle: '工作日 9:00-18:00',
    site_cta_btn_text: '联系我',
    site_utm_source_whitelist: 'baidu,google',
  })
  assert.equal(res.status, 302)
  assert.equal(rows.get('site_analytics_enabled'), '1')
  assert.equal(rows.get('site_analytics_snippet'), '<script>ga()</script>')
  assert.equal(rows.get('site_cta_enabled'), '1')
  assert.equal(rows.get('site_cta_title'), '马上咨询')
  assert.equal(rows.get('site_cta_subtitle'), '工作日 9:00-18:00')
  assert.equal(rows.get('site_cta_btn_text'), '联系我')
  assert.equal(rows.get('site_utm_source_whitelist'), 'baidu,google')
})

test('取消勾选后保存会写成 0（复选框不提交也能关掉）', async () => {
  const rows = new Map<string, string>([['site_cta_enabled', '1'], ['site_analytics_enabled', '1']])
  const post = mountWith(rows)
  // 浏览器对未勾选的复选框不提交任何字段，只带表单标记。
  await post({ __site_settings: '1', site_name: '示例站' })
  assert.equal(rows.get('site_cta_enabled'), '0')
  assert.equal(rows.get('site_analytics_enabled'), '0')
})

test('不带表单标记的提交（如管理员账号表单）不会误关开关', async () => {
  const rows = new Map<string, string>([['site_cta_enabled', '1'], ['site_analytics_enabled', '1']])
  const post = mountWith(rows)
  await post({ site_name: '示例站' })
  assert.equal(rows.get('site_cta_enabled'), '1')
  assert.equal(rows.get('site_analytics_enabled'), '1')
})

test('保存后前台读得到（SettingsStore.getMap 不按注册表过滤）', async () => {
  const rows = new Map<string, string>()
  const post = mountWith(rows)
  await post({ __site_settings: '1', site_cta_title: '马上咨询', footer_copyright: '© 2026 示例站' })
  // 前台 layoutContext 走的就是 getMap('all')，这里直接断言底层行已落库。
  assert.equal(rows.get('site_cta_title'), '马上咨询')
  assert.equal(rows.get('footer_copyright'), '© 2026 示例站')
})
