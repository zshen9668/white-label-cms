import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyTurnstile } from '../src/plugins/turnstile/index.ts'

/**
 * 回归：Turnstile 在中国大陆的可用性。
 *
 * 线上表现：前台「智能问答」提交后报「人机校验未通过」。
 * 根因：Turnstile 依赖 challenges.cloudflare.com，该域名在境内经常不可达，
 * 脚本加载不出来 → window.turnstile 为 undefined → 前端 token 恒为空。
 * 而旧逻辑「只要配了 secret 就强制校验」，于是空 token 被稳定判失败。
 *
 * 更严重的是「只填 Secret Key」的配置：前端因为没有 Site Key 根本不渲染组件，
 * token 必然为空，问答 / 联系表单 / 后台登录会被永久 403 锁死。
 */

/** 只实现 SettingsStore.getMany 用到的读语句。 */
function makeEnv(settings: Record<string, string>) {
  return {
    DB: {
      prepare(_sql: string) {
        const stmt: any = {
          _rows: [] as any[],
          bind(...args: any[]) {
            const keys = args.filter((a) => typeof a === 'string' && a.startsWith('turnstile_'))
            stmt._rows = keys.filter((k) => k in settings).map((k) => ({ key: k, value: settings[k] }))
            return stmt
          },
          async first() { return null },
          async all() { return { results: stmt._rows } },
          async run() { return { meta: { changes: 0 } } },
        }
        return stmt
      },
      async batch() { return [] },
    },
  } as any
}

const SITE = '0xSITEKEY'
const SECRET = '0xSECRET'

test('未配置任何密钥：跳过校验，放行', async () => {
  const r = await verifyTurnstile(makeEnv({}), 1, '')
  assert.equal(r.valid, true)
  assert.equal(r.skipped, true)
})

test('只配 Secret Key：跳过校验，不能锁死站点（修复前会永久 403）', async () => {
  const r = await verifyTurnstile(makeEnv({ turnstile_secret_key: SECRET }), 1, '')
  assert.equal(r.valid, true, '只填 Secret Key 时前端不渲染组件，token 必然为空，必须放行')
  assert.equal(r.skipped, true)
})

test('只配 Site Key：跳过校验，放行', async () => {
  const r = await verifyTurnstile(makeEnv({ turnstile_site_key: SITE }), 1, '')
  assert.equal(r.valid, true)
  assert.equal(r.skipped, true)
})

test('两个密钥都配齐且 token 为空：判定失败（保持防护能力）', async () => {
  const r = await verifyTurnstile(makeEnv({ turnstile_site_key: SITE, turnstile_secret_key: SECRET }), 1, '')
  assert.equal(r.valid, false, '密钥齐全时仍必须拦截空 token')
})

test('显式关闭开关：即使密钥齐全也放行', async () => {
  const r = await verifyTurnstile(
    makeEnv({ turnstile_site_key: SITE, turnstile_secret_key: SECRET, turnstile_enabled: '0' }),
    1,
    '',
  )
  assert.equal(r.valid, true, '境内用户需要能一键关掉而不必清空密钥')
  assert.equal(r.skipped, true)
})

test('显式开启开关但密钥不全：跳过校验，不锁死', async () => {
  const r = await verifyTurnstile(makeEnv({ turnstile_secret_key: SECRET, turnstile_enabled: '1' }), 1, '')
  assert.equal(r.valid, true, '密钥不全时强制开启只会锁死站点，必须降级为跳过')
  assert.equal(r.skipped, true)
})

test('显式开启开关且密钥齐全：空 token 判定失败', async () => {
  const r = await verifyTurnstile(
    makeEnv({ turnstile_site_key: SITE, turnstile_secret_key: SECRET, turnstile_enabled: '1' }),
    1,
    '',
  )
  assert.equal(r.valid, false)
})
