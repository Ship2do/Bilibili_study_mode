// 内容脚本会用到的设置字段。加新字段只改这张表，refreshRuntimeSettings 不用动。
// bool 的默认值同时决定了取值语义：默认 true 的字段用「不等于 false」，
// 默认 false 的字段用「严格等于 true」——与后台 normalizeSettings 的兜底保持一致。
const RUNTIME_SETTINGS = {
  actionHideCover:          { type: "bool",   default: false },
  autoNotInterestedEnabled: { type: "bool",   default: false },
  blockBannerEnabled:       { type: "bool",   default: true },
  blockBannerText:          { type: "string", default: "学习！" },

  // 外观：拦截界面的主题令牌由这些字段算出来
  uiTheme:                  { type: "raw",    default: "auto" },
  uiAccent:                 { type: "raw",    default: "crimson" },
  blockBannerDensity:       { type: "raw",    default: 18 },
  blockBannerColor:         { type: "raw",    default: "red" },
  blockShowVideoInfo:       { type: "bool",   default: true },
  blockOpacity:             { type: "raw",    default: 97 },

  // 拦截强度：后台已按 schema 归一化过，内容脚本原样取用即可
  blockPresentation:        { type: "raw",    default: "overlay" },
  blockAllowContinue:       { type: "bool",   default: false },
  blockContinueDelaySec:    { type: "raw",    default: 10 },
  blockAutoDismissSec:      { type: "raw",    default: 0 },
  blockScrollLock:          { type: "bool",   default: true },
  blockPauseVideo:          { type: "bool",   default: true }
};

function coerceRuntimeSetting(raw, spec) {
  if (spec.type === "bool") return spec.default === true ? raw !== false : raw === true;
  if (spec.type === "string") return String(raw || spec.default);
  return raw === undefined ? spec.default : raw;
}

function defaultRuntimeSettings() {
  const result = {};
  for (const [key, spec] of Object.entries(RUNTIME_SETTINGS)) result[key] = spec.default;
  return result;
}

const STATE = {
  lastHref: location.href,
  lastVideoKey: "",
  requestId: 0,
  blocked: false,
  pauseTimer: null,
  htmlOverflow: "",
  bodyOverflow: "",
  cardScanTimer: null,
  cardScanRunning: false,
  cardScanQueued: false,
  cardObserver: null,
  decisionCache: new Map(),
  settings: defaultRuntimeSettings(),
  notInterestedHandled: new Set(),
  // 「继续观看」/ 倒计时放行过的视频
  bypass: new Map(),
  autoDismissTimer: null,
  continueTimer: null
};

async function refreshRuntimeSettings() {
  const response = await sendMessage({ type: "GET_SETTINGS" });
  const ok = response?.ok && response.settings && typeof response.settings === "object";
  const source = ok ? response.settings : {};
  for (const [key, spec] of Object.entries(RUNTIME_SETTINGS)) {
    STATE.settings[key] = coerceRuntimeSetting(source[key], spec);
  }
}

function scheduleCardScan(delayMs) {
  if (!STATE.settings.actionHideCover) return;
  const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 180;
  if (STATE.cardScanTimer) clearTimeout(STATE.cardScanTimer);
  STATE.cardScanTimer = setTimeout(() => { STATE.cardScanTimer = null; filterVideoCards(STATE); }, delay);
}

async function evaluateCurrentPage() {
  const videoId = parseVideoId(location.href);
  const liveId = !videoId ? parseLiveRoomId(location.href) : null;
  const currentId = videoId || liveId;

  if (!currentId) {
    STATE.lastHref = location.href;
    STATE.lastVideoKey = "";
    unblockPage(STATE);
    return;
  }

  if (STATE.lastVideoKey === currentId.key && STATE.lastHref === location.href) return;

  STATE.lastVideoKey = currentId.key;
  STATE.lastHref = location.href;
  const requestId = ++STATE.requestId;
  const result = await checkSingleVideo(currentId, "page");

  if (requestId !== STATE.requestId) return;

  if (result.allowed) unblockPage(STATE);
  else blockPage(result, STATE);
}

function resetFiltering() {
  STATE.decisionCache.clear();
  restoreHiddenCards();
  scheduleCardScan(80);
}

function onMaybeNavigate() {
  if (location.href !== STATE.lastHref) {
    evaluateCurrentPage();
    scheduleCardScan(220);
  }
}

function wrapHistoryMethod(methodName) {
  const original = history[methodName];
  if (typeof original !== "function") return;
  history[methodName] = function (...args) {
    const result = original.apply(this, args);
    setTimeout(onMaybeNavigate, 0);
    return result;
  };
}

function startCardObserver() {
  if (STATE.cardObserver || !document.body) return;
  STATE.cardObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === "childList" && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
        scheduleCardScan(200);
        return;
      }
    }
  });
  STATE.cardObserver.observe(document.body, { childList: true, subtree: true });
}

wrapHistoryMethod("pushState");
wrapHistoryMethod("replaceState");
window.addEventListener("popstate", () => setTimeout(onMaybeNavigate, 0));

setInterval(() => {
  onMaybeNavigate();
  scheduleCardScan(450);
}, 2200);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.studyGuardSettings) {
    STATE.lastVideoKey = "";
    STATE.requestId++;
    STATE.notInterestedHandled.clear();
    const hadContinue = STATE.settings.blockAllowContinue === true;
    // 必须先取到新设置再重新判定，否则本次拦截用的还是旧的横幅文案／动作配置。
    refreshRuntimeSettings().finally(() => {
      // 关掉「继续观看」后，之前放行过的视频应该重新受管
      if (hadContinue && STATE.settings.blockAllowContinue !== true) STATE.bypass.clear();
      evaluateCurrentPage();
      if (STATE.settings.actionHideCover) { resetFiltering(); return; }
      STATE.decisionCache.clear();
      restoreHiddenCards();
    });
  }
});

// 主题设为「跟随系统」时，系统明暗切换要立刻反映到拦截界面上。
// 走 ensureOverlay 而不是只调 applyOverlayTheme：横幅颜色也分明暗两版，需要一起重建。
if (typeof matchMedia === "function") {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (STATE.settings.uiTheme === "auto" && getOverlayRefs()) ensureOverlay(STATE.settings);
  });
}

const init = () => {
  refreshRuntimeSettings().finally(() => {
    evaluateCurrentPage();
    startCardObserver();
    scheduleCardScan(120);
  });
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
