import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { renderSettingsPage } from '../src/templates/adminSystem.ts'
import { applyCspNonceToSnippet } from '../src/templates/layout.ts'
import { tenantMiddleware, getTenantId, DEFAULT_TENANT_ID } from '../src/middleware/tenant.ts'

/** 取出统一设置表单（id="industryConfigForm"）的 HTML 片段。 */
function unifiedForm(html: string): string {
  const start = html.indexOf('id="industryConfigForm"')
  assert.ok(start > -1, '系统设置页应包含统一设置表单 #industryConfigForm')
  const open = html.lastIndexOf('<form', start)
  const end = html.indexOf('</form>', start)
  assert.ok(end > open, '统一设置表单应有闭合标签')
  return html.slice(open, end + '</form>'.length)
}

test('系统设置页把统计脚本 / CTA / UTM 白名单都渲染成可编辑控件', () => {
  const html = renderSettingsPage({ site_name: '示例站' }, '', false, '', '示例站', 'nonce123', 'csrf123')
  for (const name of [
    'site_analytics_enabled', 'site_analytics_snippet',
    'site_cta_enabled', 'site_cta_title', 'site_cta_subtitle', 'site_cta_btn_text',
    'site_utm_source_whitelist',
  ]) {
    assert.ok(html.includes(`name="${name}"`), `缺少可编辑控件: ${name}`)
  }
})

test('统一设置表单带 __site_settings 标记，且内部不再嵌套其它 form', () => {
  const html = renderSettingsPage({}, '', false, '', '示例站', 'n', 'c')
  const form = unifiedForm(html)
  assert.ok(form.includes('name="__site_settings"'), '缺少表单提交标记，取消勾选将无法保存为关闭')
  // 嵌套 form 是非法 HTML，浏览器会把内层 form 丢掉，导致内层字段静默不提交。
  assert.equal(form.slice(form.indexOf('>') + 1).includes('<form'), false, '统一设置表单内不应嵌套 <form>')
})

test('开关类设置：只有显式存成 0 才渲染为未勾选', () => {
  const on = renderSettingsPage({}, '', false, '', '示例站', 'n', 'c')
  assert.match(on, /name="site_cta_enabled" checked/)
  assert.match(on, /name="site_analytics_enabled" checked/)

  const off = renderSettingsPage({ site_cta_enabled: '0', site_analytics_enabled: '0' }, '', false, '', '示例站', 'n', 'c')
  assert.doesNotMatch(off, /name="site_cta_enabled" checked/)
  assert.doesNotMatch(off, /name="site_analytics_enabled" checked/)
})

test('站点基础信息与站点关联配置在同一个表单里（一次保存全部生效）', () => {
  const form = unifiedForm(renderSettingsPage({}, '', false, '', '示例站', 'n', 'c'))
  for (const name of ['site_url', 'site_topic', 'primary_keywords', 'site_title', 'site_description',
    'site_favicon', 'site_default_title_template', 'site_default_desc_template', 'site_llms_content',
    'footer_copyright', 'footer_links', 'turnstile_site_key']) {
    assert.ok(form.includes(`name="${name}"`), `${name} 应位于统一设置表单内`)
  }
})

test('applyCspNonceToSnippet 给内联脚本补 nonce，不动已有 nonce 的脚本', () => {
  const nonce = 'abc123'
  assert.equal(
    applyCspNonceToSnippet('<script>ga()</script>', nonce),
    `<script nonce="${nonce}">ga()</script>`,
  )
  assert.equal(
    applyCspNonceToSnippet('<script nonce="keep">x</script>', nonce),
    '<script nonce="keep">x</script>',
  )
  assert.equal(
    applyCspNonceToSnippet('<script async src="https://www.googletagmanager.com/gtag/js"></script>', nonce),
    `<script nonce="${nonce}" async src="https://www.googletagmanager.com/gtag/js"></script>`,
  )
  // 没有 nonce 时原样返回，避免把空 nonce 写进属性（那会让脚本被 CSP 拦掉）。
  assert.equal(applyCspNonceToSnippet('<script>x</script>', ''), '<script>x</script>')
  assert.equal(applyCspNonceToSnippet('', nonce), '')
})

test('applyCspNonceToSnippet 丢弃非十六进制字符，不会把 nonce 属性写坏', () => {
  assert.equal(
    applyCspNonceToSnippet('<script>x</script>', 'a"b<c>d'),
    '<script nonce="abcd">x</script>',
  )
})

test('tenantMiddleware 单站点恒注入 tenant_id = 1', async () => {
  const app = new Hono<{ Variables: { tenant: unknown } }>()
  app.use('*', tenantMiddleware() as never)
  app.get('*', (c) => c.json({ id: getTenantId(c as never) }))

  for (const path of ['/', '/admin/settings', '/t/anything', '/api/v1/x']) {
    const res = await app.fetch(new Request('https://x.test' + path), {}, {})
    assert.equal(res.status, 200, path)
    assert.deepEqual(await res.json(), { id: DEFAULT_TENANT_ID }, path)
  }
})
