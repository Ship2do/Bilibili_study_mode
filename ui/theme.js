/*
 * 三个扩展页（popup / options / welcome）共用的主题应用逻辑。
 *
 * 亮/暗/跟随系统由 CSS 的 light-dark() 负责，这里只写 data-* 属性去切换
 * color-scheme —— 所以首帧就是正确的主题，不存在 JS 上色导致的闪烁。
 * 只有自定义主题色需要 JS 直接算，因为它不在预设表里。
 */

const ACCENT_PRESET_NAMES = ["crimson", "indigo", "teal", "amber", "rose", "slate"];

/* 相对亮度按 WCAG 公式算，用来决定强调色上面该放黑字还是白字 */
function relativeLuminance(hex) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastFor(hex) {
  return relativeLuminance(hex) > 0.45 ? "#16181d" : "#ffffff";
}

function applyTheme(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const root = document.documentElement;

  // auto 时不写 data-theme，让 :root 的 `color-scheme: light dark` 跟随系统
  const theme = ["light", "dark"].includes(source.uiTheme) ? source.uiTheme : "";
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;

  const accent = String(source.uiAccent || "crimson").trim().toLowerCase();
  if (ACCENT_PRESET_NAMES.includes(accent)) {
    // 预设走 CSS，亮/暗两版由 tokens.css 里的 light-dark() 提供
    root.dataset.accent = accent;
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-contrast");
  } else if (/^#[0-9a-f]{6}$/.test(accent)) {
    root.dataset.accent = "custom";
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-contrast", contrastFor(accent));
  } else {
    root.dataset.accent = "crimson";
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-contrast");
  }
}

/* 在 options 改了主题，已经开着的 popup / welcome 要立刻跟着变 */
function watchThemeChanges(getSettings) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.studyGuardSettings) return;
    Promise.resolve(getSettings()).then(settings => {
      if (settings) applyTheme(settings);
    });
  });
}
