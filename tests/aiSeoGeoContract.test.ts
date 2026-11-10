import test from 'node:test'
import assert from 'node:assert/strict'
import { generateAiPageContent } from '../src/utils/aiPageContent.ts'
import { normalizeAiSettings } from '../src/utils/aiSettings.ts'
import { checkGeoContent } from '../src/utils/geoCheck.ts'
import { auditSeoPage } from '../src/utils/seoAudit.ts'

function makeSettingsDb() {
  const db = {
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim()
      const stmt = {
        bind() { return stmt },
        async first() { return /SELECT value FROM settings/.test(s) ? null : null },
        async all() { return { results: [] } },
        async run() { return { meta: { changes: 0 } } },
      }
      return stmt
    },
    async batch(items) { const out = []; for (const it of items) out.push(await it.run()); return out },
  }
  return db
}

function makeEnv(payload) {
  return {
    DB: makeSettingsDb(),
    AI: { async run() { return { response: JSON.stringify(payload) } } },
    CACHE_KV: null,
    R2_MEDIA: null,
    SITE_NAME: '示例站',
  }
}

const SETTINGS = normalizeAiSettings({ enabled: true, maxTokens: 4096 })

/** 按新提示词要求产出的正文：首段 ≤80 字、4 个小节、含办理流程/注意事项/实际影响、≥800 字。 */
function body(topic) {
  const pad = (t) =>
    `围绕${t}，企业需要先核对自身适用条件与材料清单，再按统一节奏推进各环节，` +
    `执行过程中留存回执与交付物，便于后续查询与复用。对于不满足条件的部分，` +
    `应当先补充材料再重新提交，避免因资料不全造成反复退回。整个办理周期通常需要` +
    `预留充足时间，重要节点建议提前确认，并安排专人跟进办理进度。若涉及多部门协同，` +
    `建议先梳理各环节职责与交付物，再按统一节奏推进，减少往返沟通带来的时间损耗。`
  return (
    '<p>企业办理该项业务前，需要先确认适用条件、材料清单与办理周期。</p>' +
    '<h2>适用对象与典型场景</h2><p>' + pad('适用对象') + '</p>' +
    '<h2>办理流程与执行步骤</h2><p>' + pad('办理流程') + '</p>' +
    '<h2>注意事项与风险提醒</h2><p>' + pad('风险提示') + '</p>' +
    '<h2>对企业经营的实际影响</h2><p>' + pad('实际影响') + '</p>'
  )
}

const SUMMARY = '说明本地企业办理该项业务需要确认的适用条件、材料清单、办理流程与常见风险，帮助读者判断自身情况并做好办理前的准备工作，减少反复退回带来的时间损耗。'

test('城市页：新提示词产出的内容应同时通过 GEO 与 SEO 审计', async () => {
  const env = makeEnv({ title: '城市业务办理条件与流程说明', summary: SUMMARY, content: body('城市业务') })
  const result = await generateAiPageContent(env, 1, { type: 'city', city: '示例城市', keywords: ['示例主题'] }, SETTINGS)
  assert.ok(result, '城市页不应被判失败')

  const geo = checkGeoContent({ title: result.title, content: result.content })
  assert.equal(geo.score, 100, 'GEO 六项应全部通过，实际：' + JSON.stringify(geo.items.filter((i) => !i.ok)))

  const seo = auditSeoPage({
    type: 'city', key: 'city-1', title: result.title, url: '/city/1',
    description: result.summary, content: result.content, keywords: '办理流程,注意事项,实际影响',
    indexable: true, sitemap: true,
  })
  assert.ok(seo.score >= 82, 'SEO 应达到 good 档，实际 ' + seo.score + '：' + JSON.stringify(seo.reasons))
})

test('文章：新提示词产出的内容应同时通过 GEO 与 SEO 审计', async () => {
  const env = makeEnv({ title: '行业业务办理要点与风险说明', summary: SUMMARY, content: body('行业业务') })
  const result = await generateAiPageContent(env, 1, { type: 'article', title: '示例行业文章', keywords: ['示例主题'] }, SETTINGS)
  assert.ok(result, '文章不应被判失败')

  const geo = checkGeoContent({ title: result.title, content: result.content })
  assert.equal(geo.score, 100, 'GEO 六项应全部通过，实际：' + JSON.stringify(geo.items.filter((i) => !i.ok)))

  const seo = auditSeoPage({
    type: 'article', key: 'article-1', title: result.title, url: '/article/1',
    description: result.summary, content: result.content, keywords: '办理流程,注意事项,实际影响',
    indexable: true, sitemap: true,
  })
  assert.ok(seo.score >= 82, 'SEO 应达到 good 档，实际 ' + seo.score + '：' + JSON.stringify(seo.reasons))
})

test('超长首段会被自动拆分，仍满足 GEO 首段 ≤80 字', async () => {
  const longLead = '企业办理该项业务前需要先确认适用条件、材料清单与办理周期，同时核对自身资质是否满足要求，避免在提交环节被动补充材料而拖慢整体进度。'
  const env = makeEnv({
    title: '城市业务办理条件与流程说明', summary: SUMMARY,
    content: body('城市业务').replace(/<p>[^<]*<\/p>/, '<p>' + longLead + '</p>'),
  })
  const result = await generateAiPageContent(env, 1, { type: 'city', city: '示例城市', keywords: ['示例主题'] }, SETTINGS)
  assert.ok(result, '超长首段不应导致整次生成失败')
  const geo = checkGeoContent({ title: result.title, content: result.content })
  assert.equal(geo.items.find((i) => i.key === 'lead')?.ok, true, '首段应被拆到 80 字以内')
})

test('首轮输出被 token 上限截断时，重试会抬高输出预算', async () => {
  const calls: any[] = []
  // 截断特征：JSON 花括号不闭合 + <p> 未闭合
  const truncated =
    '{"title":"城市业务办理条件与流程说明","summary":"' + SUMMARY +
    '","content":"<p>企业办理该项业务前，需要先确认适用条件。</p><h2>办理流程与执行步骤</h2><p>围绕办理流程，企业需要先核对'

  const env = {
    DB: makeSettingsDb(),
    AI: {
      async run(_model: string, payload: any) {
        calls.push(payload)
        if (calls.length === 1) return { response: truncated }
        return { response: JSON.stringify({ title: '城市业务办理条件与流程说明', summary: SUMMARY, content: body('城市业务') }) }
      },
    },
    CACHE_KV: null,
    R2_MEDIA: null,
    SITE_NAME: '示例站',
  }

  const result = await generateAiPageContent(env, 1, { type: 'city', city: '示例城市', keywords: ['示例主题'] }, SETTINGS)
  assert.ok(result, '截断后重试应能成功')
  assert.ok(calls.length >= 2, '应发生重试，实际调用 ' + calls.length + ' 次')
  assert.ok(calls[1].max_tokens >= 8192, '截断重试应抬高输出预算，实际 ' + calls[1].max_tokens)
})

test('首轮输出完整但质量不达标时，重试不额外抬高预算', async () => {
  const calls: any[] = []
  const env = {
    DB: makeSettingsDb(),
    AI: {
      async run(_model: string, payload: any) {
        calls.push(payload)
        if (calls.length === 1) return { response: JSON.stringify({ title: '太短', summary: '短', content: '<p>短。</p>' }) }
        return { response: JSON.stringify({ title: '城市业务办理条件与流程说明', summary: SUMMARY, content: body('城市业务') }) }
      },
    },
    CACHE_KV: null,
    R2_MEDIA: null,
    SITE_NAME: '示例站',
  }

  const result = await generateAiPageContent(env, 1, { type: 'city', city: '示例城市', keywords: ['示例主题'] }, SETTINGS)
  assert.ok(result)
  assert.equal(calls[1].max_tokens, 4096, '未截断时保持常规重试预算')
})
