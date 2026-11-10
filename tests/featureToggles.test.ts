import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FEATURES,
  DEFAULT_FEATURE_TOGGLES,
  SEO_ONLY_TOGGLES,
  normalizeFeatureToggles,
  getFeatureToggles,
  saveFeatureToggles,
  disabledFeatureForPath,
  disabledPaths,
  buildNavHideScript,
} from '../src/utils/featureToggles.ts'

/**
 * 后台功能开关：只控制后台模块的可见性与可访问性，不删除任何代码。
 * 缺省必须全部开启，否则老部署升级后后台会凭空少掉一批菜单。
 */

function makeEnv(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial }
  const db = {
    prepare(sql: string) {
      const s = sql.replace(/\s+/g, ' ').trim()
      const stmt: any = {
        _args: [] as any[],
        bind(...args: any[]) { stmt._args = args; return stmt },
        async first() {
          const key = String(stmt._args[stmt._args.length - 1])
          return key in store ? { value: store[key] } : null
        },
        async all() { return { results: [] } },
        async run() {
          if (/^INSERT INTO settings/.test(s)) store[String(stmt._args[0])] = String(stmt._args[1])
          return { meta: { changes: 1 } }
        },
      }
      return stmt
    },
    async batch(items: any[]) { for (const it of items) await it.run(); return [] },
  }
  return { DB: db, _store: store } as any
}

test('缺省全部开启：老部署没有这个键时行为不变', async () => {
  const env = makeEnv()
  const toggles = await getFeatureToggles(env, 1)
  for (const f of FEATURES) assert.equal(toggles[f.key], true, f.key + ' 缺省应为开启')
})

test('normalizeFeatureToggles：非法输入回落到全部开启', () => {
  for (const bad of [null, undefined, '', 0, 'x', []]) {
    const t = normalizeFeatureToggles(bad)
    assert.deepEqual(t, DEFAULT_FEATURE_TOGGLES, '非法输入 ' + JSON.stringify(bad) + ' 应回落默认')
  }
})

test('normalizeFeatureToggles：显式关闭被保留，未提及的键保持开启', () => {
  const t = normalizeFeatureToggles({ social: false, messages: '0', aiqa: 'off' })
  assert.equal(t.social, false)
  assert.equal(t.messages, false)
  assert.equal(t.aiqa, false)
  assert.equal(t.seo, true, '未提及的键必须保持开启')
})

test('「仅 SEO/GEO」预设：只保留 core 功能', () => {
  for (const f of FEATURES) {
    assert.equal(SEO_ONLY_TOGGLES[f.key], f.core, f.key + ' 的预设值应与 core 标记一致')
  }
  assert.equal(SEO_ONLY_TOGGLES.seo, true)
  assert.equal(SEO_ONLY_TOGGLES.content, true, '内容管理是 SEO 的载体，必须保留')
  assert.equal(SEO_ONLY_TOGGLES.social, false)
  assert.equal(SEO_ONLY_TOGGLES.aiqa, false)
})

test('disabledFeatureForPath：命中精确路径与子路径', () => {
  const t = { ...DEFAULT_FEATURE_TOGGLES, social: false }
  assert.equal(disabledFeatureForPath(t, '/admin/social')?.key, 'social')
  assert.equal(disabledFeatureForPath(t, '/admin/social/settings')?.key, 'social')
  assert.equal(disabledFeatureForPath(t, '/admin/articles'), null, '未关闭的模块不应命中')
})

test('disabledFeatureForPath：前缀匹配不能误伤同前缀的其它路径', () => {
  const t = { ...DEFAULT_FEATURE_TOGGLES, seo: false }
  assert.equal(disabledFeatureForPath(t, '/admin/seo')?.key, 'seo')
  assert.equal(disabledFeatureForPath(t, '/admin/seo/submit')?.key, 'seo', '子路径应被覆盖')
  assert.equal(disabledFeatureForPath(t, '/admin/seo-audit/delete')?.key, 'seo', 'SEO 体检同属 seo 模块')
  // /admin/settings 与 /admin/seo 共享前缀，但必须保持可访问
  assert.equal(disabledFeatureForPath(t, '/admin/settings'), null)
  assert.equal(disabledFeatureForPath(t, '/admin/system'), null)
})

test('disabledFeatureForPath：常驻页面永远可访问', () => {
  const t = SEO_ONLY_TOGGLES
  for (const p of ['/admin', '/admin/analytics', '/admin/settings', '/admin/features', '/admin/system', '/admin/system-secrets']) {
    assert.equal(disabledFeatureForPath(t, p), null, p + ' 必须始终可访问')
  }
})

test('disabledPaths：只返回已关闭功能的路径', () => {
  const t = { ...DEFAULT_FEATURE_TOGGLES, social: false, aiqa: false }
  const paths = disabledPaths(t)
  assert.deepEqual(paths.sort(), ['/admin/ai-qa', '/admin/social'])
})

test('buildNavHideScript：无关闭项时不注入脚本', () => {
  assert.equal(buildNavHideScript(DEFAULT_FEATURE_TOGGLES, 'abc123'), '')
})

test('buildNavHideScript：缺少 nonce 时不注入（否则会被 CSP 拦掉）', () => {
  assert.equal(buildNavHideScript(SEO_ONLY_TOGGLES, ''), '')
  assert.equal(buildNavHideScript(SEO_ONLY_TOGGLES, '!!!'), '')
})

test('buildNavHideScript：包含关闭路径且带 nonce', () => {
  const script = buildNavHideScript({ ...DEFAULT_FEATURE_TOGGLES, social: false }, 'deadbeef')
  assert.ok(script.includes('nonce="deadbeef"'))
  assert.ok(script.includes('/admin/social'))
  assert.ok(!script.includes('/admin/seo'), '未关闭的模块不应出现在隐藏列表里')
})

test('保存后能读回：往返一致', async () => {
  const env = makeEnv()
  await saveFeatureToggles(env, SEO_ONLY_TOGGLES, 1)
  const back = await getFeatureToggles(env, 1)
  assert.deepEqual(back, SEO_ONLY_TOGGLES)
})

test('存储内容损坏时回落到全部开启，不抛错', async () => {
  const env = makeEnv({ feature_toggles: '{ 这不是 JSON' })
  const t = await getFeatureToggles(env, 1)
  assert.deepEqual(t, DEFAULT_FEATURE_TOGGLES)
})
