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

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  try {
    await ensureDefaultSettings();
  } catch (e) {
    console.error("[StudyGuard] 初始化失败", e);
  }

  if (reason === "install") {
    // 双保险：开发期反复「重新加载扩展」也会触发 install，光看 reason 会疯狂开标签页。
    // 用 storage.local 而不是 sync——换台电脑仍然应该重新引导一次。
    const { welcomeShownAt } = await chrome.storage.local.get("welcomeShownAt");
    if (!welcomeShownAt) {
      await chrome.storage.local.set({ welcomeShownAt: Date.now() });
      chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
    }
    return;
  }

  if (reason === "update") {
    // 老用户零打扰：只加个角标，不抢标签页。popup 打开时清除。
    chrome.action.setBadgeText({ text: "NEW" });
    chrome.action.setBadgeBackgroundColor({ color: "#d13438" });
  }
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
