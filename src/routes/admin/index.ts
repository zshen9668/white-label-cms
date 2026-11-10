import { Hono } from 'hono'
import type { Bindings, Variables } from '../../types'
import { requireAdmin } from '../../middleware/authGuard'
import { requireRbac } from '../../middleware/rbac'
import { getFeatureToggles, disabledFeatureForPath, buildNavHideScript } from '../../utils/featureToggles'
import { getTenantId } from './shared'

/**
 * 白标 CMS 后台路由按功能模块拆分。
 * 各子模块独立维护，这里统一挂载到 /admin 前缀。
 */
export const adminRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

import { adminDashboardRoutes } from './dashboard'
import { adminAuthRoutes } from './auth'
import { adminArticlesRoutes } from './articles'
import { adminCaseRoutes } from './cases'
import { adminCitiesRoutes } from './cities'
import { adminServicesRoutes } from './services'
import { adminSeoRoutes } from './seo'
import { adminKeywordsRoutes } from './keywords'
import { adminRankingRoutes } from './rankings'
import { adminSubprojectsRoutes } from './subprojects'
import { adminMessagesRoutes } from './messages'
import { adminNewsRoutes } from './news'
import { adminSettingsRoutes } from './settings'
import { adminMediaRoutes } from './media'
import { adminSystemRoutes } from './system'
import { adminSystemSecretRoutes } from './systemSecrets'
import { adminAiQaRoutes } from './aiQa'
import { adminPagesRoutes } from './pages'

// 免登录入口（初始化/恢复/登录）必须先挂载；
// 之后的 use('*') 对其余全部后台路由强制登录（与旧单体 admin.ts 行为一致）。
adminRoutes.route('/', adminAuthRoutes)

adminRoutes.use('*', requireAdmin)

adminRoutes.use('*', requireRbac())

/**
 * 功能开关：关闭的模块直接 404，避免通过直接输入 URL 绕过侧边栏隐藏；
 * 同时在 HTML 响应末尾注入脚本，把对应侧边栏链接隐藏。
 *
 * 注册位置在 requireRbac 之后、各模块路由之前：登录/初始化入口在更早处已挂载，
 * 不受影响（Hono 按注册顺序派发，先匹配到的 handler 执行后即停止）。
 */
adminRoutes.use('*', async (c, next) => {
  const toggles = await getFeatureToggles(c.env, getTenantId(c))
  if (disabledFeatureForPath(toggles, c.req.path)) return c.notFound()

  await next()

  const res = c.res
  if (!res || !String(res.headers.get('content-type') || '').includes('text/html')) return
  const script = buildNavHideScript(toggles, String((c as any).get('cspNonce') || ''))
  if (!script) return
  const html = await res.text()
  if (!html.includes('</body>')) return
  c.res = new Response(html.replace('</body>', script + '</body>'), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  })
})

// 子模块内部路径如 /articles 等直接挂载到 /admin 下保持原路径；仪表板 /admin 优先匹配
adminRoutes.route('/', adminDashboardRoutes)
adminRoutes.route('/', adminArticlesRoutes)
adminRoutes.route('/', adminCaseRoutes)
adminRoutes.route('/', adminCitiesRoutes)
adminRoutes.route('/', adminServicesRoutes)
adminRoutes.route('/', adminSeoRoutes)
adminRoutes.route('/', adminKeywordsRoutes)
adminRoutes.route('/', adminRankingRoutes)
adminRoutes.route('/', adminSubprojectsRoutes)
adminRoutes.route('/', adminMessagesRoutes)
adminRoutes.route('/', adminNewsRoutes)
adminRoutes.route('/', adminSettingsRoutes)
adminRoutes.route('/', adminMediaRoutes)
adminRoutes.route('/', adminSystemRoutes)
adminRoutes.route('/', adminSystemSecretRoutes)
adminRoutes.route('/', adminAiQaRoutes)
adminRoutes.route('/', adminPagesRoutes)
