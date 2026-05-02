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

function injectBannerStyles() {
  if (document.getElementById("sg-style")) return;
  const style = document.createElement("style");
  style.id = "sg-style";
  style.textContent = `
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
  document.head.appendChild(style);
}

function ensureOverlay(bannerEnabled, bannerText) {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  injectBannerStyles();

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647; display: none;
    align-items: center; justify-content: center;
    background: rgba(6, 1, 1, 0.97);
    font-family: ${PIXEL_FONT}; color: #fff;
  `;

  if (bannerEnabled !== false) {
    overlay.appendChild(buildBanners(bannerText || "学习！"));
  }

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
  overlay.append(panel);
  (document.documentElement || document.body)?.appendChild(overlay);

  return overlay;
}
