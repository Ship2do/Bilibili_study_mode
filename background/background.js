importScripts(
  "/shared/constants.js",
  "/shared/utils.js",
  "/background/keyword-matcher.js",
  "/background/evaluator-ai.js",
  "/background/evaluator-weak.js",
  "/background/evaluator-strong.js",
  "/background/metadata-video.js",
  "/background/metadata-live.js",
  "/background/time-rules.js",
  "/background/settings.js",
  "/background/message-handler.js"
);

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings().catch(e => console.error("[StudyGuard] 初始化失败", e));
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaultSettings().catch(e => console.error("[StudyGuard] 启动初始化失败", e));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.studyGuardSettings) {
    checkCache.clear();
    inFlightChecks.clear();
  }
});
