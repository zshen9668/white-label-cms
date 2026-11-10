import { renderAdminLayout } from './adminLayout'
import { escapeHtml } from '../utils/html'
import { FEATURES, type FeatureToggles } from '../utils/featureToggles'

/**
 * 「功能开关」后台页面。
 *
 * 设计目标：站长只想用 SEO/GEO 时，不必删代码、不必改配置，
 * 在这里一键关掉用不到的模块即可。关闭只影响后台可见性与可访问性，
 * 前台能力（/media/*、/forms/*、智能问答接口等）不受影响。
 */

export function renderFeaturesPage(
  toggles: FeatureToggles,
  opts: { siteName?: string; cspNonce?: string; csrfToken?: string; saved?: boolean; preset?: string } = {},
): string {
  const core = FEATURES.filter((f) => f.core)
  const extra = FEATURES.filter((f) => !f.core)
  const enabledCount = FEATURES.filter((f) => toggles[f.key]).length

  const row = (f: (typeof FEATURES)[number]) => `
      <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
        <input type="checkbox" name="feature_${escapeHtml(f.key)}" ${toggles[f.key] ? 'checked' : ''} style="margin-top:3px" />
        <span>
          <strong>${escapeHtml(f.label)}</strong>
          <span style="color:var(--muted);font-size:12px;display:block;line-height:1.6">${escapeHtml(f.description)}</span>
          <span style="color:var(--muted);font-size:11px;display:block">后台路径：${f.paths.map((p) => escapeHtml(p)).join('、')}</span>
        </span>
      </label>`

  const banner = opts.saved
    ? '<p class="card" style="border-left:3px solid #2e7d32;padding:10px 12px;margin:0 0 14px">功能开关已保存，侧边栏与路由已按新设置生效。</p>'
    : opts.preset
      ? `<p class="card" style="border-left:3px solid #2e7d32;padding:10px 12px;margin:0 0 14px">已应用预设：${escapeHtml(opts.preset)}。</p>`
      : ''

  return renderAdminLayout({
    title: '功能开关', active: '/admin/features', siteName: opts.siteName, cspNonce: opts.cspNonce, csrfToken: opts.csrfToken,
    body: `
    <h1>功能开关</h1>
    <p style="color:var(--muted);font-size:13px;line-height:1.8;margin:0 0 14px">
      当前启用 <strong>${enabledCount}</strong> / ${FEATURES.length} 个模块。
      关闭某个模块后，它的后台页面会直接返回 404，侧边栏也不再显示；
      <strong>代码不会被删除</strong>，随时勾回来即可恢复。
      前台能力不受影响（例如关闭「媒体库」只隐藏后台入口，前台 <code>/media/*</code> 照常服务）。
    </p>
    ${banner}

    <div class="card" style="padding:12px;margin:0 0 16px">
      <strong>一键预设</strong>
      <p style="color:var(--muted);font-size:12px;line-height:1.7;margin:6px 0 10px">
        「仅 SEO/GEO 模式」只保留内容管理、前台页面、新闻采集、SEO/GEO、排名追踪、AI 写作，
        关闭内容分发、客户留言、智能问答、媒体库、表单管理、角色权限、API 密钥。
      </p>
      <form method="post" action="/admin/features/preset" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" type="submit" name="preset" value="seo">仅 SEO/GEO 模式</button>
        <button class="btn" type="submit" name="preset" value="all">全部开启</button>
      </form>
    </div>

    <form class="admin-form card" method="post" action="/admin/features" style="margin:0 0 16px">
      <strong>SEO / GEO 核心模块</strong>
      <p style="color:var(--muted);font-size:12px;margin:4px 0 0">这些是 SEO/GEO 的载体，关掉后对应功能会失去可优化的对象。</p>
      ${core.map(row).join('')}

      <strong style="display:block;margin-top:18px">可选模块</strong>
      <p style="color:var(--muted);font-size:12px;margin:4px 0 0">用不到就关掉，后台更清爽。</p>
      ${extra.map(row).join('')}

      <button class="btn" type="submit" style="margin-top:14px">保存功能开关</button>
    </form>`,
  })
}
