import test from 'node:test'
import assert from 'node:assert/strict'
import { generateAiPageContent } from '../src/utils/aiPageContent.ts'
import { normalizeAiSettings } from '../src/utils/aiSettings.ts'

/**
 * 回归：质量门槛 qualityEnough 必须与提示词的实际要求一致。
 *
 * 线上表现：「AI 设置 → 测试」连通性通过，但真实内容任务报
 * 「真实内容任务返回内容过短或为空」。
 *
 * 根因：门槛对 city/service/landing/article/page 全部强制要求正文出现
 * 「企业实际影响/实际影响」字样，并对 city 也要求 ≥4 个 H2/H3；
 * 但这些类型的提示词从不要求写「实际影响」，city 提示词只要求「至少 3 个小节」。
 * 于是模型按提示词正常产出的合格内容被稳定判失败，三轮全挂 → 返回 null。
 */

/** 只实现 SettingsStore 用到的读语句；返回空设置即可。 */
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
    async batch(items) {
      const out = []
      for (const it of items) out.push(await it.run())
      return out
    },
  }
  return db
}

/** 让 Worker AI 返回一份「像模型真实产出」的 JSON 正文。 */
function makeAi(payload) {
  return {
    async run() {
      return { response: JSON.stringify(payload) }
    },
  }
}

function makeEnv(payload) {
  return {
    DB: makeSettingsDb(),
    AI: makeAi(payload),
    CACHE_KV: null,
    R2_MEDIA: null,
    SITE_NAME: '示例站',
  }
}

const SETTINGS = normalizeAiSettings({ enabled: true, maxTokens: 4096 })

/** 城市页正文：3 个小节、含流程/风险/建议，且刻意不含「实际影响」字样。 */
function cityContent() {
  const pad = (topic) =>
    `围绕${topic}，先核对适用对象与办理条件，再按步骤准备所需材料并提交申请，` +
    `执行过程中需要留存回执以便后续查询。对于不满足条件的部分，应当先补充材料再重新提交，` +
    `避免因资料不全造成反复退回。整个办理周期通常需要预留充足时间，重要节点建议提前确认，` +
    `并安排专人跟进办理进度。若涉及多部门协同，建议先梳理各环节职责与交付物，` +
    `再按统一节奏推进，减少往返沟通带来的时间损耗。材料准备阶段应逐项核对清单，` +
    `对容易遗漏的证明材料提前补齐，避免在提交环节被动补充而拖慢整体进度。`
  return (
    '<p>城市服务办理需要先确认适用条件、材料清单与办理周期。</p>' +
    '<h2>适用对象与典型场景</h2><p>' + pad('适用对象') + '</p>' +
    '<h2>办理流程与材料准备</h2><p>' + pad('办理流程') + '</p>' +
    '<h2>风险提示与行动建议</h2><p>' + pad('风险提示') + '</p>'
  )
}

test('城市页：3 个小节、不含「实际影响」字样，仍应通过质量门槛', async () => {
  const env = makeEnv({
    title: '城市服务办理条件与流程说明',
    summary: '说明本地企业办理该项服务需要确认的适用条件、材料清单、办理流程与常见风险，帮助读者判断自身情况并做好办理前的准备工作。',
    content: cityContent(),
  })
  const result = await generateAiPageContent(env, 1, { type: 'city', city: '示例城市', keywords: ['示例主题'] }, SETTINGS)
  assert.ok(result, '门槛与提示词一致后，城市页不应被判失败')
  assert.ok(result.content.length >= 560, '正文应达到城市页最低字数')
  assert.ok(!/实际影响|企业影响/.test(result.content), '该正文本身不含「实际影响」，用于锁定门槛不再强制要求它')
})

test('城市页：正文只有 3 个小节也不应因小节数被判失败（提示词只要求 3 个）', async () => {
  const env = makeEnv({
    title: '城市服务办理条件与流程说明',
    summary: '说明本地企业办理该项服务需要确认的适用条件、材料清单、办理流程与常见风险，帮助读者判断自身情况并做好办理前的准备工作。',
    content: cityContent(),
  })
  const result = await generateAiPageContent(env, 1, { type: 'city', city: '示例城市', keywords: ['示例主题'] }, SETTINGS)
  assert.ok(result)
  const headings = (result.content.match(/<h[23][^>]*>/gi) || []).length
  assert.equal(headings, 3, '示例正文恰好 3 个小节')
})

test('服务页：内容合格即应通过（提示词要求 4 个小节，这里给 4 个）', async () => {
  const pad = (t) =>
    `围绕${t}，需要说明适用企业、准备材料、执行步骤与常见风险，并给出可执行的建议，` +
    `办理前应先核对自身条件，执行中留存凭证，结束后复查结果是否满足预期。` +
    `对于流程中涉及的核对环节，建议逐项确认并记录，便于后续追溯与复用；` +
    `涉及多环节协同时，先明确各环节的输入与输出，再按统一节奏推进，` +
    `可以显著减少返工与重复沟通，让整体办理更加可预期。`
  const content =
    '<p>服务办理需要先确认适用企业与所需材料清单。</p>' +
    '<h2>适用对象与场景</h2><p>' + pad('适用对象') + '</p>' +
    '<h2>服务范围与准备材料</h2><p>' + pad('服务范围') + '</p>' +
    '<h2>办理流程与执行步骤</h2><p>' + pad('办理流程') + '</p>' +
    '<h2>风险提示与行动建议</h2><p>' + pad('风险提示') + '</p>'
  const env = makeEnv({
    title: '服务办理条件与执行步骤说明',
    summary: '说明该项服务的适用对象、服务范围、准备材料、执行步骤与常见风险，帮助读者判断是否适用并完成办理前的准备工作。',
    content,
  })
  const result = await generateAiPageContent(env, 1, { type: 'service', service: '示例服务', keywords: ['示例主题'] }, SETTINGS)
  assert.ok(result)
})

test('普通页面（page）：不强制 3 个以上小节，也不强制「实际影响」', async () => {
  const env = makeEnv({
    title: '关于我们的服务能力与工作方式',
    summary: '介绍我们的服务能力、工作方式与合作流程，说明能够提供的支持范围以及沟通与协作的基本安排，便于读者了解如何开展合作。',
    content:
      '<p>我们提供面向企业的内容与技术支持服务。</p>' +
      '<h2>服务能力</h2><p>' + '团队具备内容策划、技术实施与持续运维能力，可以按阶段交付并根据反馈调整。'.repeat(8) + '</p>',
  })
  const result = await generateAiPageContent(env, 1, { type: 'page', pageLabel: '关于我们', pagePath: '/about' }, SETTINGS)
  assert.ok(result, '普通页面不应被流程/影响类门槛拦住')
})

test('AI 返回空内容时仍应判定失败（不能因为放宽门槛而放行空内容）', async () => {
  const env = makeEnv({ title: '无正文', summary: '', content: '' })
  const result = await generateAiPageContent(env, 1, { type: 'city', city: '示例城市', keywords: ['示例主题'] }, SETTINGS)
  assert.equal(result, null, '空正文必须判失败')
})

test('ai_max_tokens 下限提高到能写出合格正文的水平', () => {
  const tooSmall = normalizeAiSettings({ enabled: true, maxTokens: 256 })
  assert.ok(tooSmall.maxTokens >= 2048, '256 token 不可能写出城市页/文章要求的正文，必须被抬高')
  const normal = normalizeAiSettings({ enabled: true, maxTokens: 4096 })
  assert.equal(normal.maxTokens, 4096, '正常值不应被改动')
  const huge = normalizeAiSettings({ enabled: true, maxTokens: 999999 })
  assert.equal(huge.maxTokens, 32768, '上限仍然生效')
})
