import test from 'node:test'
import assert from 'node:assert/strict'
import { getAiPromptSettings, saveAiPromptSettings, composeAiPrompt } from '../src/utils/aiPrompts.ts'

/**
 * 提示词设置已从「按任务拆 8 个输入框」收敛为「一个统一补充字段」。
 *
 * 这里锁定两件事：
 * 1. 升级不丢配置——旧版按任务保存的提示词会被合并进统一字段；
 * 2. 统一字段对所有任务生效，不会只作用于某一个任务。
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
        async all() {
          const keys = stmt._args.filter((a: any) => typeof a === 'string' && a.startsWith('ai_prompt_'))
          return { results: keys.filter((k: string) => k in store).map((k: string) => ({ key: k, value: store[k] })) }
        },
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

test('未配置任何提示词：返回空的统一字段', async () => {
  const settings = await getAiPromptSettings(makeEnv(), 1)
  assert.deepEqual(settings, { custom: '' })
})

test('旧版按任务保存的提示词会被合并进统一字段，升级不丢配置', async () => {
  const env = makeEnv({
    ai_prompt_global: '语气要克制。',
    ai_prompt_city: '城市页要写本地场景。',
    ai_prompt_article: '文章要有可执行步骤。',
  })
  const settings = await getAiPromptSettings(env, 1)
  assert.ok(settings.custom.includes('语气要克制。'))
  assert.ok(settings.custom.includes('城市页要写本地场景。'))
  assert.ok(settings.custom.includes('文章要有可执行步骤。'))
  assert.ok(settings.custom.includes('【全局规则】'), '合并后应保留来源标注，便于人工整理')
  assert.ok(settings.custom.includes('【城市页面】'))
})

test('统一字段已有内容时，不再合并旧键（避免每次读取都重复拼接）', async () => {
  const env = makeEnv({
    ai_prompt_custom: '统一规则。',
    ai_prompt_global: '旧规则。',
  })
  const settings = await getAiPromptSettings(env, 1)
  assert.equal(settings.custom, '统一规则。')
})

test('保存后能读回：往返一致', async () => {
  const env = makeEnv()
  await saveAiPromptSettings(env, { custom: '面向中小企业，语气务实。' }, 1)
  const back = await getAiPromptSettings(env, 1)
  assert.equal(back.custom, '面向中小企业，语气务实。')
})

test('清空自定义：保存空串后读回为空', async () => {
  const env = makeEnv({ ai_prompt_custom: '旧内容' })
  await saveAiPromptSettings(env, { custom: '' }, 1)
  const back = await getAiPromptSettings(env, 1)
  assert.equal(back.custom, '')
})

test('统一补充规则对所有任务生效，不是只作用于某一个任务', () => {
  const settings = { custom: '本站在内蒙古做算力中心租赁，读者是企业 IT 负责人。' }
  const tasks = ['news', 'city', 'service', 'article', 'keyword', 'landing', 'page'] as const
  for (const key of tasks) {
    const prompt = composeAiPrompt(settings, key, { siteName: '示例站' })
    assert.ok(prompt.includes('<CUSTOM_SUPPLEMENT>'), key + ' 应包含自定义补充区块')
    assert.ok(prompt.includes('算力中心租赁'), key + ' 应带上统一补充规则的内容')
  }
})

test('未设置自定义规则时输出占位文案，不注入空内容', () => {
  const prompt = composeAiPrompt({ custom: '' }, 'city', { siteName: '示例站' })
  assert.ok(prompt.includes('无自定义补充规则。'), '应明确告知模型没有自定义补充')
  assert.ok(prompt.includes('<DEFAULT_WRITING_BASELINE>'), '系统默认底线必须始终存在')
})

test('自定义规则不能覆盖系统默认底线：两者同时出现在提示词里', () => {
  const prompt = composeAiPrompt({ custom: '写得专业一点。' }, 'city', { siteName: '示例站' })
  assert.ok(prompt.includes('<DEFAULT_WRITING_BASELINE>'))
  assert.ok(prompt.includes('<CUSTOM_SUPPLEMENT>'))
  assert.ok(prompt.includes('发布前硬指标'), 'SEO/GEO 硬指标属于默认底线，必须保留')
})
