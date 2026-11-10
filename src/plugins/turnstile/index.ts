import type { CmsPlugin } from '../types'
import type { Bindings } from '../../types'
import { SettingsStore } from '../../utils/settingsStore'
import { safeWarn } from '../../utils/safeLogger'

export type TurnstileResult = { valid: boolean; skipped?: boolean }

/**
 * Turnstile 人机校验(移植 SonicJS turnstile-plugin,零依赖走 fetch)。
 * - 密钥存 settings:turnstile_site_key / turnstile_secret_key(管理端系统设置维护,免重部署)
 * - 开关存 settings:turnstile_enabled('1' 强制开 / '0' 强制关 / 未设置按两个 key 是否配齐自动判定)
 * - 未启用时返回 skipped,调用方按放行处理
 * - 生产建议:登录/表单/contact 关键写端点接入;校验失败 → 403
 *
 * 中国大陆注意:Turnstile 依赖 challenges.cloudflare.com,该域名在境内经常不可达。
 * 脚本加载不出来时前端拿不到 token,若仍强制校验会把问答/表单/登录全部锁死,
 * 因此这里要求 Site Key 与 Secret Key 同时配齐才真正启用。
 */
export async function verifyTurnstile(env: Bindings, tenantId: number, token: string, remoteIp?: string): Promise<TurnstileResult> {
  const settings = await SettingsStore.forTenant(env, tenantId).getMany([
    'turnstile_site_key', 'turnstile_secret_key', 'turnstile_enabled',
  ])
  const siteKey = String(settings['turnstile_site_key'] || '').trim()
  const secretKey = String(settings['turnstile_secret_key'] || '').trim()

  // 显式开关优先；未设置时按「两个 key 都配齐」自动判定，兼容既有部署。
  const explicit = String(settings['turnstile_enabled'] ?? '').trim()
  const enabled = explicit === '0' ? false : explicit === '1' ? true : Boolean(siteKey && secretKey)
  if (!enabled) return { valid: true, skipped: true }

  // 只配了 Secret Key 而没配 Site Key：前端不会渲染组件，token 必然为空。
  // 此时继续强制校验会永久 403，所以按未配置处理并告警，避免把站点锁死。
  if (!siteKey || !secretKey) {
    safeWarn('turnstile enabled but keys incomplete; skipping verification', {
      hasSiteKey: Boolean(siteKey),
      hasSecretKey: Boolean(secretKey),
    })
    return { valid: true, skipped: true }
  }

  if (!token.trim()) return { valid: false }
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secretKey, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(5000),
    })
    const data = (await res.json()) as { success?: boolean }
    return { valid: data.success === true }
  } catch (e) {
    // 校验服务不可用时降级为跳过(与未启用行为一致),避免误伤
    safeWarn('turnstile verify unavailable, skipping', { error: String(e) })
    return { valid: true, skipped: true }
  }
}

export async function turnstileSiteKey(env: Bindings, tenantId = 1): Promise<string> {
  return String(await SettingsStore.forTenant(env, tenantId).get('turnstile_site_key') || '')
}

export const turnstilePlugin: CmsPlugin = {
  id: 'turnstile',
  version: '1.0.0',
  mount() {
    // 无路由:作为工具服务由登录/contact/表单写端点调用 verifyTurnstile
  },
}
