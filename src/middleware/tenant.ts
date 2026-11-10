import type { MiddlewareHandler } from 'hono'
import type { Bindings, Variables, TenantContext } from '../types'

/** 单站点部署下的唯一租户 id。所有数据都归属它。 */
export const DEFAULT_TENANT_ID = 1

/**
 * 租户上下文中间件（单站点部署）。
 *
 * 本系统按**单站点**运行：全部数据归属默认租户 `tenant_id = 1`，后台与前台读写的是同一份数据。
 * 这里只负责把默认租户写进请求上下文，供 `getTenantId()` / `scoped()` 使用，保证所有查询
 * 都带上同一个 `tenant_id`，不会出现"有的查询带、有的不带"的漂移。
 *
 * 历史说明：旧版本按 `/t/{slug}` 路径识别租户，但**从未有任何路由挂载在 `/t/` 下**，
 * 那段逻辑只会让 `/t/xxx` 落进 404，属于文档与实现不符的死代码，已移除。
 * 数据库里的 `tenant_id` 列保留（默认值 1），这样将来真要开多站点时不必改表结构。
 */
export function tenantMiddleware(): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (c, next) => {
    c.set('tenant', {
      id: DEFAULT_TENANT_ID,
      slug: 'main',
      tier: 'free',
      status: 'active',
    } as TenantContext)
    await next()
  }
}

/** 取当前请求的 tenantId；单站点部署恒为 1。 */
export function getTenantId(c: { get: (key: string) => TenantContext | undefined }): number {
  return c.get('tenant')?.id ?? DEFAULT_TENANT_ID
}
