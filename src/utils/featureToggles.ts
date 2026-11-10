import { SettingsStore } from './settingsStore'
import type { Bindings } from '../types'
import { safeError } from './safeLogger'

/**
 * 后台功能开关。
 *
 * 设计取舍：开关只控制「后台是否暴露这个模块」，不删除任何代码。
 * 关闭后该模块的后台路由直接 404，侧边栏也不再显示，但前台能力不受影响
 * （例如关闭「媒体库」只隐藏 /admin/media，前台 /media/* 照常服务）。
 *
 * 为什么不做物理删除：SEO/GEO 依附于内容，城市页/服务页/文章本身就是 SEO 载体，
 * 删掉内容模块会让 SEO 功能变成空壳；而且删除不可逆，开关随时可恢复。
 */

export type FeatureKey =
  | 'content' | 'news' | 'pages' | 'seo' | 'ranking' | 'ai'
  | 'social' | 'messages' | 'aiqa' | 'media' | 'forms' | 'rbac' | 'apikeys'

export type FeatureDef = {
  key: FeatureKey
  label: string
  description: string
  /** 该功能占用的后台路径前缀；命中即视为访问了该功能 */
  paths: readonly string[]
  /** SEO/GEO 核心功能：「仅 SEO/GEO」预设会保留这些 */
  core: boolean
}

export const FEATURES: readonly FeatureDef[] = [
  { key: 'content', label: '内容管理', description: '文章、成功案例、采集日志', paths: ['/admin/articles', '/admin/cases', '/admin/collection-logs'], core: true },
  { key: 'news', label: '新闻采集', description: 'RSS 来源、定时采集与质量门槛', paths: ['/admin/news-sources'], core: true },
  { key: 'pages', label: '前台页面', description: '页面、城市、服务、导航与联系渠道', paths: ['/admin/pages'], core: true },
  { key: 'seo', label: 'SEO / GEO', description: '收录推送、GEO 引用监测、关键词矩阵、结构化数据、SEO 体检', paths: ['/admin/seo', '/admin/seo-audit', '/admin/geo', '/admin/keywords'], core: true },
  { key: 'ranking', label: '排名追踪', description: 'SERP 排位雷达与历史曲线', paths: ['/admin/rankings'], core: true },
  { key: 'ai', label: 'AI 写作', description: 'AI 通道、提示词与内容生成', paths: ['/admin/ai-settings', '/admin/ai-prompts'], core: true },
  { key: 'social', label: '内容分发', description: '国内平台文案与微信排版', paths: ['/admin/social'], core: false },
  { key: 'messages', label: '客户留言', description: '咨询查看与回复', paths: ['/admin/messages'], core: false },
  { key: 'aiqa', label: '智能问答', description: '站内问答与企业微信自动回复', paths: ['/admin/ai-qa'], core: false },
  { key: 'media', label: '媒体库', description: 'R2 图片与文件管理（前台 /media/* 不受影响）', paths: ['/admin/media'], core: false },
  { key: 'forms', label: '表单管理', description: '动态表单与提交收集（前台 /forms/* 不受影响）', paths: ['/admin/forms'], core: false },
  { key: 'rbac', label: '角色权限', description: 'RBAC 自定义角色分配', paths: ['/admin/rbac'], core: false },
  { key: 'apikeys', label: 'API 密钥', description: 'Bearer 鉴权密钥管理', paths: ['/admin/api-keys'], core: false },
] as const

export type FeatureToggles = Record<FeatureKey, boolean>

export const DEFAULT_FEATURE_TOGGLES: FeatureToggles = Object.fromEntries(
  FEATURES.map((f) => [f.key, true]),
) as FeatureToggles

/** 「仅 SEO/GEO」预设：只保留 core 功能，其余全部关闭。 */
export const SEO_ONLY_TOGGLES: FeatureToggles = Object.fromEntries(
  FEATURES.map((f) => [f.key, f.core]),
) as FeatureToggles

/** 缺省视为开启：老部署没有这个键时行为不变。 */
export function normalizeFeatureToggles(input: unknown): FeatureToggles {
  const out = { ...DEFAULT_FEATURE_TOGGLES }
  if (!input || typeof input !== 'object') return out
  const raw = input as Record<string, unknown>
  for (const f of FEATURES) {
    const v = raw[f.key]
    if (v === undefined || v === null || v === '') continue
    out[f.key] = v === true || v === '1' || v === 'true' || v === 'on'
  }
  return out
}

export async function getFeatureToggles(env: Pick<Bindings, 'DB'>, tenantId = 1): Promise<FeatureToggles> {
  try {
    const raw = await SettingsStore.forTenant(env, tenantId).get('feature_toggles', '')
    if (!raw) return { ...DEFAULT_FEATURE_TOGGLES }
    return normalizeFeatureToggles(JSON.parse(String(raw)))
  } catch (e) {
    safeError('feature toggles load failed, using defaults', e)
    return { ...DEFAULT_FEATURE_TOGGLES }
  }
}

export async function saveFeatureToggles(
  env: Pick<Bindings, 'DB'>,
  toggles: FeatureToggles,
  tenantId = 1,
): Promise<FeatureToggles> {
  const normalized = normalizeFeatureToggles(toggles)
  await SettingsStore.forTenant(env, tenantId).batch([['feature_toggles', JSON.stringify(normalized)]])
  return normalized
}

/** 该后台路径是否落在某个已关闭的功能里；命中则返回该功能定义。 */
export function disabledFeatureForPath(toggles: FeatureToggles, path: string): FeatureDef | null {
  for (const f of FEATURES) {
    if (toggles[f.key]) continue
    for (const p of f.paths) {
      if (path === p || path.startsWith(p + '/')) return f
    }
  }
  return null
}

/** 已关闭功能占用的全部后台路径，供侧边栏隐藏脚本使用。 */
export function disabledPaths(toggles: FeatureToggles): string[] {
  const out: string[] = []
  for (const f of FEATURES) {
    if (toggles[f.key]) continue
    out.push(...f.paths)
  }
  return out
}

/**
 * 生成侧边栏隐藏脚本。
 *
 * 为什么不把开关一路透传给模板：后台模板是纯函数，`renderAdminLayout` 有 41 处调用、
 * 分布在 16 个文件里，为了隐藏几个链接去改 41 处签名，收益不抵回归风险。
 * 这里在 HTML 响应末尾注入一段按 href 匹配的脚本，效果一致且零模板改动。
 */
export function buildNavHideScript(toggles: FeatureToggles, nonce: string): string {
  const paths = disabledPaths(toggles)
  if (!paths.length) return ''
  const safeNonce = String(nonce || '').replace(/[^a-f0-9]/gi, '')
  if (!safeNonce) return ''
  const json = JSON.stringify(paths).replace(/</g, '\\u003c')
  return `<script nonce="${safeNonce}">(function(){var d=${json};` +
    `document.querySelectorAll('.admin-sidebar-nav a[href]').forEach(function(a){` +
    `var h=a.getAttribute('href')||'';` +
    `if(d.some(function(p){return h===p||h.indexOf(p+'/')===0})){` +
    `var li=a.closest('li')||a.parentElement;if(li)li.style.display='none';}});})();</script>`
}
