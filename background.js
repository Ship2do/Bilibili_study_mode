const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  fallbackToMeta: true,
  allowKeywords: [
    "学习",
    "知识",
    "科普",
    "课程",
    "公开课",
    "教育",
    "数学",
    "英语",
    "编程",
    "科学",
    "考研",
    "四六级"
  ],
  blockKeywords: [
    "游戏",
    "手游",
    "电竞",
    "娱乐",
    "搞笑",
    "鬼畜",
    "整活",
    "抽卡",
    "直播",
    "明星",
    "综艺",
    "追番",
    "番剧",
    "二次元",
    "舞蹈",
    "音乐",
    "vlog"
  ],
  hideBlockedCovers: false,
  aiEnabled: false,
  aiOnlyWhenNoTag: true,
  aiBlockEnabled: true,
  aiHideEnabled: false,
  aiApiUrl: "",
  aiApiKey: "",
  aiModel: "",
  aiRequestTimeoutMs: 12000,
  autoNotInterestedEnabled: false,
  timeStrategyEnabled: false,
  timeRules: [],
  focusLockEnabled: false,
  focusLockPasswordHash: ""
});

const CHECK_CACHE_TTL_MS = 30 * 60 * 1000;
const checkCache = new Map();
const inFlightChecks = new Map();

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(num)));
}

function normalizeTimeText(value, fallback) {
  const text = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(text)) {
    const [hourText, minuteText] = text.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }
  return fallback;
}

function normalizeWeekDays(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const days = list
    .map((item) => Number(item))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMode(mode) {
  const value = String(mode || "").trim().toLowerCase();
  if (value === "strict") {
    return "strict";
  }
  if (value === "block_all") {
    return "block_all";
  }
  if (value === "custom") {
    return "custom";
  }
  return "normal";
}

function normalizeTimeRules(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const normalized = [];

  for (const item of list) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const days = normalizeWeekDays(item.days);
    if (days.length === 0) {
      continue;
    }
    const rule = {
      id: String(item.id || randomId("rule")),
      name: String(item.name || "").trim() || "未命名时段",
      enabled: item.enabled !== false,
      days,
      start: normalizeTimeText(item.start, "00:00"),
      end: normalizeTimeText(item.end, "23:59"),
      mode: normalizeMode(item.mode),
      overrides: {
        enabled: item.overrides?.enabled !== false,
        hideBlockedCovers: item.overrides?.hideBlockedCovers === true,
        fallbackToMeta: item.overrides?.fallbackToMeta !== false,
        aiBlockEnabled: item.overrides?.aiBlockEnabled !== false,
        aiHideEnabled: item.overrides?.aiHideEnabled === true
      }
    };
    normalized.push(rule);
  }

  return normalized;
}

function normalizeKeywords(raw) {
  const values = Array.isArray(raw) ? raw : [];
  const clean = values
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(clean));
}

function normalizeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const legacyKeywords = normalizeKeywords(source.keywords);

  const allowKeywords = normalizeKeywords(source.allowKeywords).length
    ? normalizeKeywords(source.allowKeywords)
    : legacyKeywords.length
      ? legacyKeywords
      : [...DEFAULT_SETTINGS.allowKeywords];

  const blockKeywords = normalizeKeywords(source.blockKeywords).length
    ? normalizeKeywords(source.blockKeywords)
    : [...DEFAULT_SETTINGS.blockKeywords];

  return {
    enabled: source.enabled !== false,
    fallbackToMeta: source.fallbackToMeta !== false,
    allowKeywords,
    blockKeywords,
    hideBlockedCovers: source.hideBlockedCovers === true,
    aiEnabled: source.aiEnabled === true,
    aiOnlyWhenNoTag: source.aiOnlyWhenNoTag !== false,
    aiBlockEnabled: source.aiBlockEnabled !== false,
    aiHideEnabled: source.aiHideEnabled === true,
    aiApiUrl: String(source.aiApiUrl || "").trim(),
    aiApiKey: String(source.aiApiKey || "").trim(),
    aiModel: String(source.aiModel || "").trim(),
    aiRequestTimeoutMs: clampNumber(source.aiRequestTimeoutMs, 3000, 30000, 12000),
    autoNotInterestedEnabled: source.autoNotInterestedEnabled === true,
    timeStrategyEnabled: source.timeStrategyEnabled === true,
    timeRules: normalizeTimeRules(source.timeRules),
    focusLockEnabled: source.focusLockEnabled === true,
    focusLockPasswordHash: String(source.focusLockPasswordHash || "").trim()
  };
}

function cloneDefaultSettings() {
  return {
    enabled: DEFAULT_SETTINGS.enabled,
    fallbackToMeta: DEFAULT_SETTINGS.fallbackToMeta,
    allowKeywords: [...DEFAULT_SETTINGS.allowKeywords],
    blockKeywords: [...DEFAULT_SETTINGS.blockKeywords],
    hideBlockedCovers: DEFAULT_SETTINGS.hideBlockedCovers,
    aiEnabled: DEFAULT_SETTINGS.aiEnabled,
    aiOnlyWhenNoTag: DEFAULT_SETTINGS.aiOnlyWhenNoTag,
    aiBlockEnabled: DEFAULT_SETTINGS.aiBlockEnabled,
    aiHideEnabled: DEFAULT_SETTINGS.aiHideEnabled,
    aiApiUrl: DEFAULT_SETTINGS.aiApiUrl,
    aiApiKey: DEFAULT_SETTINGS.aiApiKey,
    aiModel: DEFAULT_SETTINGS.aiModel,
    aiRequestTimeoutMs: DEFAULT_SETTINGS.aiRequestTimeoutMs,
    autoNotInterestedEnabled: DEFAULT_SETTINGS.autoNotInterestedEnabled,
    timeStrategyEnabled: DEFAULT_SETTINGS.timeStrategyEnabled,
    timeRules: [...DEFAULT_SETTINGS.timeRules],
    focusLockEnabled: DEFAULT_SETTINGS.focusLockEnabled,
    focusLockPasswordHash: DEFAULT_SETTINGS.focusLockPasswordHash
  };
}

function clearDecisionCache() {
  checkCache.clear();
  inFlightChecks.clear();
}

function toMinuteOfDay(timeText) {
  const [hourText, minuteText] = String(timeText || "00:00").split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return hour * 60 + minute;
}

function timeRuleModeWeight(mode) {
  if (mode === "block_all") {
    return 4;
  }
  if (mode === "strict") {
    return 3;
  }
  if (mode === "custom") {
    return 2;
  }
  return 1;
}

function timeRuleDurationMinutes(rule) {
  const start = toMinuteOfDay(rule.start);
  const end = toMinuteOfDay(rule.end);
  if (start === end) {
    return 24 * 60;
  }
  if (end > start) {
    return end - start;
  }
  return 24 * 60 - start + end;
}

function timeRulesStrictnessScore(settings) {
  if (!settings.timeStrategyEnabled) {
    return 0;
  }
  const rules = Array.isArray(settings.timeRules) ? settings.timeRules : [];
  let score = 0;
  for (const rule of rules) {
    if (!rule || rule.enabled === false) {
      continue;
    }
    const dayCount = Array.isArray(rule.days) ? rule.days.length : 0;
    if (dayCount === 0) {
      continue;
    }
    const duration = timeRuleDurationMinutes(rule);
    const weight = timeRuleModeWeight(rule.mode);
    score += dayCount * duration * weight;
  }
  return score;
}

function includesAllKeywords(needles, haystack) {
  const set = new Set((Array.isArray(haystack) ? haystack : []).map((item) => String(item)));
  const list = Array.isArray(needles) ? needles : [];
  return list.every((item) => set.has(String(item)));
}

function isLessStrict(current, next) {
  if (current.enabled && !next.enabled) {
    return true;
  }
  if (current.hideBlockedCovers && !next.hideBlockedCovers) {
    return true;
  }
  if (current.autoNotInterestedEnabled && !next.autoNotInterestedEnabled) {
    return true;
  }

  if (current.aiEnabled && !next.aiEnabled) {
    return true;
  }
  if (current.aiEnabled && current.aiBlockEnabled && !next.aiBlockEnabled) {
    return true;
  }
  if (current.aiEnabled && current.aiHideEnabled && !next.aiHideEnabled) {
    return true;
  }
  if (current.aiEnabled && !current.aiOnlyWhenNoTag && next.aiOnlyWhenNoTag) {
    return true;
  }

  if (!current.fallbackToMeta && next.fallbackToMeta) {
    return true;
  }

  if (current.blockKeywords.length > next.blockKeywords.length) {
    return true;
  }
  if (!includesAllKeywords(current.blockKeywords, next.blockKeywords)) {
    return true;
  }
  if (!includesAllKeywords(next.allowKeywords, current.allowKeywords)) {
    return true;
  }

  if (current.timeStrategyEnabled && !next.timeStrategyEnabled) {
    return true;
  }
  if (timeRulesStrictnessScore(next) < timeRulesStrictnessScore(current)) {
    return true;
  }

  if (current.focusLockEnabled && !next.focusLockEnabled) {
    return true;
  }

  return false;
}

function createFocusError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(hash, inputPassword) {
  if (!hash) {
    return false;
  }
  if (!inputPassword) {
    return false;
  }
  const inputHash = await sha256Hex(String(inputPassword));
  return inputHash === String(hash);
}

async function getSettings() {
  const stored = await chrome.storage.sync.get("studyGuardSettings");
  return normalizeSettings(stored.studyGuardSettings);
}

async function setSettings(partial, auth) {
  const current = await getSettings();
  const authInfo = auth && typeof auth === "object" ? auth : {};
  const merged = { ...current, ...(partial && typeof partial === "object" ? partial : {}) };
  const next = normalizeSettings(merged);

  const newPassword = String(authInfo.newPassword || "").trim();
  const unlockPassword = String(authInfo.unlockPassword || "").trim();

  const changingPassword = newPassword.length > 0;
  if (changingPassword) {
    next.focusLockPasswordHash = await sha256Hex(newPassword);
  } else {
    next.focusLockPasswordHash = String(current.focusLockPasswordHash || "");
  }

  if (next.focusLockEnabled && !next.focusLockPasswordHash) {
    throw createFocusError("PASSWORD_SETUP_REQUIRED", "开启专注密码锁前，请先设置密码");
  }

  const lessStrict = isLessStrict(current, next);
  const needUnlock =
    current.focusLockEnabled && (lessStrict || changingPassword || (current.focusLockPasswordHash && !next.focusLockPasswordHash));

  if (needUnlock) {
    const passed = await verifyPassword(current.focusLockPasswordHash, unlockPassword);
    if (!passed) {
      throw createFocusError("PASSWORD_REQUIRED", "此操作会降低专注度或修改安全设置，请输入密码");
    }
  }

  await chrome.storage.sync.set({ studyGuardSettings: next });
  clearDecisionCache();
  return next;
}

async function resetSettings(auth) {
  const current = await getSettings();
  if (current.focusLockEnabled) {
    const authInfo = auth && typeof auth === "object" ? auth : {};
    const unlockPassword = String(authInfo.unlockPassword || "").trim();
    const passed = await verifyPassword(current.focusLockPasswordHash, unlockPassword);
    if (!passed) {
      throw createFocusError("PASSWORD_REQUIRED", "重置会降低专注度，请输入密码");
    }
  }
  const defaults = cloneDefaultSettings();
  await chrome.storage.sync.set({ studyGuardSettings: defaults });
  clearDecisionCache();
  return defaults;
}

async function ensureDefaultSettings() {
  const stored = await chrome.storage.sync.get("studyGuardSettings");
  if (!stored.studyGuardSettings) {
    await chrome.storage.sync.set({ studyGuardSettings: cloneDefaultSettings() });
    clearDecisionCache();
    return;
  }
  const normalized = normalizeSettings(stored.studyGuardSettings);
  await chrome.storage.sync.set({ studyGuardSettings: normalized });
}

function toPublicSettings(settings) {
  const source = normalizeSettings(settings);
  const result = { ...source };
  delete result.focusLockPasswordHash;
  result.focusLockHasPassword = !!source.focusLockPasswordHash;
  return result;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function findMatches(texts, keywords) {
  const textList = (Array.isArray(texts) ? texts : [])
    .map(normalizeText)
    .filter(Boolean);
  const keywordList = normalizeKeywords(keywords);
  const matched = new Set();

  for (const keyword of keywordList) {
    const needle = normalizeText(keyword);
    if (!needle) {
      continue;
    }
    const hit = textList.some((text) => text.includes(needle));
    if (hit) {
      matched.add(keyword);
    }
  }

  return Array.from(matched);
}

function settingsFingerprint(settings, context) {
  return JSON.stringify([
    context,
    settings.enabled,
    settings.fallbackToMeta,
    settings.allowKeywords,
    settings.blockKeywords,
    settings.hideBlockedCovers,
    settings.aiEnabled,
    settings.aiOnlyWhenNoTag,
    settings.aiBlockEnabled,
    settings.aiHideEnabled,
    settings.aiApiUrl,
    settings.aiModel,
    settings.aiApiKey,
    settings.aiRequestTimeoutMs,
    settings.timeStrategyEnabled,
    settings.timeRules
  ]);
}

function normalizeContext(context) {
  return context === "card" ? "card" : "page";
}

function videoKeyFromId(videoId) {
  if (!videoId || typeof videoId !== "object") {
    return "";
  }
  if (videoId.key) {
    return String(videoId.key);
  }
  if (videoId.bvid) {
    return `bvid:${videoId.bvid}`;
  }
  if (videoId.aid) {
    return `aid:${videoId.aid}`;
  }
  return "";
}

function getCachedDecision(cacheKey, fingerprint) {
  const cached = checkCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  const expired = Date.now() - cached.timestamp > CHECK_CACHE_TTL_MS;
  if (expired || cached.fingerprint !== fingerprint) {
    checkCache.delete(cacheKey);
    return null;
  }
  return cached.result;
}

function setCachedDecision(cacheKey, fingerprint, result) {
  checkCache.set(cacheKey, {
    fingerprint,
    timestamp: Date.now(),
    result
  });
}

function enrichDecision(decision, metadata) {
  const matchedAllowKeywords = Array.isArray(decision.matchedAllowKeywords)
    ? decision.matchedAllowKeywords
    : [];
  const matchedBlockKeywords = Array.isArray(decision.matchedBlockKeywords)
    ? decision.matchedBlockKeywords
    : [];
  const ai =
    decision.ai && typeof decision.ai === "object"
      ? decision.ai
      : { used: false, isEntertainment: false, reason: "", confidence: null, error: "" };

  return {
    allowed: decision.allowed === true,
    hideCard: decision.hideCard === true,
    reason: String(decision.reason || ""),
    blockedBy: String(decision.blockedBy || ""),
    matchedAllowKeywords,
    matchedBlockKeywords,
    matchedKeywords: decision.allowed === true ? matchedAllowKeywords : matchedBlockKeywords,
    ai,
    metadata,
    timeRule: decision.timeRule || null
  };
}

function hasAiConfig(settings) {
  return !!(
    settings.aiEnabled &&
    settings.aiApiUrl &&
    settings.aiApiKey &&
    settings.aiModel
  );
}

function isRuleActiveAt(rule, date) {
  if (!rule || rule.enabled === false) {
    return false;
  }
  const days = Array.isArray(rule.days) ? rule.days : [];
  if (days.length === 0) {
    return false;
  }

  const nowDay = date.getDay();
  const nowMinute = date.getHours() * 60 + date.getMinutes();
  const start = toMinuteOfDay(rule.start);
  const end = toMinuteOfDay(rule.end);

  if (start === end) {
    return days.includes(nowDay);
  }

  if (end > start) {
    return days.includes(nowDay) && nowMinute >= start && nowMinute < end;
  }

  if (days.includes(nowDay) && nowMinute >= start) {
    return true;
  }
  const previousDay = (nowDay + 6) % 7;
  if (days.includes(previousDay) && nowMinute < end) {
    return true;
  }
  return false;
}

function getActiveTimeRule(settings, nowDate) {
  if (!settings.timeStrategyEnabled) {
    return null;
  }
  const rules = Array.isArray(settings.timeRules) ? settings.timeRules : [];
  const now = nowDate instanceof Date ? nowDate : new Date();
  let selected = null;
  let selectedIndex = -1;
  let selectedWeight = -1;

  rules.forEach((rule, index) => {
    if (!isRuleActiveAt(rule, now)) {
      return;
    }
    const weight = timeRuleModeWeight(rule.mode);
    if (weight > selectedWeight) {
      selected = rule;
      selectedIndex = index;
      selectedWeight = weight;
      return;
    }
    if (weight === selectedWeight && selectedIndex >= 0 && index < selectedIndex) {
      selected = rule;
      selectedIndex = index;
      selectedWeight = weight;
    }
  });

  return selected;
}

function buildBlockAllDecision(rule, context) {
  const ruleName = rule && rule.name ? rule.name : "时段策略";
  const suffix = context === "card" ? "（封面已隐藏）" : "";
  return {
    allowed: false,
    hideCard: context === "card",
    reason: `当前时段“${ruleName}”禁止访问${suffix}`,
    blockedBy: "time_block_all",
    matchedAllowKeywords: [],
    matchedBlockKeywords: [],
    ai: { used: false, isEntertainment: false, reason: "", confidence: null, error: "" },
    timeRule: rule || null
  };
}

function applyRuleToSettings(settings, rule) {
  if (!rule || (rule.mode !== "strict" && rule.mode !== "custom")) {
    return settings;
  }

  if (rule.mode === "custom") {
    const overrides = rule.overrides || {};
    return {
      ...settings,
      enabled: typeof overrides.enabled === "boolean" ? overrides.enabled : settings.enabled,
      hideBlockedCovers: typeof overrides.hideBlockedCovers === "boolean" ? overrides.hideBlockedCovers : settings.hideBlockedCovers,
      fallbackToMeta: typeof overrides.fallbackToMeta === "boolean" ? overrides.fallbackToMeta : settings.fallbackToMeta,
      aiBlockEnabled: typeof overrides.aiBlockEnabled === "boolean" ? overrides.aiBlockEnabled : settings.aiBlockEnabled,
      aiHideEnabled: typeof overrides.aiHideEnabled === "boolean" ? overrides.aiHideEnabled : settings.aiHideEnabled
    };
  }

  const next = {
    ...settings,
    hideBlockedCovers: true,
    fallbackToMeta: false
  };

  if (hasAiConfig(settings)) {
    next.aiEnabled = true;
    next.aiBlockEnabled = true;
    next.aiHideEnabled = true;
    next.aiOnlyWhenNoTag = false;
  }

  return next;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function buildVideoQuery(videoId) {
  if (videoId && videoId.bvid) {
    return `bvid=${encodeURIComponent(videoId.bvid)}`;
  }
  if (videoId && videoId.aid) {
    return `aid=${encodeURIComponent(videoId.aid)}`;
  }
  throw new Error("未识别到视频ID");
}

async function fetchVideoMetadata(videoId) {
  const query = buildVideoQuery(videoId);
  const viewUrl = `https://api.bilibili.com/x/web-interface/view?${query}`;
  const viewResponse = await fetchJson(viewUrl, {
    credentials: "include"
  });

  if (viewResponse.code !== 0 || !viewResponse.data) {
    throw new Error(`view接口异常: code=${viewResponse.code}`);
  }

  const view = viewResponse.data;
  const metadata = {
    aid: view.aid ? String(view.aid) : "",
    bvid: view.bvid ? String(view.bvid) : "",
    title: view.title ? String(view.title) : "",
    tname: view.tname ? String(view.tname) : "",
    tags: []
  };

  const tagQuery = metadata.bvid
    ? `bvid=${encodeURIComponent(metadata.bvid)}`
    : `aid=${encodeURIComponent(metadata.aid)}`;

  try {
    const tagsUrl = `https://api.bilibili.com/x/tag/archive/tags?${tagQuery}`;
    const tagsResponse = await fetchJson(tagsUrl, {
      credentials: "include"
    });
    if (tagsResponse.code === 0 && Array.isArray(tagsResponse.data)) {
      metadata.tags = tagsResponse.data
        .map((item) => String(item.tag_name || "").trim())
        .filter(Boolean);
    }
  } catch (error) {
    console.warn("[StudyGuard] 标签接口请求失败", error);
  }

  return metadata;
}

function evaluateByKeywords(metadata, settings) {
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const allowFromTag = findMatches(tags, settings.allowKeywords);
  const blockFromTag = findMatches(tags, settings.blockKeywords);

  if (blockFromTag.length > 0) {
    return {
      allowed: false,
      hideCard: settings.hideBlockedCovers,
      reason: `命中屏蔽关键词：${blockFromTag.join("、")}`,
      blockedBy: "block_keyword",
      matchedAllowKeywords: [],
      matchedBlockKeywords: blockFromTag,
      ai: { used: false, isEntertainment: false, reason: "", confidence: null, error: "" }
    };
  }

  if (tags.length > 0) {
    if (allowFromTag.length > 0) {
      return {
        allowed: true,
        hideCard: false,
        reason: `标签命中学习关键词：${allowFromTag.join("、")}`,
        blockedBy: "",
        matchedAllowKeywords: allowFromTag,
        matchedBlockKeywords: [],
        ai: { used: false, isEntertainment: false, reason: "", confidence: null, error: "" }
      };
    }
    return {
      allowed: false,
      hideCard: false,
      reason: "视频标签未命中学习关键词",
      blockedBy: "not_learning",
      matchedAllowKeywords: [],
      matchedBlockKeywords: [],
      ai: { used: false, isEntertainment: false, reason: "", confidence: null, error: "" }
    };
  }

  if (!settings.fallbackToMeta) {
    return {
      allowed: false,
      hideCard: false,
      reason: "未读取到标签，且未开启标题/分区兜底放行",
      blockedBy: "no_tag_no_fallback",
      matchedAllowKeywords: [],
      matchedBlockKeywords: [],
      ai: { used: false, isEntertainment: false, reason: "", confidence: null, error: "" }
    };
  }

  const metaTexts = [metadata.tname, metadata.title];
  const blockFromMeta = findMatches(metaTexts, settings.blockKeywords);
  if (blockFromMeta.length > 0) {
    return {
      allowed: false,
      hideCard: settings.hideBlockedCovers,
      reason: `标题/分区命中屏蔽关键词：${blockFromMeta.join("、")}`,
      blockedBy: "block_keyword",
      matchedAllowKeywords: [],
      matchedBlockKeywords: blockFromMeta,
      ai: { used: false, isEntertainment: false, reason: "", confidence: null, error: "" }
    };
  }

  const allowFromMeta = findMatches(metaTexts, settings.allowKeywords);
  if (allowFromMeta.length > 0) {
    return {
      allowed: true,
      hideCard: false,
      reason: `未读取到标签，但标题/分区命中学习关键词：${allowFromMeta.join("、")}`,
      blockedBy: "",
      matchedAllowKeywords: allowFromMeta,
      matchedBlockKeywords: [],
      ai: { used: false, isEntertainment: false, reason: "", confidence: null, error: "" }
    };
  }

  return {
    allowed: false,
    hideCard: false,
    reason: "未读取到有效标签，且标题/分区未命中学习关键词",
    blockedBy: "not_learning",
    matchedAllowKeywords: [],
    matchedBlockKeywords: [],
    ai: { used: false, isEntertainment: false, reason: "", confidence: null, error: "" }
  };
}

function shouldRunAi(metadata, settings, context, keywordDecision) {
  if (!hasAiConfig(settings)) {
    return false;
  }
  if (settings.aiOnlyWhenNoTag) {
    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    if (tags.length > 0) {
      return false;
    }
  }
  if (Array.isArray(keywordDecision.matchedBlockKeywords) && keywordDecision.matchedBlockKeywords.length > 0) {
    return false;
  }

  if (context === "card") {
    if (!settings.hideBlockedCovers || !settings.aiHideEnabled) {
      return false;
    }
    if (keywordDecision.hideCard) {
      return false;
    }
    return true;
  }

  if (!settings.aiBlockEnabled) {
    return false;
  }
  if (!keywordDecision.allowed) {
    return false;
  }
  return true;
}

function stripCodeFence(text) {
  const source = String(text || "").trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : source;
}

function extractTextFromAiResponse(data) {
  if (!data || typeof data !== "object") {
    return "";
  }

  const chatContent = data.choices?.[0]?.message?.content;
  if (typeof chatContent === "string") {
    return chatContent;
  }
  if (Array.isArray(chatContent)) {
    return chatContent
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  if (Array.isArray(data.output)) {
    const segments = [];
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) {
        continue;
      }
      for (const content of item.content) {
        if (content && typeof content.text === "string") {
          segments.push(content.text);
        }
      }
    }
    if (segments.length > 0) {
      return segments.join("\n").trim();
    }
  }

  return "";
}

function parseAiDecisionText(text) {
  const raw = stripCodeFence(text);
  if (!raw) {
    throw new Error("AI返回为空");
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    parsed = null;
  }

  if (parsed && typeof parsed === "object") {
    const keys = ["is_entertainment", "isEntertainment", "entertainment"];
    let value = null;
    for (const key of keys) {
      if (typeof parsed[key] === "boolean") {
        value = parsed[key];
        break;
      }
      if (typeof parsed[key] === "string") {
        const normalized = parsed[key].trim().toLowerCase();
        if (["true", "yes", "1"].includes(normalized)) {
          value = true;
          break;
        }
        if (["false", "no", "0"].includes(normalized)) {
          value = false;
          break;
        }
      }
    }

    if (value === null) {
      throw new Error("AI返回未包含 is_entertainment 字段");
    }

    const confidenceNum = Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceNum) ? confidenceNum : null;
    const reason = String(parsed.reason || parsed.explanation || "").trim();
    return { isEntertainment: value, confidence, reason };
  }

  const lower = raw.toLowerCase();
  if (/is[_\s-]*entertainment[^a-z0-9]*(true|yes|1)/i.test(lower)) {
    return { isEntertainment: true, confidence: null, reason: "" };
  }
  if (/is[_\s-]*entertainment[^a-z0-9]*(false|no|0)/i.test(lower)) {
    return { isEntertainment: false, confidence: null, reason: "" };
  }

  throw new Error("无法解析AI返回结果");
}

async function callAiJudge(metadata, settings) {
  const payload = {
    title: metadata.title || "",
    partition: metadata.tname || "",
    tags: Array.isArray(metadata.tags) ? metadata.tags : []
  };

  const systemPrompt =
    "你是B站视频分类器。请判断视频是否属于娱乐导向（游戏、搞笑、综艺、直播、明星八卦、二次元追番、纯休闲消遣等），而非学习/知识/科普导向。只输出JSON，不要额外文字。JSON格式：{\"is_entertainment\":boolean,\"confidence\":0到1之间数字,\"reason\":\"简短原因\"}";
  const userPrompt = `请判断以下视频是否为娱乐向内容：\n${JSON.stringify(payload, null, 2)}`;

  const body = {
    model: settings.aiModel,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), settings.aiRequestTimeoutMs);

  try {
    const response = await fetch(settings.aiApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.aiApiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`AI接口状态异常: HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = extractTextFromAiResponse(data);
    return parseAiDecisionText(text);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("AI请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function applyAiDecision(keywordDecision, metadata, settings, context) {
  if (!shouldRunAi(metadata, settings, context, keywordDecision)) {
    return keywordDecision;
  }

  try {
    const aiResult = await callAiJudge(metadata, settings);
    const next = {
      ...keywordDecision,
      ai: {
        used: true,
        isEntertainment: aiResult.isEntertainment === true,
        confidence: aiResult.confidence,
        reason: aiResult.reason || "",
        error: ""
      }
    };

    if (aiResult.isEntertainment) {
      if (context === "page" && settings.aiBlockEnabled) {
        next.allowed = false;
        next.blockedBy = "ai_entertainment";
        next.reason = aiResult.reason
          ? `AI判定为娱乐向内容：${aiResult.reason}`
          : "AI判定为娱乐向内容";
      }
      if (context === "card" && settings.hideBlockedCovers && settings.aiHideEnabled) {
        next.hideCard = true;
      }
    }

    return next;
  } catch (error) {
    return {
      ...keywordDecision,
      ai: {
        used: true,
        isEntertainment: false,
        confidence: null,
        reason: "",
        error: String(error.message || error)
      }
    };
  }
}

function failedDecision(message) {
  return {
    allowed: false,
    hideCard: false,
    reason: message,
    blockedBy: "error",
    matchedAllowKeywords: [],
    matchedBlockKeywords: [],
    ai: { used: false, isEntertainment: false, reason: "", confidence: null, error: "" },
    metadata: { title: "", tname: "", tags: [] }
  };
}

async function checkVideoWithSettings(videoId, settings, context) {
  const normalizedContext = normalizeContext(context);
  const videoKey = videoKeyFromId(videoId);
  if (!videoKey) {
    return failedDecision("未识别到视频ID");
  }

  const activeTimeRule = getActiveTimeRule(settings, new Date());
  const effectiveSettings = applyRuleToSettings(settings, activeTimeRule);

  if (activeTimeRule && activeTimeRule.mode === "block_all") {
    return enrichDecision(
      buildBlockAllDecision(activeTimeRule, normalizedContext),
      { title: "", tname: "", tags: [] }
    );
  }

  if (!settings.enabled) {
    return {
      allowed: true,
      hideCard: false,
      reason: "扩展开关已关闭",
      blockedBy: "",
      matchedAllowKeywords: [],
      matchedBlockKeywords: [],
      matchedKeywords: [],
      ai: { used: false, isEntertainment: false, reason: "", confidence: null, error: "" },
      metadata: { title: "", tname: "", tags: [] }
    };
  }

  const timeToken = activeTimeRule
    ? `${activeTimeRule.id || ""}:${activeTimeRule.mode || ""}`
    : "no_time_rule";
  const fingerprint = `${settingsFingerprint(effectiveSettings, normalizedContext)}::${timeToken}`;
  const cacheKey = `${normalizedContext}::${videoKey}`;
  const cached = getCachedDecision(cacheKey, fingerprint);
  if (cached) {
    return cached;
  }

  const inFlightKey = `${fingerprint}::${cacheKey}`;
  if (inFlightChecks.has(inFlightKey)) {
    return inFlightChecks.get(inFlightKey);
  }

  const task = (async () => {
    try {
      const metadata = await fetchVideoMetadata(videoId);
      const keywordDecision = evaluateByKeywords(metadata, effectiveSettings);
      const finalDecision = await applyAiDecision(
        keywordDecision,
        metadata,
        effectiveSettings,
        normalizedContext
      );
      finalDecision.timeRule = activeTimeRule || null;
      const enriched = enrichDecision(finalDecision, metadata);
      setCachedDecision(cacheKey, fingerprint, enriched);
      return enriched;
    } catch (error) {
      const failed = failedDecision(`视频校验失败：${error.message}`);
      setCachedDecision(cacheKey, fingerprint, failed);
      return failed;
    }
  })().finally(() => {
    inFlightChecks.delete(inFlightKey);
  });

  inFlightChecks.set(inFlightKey, task);
  return task;
}

async function checkVideo(videoId, context) {
  const settings = await getSettings();
  return checkVideoWithSettings(videoId, settings, context);
}

async function batchCheckVideos(videoIds, context) {
  const list = Array.isArray(videoIds) ? videoIds : [];
  const settings = await getSettings();
  const normalizedContext = normalizeContext(context);

  const pairs = await Promise.all(
    list.map(async (videoId) => {
      const key = videoKeyFromId(videoId);
      const result = await checkVideoWithSettings(videoId, settings, normalizedContext);
      return [key, result];
    })
  );

  const results = {};
  for (const [key, result] of pairs) {
    if (key) {
      results[key] = result;
    }
  }
  return results;
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings().catch((error) => {
    console.error("[StudyGuard] 初始化失败", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaultSettings().catch((error) => {
    console.error("[StudyGuard] 启动初始化失败", error);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.studyGuardSettings) {
    clearDecisionCache();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (message.type === "CHECK_VIDEO") {
    checkVideo(message.videoId, message.context)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse(failedDecision(`未知错误：${error.message}`));
      });
    return true;
  }

  if (message.type === "BATCH_CHECK_VIDEOS") {
    batchCheckVideos(message.videoIds, message.context)
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: error.message, results: {} }));
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings: toPublicSettings(settings) }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "SET_SETTINGS") {
    setSettings(message.settings || {}, message.auth || {})
      .then((settings) => sendResponse({ ok: true, settings: toPublicSettings(settings) }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error.message,
          code: error.code || "SETTINGS_ERROR"
        })
      );
    return true;
  }

  if (message.type === "RESET_SETTINGS") {
    resetSettings(message.auth || {})
      .then((settings) => sendResponse({ ok: true, settings: toPublicSettings(settings) }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error.message,
          code: error.code || "RESET_ERROR"
        })
      );
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
