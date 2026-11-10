# 单站点设计

一套代码部署一个站点。全部数据归属默认租户 `tenant_id = 1`。

> 本文件原名 `SAAS-MULTI-TENANT-DESIGN.md`。旧版本按"一套代码服务多个站点"设计，
> 但 `/t/{slug}` 路径识别**从未有任何路由挂载**，那段逻辑只会让 `/t/xxx` 落进 404，
> 属于文档与实现不符的死代码。现已按单站点收敛：`tenant_id` 列保留（默认值 1），
> 将来真要开多站点时不必改表结构。

## 架构概览

| 维度 | 方案 |
|---|---|
| 数据归属 | 共享一套 D1，全部数据 `tenant_id = 1` |
| 站点识别 | 无。一个 Worker 就是一个站点，用自定义域区分不同部署 |
| 计费 | 不内置 |

---

## 1. 数据库

### 核心表

```sql
tenants(id, slug, display_name, owner_email, tier, status, trial_ends_at)
users(id, email, password_hash)
tenant_members(tenant_id, user_id, role)
tier_limits(tier, cities_max, articles_max, ai_generations_day, custom_domain, white_label)
```

- `tenants.tier`：`free` / `basic` / `pro` / `enterprise`
- `tenants.status`：`active` / `suspended`
- `tier_limits` 定义各档位配额上限，由 `migrations/0002_seed.sql` 写入

### `tenant_id` 的作用域

- 所有业务表带 `tenant_id INTEGER NOT NULL DEFAULT 1`，并有 `(tenant_id, ...)` 复合索引
- 全部数据归属 `tenant_id = 1`
- 唯一约束按租户作用域（例如 `cities` 是 `UNIQUE(slug, tenant_id)`）

**为什么单站点还留着 `tenant_id`？** 因为去掉它要改 11 个迁移 + 全仓库几百条 SQL，
收益为零。保留列、统一写 1，是成本最低且不锁死未来的做法。

---

## 2. 路由

### 租户上下文中间件

`src/middleware/tenant.ts`

- 无条件注入 `c.set('tenant', { id: 1, slug: 'main', tier: 'free', status: 'active' })`
- 供 `getTenantId()` / `scoped()` 使用，保证所有查询都带上同一个 `tenant_id`

### 租户 API

`src/routes/tenant.ts` 仍保留（`/api/saas/*`），但它是**独立可选的**：
单站点部署不调用它，站点功能完全不受影响。它提供：

```text
POST /api/saas/tenants              # 创建租户 + owner 用户 + 成员关系(限流 5/60s)
POST /api/saas/tenants/:slug/login  # 邮箱 + 密码登录 → 返回 KV 会话 token(限流 10/60s)
GET  /api/saas/auth/me              # 当前租户与档位(Bearer 鉴权)
```

---

## 3. 关键抽象

### SettingsStore

`src/utils/settingsStore.ts`

```ts
SettingsStore.for(env).get('site_name')                  // 默认租户(tenant_id = 1)
SettingsStore.forTenant(env, tenantId).get('site_name')  // 指定租户
```

- `get` / `getMany` / `getMap` / `batch` / `delete` 全部带租户维度
- 后台路由一律使用 `forTenant(env, getTenantId(c))`，避免写入落到别的租户

### 租户作用域查询

`src/db/scoped.ts`

- `scoped()` 负责给查询注入 `tenant_id` 条件；业务代码不手写租户过滤
- `getTenantId(c)` 从请求上下文取当前租户

### 后台鉴权

`src/middleware/authGuard.ts` / `src/middleware/rbac.ts`

- 会话 JWT 携带 `{ uid, email, pwd }`；`requireAdmin` 校验账号仍存在、密码指纹未变
- 角色模块权限由 `requireRbac()` 校验，`/admin` 与 `/admin/modules/*` 使用同一套中间件

---

## 4. 相关文件

```text
migrations/0001_baseline.sql   # tenants / users / tenant_members / tier_limits 及全部业务表
migrations/0002_seed.sql       # 默认租户 + 各档位配额
src/middleware/tenant.ts       # 租户上下文(单站点恒为 1)
src/routes/tenant.ts           # 可选的 SaaS 租户 API
src/db/scoped.ts               # scoped() / getTenantId()
src/utils/settingsStore.ts     # 设置读写租户化
src/plugins/rbac/              # 角色与后台模块权限
```

---

## 5. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 查询漏写 `tenant_id` → 将来开多站点时串数据 | 统一走 `scoped()`；JOIN / 子查询里每张表显式加 `tenant_id` |
| 单库数据量大后慢查询 | 已建 `(tenant_id, ...)` 复合索引 |
| 误以为 `/t/{slug}` 可用 | 已从代码与文档中移除该路径的承诺 |

---

## 6. 验收标准

- 前台、后台读写的是同一份 `tenant_id = 1` 的数据
- `/t/xxx` 返回 404（没有路由挂载，符合预期）
- `npm test` 与 `npm run validate:complete` 全绿
