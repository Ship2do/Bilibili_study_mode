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
  settings: { actionHideCover: false, autoNotInterestedEnabled: false },
  notInterestedHandled: new Set()
};

async function refreshRuntimeSettings() {
  const response = await sendMessage({ type: "GET_SETTINGS" });
  if (response?.ok && response.settings && typeof response.settings === "object") {
    STATE.settings.actionHideCover = response.settings.actionHideCover === true;
    STATE.settings.autoNotInterestedEnabled = response.settings.autoNotInterestedEnabled === true;
  } else {
    STATE.settings.actionHideCover = false;
    STATE.settings.autoNotInterestedEnabled = false;
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
    evaluateCurrentPage();
    refreshRuntimeSettings().then(() => {
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
