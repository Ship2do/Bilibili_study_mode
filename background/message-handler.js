const CHECK_CACHE_TTL_MS = 30 * 60 * 1000;
// 失败（断网、B站限流）只做极短的负缓存：既不至于每次扫描都重打接口，
// 也不会让一次网络抖动把视频误拦满 30 分钟。
const FAILED_CACHE_TTL_MS = 30 * 1000;
const checkCache = new Map();
const inFlightChecks = new Map();

function normalizeContext(context) {
  return context === "card" ? "card" : "page";
}

function videoKeyFromId(videoId) {
  if (!videoId || typeof videoId !== "object") return "";
  if (videoId.key) return String(videoId.key);
  if (videoId.bvid) return `bvid:${videoId.bvid}`;
  if (videoId.aid) return `aid:${videoId.aid}`;
  if (videoId.rid) return `room:${videoId.rid}`;
  return "";
}

function settingsFingerprint(settings, context) {
  return JSON.stringify([
    context, settings.mode, settings.actionBlockVideo, settings.actionHideCover,
    settings.allowKeywords, settings.blockKeywords, settings.aiPreFilterBlockKeywords,
    settings.aiApiUrl, settings.aiModel, settings.aiApiKey, settings.aiPrompt,
    settings.aiRequestTimeoutMs, settings.timeStrategyEnabled, settings.timeRules
  ]);
}

function getCachedDecision(cacheKey, fingerprint) {
  const cached = checkCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > cached.ttlMs || cached.fingerprint !== fingerprint) {
    checkCache.delete(cacheKey);
    return null;
  }
  return cached.result;
}

function setCachedDecision(cacheKey, fingerprint, result, ttlMs) {
  checkCache.set(cacheKey, {
    fingerprint,
    timestamp: Date.now(),
    ttlMs: Number.isFinite(ttlMs) ? ttlMs : CHECK_CACHE_TTL_MS,
    result
  });
}

function enrichDecision(decision, metadata) {
  const matchedAllowKeywords = Array.isArray(decision.matchedAllowKeywords) ? decision.matchedAllowKeywords : [];
  const matchedBlockKeywords = Array.isArray(decision.matchedBlockKeywords) ? decision.matchedBlockKeywords : [];
  const ai = decision.ai && typeof decision.ai === "object" ? decision.ai : createDefaultAiResult();
  return {
    allowed: decision.allowed === true,
    hideCard: decision.hideCard === true,
    reason: String(decision.reason || ""),
    blockedBy: String(decision.blockedBy || ""),
    mode: String(decision.mode || ""),
    matchedAllowKeywords,
    matchedBlockKeywords,
    matchedKeywords: matchedBlockKeywords.length > 0 ? matchedBlockKeywords : matchedAllowKeywords,
    ai,
    metadata,
    timeRule: decision.timeRule || null
  };
}

function failedDecision(message) {
  return {
    allowed: false, hideCard: false, reason: message,
    blockedBy: "error", mode: "",
    matchedAllowKeywords: [], matchedBlockKeywords: [],
    ai: createDefaultAiResult(),
    metadata: { title: "", tname: "", tags: [] }
  };
}

function applyActions(modeDecision, settings, context) {
  const normalizedContext = normalizeContext(context);
  if (!modeDecision.shouldBlock) {
    return {
      allowed: true, hideCard: false, reason: modeDecision.reason,
      blockedBy: "", mode: modeDecision.mode,
      matchedAllowKeywords: modeDecision.matchedAllowKeywords,
      matchedBlockKeywords: modeDecision.matchedBlockKeywords,
      ai: modeDecision.ai
    };
  }
  const hideCard = normalizedContext === "card" && settings.actionHideCover;
  const blockPage = normalizedContext === "page" && settings.actionBlockVideo;
  if (!blockPage && normalizedContext === "page") {
    return {
      allowed: true, hideCard: false, reason: modeDecision.reason,
      blockedBy: modeDecision.blockedBy, mode: modeDecision.mode,
      matchedAllowKeywords: modeDecision.matchedAllowKeywords,
      matchedBlockKeywords: modeDecision.matchedBlockKeywords,
      ai: modeDecision.ai
    };
  }
  return {
    allowed: !blockPage, hideCard, reason: modeDecision.reason,
    blockedBy: modeDecision.blockedBy, mode: modeDecision.mode,
    matchedAllowKeywords: modeDecision.matchedAllowKeywords,
    matchedBlockKeywords: modeDecision.matchedBlockKeywords,
    ai: modeDecision.ai
  };
}

async function evaluateByMode(metadata, settings) {
  const mode = normalizeDecisionMode(settings.mode);
  if (mode === "weak") return evaluateWeakMode(metadata, settings);
  if (mode === "ai") return evaluateAiMode(metadata, settings);
  return evaluateStrongMode(metadata, settings);
}

async function checkVideoWithSettings(videoId, settings, context) {
  const normalizedContext = normalizeContext(context);
  const videoKey = videoKeyFromId(videoId);
  if (!videoKey) return failedDecision("未识别到视频ID");

  const activeTimeRule = getActiveTimeRule(settings, new Date());
  const effectiveSettings = applyRuleToSettings(settings, activeTimeRule);

  if (activeTimeRule && activeTimeRule.mode === "block_all") {
    return enrichDecision(buildBlockAllDecision(activeTimeRule, normalizedContext), { title: "", tname: "", tags: [] });
  }

  const timeToken = activeTimeRule ? `${activeTimeRule.id || ""}:${activeTimeRule.mode || ""}` : "no_time_rule";
  const fingerprint = `${settingsFingerprint(effectiveSettings, normalizedContext)}::${timeToken}`;
  const cacheKey = `${normalizedContext}::${videoKey}`;
  const cached = getCachedDecision(cacheKey, fingerprint);
  if (cached) return cached;

  const inFlightKey = `${fingerprint}::${cacheKey}`;
  if (inFlightChecks.has(inFlightKey)) return inFlightChecks.get(inFlightKey);

  const task = (async () => {
    try {
      const metadata = videoId.type === "live"
        ? await fetchLiveRoomMetadata(videoId.rid)
        : await fetchVideoMetadata(videoId);
      const modeDecision = await evaluateByMode(metadata, effectiveSettings);
      const finalDecision = applyActions(modeDecision, effectiveSettings, normalizedContext);
      finalDecision.timeRule = activeTimeRule || null;
      const enriched = enrichDecision(finalDecision, metadata);
      setCachedDecision(cacheKey, fingerprint, enriched);
      return enriched;
    } catch (error) {
      const failed = failedDecision(`视频校验失败：${error.message}`);
      setCachedDecision(cacheKey, fingerprint, failed, FAILED_CACHE_TTL_MS);
      return failed;
    }
  })().finally(() => { inFlightChecks.delete(inFlightKey); });

  inFlightChecks.set(inFlightKey, task);
  return task;
}

async function checkVideo(videoId, context) {
  return checkVideoWithSettings(videoId, await getSettings(), context);
}

async function batchCheckVideos(videoIds, context) {
  const list = Array.isArray(videoIds) ? videoIds : [];
  const settings = await getSettings();
  const normalizedContext = normalizeContext(context);
  const pairs = await Promise.all(
    list.map(async (videoId) => [
      videoKeyFromId(videoId),
      await checkVideoWithSettings(videoId, settings, normalizedContext)
    ])
  );
  const results = {};
  for (const [key, result] of pairs) {
    if (key) results[key] = result;
  }
  return results;
}

// 引导页的「实地试跑」：拿给定的元数据和一份还没保存的设置跑一遍判定，
// 不碰网络、不写存储。复用真正的 evaluateByMode，避免引导页自己复刻一套判定逻辑。
async function previewDecision(metadata, partialSettings) {
  const current = await getSettings();
  const settings = normalizeSettings({ ...current, ...(partialSettings && typeof partialSettings === "object" ? partialSettings : {}) });

  // AI 模式要真实调接口，不适合试跑；调用方应该只在 weak/strong 下用这个接口
  if (normalizeDecisionMode(settings.mode) === "ai") {
    return { supported: false, shouldBlock: true, reason: "AI模式需要真实调用接口，无法离线试跑", mode: "ai" };
  }

  const meta = {
    title: "", tname: "", desc: "", ownerName: "", ownerMid: "", ownerSign: "", tags: [],
    ...(metadata && typeof metadata === "object" ? metadata : {})
  };
  const decision = await evaluateByMode(meta, settings);
  return {
    supported: true,
    shouldBlock: decision.shouldBlock === true,
    reason: decision.reason,
    mode: decision.mode,
    matchedAllowKeywords: decision.matchedAllowKeywords,
    matchedBlockKeywords: decision.matchedBlockKeywords
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "CHECK_VIDEO") {
    checkVideo(message.videoId, message.context)
      .then(sendResponse)
      .catch(error => sendResponse(failedDecision(`未知错误：${error.message}`)));
    return true;
  }

  if (message.type === "BATCH_CHECK_VIDEOS") {
    batchCheckVideos(message.videoIds, message.context)
      .then(results => sendResponse({ ok: true, results }))
      .catch(error => sendResponse({ ok: false, error: error.message, results: {} }));
    return true;
  }

  if (message.type === "PREVIEW_DECISION") {
    previewDecision(message.metadata, message.settings)
      .then(decision => sendResponse({ ok: true, decision }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    getSettings().then(s => sendResponse({ ok: true, settings: toPublicSettings(s) }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message.type === "SET_SETTINGS") {
    setSettings(message.settings || {}, message.auth || {})
      .then(s => sendResponse({ ok: true, settings: toPublicSettings(s) }))
      .catch(e => sendResponse({ ok: false, error: e.message, code: e.code || "SETTINGS_ERROR" }));
    return true;
  }

  if (message.type === "RESET_SETTINGS") {
    resetSettings(message.auth || {})
      .then(s => sendResponse({ ok: true, settings: toPublicSettings(s) }))
      .catch(e => sendResponse({ ok: false, error: e.message, code: e.code || "RESET_ERROR" }));
    return true;
  }

  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
