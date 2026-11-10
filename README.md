# 白标 CMS

基于 **Hono + Cloudflare Workers + D1** 的白标 SEO 营销系统。

一套代码部署一个站点。行业画像、页面文案、SEO 关键词、AI 提示词、统计脚本、CTA 文案全部在后台配置，**改一次、全站生效，无需重新部署**。

面向搜索引擎与 AI 引擎（GEO）做了完整适配：动态 sitemap、robots、llms.txt、JSON-LD 结构化数据、AI 爬虫白名单。

---

## 目录

- [功能特性](#功能特性)
- [AI 内容质量](#ai-内容质量)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [部署](#部署)
- [后台使用指南](#后台使用指南)
- [安全模型](#安全模型)
- [目录结构](#目录结构)
- [常用命令](#常用命令)
- [推 GitHub 前必做](#-推-github-前必做重要)
- [常见问题](#常见问题)

---

## 功能特性

### 站点与内容

| 特性 | 说明 |
|---|---|
| 统一设置 | 后台「系统设置」是站点配置的**唯一入口**：站点信息、行业画像、SEO 模板、页脚、统计脚本、CTA、UTM 白名单、人机校验，一个表单一次保存，前台立即生效 |
| 内容管理 | 文章（草稿 / 待审核 / 已发布 / 驳回）、成功案例、客户留言与回复 |
| 新闻采集 | RSS / Atom / JSON / HTML 列表页采集，AI 独立解读 + 质量门槛 + 人工审核，定时任务每 5 分钟检查一次 |
| 内容分发 | 一键生成抖音 / 快手 / 小红书 / 哔哩哔哩等平台的发布文案与排版 |
| 媒体库 | R2 对象存储，图片上传、微信二维码管理、逐文件删除 |
| 动态表单 | 后台定义字段，前台 `/forms/<slug>` 直接可用，提交可导出 CSV |
| 双语前台 | `?lang=` + cookie 解析，自指 canonical 与 hreflang 互指 |

### 搜索与增长

| 特性 | 说明 |
|---|---|
| 可收录 | 动态 `sitemap.xml`、`robots.txt`、`llms.txt`、`llms-full.txt`、`ai-index.json`、`feed.xml` |
| GEO 引用 | JSON-LD 结构化数据（WebPage / Organization / Service / Article / FAQPage / HowTo / ItemList），AI 引擎可直接提取 |
| SEO 关键词 | 城市 × 服务关键词矩阵、页面级 SEO 标题/描述、站点默认 title/desc 模板占位符 |
| 收录推送 | 百度普通收录、IndexNow（Bing 等）、360、搜狗；Google 走 Sitemap + Search Console |
| 排名追踪 | 关键词排位雷达与历史曲线 |
| SEO 体检 | 全站页面评分、一键优化低分 AI 页面、清理无效生成页 |

### AI

| 特性 | 说明 |
|---|---|
| 模型通道 | Workers AI（默认，免密钥）或任意 OpenAI 兼容 API，支持失败降级 |
| 内容生成 | 城市页、服务页、文章、落地页、案例页的 AI 写作，带质量门槛 |
| 提示词 | **一份统一补充规则**对所有任务生效，可随行业一键生成；系统默认底线只读展示 |
| 智能问答 | 前台浮动问答窗 + 企业微信自动回复，先检索站内已发布内容再作答并附出处 |

### 获客转化

| 特性 | 说明 |
|---|---|
| CTA 悬浮块 | 右下角咨询悬浮按钮，文案与开关在「系统设置 → 统计与转化」配置 |
| 联系表单 | `/contact` 表单 + UTM 透传（白名单校验）+ 蜜罐反垃圾 + Turnstile 可选 |
| 统计脚本 | 粘贴 GA4 / 百度统计 / Cloudflare Web Analytics 片段，自动补 CSP nonce |

---

## AI 内容质量

AI 生成的内容要同时过两道审计，提示词按这两道审计的**实际评分项**逐条对齐，而不是各写各的。

### 两道审计

| 审计 | 位置 | 检查项 |
|---|---|---|
| GEO 收录 | `src/utils/geoCheck.ts` | 6 项：首段 ≤80 字、办理流程/执行步骤、注意事项/风险、实际影响、≥4 个 H2/H3、≥600 字 |
| SEO 评分 | `src/utils/seoAudit.ts` | 标题 8-45 字、描述 50-180 字、正文信息量、≥4 个 H2/H3、主题词 3-5 个且都有正文证据、无关键词包含关系、无 AI 生产标记 |

### 提示词里的硬指标

`buildWhiteLabelAiGlobalPrompt` 把上面两道审计写成模型可自检的清单：

1. **首段** ≤80 个中文字符，独立成 `<p>`，直接给核心结论
2. **小节** ≥4 个有信息量的 H2/H3，禁止空小节与模板化重复
3. **字数** 城市/服务/落地页/首页/列表页 ≥800 字，文章 ≥900 字，联系页 ≥400 字
4. **必备小节** 办理流程或执行步骤、注意事项或风险、实际影响，另加行动建议与常见问题
5. **标题** 8-45 字，只表达一个主搜索意图
6. **摘要** 50-180 字，首句直接说明核心价值
7. **主题词** 3-5 个，每个都要有完全一致的字符串证据，词间不能互相包含
8. **禁止** 出现「本文由AI生成」「AI图解」等生产过程标记

### 输出格式硬约束

提示词明确要求返回**完整闭合的 JSON 对象**，字段一个都不能少，`content` 必须是标签全部闭合的 HTML 片段：

- 不得只返回纯文本、不得省略字段、不得用「……」占位
- 不得因输出长度上限中途截断：宁可压缩每节篇幅，也要保证 JSON 闭合、字段齐全、小节达标
- 输出前自检：能否 `JSON.parse`、标签是否闭合、字段是否齐全

### 提示词：一份统一补充规则

后台「AI 提示词」只有**一个输入框**，对所有任务生效（新闻解读、城市页、服务页、文章、落地页、普通页面、关键词候选）。

**为什么收敛成一个**：之前按任务拆成 8 个输入框，站长要维护 8 份内容，改一次口径就得改 8 遍，还容易出现各任务说法不一致。任务之间的差异由内置的默认写作底线负责，不需要人工重复维护。

**组合链**（固定顺序，不可颠倒）：

```
默认写作底线（内置，含 SEO/GEO 硬指标）
  → 你的统一补充规则
    → 当前页面资料
      → 当前 AI 通道
```

**关键性质**：默认底线**不会被补充规则删除**。所以写一句「写得专业一点」不会把 JSON 结构、字数要求、必备小节一起覆盖掉——这是刻意的设计，避免一句随手的补充把整套质量标准冲掉。

| 操作 | 说明 |
|---|---|
| 保存 | 写入 `settings` 表的 `ai_prompt_custom`，下一次生成立即生效 |
| 一键生成 | 按当前行业画像生成一段通用补充规则，**回填到输入框**，确认后再保存 |
| 测试 | 选一个任务跑真实链路，验证当前生效提示词能否产出合格内容 |
| 清空自定义 | 恢复为纯系统默认 |

**升级不丢配置**：首次读取时若统一字段为空，会把旧版按任务保存的 8 份提示词合并进来（带 `【全局规则】` 等来源标注），人工整理后再保存即可。

### 代码侧的兜底

| 机制 | 位置 | 作用 |
|---|---|---|
| 首段自动拆分 | `normalizeLeadParagraph` | 模型把首段写成 100+ 字时，按句末标点拆开，首句留首段，其余顺延，内容不丢失 |
| 截断检测 | `looksTruncated` | 检测 JSON 括号或 HTML 标签不配对；命中时重试把输出预算抬到 8192 token，并要求压缩篇幅保住结构 |
| 三轮生成 | `generateAiPageContent` | 首轮 JSON → 重试强化格式 → HTML 正文兜底，三轮都过质量门槛才返回 |
| 质量门槛 | `qualityEnough` | 门槛**不严于**提示词要求，避免模型按提示词正常产出却被判失败 |

> 门槛与提示词必须同源。历史上出现过「AI 测试连通性通过、真实内容任务报内容过短或为空」，根因就是门槛比提示词更严，模型正常产出被稳定判失败。`tests/aiSeoGeoContract.test.ts` 锁定了这条链路。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Cloudflare Workers |
| Web 框架 | Hono 4 |
| 数据库 | D1（SQLite） |
| 缓存 / 会话 / 限流 | Workers KV |
| 对象存储 | R2 |
| AI | Workers AI 或外部 OpenAI 兼容 API |
| 构建 / 部署 | wrangler |
| 依赖 | 生产依赖只有 `hono` 一个 |

---

## 快速开始

```bash
npm ci              # 安装依赖
npm run typecheck   # tsc --noEmit 类型检查
npm test            # 单元测试（249 个）
npm run dev         # 本地开发（需 wrangler）
```

> **Windows 提示**：`workerd` 在 Windows 上可能报 `spawn EFTYPE`。这是 wrangler 的环境问题，不是代码问题；本地跑不起来可以直接走线上部署。

---

## 部署

### 方式一：Cloudflare Workers GitHub 集成（推荐）

1. 把代码推送到你的 GitHub 仓库。
2. Cloudflare Dashboard → **Workers & Pages** → **Import a repository**，选择该仓库。
3. 构建命令填 `npm run deploy`。该命令依次完成：

   ```
   环境自检 → 创建/复用 D1、KV、R2 → 资源 ID 写进 .wrangler.deploy.toml
   → 应用 migrations/ 全部迁移 → wrangler deploy → /healthz?probe=1 健康检查
   ```

4. 不需要在构建里手填 Token。前提是 Cloudflare 账号已有同名资源；不存在时首次部署会自动创建。

### 方式二：本地命令行

```bash
# 1. 在项目根目录创建 .dev.vars（已 gitignore）
cat > .dev.vars <<'VARS'
CLOUDFLARE_API_TOKEN=你的Token
CLOUDFLARE_ACCOUNT_ID=你的AccountID
VARS

# 2. 一键部署
npm run deploy
```

### 环境变量与密钥

| 名称 | 用途 | 必需 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | 本地脚本调用 Cloudflare API 创建资源 | 首次部署需要 |
| `CLOUDFLARE_ACCOUNT_ID` | 同上 | 首次部署需要 |
| `SETUP_TOKEN` | `/admin/setup` 首次初始化的守护令牌 | 建议配置 |
| `SITE_URL` | 公开站点地址（也可在后台「系统设置」填） | 可选 |
| `JWT_SECRET` | 会话签名密钥（不填则自动生成并存 KV） | 可选 |

> 后台「系统密钥」页面里配置的值**优先于**环境变量，改完不需要重新部署。

### 资源清单

| 资源 | 名称 | 绑定名 |
|---|---|---|
| D1 | `white-label-cms-db` | `DB` |
| KV | `CACHE_KV` | `CACHE_KV` |
| R2 | `white-label-cms-r2-media` | `R2_MEDIA` |
| Workers AI | — | `AI` |

### 首次初始化

部署完成后访问 `https://你的域名/admin/setup`：

1. 填管理员邮箱与密码（至少 10 位、含两类字符）。
2. 可选：选一个行业预设，系统会自动写入行业画像、城市、服务与关键词矩阵。
3. 提交后自动登录进入后台。

之后所有配置都在后台完成，不需要再碰代码。

---

## 后台使用指南

后台侧边栏分 6 组，共 23 个页面。

### 📊 总览

| 页面 | 用途 |
|---|---|
| 数据概览 | 访问量、内容统计、待办、内容新鲜度与 GEO 完整性 |
| 访问统计 | 近 30 天每日 PV |

### 📰 内容

| 页面 | 用途 |
|---|---|
| 文章管理 | 新建 / 编辑 / 发布 / 审核 / 驳回、AI 写作、版本历史、微信排版、多平台分发 |
| 成功案例 | 客户案例与交付成果 |
| 新闻采集 | 采集源管理、立即抓取、定时采集、质量门槛 |
| 采集日志 | 定时任务运行记录 |
| 内容分发 | 国内平台文案与排版 |
| 客户留言 | 查看、回复、标记已读、删除 |

### 📄 页面

| 页面 | 用途 |
|---|---|
| 前台页面 | 页面标题/正文/SEO、城市、服务、导航、联系渠道、语言 |

### 🚀 SEO 增长

| 页面 | 用途 |
|---|---|
| SEO / 推送 | 收录提交与推送日志、SEO 体检 |
| GEO / AI 搜索 | AI 爬虫统计、引用监测、结构化数据 |
| 关键词矩阵 | 城市 × 服务词库 |
| 排名追踪 | SERP 排位雷达 |

### 🤖 AI

| 页面 | 用途 |
|---|---|
| AI 通道 | 模型选择、参数、连通性测试、真实内容任务测试 |
| AI 提示词 | **一份统一补充规则**，对所有任务生效；可随行业一键生成 |
| 智能问答 | 问答开关、欢迎语、资料上限、企业微信配置、会话记录 |

### ⚙️ 系统

| 页面 | 用途 |
|---|---|
| 媒体库 | R2 图片与文件、微信二维码 |
| 表单管理 | 动态表单与提交收集 |
| 角色权限 | RBAC 自定义角色与模块权限 |
| API 密钥 | Bearer 鉴权密钥管理 |
| **系统设置** | **站点配置的唯一入口**（见下） |
| 功能开关 | 一键隐藏用不到的后台模块（见下） |
| 系统密钥 | AI / 推送 / 接入密钥，加密存储 |
| 系统自检 | 绑定、数据库与部署状态 |

### 系统设置里有什么

`/admin/settings` 一个表单覆盖全部站点级配置，点「保存全部设置」即写入 D1 并清 CDN 缓存：

| 区块 | 内容 |
|---|---|
| 🏷️ 站点画像 | 画像名称、当前主题/行业/模板概览 |
| 🏭 行业与业务配置 | 站点名称、行业预设、行业名称、行业关键词（可 AI 生成）、目标客户、服务特色、应用场景、核心服务、新闻分类 |
| 🌐 站点基础信息 | 公开站点地址、核心主题、核心主题词、站点标题、站点描述 |
| 🔗 站点关联配置 | favicon、默认标题/描述模板、llms.txt 自定义内容 |
| 📈 统计与转化 | 统计脚本开关与代码、CTA 开关与文案、UTM 来源白名单 |
| 📄 Footer 页脚 | 版权、免责声明、AI 内容声明、底部链接 |
| 🔒 Turnstile | Site Key / Secret Key |

> 联系方式 / 导航 / 语言是结构化编辑器，在「前台页面 → 站点模块」；各类密钥在「系统密钥」。这两处是刻意的分工，不是遗漏。

### 配置生效链路

```
后台保存 → D1 settings 表 → 前台每次请求读 settings → 渲染
                          ↘ purgeCacheAll() 清 CDN 缓存
```

所以**保存即生效**，不需要重新部署。唯一例外是「行业与业务配置」：改动行业/主题会触发关键词矩阵重建与页面 SEO 同步，这是有意的（矩阵依赖画像）。

### 功能开关（`/admin/features`）

只想用 SEO/GEO 时，不必删代码、不必改配置，在这里一键关掉用不到的模块。

**「仅 SEO/GEO 模式」预设**保留 6 个核心模块，关闭其余 7 个：

| 保留（core） | 关闭 |
|---|---|
| 内容管理、前台页面、新闻采集、SEO/GEO、排名追踪、AI 写作 | 内容分发、客户留言、智能问答、媒体库、表单管理、角色权限、API 密钥 |

**关闭后的行为**：

- 该模块的后台路由直接返回 **404**（不能靠直接输入 URL 绕过）
- 侧边栏不再显示对应链接
- **代码不会被删除**，勾回来立即恢复
- **前台能力不受影响**：关闭「媒体库」只隐藏 `/admin/media`，前台 `/media/*` 照常服务；关闭「表单管理」不影响前台 `/forms/<slug>`

**为什么不做物理删除**：SEO/GEO 依附于内容——城市页、服务页、文章本身就是 SEO 的载体，删掉内容模块会让 SEO 功能变成空壳。而且删除不可逆，开关随时可恢复。

**实现要点**：

| 位置 | 作用 |
|---|---|
| `src/utils/featureToggles.ts` | 功能注册表、读写、路径匹配、侧边栏隐藏脚本 |
| `src/routes/admin/index.ts` | 路由守卫：关闭的模块 404 + 注入隐藏脚本 |
| `src/templates/adminFeatures.ts` | 开关页面 |
| `settings` 表 `feature_toggles` | JSON 存储；**缺省全部开启**，老部署升级后行为不变 |

> 侧边栏隐藏走「响应注入」而不是把开关透传给模板：`renderAdminLayout` 有 41 处调用、分布在 16 个文件，为隐藏几个链接去改 41 处签名，收益不抵回归风险。

---

## 安全模型

修改相关代码时务必遵守这些不变量。

### 数据归属

- 全部数据归属默认租户 `tenant_id = 1`，由 `src/middleware/tenant.ts` 注入请求上下文。
- 读走 `scoped()`（自动给顶层 WHERE 注入 `tenant_id = ?`），写显式绑定 `tenant_id`。见 `src/db/scoped.ts`。
- **不要拼接裸 SQL 的租户条件**，也不要在 JOIN / 子查询里漏掉 `tenant_id`（`scoped()` 只管顶层 WHERE）。

### 认证与会话

- 会话 JWT 绑定密码哈希指纹（`src/middleware/authGuard.ts`）：改密码即全端下线，无需额外迁移。
- 密码用 PBKDF2 600k 迭代（`src/utils/password.ts`），旧 SHA-256 哈希在登录时自动升级。
- 登录失败用 `DUMMY_PASSWORD_HASH` 抹平时序差异；失败 5 次锁定 15 分钟。
- 后台所有路由（含插件挂载的 `/admin/*`）都过 `requireAdmin` + `requireRbac`。

### 请求安全

- **CSRF**：严格双提交（`src/middleware/security.ts`）。明确拒绝「没有 token 就退回 Origin 检查」的降级分支。
- **CSP**：前台 `script-src` 只放行 `'self'` + 本次请求的 nonce + Turnstile + 统计服务商白名单。后台配置的统计脚本片段由 `applyCspNonceToSnippet` 自动补 nonce。
- **路径遍历**：循环解码 + 字符白名单 + `path.posix.normalize` 三重（`src/utils/safePath.ts`）。
- **限流**：登录 / 初始化 / 恢复 / 联系表单 / 公开 API 全部基于 KV 限流；KV 不可用时**拒绝**而不是放行。
- **SSRF**：新闻采集只允许抓取公网 http(s) 地址，拒绝 localhost、内网 IP、私有域名。

### 输出安全

- **SQL 注入**：全仓库参数化绑定，禁止把运行时值拼进 SQL 字符串。
- **XSS**：模板插值一律走 `escapeHtml`；AI 输出走 `textContent` / `createElement`，不碰 `innerHTML`；富文本走标签白名单并丢弃全部属性。
- **CSV 公式注入**：表单导出用 `csvCell()`，以 `=` `+` `-` `@` 开头的值会被前置单引号降级为文本。

### 子查询的 `tenant_id`（易踩坑）

`scoped()` **只给顶层 WHERE 注入 `tenant_id`**，子查询 / `EXISTS` / `JOIN` 里的表不会被过滤。
写 JOIN 或子查询时，**每张表都要显式加 `tenant_id = ?` 并全部用表别名前缀限定列名**（避免 `ambiguous column name`）。
单站点部署下漏写不会串数据，但会让「将来开多站点」变成一次全仓库排查，所以按规矩写。

---

## 目录结构

```
src/
  index.ts             Worker 入口：中间件链、路由挂载、cron
  routes/
    public.ts          前台页面（首页/服务/城市/案例/资讯/关于/联系/搜索）
    seo.ts             sitemap / robots / llms.txt / llms-full.txt / ai-index.json / feed.xml
    api.ts             公开写接口（留言）
    apiV2.ts           Bearer 密钥只读 API
    aiQa.ts            智能问答公开接口
    wecom.ts           企业微信回调
    tenant.ts          可选的 SaaS 租户 API
    admin/             后台聚合路由（requireAdmin + requireRbac）
    adminModules/      /admin/modules/*（同等权限校验）
  middleware/          鉴权、RBAC、限流/CSRF/安全头、租户上下文
  plugins/             内置插件（版本历史、表单、Turnstile、RBAC、API 密钥、分析）
  templates/           前台与后台 HTML 模板
  utils/               设置读写、AI 调用、SEO、安全日志、路径校验
    aiPrompts.ts       AI 提示词组合链（全局底线 + 任务规则 + 自定义补充）
    aiPageContent.ts   AI 内容生成：三轮生成、质量门槛、首段拆分、截断检测
    aiSettings.ts      AI 通道配置与调用（Workers AI / OpenAI 兼容）
    geoCheck.ts        GEO 收录审计（6 项）
    seoAudit.ts        SEO 页面评分
  db/                  scoped() 租户作用域查询
  cron/                定时任务（新闻采集、日志清理）
public/                静态资源（Workers Assets：CSS/JS/图标/sw.js）
migrations/            D1 迁移（只追加，不改名）
scripts/               部署、验证、自检脚本
tests/                 Node 单元测试
docs/                  部署、迁移与架构文档
```

---

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm ci` | 安装依赖 |
| `npm run typecheck` | `tsc --noEmit` 类型检查 |
| `npm test` | 运行单元测试（249 个） |
| `npm run validate:complete` | 13 项校验 + typecheck + 测试（**推 GitHub 前必跑**） |
| `npm run dev` | 本地开发（需 wrangler） |
| `npm run deploy` | 部署（创建/复用资源 + 迁移 + 发布 + 健康检查） |
| `npm run doctor` | 环境与依赖自检 |
| `npm run db:migrate:remote` | 只应用 D1 迁移 |
| `npm run db:create-admin` | 命令行创建管理员 |
| `npm run smoke:deploy` | 部署后冒烟测试 |

---

## ⚠️ 推 GitHub 前必做（重要）

Cloudflare 的构建命令是 `npm run build`，它**只做类型检查，不跑测试**——坏测试会被静默漏过。
所以推送前**本地必须跑一次完整校验**，全绿再推：

```bash
npm run validate:complete
```

这条命令覆盖 13 项仓库校验 + `typecheck` + 全部单元测试（249 个）：

| 校验项 | 作用 |
|---|---|
| `doctor` | 环境/依赖自检 |
| `verify` | 仓库完整性 |
| `check:schema` | 在内存 SQLite 上重放全部 D1 迁移，校验表结构 |
| `check:routes` | 后台路由快照比对（改路由后跑一次 `--update` 再 review 差异） |
| `check:public` | 前台路由与内部链接可达性 |
| `check:seo-geo` | SEO / GEO 合同（JSON-LD、llms.txt 等对外暴露面） |
| `check:deployment` | 部署配置一致性（单一 wrangler.toml、lockfile 入库、README 标记齐全） |
| `check:migrations` | 迁移文件名与编号规则 |
| `check:whitelabel` | 白标基线（禁止遗留行业内容与品牌） |
| `check:contact-fields` | 联系字段约定 |
| `check:plugins` | 插件 cron 接线 |
| `check:ai-qa` | 智能问答 / 企业微信 / 双语接线 |
| `check:admin-templates` | 后台模板模块结构 |

全部 exit 0 且 `npm test` 为 249/249 全绿，才可推送。

---

## 常见问题

### 后台打不开 / 报「数据库结构未初始化」

D1 已绑定但业务表没建出来。在项目目录执行：

```bash
npm run deploy
# 或只补数据库结构
npx wrangler d1 migrations apply DB --remote
```

系统**不会**在运行时自动建表——运行时建表会与迁移结构冲突，导致后台持续报 `no such column`。

### 后台能进，但前台页面是空的

1. 打开 `/healthz?probe=1` 看 `bindings` 与 `missing_tables`。
2. 进「系统设置」填站点名称、行业、核心服务，保存。
3. 进「前台页面」确认页面没有被设为「隐藏」。

### 改了设置但前台没变

- 前台 HTML 有 30 秒边缘缓存（`Cache-Control: public, max-age=30`）。保存设置会主动清缓存，但如果你直接改了数据库，需要等 30 秒或手动清缓存。
- 启用多语言后，前台 HTML 不再进边缘缓存（避免把中文缓存给英文访客），此时改动是立即生效的。

### AI 功能不可用

1. 「AI 通道」页点「测试连通性」。
2. Workers AI 需要账号开通；未开通时删掉 `wrangler.toml` 里的 `[ai]` 段落即可（AI 功能降级关闭，其余不受影响）。
3. 用外部 OpenAI 兼容 API 时，Base URL 必须是 HTTPS 公网地址，且密钥要填在「AI 通道」或「系统密钥」。

### AI 测试连通性通过，但真实内容任务报「内容过短或为空」

这两件事测的不是同一条链路：

- **连通性测试**只发一句「只回复 ok」，验证模型能返回文本。
- **真实内容任务测试**走完整的 `generateAiPageContent`，要过质量门槛、GEO/SEO 结构要求。

排查顺序：

1. 看「AI 通道」页的**真实内容任务测试**（选城市页或文章），它会返回具体失败原因。
2. 确认模型本身可用——**403 / 401 / 429 是供应商侧问题**（区域限制、密钥、配额），与代码无关，换一个可用模型即可。
3. 确认「最大输出」不低于 4096 token。低于 2048 会被自动抬到 2048，但长文章建议 4096 以上。
4. 如果模型输出被截断，系统会自动检测并把重试预算抬到 8192 token；仍失败说明模型本身能力不足，换更强的模型。

### 前台「智能问答」报「人机校验未通过」

**中国大陆用户几乎必然遇到**，原因是 Turnstile 依赖 `challenges.cloudflare.com`，该域名在境内经常不可达：

```
脚本加载失败 → window.turnstile 为 undefined → 前端 token 恒为空 → 后端判定失败 → 403
```

**解决办法**：进「系统设置」→ 底部「Turnstile 人机校验」→ **取消勾选「启用 Turnstile 人机校验」** → 保存。

关闭后系统仍有限流（`/api/ai/ask` 每分钟 8 次）与蜜罐反垃圾兜底，不是裸奔。

**注意两个坑**：

- 只填 Secret Key 不填 Site Key 时，前端不会渲染组件，token 必然为空。系统已做保护：密钥不全时自动降级为跳过校验，不会锁死站点。
- 关闭校验**不需要清空密钥**，取消勾选即可；密钥留着以后想开回来随时勾上。

**如果一定要人机校验**：Turnstile 在境内不可用，需要换国内方案（阿里云验证码、腾讯防水墙、极验 Geetest），在 `src/plugins/turnstile/index.ts` 旁新增一个校验插件，并在 `src/routes/aiQa.ts`、`src/routes/api.ts`、`src/routes/admin/auth.ts`、`src/plugins/forms/index.ts` 四处替换调用。

### 统计脚本填了但没数据

- 确认「系统设置 → 统计与转化」里**勾选了「启用统计脚本」**。
- 内联 `<script>` 会自动补 CSP nonce；外链脚本的域名必须在 CSP 白名单里（已放行 `googletagmanager.com`、`google-analytics.com`、`hm.baidu.com`、`static.cloudflareinsights.com`）。要接别家统计，把域名加进 `src/middleware/security.ts` 的 `ANALYTICS_SCRIPT_HOSTS`。

### 媒体上传后 `/media/*` 返回 503

R2 未绑定。在 Cloudflare 控制台创建 `white-label-cms-r2-media` 并绑定为 `R2_MEDIA`，或直接跑 `npm run deploy` 自动创建。

### 本地 `npm run dev` 报 `spawn EFTYPE`

Windows 上 `workerd` 的环境问题，不是代码问题。跳过本地开发，直接部署到 Cloudflare 验证。

---

## 相关文档

| 文档 | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构与请求链路 |
| [docs/SINGLE-SITE-DESIGN.md](docs/SINGLE-SITE-DESIGN.md) | 单站点数据归属设计 |
| [docs/DEPLOY.md](docs/DEPLOY.md) | 部署细节 |
| [docs/MIGRATIONS.md](docs/MIGRATIONS.md) | 数据库迁移约定 |
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | 后台逐页说明 |
| [docs/CF-SETUP-TROUBLESHOOTING.md](docs/CF-SETUP-TROUBLESHOOTING.md) | Cloudflare 配置排错 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献流程 |
| [CHANGELOG.md](CHANGELOG.md) | 更新记录 |

本仓库遵循 [LICENSE](LICENSE)、[CONTRIBUTING.md](CONTRIBUTING.md) 与 [CHANGELOG.md](CHANGELOG.md)。
