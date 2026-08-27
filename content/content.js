// 内容脚本会用到的设置字段。加新字段只改这张表，refreshRuntimeSettings 不用动。
// bool 的默认值同时决定了取值语义：默认 true 的字段用「不等于 false」，
// 默认 false 的字段用「严格等于 true」——与后台 normalizeSettings 的兜底保持一致。
const RUNTIME_SETTINGS = {
  actionHideCover:          { type: "bool",   default: false },
  autoNotInterestedEnabled: { type: "bool",   default: false },
  blockBannerEnabled:       { type: "bool",   default: true },
  blockBannerText:          { type: "string", default: "学习！" }
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
  notInterestedHandled: new Set()
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
    // 必须先取到新设置再重新判定，否则本次拦截用的还是旧的横幅文案／动作配置。
    refreshRuntimeSettings().finally(() => {
      evaluateCurrentPage();
      if (STATE.settings.actionHideCover) { resetFiltering(); return; }
      STATE.decisionCache.clear();
      restoreHiddenCards();
    });
  }
});

const init = () => {
  refreshRuntimeSettings().finally(() => {
    evaluateCurrentPage();
    startCardObserver();
    scheduleCardScan(120);
  });
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
