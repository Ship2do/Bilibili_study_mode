/*
 * 拦截界面的主题数据与样式模板。
 *
 * 内容脚本拿不到 shared/ 里的常量（2.1.0 起已从 content_scripts 移除），
 * 所以调色板在这里独立维护，靠测试与 ui/tokens.css 比对防漂移。
 *
 * 不用 web_accessible_resources + <link> 引外部 css：那会把扩展资源 URL
 * 暴露给B站（可被用于指纹识别），还要改 manifest。CSS 文本常量零暴露。
 */

// 遮罩底色恒为中性暗色，不跟随主题。
// 亮色主题下如果遮罩变成一片白，既刺眼又失去「被拦住」的心理压迫感；
// 明暗差异体现在中间那张面板上，遮罩的功能性不被削弱。
const OVERLAY_SCRIM_RGB = "10, 12, 16";

const OVERLAY_PALETTE = {
  light: {
    "--sg-panel-bg": "#ffffff",
    "--sg-panel-border": "#e3e6ea",
    "--sg-text": "#1a1d21",
    "--sg-text-sub": "#5b6570",
    "--sg-text-muted": "#8b949e",
    "--sg-line": "#e3e6ea",
    "--sg-btn-bg": "#ffffff",
    "--sg-btn-border": "#cfd4da",
    "--sg-btn-hover": "#f0f2f5",
    "--sg-shadow": "0 16px 48px rgba(16, 24, 40, .3)",
    "--sg-banner-sat": "72%",
    "--sg-banner-light": "46%"
  },
  dark: {
    "--sg-panel-bg": "#171a20",
    "--sg-panel-border": "#272c35",
    "--sg-text": "#e6e9ee",
    "--sg-text-sub": "#9aa4b2",
    "--sg-text-muted": "#6b7482",
    "--sg-line": "#272c35",
    "--sg-btn-bg": "#1e222a",
    "--sg-btn-border": "#363c47",
    "--sg-btn-hover": "#242933",
    "--sg-shadow": "0 16px 48px rgba(0, 0, 0, .62)",
    "--sg-banner-sat": "64%",
    "--sg-banner-light": "38%"
  }
};

// 与 ui/tokens.css 的 html[data-accent] 预设逐一对应
const OVERLAY_ACCENTS = {
  crimson: { light: "#d13438", dark: "#ff6b6e" },
  indigo: { light: "#4f46e5", dark: "#818cf8" },
  teal: { light: "#0d9488", dark: "#2dd4bf" },
  amber: { light: "#b45309", dark: "#fbbf24" },
  rose: { light: "#be185d", dark: "#f472b6" },
  slate: { light: "#475569", dark: "#94a3b8" }
};

const OVERLAY_FONTS = {
  system: `-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`,
  serif: `"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, Georgia, serif`,
  mono: `ui-monospace, "Cascadia Code", "JetBrains Mono", Consolas, "Microsoft YaHei", monospace`
};

const OVERLAY_RADII = { sharp: "4px", soft: "14px", round: "22px" };

// 全部规则只引用 var(--sg-*)，不含任何字面色值——换主题只是几次 setProperty，不重建 DOM。
const OVERLAY_CSS = `
  /* all: initial 连继承属性（字体、行高、字距、颜色）一起挡掉。
     自定义属性不受 all 影响，所以 --sg-* 令牌仍能正常继承进来。 */
  :host { all: initial; }

  @keyframes sg-scroll-0 { from { transform: translateX(-18%); } to { transform: translateX(18%); } }
  @keyframes sg-scroll-1 { from { transform: translateX(18%); }  to { transform: translateX(-18%); } }

  .sg-panel {
    position: relative; z-index: 1;
    box-sizing: border-box;
    width: min(520px, 90vw);
    padding: 28px;
    border: 1px solid var(--sg-panel-border);
    border-radius: var(--sg-radius);
    background: var(--sg-panel-bg);
    box-shadow: var(--sg-shadow);
    font-family: var(--sg-font);
    text-align: left;
    /* toast 模式下宿主整体 pointer-events: none 以便页面可点，面板本身要收回可点 */
    pointer-events: auto;
  }

  /* card：页面仍可见但整层拦住点击，面板浮在毛玻璃背板上 */
  :host([data-kind="card"]) { backdrop-filter: blur(8px); }

  /* toast：顶部提示条，不遮挡页面 */
  :host([data-kind="toast"]) .sg-panel {
    width: min(420px, 92vw);
    padding: 14px 16px;
  }
  :host([data-kind="toast"]) .sg-title { font-size: 15px; margin-bottom: 4px; }
  :host([data-kind="toast"]) .sg-badge { margin-bottom: 8px; font-size: 11px; padding: 2px 8px; }
  :host([data-kind="toast"]) .sg-reason { font-size: 12px; }
  :host([data-kind="toast"]) .sg-encourage { font-size: 12px; margin-bottom: 8px; }
  :host([data-kind="toast"]) .sg-video-info { margin-bottom: 10px; padding-top: 8px; }
  :host([data-kind="toast"]) .sg-btn { padding: 6px 12px; font-size: 12px; }

  .sg-badge {
    display: inline-block;
    padding: 3px 10px;
    margin-bottom: 14px;
    border-radius: 999px;
    background: var(--sg-accent);
    color: var(--sg-accent-contrast);
    font-size: 12px;
    font-weight: 600;
  }

  .sg-title {
    margin: 0 0 10px;
    color: var(--sg-text);
    font-family: var(--sg-font);
    font-size: 22px;
    font-weight: 650;
    line-height: 1.35;
  }

  .sg-reason {
    margin: 0 0 6px;
    color: var(--sg-text-sub);
    font-family: var(--sg-font);
    font-size: 14px;
    line-height: 1.6;
  }

  .sg-encourage {
    margin: 0 0 14px;
    color: var(--sg-accent);
    font-family: var(--sg-font);
    font-size: 13px;
    font-weight: 600;
  }
  .sg-encourage:empty { display: none; }

  .sg-video-info {
    margin: 0 0 20px;
    padding-top: 14px;
    border-top: 1px solid var(--sg-line);
    color: var(--sg-text-muted);
    font-family: var(--sg-font);
    font-size: 12px;
    line-height: 1.7;
    word-break: break-all;
  }
  .sg-video-info[hidden] { display: none; }

  .sg-actions { display: flex; flex-wrap: wrap; gap: 10px; }

  .sg-btn {
    padding: 9px 18px;
    border: 1px solid var(--sg-btn-border);
    border-radius: calc(var(--sg-radius) * .6);
    background: var(--sg-btn-bg);
    color: var(--sg-text);
    font-family: var(--sg-font);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.5;
    cursor: pointer;
    transition: background 120ms cubic-bezier(.2,.8,.2,1), transform 120ms cubic-bezier(.2,.8,.2,1);
  }
  .sg-btn:hover:not(:disabled) { background: var(--sg-btn-hover); }
  .sg-btn:active:not(:disabled) { transform: scale(.98); }
  .sg-btn:disabled { opacity: .5; cursor: not-allowed; }
  .sg-btn:focus-visible { outline: 2px solid var(--sg-accent); outline-offset: 2px; }

  .sg-btn[hidden] { display: none; }
  .sg-btn-continue { color: var(--sg-text-muted); }

  .sg-btn-home { border-color: transparent; background: var(--sg-accent); color: var(--sg-accent-contrast); }
  .sg-btn-home:hover:not(:disabled) { background: var(--sg-accent); filter: brightness(.92); }

  @media (prefers-reduced-motion: reduce) {
    .sg-banners * { animation: none !important; }
  }
`;

function resolveOverlayScheme(uiTheme) {
  if (uiTheme === "light" || uiTheme === "dark") return uiTheme;
  const query = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  return query && query.matches ? "dark" : "light";
}

function resolveOverlayAccent(uiAccent, scheme) {
  const value = String(uiAccent || "crimson").trim().toLowerCase();
  if (OVERLAY_ACCENTS[value]) return OVERLAY_ACCENTS[value][scheme];
  return /^#[0-9a-f]{6}$/.test(value) ? value : OVERLAY_ACCENTS.crimson[scheme];
}

/* 按 WCAG 相对亮度决定强调色上面放黑字还是白字 */
function overlayContrastFor(hex) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#16181d" : "#ffffff";
}

/* 返回宿主上要设置的全部 --sg-* 令牌 */
function buildOverlayTokens(settings) {
  const scheme = resolveOverlayScheme(settings.uiTheme);
  const accent = resolveOverlayAccent(settings.uiAccent, scheme);
  const opacity = Number.isFinite(Number(settings.blockOpacity)) ? Number(settings.blockOpacity) : 97;

  return {
    ...OVERLAY_PALETTE[scheme],
    "--sg-accent": accent,
    "--sg-accent-contrast": overlayContrastFor(accent),
    "--sg-font": OVERLAY_FONTS[settings.uiFont] || OVERLAY_FONTS.system,
    "--sg-radius": OVERLAY_RADII[settings.uiRadius] || OVERLAY_RADII.soft,
    "--sg-scrim": `rgba(${OVERLAY_SCRIM_RGB}, ${Math.min(100, Math.max(0, opacity)) / 100})`
  };
}
