const OVERLAY_ID = "__study_guard_overlay__";

// 用户没自定义鼓励语时，按视频 key 稳定挑一条——同一个视频每次拦截看到的话一样，
// 不同视频之间有变化，避免同一句话反复出现产生免疫。
const BUILTIN_ENCOURAGEMENTS = [
  "现在关掉，等会儿会感谢自己。",
  "先把手头那件事做完。",
  "这条视频明天还在，今天的时间不在。"
];

function getModeLabel(mode) {
  if (mode === "weak") return "弱模式";
  if (mode === "strong") return "强模式";
  if (mode === "ai") return "AI模式";
  return "学习模式";
}

function getBlockReasonText(result) {
  const { mode, reason } = result;
  if (mode === "weak") return "命中屏蔽词";
  if (mode === "strong") return "未命中学习词";
  if (mode === "ai") return reason || "AI判定为非学习向";
  return reason || "该视频未通过学习模式规则";
}

function pickEncouragement(customText, videoKey) {
  const custom = String(customText || "").trim();
  if (custom) return custom;
  const key = String(videoKey || "");
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  return BUILTIN_ENCOURAGEMENTS[hash % BUILTIN_ENCOURAGEMENTS.length];
}

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// 每条横幅的色相在基准色相上做一点随机扰动，制造「多条横幅色调微妙差异」的效果。
// 扰动逻辑保持原样，只把基准色相、密度、速度提为可配置。
function buildBanners(text, options) {
  const container = document.createElement("div");
  container.className = "sg-banners";
  container.style.cssText = `
    position: absolute; inset: 0; overflow: hidden;
    pointer-events: none; z-index: 0;
  `;

  const rand = seededRandom(42);
  const count = options.density;
  const baseHue = options.hue;
  const repeatedText = Array(25).fill(text).join("　　　");

  for (let i = 0; i < count; i++) {
    const angle = Math.round(rand() * 90 - 45);
    const topPercent = (i / count) * 130 - 15;
    // speed 1..10 映射到 15..6 秒，数值越大转得越快
    const duration = 16 - options.speed + Math.round(rand() * 4);
    const direction = rand() > 0.5 ? "normal" : "reverse";
    const hueShift = Math.round(rand() * 10 - 5);
    const hue = (baseHue + hueShift + 360) % 360;
    const animClass = `sg-scroll-${i % 2}`;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      position: absolute; left: -90%; top: ${topPercent}%;
      width: 280%; height: 30px;
      animation: ${animClass} ${duration}s linear infinite ${direction};
    `;

    const banner = document.createElement("div");
    banner.style.cssText = `
      width: 100%; height: 30px; line-height: 30px;
      font-family: var(--sg-font); font-size: 16px; font-weight: 700;
      letter-spacing: 2px;
      color: rgba(255, 255, 255, 0.92);
      background: hsl(${hue} var(--sg-banner-sat) var(--sg-banner-light));
      text-align: center; white-space: nowrap;
      transform: rotate(${angle}deg);
      text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.4);
    `;
    banner.textContent = repeatedText;

    wrapper.appendChild(banner);
    container.appendChild(wrapper);
  }

  return container;
}

function bannerSignature(settings, presentation) {
  const enabled = presentation.showBanners && Number(settings.blockBannerDensity) > 0;
  return [
    enabled ? "1" : "0",
    settings.blockBannerText || "学习！",
    settings.blockBannerDensity,
    settings.blockBannerSpeed,
    settings.blockBannerHue
  ].join("|");
}

// 横幅只在文案/开关/密度/速度/色相/呈现方式变化时重建，纯换主题不动它。
function applyBanners(host, root, settings, presentation, signature) {
  host.dataset.sgBanner = signature;
  const existing = root.querySelector(".sg-banners");
  if (existing) existing.remove();

  const density = Number(settings.blockBannerDensity);
  if (!presentation.showBanners || !(density > 0)) return;

  root.insertBefore(buildBanners(settings.blockBannerText || "学习！", {
    density,
    speed: Number(settings.blockBannerSpeed) || 5,
    hue: Number.isFinite(Number(settings.blockBannerHue)) ? Number(settings.blockBannerHue) : 355
  }), root.firstChild);
}

// 呈现方式对行为设「上限」，避免出现「温和提示条却锁死滚动」这种自相矛盾的状态。
// 注意 toast 隐含 allowContinue（提示条本来就不阻断），这也是它在密码锁里 tier 最低
// 的原因——tier 排序与实际可绕过难度一致，不会出现「选了 toast 反而不要密码」的漏洞。
function resolvePresentation(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const kind = ["overlay", "card", "toast"].includes(source.blockPresentation)
    ? source.blockPresentation : "overlay";
  const opacity = Number.isFinite(Number(source.blockOpacity)) ? Number(source.blockOpacity) : 97;

  return {
    kind,
    scrollLock: kind === "toast" ? false : source.blockScrollLock !== false,
    pauseVideo: source.blockPauseVideo !== false,
    showBanners: kind === "overlay" && source.blockBannerEnabled !== false,
    // card 背后要能看见页面，遮罩透明度封顶；toast 完全不遮
    scrimOpacity: kind === "overlay" ? opacity / 100 : (kind === "card" ? Math.min(opacity, 55) / 100 : 0),
    allowContinue: source.blockAllowContinue === true || kind === "toast",
    continueDelaySec: Math.max(0, Number(source.blockContinueDelaySec) || 0),
    autoDismissSec: Math.max(0, Number(source.blockAutoDismissSec) || 0)
  };
}

// 换主题只是几次 setProperty，不重建 DOM
function applyOverlayTheme(host, settings, presentation) {
  const tokens = buildOverlayTokens(settings);
  for (const [name, value] of Object.entries(tokens)) {
    host.style.setProperty(name, value, "important");
  }

  const p = presentation || resolvePresentation(settings);
  host.dataset.kind = p.kind;

  if (p.kind === "toast") {
    host.style.setProperty("background", "transparent", "important");
    host.style.setProperty("align-items", "flex-start", "important");
    host.style.setProperty("padding", "16px", "important");
    // 提示条不该挡住页面操作，宿主整体穿透，面板自己收回可点
    host.style.setProperty("pointer-events", "none", "important");
  } else {
    host.style.setProperty("background", `rgba(${OVERLAY_SCRIM_RGB}, ${p.scrimOpacity})`, "important");
    host.style.setProperty("align-items", "center", "important");
    host.style.setProperty("padding", "0", "important");
    host.style.setProperty("pointer-events", "auto", "important");
  }
}

// 拦截界面的所有内部元素引用集中在这里。外部（page-blocker）只通过 getOverlayRefs()
// 拿引用，不再直接查弹窗内部 DOM——shadow root 里的元素用 document.querySelector 是
// 查不到的，集中一处也便于将来改结构。
let overlayRefs = null;

function createOverlay() {
  const host = document.createElement("div");
  host.id = OVERLAY_ID;
  // 定位样式留在宿主的内联样式上：内联优先级高于 shadow 里的 :host { all: initial }，
  // 也让显隐可以直接操作宿主。
  //
  // 每条都带 !important：shadow root 保护的是内部元素，宿主本身仍是页面 DOM 里的一个
  // div，会被B站形如 `div { background: ... !important }` 的全局规则击穿——实测过，
  // 遮罩底色会整个消失。内联 !important 在层叠里优先级最高，页面的 !important 也压不过。
  // 可继承属性（字距、行高、字体、颜色…）必须一并在宿主上重置：shadow 内部的元素
  // 是从宿主继承这些值的，而页面的 `* { letter-spacing: 4px !important }` 能命中宿主，
  // 压过 :host { all: initial } 这条普通声明。实测中文字距会被整个撑开。
  host.style.cssText = `
    position: fixed !important; inset: 0 !important;
    z-index: 2147483647 !important; display: none !important;
    align-items: center !important; justify-content: center !important;
    margin: 0 !important; padding: 0 !important; border: 0 !important;
    pointer-events: auto !important; visibility: visible !important;
    max-width: none !important; max-height: none !important;
    transform: none !important; filter: none !important; opacity: 1 !important;
    letter-spacing: normal !important; word-spacing: normal !important;
    line-height: normal !important; font-size: 16px !important;
    font-weight: 400 !important; font-style: normal !important;
    font-variant: normal !important; text-transform: none !important;
    text-align: left !important; text-indent: 0 !important;
    text-shadow: none !important; white-space: normal !important;
    direction: ltr !important; writing-mode: horizontal-tb !important;
    color: #000 !important; cursor: auto !important;
  `;

  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = OVERLAY_CSS;
  root.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "sg-panel";

  const badge = document.createElement("span");
  badge.className = "sg-badge";

  const title = document.createElement("h1");
  title.className = "sg-title";
  title.textContent = "已拦截";

  const reason = document.createElement("p");
  reason.className = "sg-reason";

  const encourage = document.createElement("p");
  encourage.className = "sg-encourage";

  const videoInfo = document.createElement("p");
  videoInfo.className = "sg-video-info";

  const actions = document.createElement("div");
  actions.className = "sg-actions";

  const homeBtn = document.createElement("button");
  homeBtn.type = "button";
  homeBtn.className = "sg-btn sg-btn-home";
  homeBtn.textContent = "返回首页";
  homeBtn.addEventListener("click", () => { location.href = "https://www.bilibili.com/"; });

  const optBtn = document.createElement("button");
  optBtn.type = "button";
  optBtn.className = "sg-btn sg-btn-opt";
  optBtn.textContent = "调整规则";
  optBtn.addEventListener("click", () => { chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }); });

  // 出口按钮：默认隐藏，只有 blockAllowContinue 或 toast 模式才出现。
  // 点击行为由 page-blocker 用 onclick 赋值（不是 addEventListener，避免反复拦截时累积监听）。
  const continueBtn = document.createElement("button");
  continueBtn.type = "button";
  continueBtn.className = "sg-btn sg-btn-continue";
  continueBtn.textContent = "继续观看";
  continueBtn.hidden = true;

  actions.append(homeBtn, optBtn, continueBtn);
  panel.append(badge, title, reason, encourage, videoInfo, actions);
  root.appendChild(panel);
  (document.documentElement || document.body)?.appendChild(host);

  return { host, root, style, panel, badge, title, reason, encourage, videoInfo, actions, homeBtn, optBtn, continueBtn };
}

function getOverlayRefs() {
  return overlayRefs;
}

// 显隐必须走 setProperty(..., "important")：直接赋值 style.display 会把上面设的
// !important 标志抹掉，页面的 `div { display: ... !important }` 就又能压过来了。
function showOverlay() {
  if (overlayRefs) overlayRefs.host.style.setProperty("display", "flex", "important");
}

function hideOverlay() {
  const host = overlayRefs ? overlayRefs.host : document.getElementById(OVERLAY_ID);
  if (host) host.style.setProperty("display", "none", "important");
}

function ensureOverlay(settings) {
  // 宿主可能被B站的页面重绘摘掉，isConnected 比按 id 查更可靠
  if (!overlayRefs || !overlayRefs.host.isConnected) overlayRefs = createOverlay();

  const presentation = resolvePresentation(settings);
  applyOverlayTheme(overlayRefs.host, settings, presentation);

  const signature = bannerSignature(settings, presentation);
  if (overlayRefs.host.dataset.sgBanner !== signature) {
    applyBanners(overlayRefs.host, overlayRefs.root, settings, presentation, signature);
  }
  return overlayRefs.host;
}
