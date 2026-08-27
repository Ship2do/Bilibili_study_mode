const OVERLAY_ID = "__study_guard_overlay__";
const PIXEL_FONT = "'Courier New', 'Consolas', monospace";

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

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildBanners(text) {
  const container = document.createElement("div");
  container.className = "sg-banners";
  container.style.cssText = `
    position: absolute; inset: 0; overflow: hidden;
    pointer-events: none; z-index: 0;
  `;

  const rand = seededRandom(42);
  const count = 18;
  const repeatedText = Array(25).fill(text).join("　　　");

  for (let i = 0; i < count; i++) {
    const angle = Math.round(rand() * 90 - 45);
    const topPercent = (i / count) * 130 - 15;
    const duration = 5 + Math.round(rand() * 10);
    const direction = rand() > 0.5 ? "normal" : "reverse";
    const hueShift = Math.round(rand() * 10 - 5);
    const animClass = `sg-scroll-${i % 2}`;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      position: absolute; left: -90%; top: ${topPercent}%;
      width: 280%; height: 32px;
      animation: ${animClass} ${duration}s linear infinite ${direction};
    `;

    const banner = document.createElement("div");
    banner.style.cssText = `
      width: 100%; height: 32px; line-height: 32px;
      font-family: ${PIXEL_FONT}; font-size: 18px; font-weight: 900;
      letter-spacing: 5px;
      color: rgba(255, 255, 255, 0.85);
      background: hsl(${355 + hueShift}, 80%, 42%);
      text-align: center; white-space: nowrap;
      transform: rotate(${angle}deg);
      text-shadow: 2px 2px 0 rgba(0,0,0,0.5);
      box-shadow: 0 1px 6px rgba(0,0,0,0.3);
      image-rendering: pixelated;
    `;
    banner.textContent = repeatedText;

    wrapper.appendChild(banner);
    container.appendChild(wrapper);
  }

  return container;
}

// 拦截界面整体挂在 shadow root 里，这段样式随之注入 shadow，不再污染B站页面，
// 也不会被B站的全局重置样式（* {} / button {} / h1 {}）反过来污染。
function overlayStyleText() {
  return `
    /* all: initial 连继承属性（字体、行高、字距、颜色）一起挡掉，
       这是纯 class 前缀方案做不到的。宿主自身的定位样式写在内联，优先级更高不受影响。
       自定义属性不受 all 影响，所以 --sg-* 令牌仍能正常继承进来。 */
    :host { all: initial; }
    @keyframes sg-scroll-0 {
      from { transform: translateX(-18%); }
      to   { transform: translateX(18%); }
    }
    @keyframes sg-scroll-1 {
      from { transform: translateX(18%); }
      to   { transform: translateX(-18%); }
    }
    .sg-panel {
      position: relative; z-index: 1;
      width: min(720px, 88vw);
      background: #110808;
      border: 3px solid #dc2626;
      padding: 32px; box-sizing: border-box;
      box-shadow:
        0 0 0 5px #0a0404,
        0 0 80px rgba(220,38,38,0.35),
        inset 0 0 60px rgba(220,38,38,0.05);
    }
    .sg-title {
      margin: 0 0 18px; font-size: 30px; font-weight: 900;
      font-family: ${PIXEL_FONT}; color: #ff3333;
      text-shadow: 3px 3px 0 #000, 0 0 20px rgba(255,50,50,0.5);
      text-transform: uppercase; letter-spacing: 6px;
      text-align: center;
    }
    .sg-reason {
      margin: 0 0 14px; color: #ffbbbb; font-size: 16px; line-height: 1.6;
      font-family: ${PIXEL_FONT}; font-weight: 700;
      text-shadow: 1px 1px 0 rgba(0,0,0,0.6);
    }
    .sg-video-info {
      margin: 0 0 22px; color: #aa6666; font-size: 13px; line-height: 1.7;
      font-family: ${PIXEL_FONT};
      border-top: 2px solid #331111; padding-top: 14px;
    }
    .sg-actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
    .sg-btn {
      border: 3px solid; border-radius: 0; padding: 14px 24px;
      font-family: ${PIXEL_FONT}; font-size: 14px; font-weight: 900;
      cursor: pointer; text-transform: uppercase; letter-spacing: 3px;
      transition: transform 0.08s;
      image-rendering: pixelated;
    }
    .sg-btn:hover { transform: translate(-2px, -2px); }
    .sg-btn:active { transform: translate(2px, 2px); }
    .sg-btn-home {
      background: #cc1111; color: #fff; border-color: #ff4444;
      box-shadow: 5px 5px 0 #000;
    }
    .sg-btn-home:hover { background: #ee2222; }
    .sg-btn-opt {
      background: #1a0808; color: #ff8888; border-color: #552222;
      box-shadow: 5px 5px 0 #000;
    }
    .sg-btn-opt:hover { background: #2a1010; border-color: #773333; }
  `;
}

function bannerSignature(bannerEnabled, bannerText) {
  return `${bannerEnabled !== false ? "1" : "0"}:${bannerText || "学习！"}`;
}

// 横幅只在文案/开关变化时重建，避免设置改完必须刷新页面才生效。
function applyBanners(host, root, bannerEnabled, bannerText, signature) {
  host.dataset.sgBanner = signature;
  const existing = root.querySelector(".sg-banners");
  if (existing) existing.remove();
  if (bannerEnabled === false) return;
  root.insertBefore(buildBanners(bannerText || "学习！"), root.firstChild);
}

// 拦截界面的所有内部元素引用集中在这里。外部（page-blocker）只通过 getOverlayRefs()
// 拿引用，不再直接查弹窗内部 DOM——shadow root 里的元素用 document.querySelector 是
// 查不到的，集中一处也便于将来改结构。
let overlayRefs = null;

function createOverlay() {
  const host = document.createElement("div");
  host.id = OVERLAY_ID;
  // 定位样式留在宿主的内联样式上：内联优先级高于 shadow 里的 :host { all: initial }，
  // 也让 page-blocker 继续用 host.style.display 控制显隐。
  //
  // 每条都带 !important：shadow root 保护的是内部元素，宿主本身仍是页面 DOM 里的一个
  // div，会被B站形如 `div { background: ... !important }` 的全局规则击穿——实测过，
  // 遮罩底色会整个消失。内联 !important 在层叠里优先级最高，页面的 !important 也压不过。
  host.style.cssText = `
    position: fixed !important; inset: 0 !important;
    z-index: 2147483647 !important; display: none !important;
    align-items: center !important; justify-content: center !important;
    margin: 0 !important; padding: 0 !important; border: 0 !important;
    background: rgba(6, 1, 1, 0.97) !important;
    font-family: ${PIXEL_FONT} !important; color: #fff !important;
    pointer-events: auto !important; visibility: visible !important;
    max-width: none !important; max-height: none !important;
    transform: none !important; filter: none !important; opacity: 1 !important;
  `;

  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = overlayStyleText();
  root.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "sg-panel";

  const title = document.createElement("h1");
  title.className = "sg-title";
  title.textContent = "!! 已拦截 !!";

  const reason = document.createElement("p");
  reason.className = "sg-reason";

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

  actions.append(homeBtn, optBtn);
  panel.append(title, reason, videoInfo, actions);
  root.appendChild(panel);
  (document.documentElement || document.body)?.appendChild(host);

  return { host, root, style, panel, title, reason, videoInfo, actions, homeBtn, optBtn };
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

function ensureOverlay(bannerEnabled, bannerText) {
  // 宿主可能被B站的页面重绘摘掉，isConnected 比按 id 查更可靠
  if (!overlayRefs || !overlayRefs.host.isConnected) overlayRefs = createOverlay();

  const signature = bannerSignature(bannerEnabled, bannerText);
  if (overlayRefs.host.dataset.sgBanner !== signature) {
    applyBanners(overlayRefs.host, overlayRefs.root, bannerEnabled, bannerText, signature);
  }
  return overlayRefs.host;
}
