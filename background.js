const DEFAULT_AI_PROMPT_TEMPLATE = [
  "请判断这个B站视频是否属于学习向内容。",
  "请严格只输出JSON，不要输出任何额外文字。",
  "JSON格式：{\"is_learning\":true/false,\"confidence\":0到1数字,\"reason\":\"简短原因\"}",
  "",
  "标题: {{title}}",
  "分区: {{partition}}",
  "标签: {{tags}}",
  "UP主: {{owner_name}}",
  "UP主ID: {{owner_mid}}",
  "UP主签名: {{owner_sign}}",
  "简介: {{description}}",
  "BV号: {{bvid}}",
  "AV号: {{aid}}",
  "完整元数据(JSON): {{metadata_json}}"
].join("\n");

const DEFAULT_SETTINGS = Object.freeze({
  mode: "strong",
  actionBlockVideo: true,
  actionHideCover: false,
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
  aiPreFilterBlockKeywords: true,
  aiApiUrl: "",
  aiApiKey: "",
  aiModel: "",
  aiPrompt: DEFAULT_AI_PROMPT_TEMPLATE,
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

function normalizeDecisionMode(mode) {
  const value = String(mode || "").trim().toLowerCase();
  if (value === "weak") {
    return "weak";
  }
  if (value === "ai") {
    return "ai";
  }
  return "strong";
}

function normalizeTimeRuleMode(mode) {
  const value = String(mode || "").trim().toLowerCase();
  if (value === "block_all") {
    return "block_all";
  }
  return "custom";
}

function normalizeAiPrompt(raw) {
  const text = String(raw || "").trim();
  return text || DEFAULT_AI_PROMPT_TEMPLATE;
}

function normalizeKeywords(raw) {
  const values = Array.isArray(raw) ? raw : [];
  const clean = values
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(clean));
}

function normalizeActionValue(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback === true;
}

function normalizeRuleOverrides(raw, fallbackSettings) {
  const source = raw && typeof raw === "object" ? raw : {};
  const base =
    fallbackSettings && typeof fallbackSettings === "object"
      ? fallbackSettings
      : {
          mode: DEFAULT_SETTINGS.mode,
          actionBlockVideo: DEFAULT_SETTINGS.actionBlockVideo,
          actionHideCover: DEFAULT_SETTINGS.actionHideCover,
          aiPreFilterBlockKeywords: DEFAULT_SETTINGS.aiPreFilterBlockKeywords
        };

  const decisionMode = normalizeDecisionMode(source.decisionMode || source.mode || base.mode);
  const actionBlockVideo = normalizeActionValue(source.actionBlockVideo, base.actionBlockVideo);
  const actionHideCover = normalizeActionValue(source.actionHideCover, base.actionHideCover);
  const aiPreFilterBlockKeywords =
    typeof source.aiPreFilterBlockKeywords === "boolean"
      ? source.aiPreFilterBlockKeywords
      : base.aiPreFilterBlockKeywords !== false;

  return {
    decisionMode,
    actionBlockVideo,
    actionHideCover,
    aiPreFilterBlockKeywords
  };
}

function normalizeTimeRules(raw, fallbackSettings) {
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

    const legacyMode = String(item.mode || "").trim().toLowerCase();
    const mode = normalizeTimeRuleMode(legacyMode);

    const rawOverrides =
      item.overrides && typeof item.overrides === "object" ? { ...item.overrides } : {};

    if (
      typeof rawOverrides.actionBlockVideo !== "boolean" &&
      Object.prototype.hasOwnProperty.call(rawOverrides, "enabled")
    ) {
      rawOverrides.actionBlockVideo = rawOverrides.enabled !== false;
    }
    if (
      typeof rawOverrides.actionHideCover !== "boolean" &&
      Object.prototype.hasOwnProperty.call(rawOverrides, "hideBlockedCovers")
    ) {
      rawOverrides.actionHideCover = rawOverrides.hideBlockedCovers === true;
    }
    if (
      typeof rawOverrides.aiPreFilterBlockKeywords !== "boolean" &&
      Object.prototype.hasOwnProperty.call(rawOverrides, "aiBlockEnabled")
    ) {
      rawOverrides.aiPreFilterBlockKeywords = rawOverrides.aiBlockEnabled !== false;
    }

    let overrideFallback = fallbackSettings;
    if (legacyMode === "strict") {
      overrideFallback = {
        ...fallbackSettings,
        mode: "strong",
        actionBlockVideo: true,
        actionHideCover: true,
        aiPreFilterBlockKeywords: true
      };
      if (typeof rawOverrides.decisionMode !== "string") {
        rawOverrides.decisionMode = "strong";
      }
      if (typeof rawOverrides.actionBlockVideo !== "boolean") {
        rawOverrides.actionBlockVideo = true;
      }
      if (typeof rawOverrides.actionHideCover !== "boolean") {
        rawOverrides.actionHideCover = true;
      }
    }

    const overrides = normalizeRuleOverrides(rawOverrides, overrideFallback);
    if (mode === "custom" && !overrides.actionBlockVideo && !overrides.actionHideCover) {
      continue;
    }

    normalized.push({
      id: String(item.id || randomId("rule")),
      name: String(item.name || "").trim() || "未命名时段",
      enabled: item.enabled !== false,
      days,
      start: normalizeTimeText(item.start, "00:00"),
      end: normalizeTimeText(item.end, "23:59"),
      mode,
      overrides
    });
  }

  return normalized;
}

function ensureAtLeastOneAction(settings) {
  if (settings.actionBlockVideo || settings.actionHideCover) {
    return settings;
  }
  return {
    ...settings,
    actionBlockVideo: true
  };
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

  const mode = normalizeDecisionMode(source.mode || (source.aiEnabled === true ? "ai" : "strong"));

  const actionBlockVideo = normalizeActionValue(source.actionBlockVideo, source.enabled !== false);
  const actionHideCover = normalizeActionValue(
    source.actionHideCover,
    source.hideBlockedCovers === true
  );

  const aiPreFilterBlockKeywords =
    typeof source.aiPreFilterBlockKeywords === "boolean" ? source.aiPreFilterBlockKeywords : true;

  const base = {
    mode,
    actionBlockVideo,
    actionHideCover,
    allowKeywords,
    blockKeywords,
    aiPreFilterBlockKeywords,
    aiApiUrl: String(source.aiApiUrl || "").trim(),
    aiApiKey: String(source.aiApiKey || "").trim(),
    aiModel: String(source.aiModel || "").trim(),
    aiPrompt: normalizeAiPrompt(source.aiPrompt),
    aiRequestTimeoutMs: clampNumber(source.aiRequestTimeoutMs, 3000, 30000, 12000),
    autoNotInterestedEnabled: source.autoNotInterestedEnabled === true,
    timeStrategyEnabled: source.timeStrategyEnabled === true,
    timeRules: [],
    focusLockEnabled: source.focusLockEnabled === true,
    focusLockPasswordHash: String(source.focusLockPasswordHash || "").trim()
  };

  base.timeRules = normalizeTimeRules(source.timeRules, base);
  return ensureAtLeastOneAction(base);
}

function cloneDefaultSettings() {
  return {
    mode: DEFAULT_SETTINGS.mode,
    actionBlockVideo: DEFAULT_SETTINGS.actionBlockVideo,
    actionHideCover: DEFAULT_SETTINGS.actionHideCover,
    allowKeywords: [...DEFAULT_SETTINGS.allowKeywords],
    blockKeywords: [...DEFAULT_SETTINGS.blockKeywords],
    aiPreFilterBlockKeywords: DEFAULT_SETTINGS.aiPreFilterBlockKeywords,
    aiApiUrl: DEFAULT_SETTINGS.aiApiUrl,
    aiApiKey: DEFAULT_SETTINGS.aiApiKey,
    aiModel: DEFAULT_SETTINGS.aiModel,
    aiPrompt: DEFAULT_SETTINGS.aiPrompt,
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

function decisionModeWeight(mode) {
  if (mode === "strong") {
    return 3;
  }
  if (mode === "ai") {
    return 2;
  }
  return 1;
}

function timeRuleModeWeight(mode) {
  if (mode === "block_all") {
    return 99;
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

function ruleStrictnessWeight(rule, baseSettings) {
  if (!rule || rule.mode === "block_all") {
    return 24;
  }

  const fallback =
    baseSettings && typeof baseSettings === "object" ? baseSettings : DEFAULT_SETTINGS;
  const overrides = rule.overrides || {};

  const mode = normalizeDecisionMode(overrides.decisionMode || fallback.mode);
  const actionBlockVideo =
    typeof overrides.actionBlockVideo === "boolean"
      ? overrides.actionBlockVideo
      : fallback.actionBlockVideo;
  const actionHideCover =
    typeof overrides.actionHideCover === "boolean"
      ? overrides.actionHideCover
      : fallback.actionHideCover;
  const aiPreFilterBlockKeywords =
    typeof overrides.aiPreFilterBlockKeywords === "boolean"
      ? overrides.aiPreFilterBlockKeywords
      : fallback.aiPreFilterBlockKeywords;

  let score = decisionModeWeight(mode);
  if (actionBlockVideo) {
    score += 2;
  }
  if (actionHideCover) {
    score += 1;
  }
  if (mode === "ai" && aiPreFilterBlockKeywords) {
    score += 1;
  }
  return score;
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
    const weight = ruleStrictnessWeight(rule, settings);
    score += dayCount * duration * weight;
  }
  return score;
}

function includesAllKeywords(needles, haystack) {
  const set = new Set((Array.isArray(haystack) ? haystack : []).map((item) => String(item)));
  const list = Array.isArray(needles) ? needles : [];
  return list.every((item) => set.has(String(item)));
}

function hasNewKeywords(baseKeywords, nextKeywords) {
  const baseSet = new Set(
    (Array.isArray(baseKeywords) ? baseKeywords : []).map((item) => String(item))
  );
  const nextList = Array.isArray(nextKeywords) ? nextKeywords : [];
  return nextList.some((item) => !baseSet.has(String(item)));
}

function modeChangeLessStrict(current, next) {
  return decisionModeWeight(next.mode) < decisionModeWeight(current.mode);
}

function keywordChangeLessStrict(current, next) {
  if (current.mode === "weak") {
    return !includesAllKeywords(current.blockKeywords, next.blockKeywords);
  }

  if (current.mode === "strong") {
    return hasNewKeywords(current.allowKeywords, next.allowKeywords);
  }

  if (current.mode === "ai") {
    if (current.aiPreFilterBlockKeywords && !next.aiPreFilterBlockKeywords) {
      return true;
    }
    if (current.aiPreFilterBlockKeywords) {
      return !includesAllKeywords(current.blockKeywords, next.blockKeywords);
    }
  }

  return false;
}

function isLessStrict(current, next) {
  if (current.actionBlockVideo && !next.actionBlockVideo) {
    return true;
  }
  if (current.actionHideCover && !next.actionHideCover) {
    return true;
  }
  if (current.autoNotInterestedEnabled && !next.autoNotInterestedEnabled) {
    return true;
  }

  if (modeChangeLessStrict(current, next)) {
    return true;
  }
  if (keywordChangeLessStrict(current, next)) {
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

function validateActions(settings) {
  if (!settings.actionBlockVideo && !settings.actionHideCover) {
    throw createFocusError("ACTIONS_REQUIRED", "请至少开启一个动作：拦截视频或隐藏封面");
  }
}

function validateTimeRules(rules) {
  const list = Array.isArray(rules) ? rules : [];
  for (const rule of list) {
    if (!rule || rule.mode !== "custom") {
      continue;
    }
    const overrides = rule.overrides || {};
    if (!overrides.actionBlockVideo && !overrides.actionHideCover) {
      throw createFocusError(
        "RULE_ACTIONS_REQUIRED",
        `时段规则“${rule.name || "未命名时段"}”至少开启一个动作`
      );
    }
  }
}

async function setSettings(partial, auth) {
  const current = await getSettings();
  const authInfo = auth && typeof auth === "object" ? auth : {};
  const nextSource = {
    ...current,
    ...(partial && typeof partial === "object" ? partial : {})
  };

  if (nextSource.actionBlockVideo === false && nextSource.actionHideCover === false) {
    throw createFocusError("ACTIONS_REQUIRED", "请至少开启一个动作：拦截视频或隐藏封面");
  }

  const next = normalizeSettings(nextSource);
  validateActions(next);
  validateTimeRules(next.timeRules);

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
    current.focusLockEnabled &&
    (lessStrict ||
      changingPassword ||
      (current.focusLockPasswordHash && !next.focusLockPasswordHash));

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
  validateActions(normalized);
  validateTimeRules(normalized.timeRules);
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
    settings.mode,
    settings.actionBlockVideo,
    settings.actionHideCover,
    settings.allowKeywords,
    settings.blockKeywords,
    settings.aiPreFilterBlockKeywords,
    settings.aiApiUrl,
    settings.aiModel,
    settings.aiApiKey,
    settings.aiPrompt,
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

function createDefaultAiResult() {
  return { used: false, isLearning: false, confidence: null, reason: "", error: "" };
}

function enrichDecision(decision, metadata) {
  const matchedAllowKeywords = Array.isArray(decision.matchedAllowKeywords)
    ? decision.matchedAllowKeywords
    : [];
  const matchedBlockKeywords = Array.isArray(decision.matchedBlockKeywords)
    ? decision.matchedBlockKeywords
    : [];
  const ai =
    decision.ai && typeof decision.ai === "object" ? decision.ai : createDefaultAiResult();

  const matchedKeywords =
    matchedBlockKeywords.length > 0 ? matchedBlockKeywords : matchedAllowKeywords;

  return {
    allowed: decision.allowed === true,
    hideCard: decision.hideCard === true,
    reason: String(decision.reason || ""),
    blockedBy: String(decision.blockedBy || ""),
    mode: String(decision.mode || ""),
    matchedAllowKeywords,
    matchedBlockKeywords,
    matchedKeywords,
    ai,
    metadata,
    timeRule: decision.timeRule || null
  };
}

function hasAiConfig(settings) {
  return !!(settings.aiApiUrl && settings.aiApiKey && settings.aiModel);
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
    mode: "time_block_all",
    matchedAllowKeywords: [],
    matchedBlockKeywords: [],
    ai: createDefaultAiResult(),
    timeRule: rule || null
  };
}

function applyRuleToSettings(settings, rule) {
  if (!rule || rule.mode !== "custom") {
    return settings;
  }

  const overrides = rule.overrides || {};
  let next = {
    ...settings,
    mode: normalizeDecisionMode(overrides.decisionMode || settings.mode),
    actionBlockVideo:
      typeof overrides.actionBlockVideo === "boolean"
        ? overrides.actionBlockVideo
        : settings.actionBlockVideo,
    actionHideCover:
      typeof overrides.actionHideCover === "boolean"
        ? overrides.actionHideCover
        : settings.actionHideCover,
    aiPreFilterBlockKeywords:
      typeof overrides.aiPreFilterBlockKeywords === "boolean"
        ? overrides.aiPreFilterBlockKeywords
        : settings.aiPreFilterBlockKeywords
  };
  next = ensureAtLeastOneAction(next);
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
    desc: view.desc ? String(view.desc) : "",
    duration: Number.isFinite(Number(view.duration)) ? Number(view.duration) : null,
    pubdate: Number.isFinite(Number(view.pubdate)) ? Number(view.pubdate) : null,
    ownerName: view.owner && view.owner.name ? String(view.owner.name) : "",
    ownerMid: view.owner && view.owner.mid ? String(view.owner.mid) : "",
    ownerSign: view.owner && view.owner.sign ? String(view.owner.sign) : "",
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

function collectKeywordTexts(metadata) {
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  return [
    metadata.title,
    metadata.tname,
    metadata.ownerName,
    metadata.ownerSign,
    metadata.desc,
    ...tags
  ];
}

function createModeDecision(
  shouldBlock,
  reason,
  blockedBy,
  mode,
  matchedAllowKeywords,
  matchedBlockKeywords,
  ai
) {
  return {
    shouldBlock: shouldBlock === true,
    reason: String(reason || ""),
    blockedBy: String(blockedBy || ""),
    mode: String(mode || ""),
    matchedAllowKeywords: Array.isArray(matchedAllowKeywords) ? matchedAllowKeywords : [],
    matchedBlockKeywords: Array.isArray(matchedBlockKeywords) ? matchedBlockKeywords : [],
    ai: ai && typeof ai === "object" ? ai : createDefaultAiResult()
  };
}

function evaluateWeakMode(metadata, settings) {
  const blockMatches = findMatches(collectKeywordTexts(metadata), settings.blockKeywords);
  if (blockMatches.length > 0) {
    return createModeDecision(
      true,
      `弱模式命中屏蔽关键词：${blockMatches.join("、")}`,
      "weak_block_keyword",
      "weak",
      [],
      blockMatches,
      createDefaultAiResult()
    );
  }

  return createModeDecision(
    false,
    "弱模式未命中屏蔽关键词",
    "",
    "weak",
    [],
    [],
    createDefaultAiResult()
  );
}

function evaluateStrongMode(metadata, settings) {
  const allowMatches = findMatches(collectKeywordTexts(metadata), settings.allowKeywords);
  if (allowMatches.length > 0) {
    return createModeDecision(
      false,
      `强模式命中学习关键词：${allowMatches.join("、")}`,
      "",
      "strong",
      allowMatches,
      [],
      createDefaultAiResult()
    );
  }

  return createModeDecision(
    true,
    "强模式未命中学习关键词",
    "strong_not_learning",
    "strong",
    [],
    [],
    createDefaultAiResult()
  );
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

function parseBooleanLike(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "learning", "study", "allow", "allowed", "pass"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0", "entertainment", "block", "blocked", "deny"].includes(normalized)) {
      return false;
    }
  }
  return null;
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
    const learningKeys = ["is_learning", "isLearning", "learning", "allow", "allowed", "pass"];
    const entertainmentKeys = ["is_entertainment", "isEntertainment", "entertainment"];

    let isLearning = null;
    for (const key of learningKeys) {
      const value = parseBooleanLike(parsed[key]);
      if (value !== null) {
        isLearning = value;
        break;
      }
    }

    if (isLearning === null) {
      for (const key of entertainmentKeys) {
        const value = parseBooleanLike(parsed[key]);
        if (value !== null) {
          isLearning = !value;
          break;
        }
      }
    }

    if (isLearning === null && typeof parsed.decision === "string") {
      const normalized = parsed.decision.trim().toLowerCase();
      if (normalized === "learning" || normalized === "study") {
        isLearning = true;
      }
      if (normalized === "entertainment") {
        isLearning = false;
      }
    }

    if (isLearning === null) {
      throw new Error("AI返回未包含可识别的学习判定字段");
    }

    const confidenceNum = Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceNum) ? confidenceNum : null;
    const reason = String(parsed.reason || parsed.explanation || parsed.note || "").trim();
    return { isLearning, confidence, reason };
  }

  const lower = raw.toLowerCase();
  if (/is[_\s-]*learning[^a-z0-9]*(true|yes|1)/i.test(lower)) {
    return { isLearning: true, confidence: null, reason: "" };
  }
  if (/is[_\s-]*learning[^a-z0-9]*(false|no|0)/i.test(lower)) {
    return { isLearning: false, confidence: null, reason: "" };
  }

  if (/is[_\s-]*entertainment[^a-z0-9]*(true|yes|1)/i.test(lower)) {
    return { isLearning: false, confidence: null, reason: "" };
  }
  if (/is[_\s-]*entertainment[^a-z0-9]*(false|no|0)/i.test(lower)) {
    return { isLearning: true, confidence: null, reason: "" };
  }

  throw new Error("无法解析AI返回结果");
}

function stringifyPromptValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function buildPromptVariables(metadata) {
  return {
    title: metadata.title || "",
    partition: metadata.tname || "",
    tags: Array.isArray(metadata.tags) ? metadata.tags.join("、") : "",
    owner_name: metadata.ownerName || "",
    owner_mid: metadata.ownerMid || "",
    owner_sign: metadata.ownerSign || "",
    description: metadata.desc || "",
    aid: metadata.aid || "",
    bvid: metadata.bvid || "",
    duration: metadata.duration ?? "",
    pubdate: metadata.pubdate ?? "",
    metadata_json: JSON.stringify(metadata, null, 2)
  };
}

function renderPromptTemplate(template, metadata) {
  const text = normalizeAiPrompt(template);
  const vars = buildPromptVariables(metadata);
  return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      return "";
    }
    return stringifyPromptValue(vars[key]);
  });
}

async function callAiJudge(metadata, settings) {
  const userPrompt = renderPromptTemplate(settings.aiPrompt, metadata);
  const body = {
    model: settings.aiModel,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "你是B站学习内容判定器。你必须基于输入信息判断是否为学习向内容。仅输出JSON，不要输出其它文本。"
      },
      { role: "user", content: userPrompt }
    ]
  };

  const headers = {
    "Content-Type": "application/json"
  };
  if (settings.aiApiKey) {
    headers.Authorization = `Bearer ${settings.aiApiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), settings.aiRequestTimeoutMs);

  try {
    const response = await fetch(settings.aiApiUrl, {
      method: "POST",
      headers,
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

async function evaluateAiMode(metadata, settings) {
  const keywordTexts = collectKeywordTexts(metadata);
  const blockMatches = findMatches(keywordTexts, settings.blockKeywords);

  if (settings.aiPreFilterBlockKeywords && blockMatches.length > 0) {
    return createModeDecision(
      true,
      `AI模式前置过滤命中屏蔽关键词：${blockMatches.join("、")}`,
      "ai_prefilter_block_keyword",
      "ai",
      [],
      blockMatches,
      createDefaultAiResult()
    );
  }

  if (!hasAiConfig(settings)) {
    return createModeDecision(
      true,
      "AI模式配置不完整，已按安全策略拦截",
      "ai_config_missing",
      "ai",
      [],
      blockMatches,
      {
        used: false,
        isLearning: false,
        confidence: null,
        reason: "",
        error: "AI配置不完整"
      }
    );
  }

  try {
    const aiResult = await callAiJudge(metadata, settings);
    const aiInfo = {
      used: true,
      isLearning: aiResult.isLearning === true,
      confidence: aiResult.confidence,
      reason: aiResult.reason || "",
      error: ""
    };

    if (aiResult.isLearning) {
      return createModeDecision(
        false,
        aiResult.reason ? `AI判定为学习向：${aiResult.reason}` : "AI判定为学习向",
        "",
        "ai",
        [],
        blockMatches,
        aiInfo
      );
    }

    return createModeDecision(
      true,
      aiResult.reason ? `AI判定为非学习向：${aiResult.reason}` : "AI判定为非学习向",
      "ai_not_learning",
      "ai",
      [],
      blockMatches,
      aiInfo
    );
  } catch (error) {
    return createModeDecision(
      true,
      `AI判定失败，已按安全策略拦截：${String(error.message || error)}`,
      "ai_error",
      "ai",
      [],
      blockMatches,
      {
        used: true,
        isLearning: false,
        confidence: null,
        reason: "",
        error: String(error.message || error)
      }
    );
  }
}

async function evaluateByMode(metadata, settings) {
  const mode = normalizeDecisionMode(settings.mode);
  if (mode === "weak") {
    return evaluateWeakMode(metadata, settings);
  }
  if (mode === "ai") {
    return evaluateAiMode(metadata, settings);
  }
  return evaluateStrongMode(metadata, settings);
}

function applyActions(modeDecision, settings, context) {
  const normalizedContext = normalizeContext(context);
  const shouldBlock = modeDecision.shouldBlock === true;

  if (!shouldBlock) {
    return {
      allowed: true,
      hideCard: false,
      reason: modeDecision.reason,
      blockedBy: "",
      mode: modeDecision.mode,
      matchedAllowKeywords: modeDecision.matchedAllowKeywords,
      matchedBlockKeywords: modeDecision.matchedBlockKeywords,
      ai: modeDecision.ai
    };
  }

  const hideCard = normalizedContext === "card" && settings.actionHideCover;
  const blockPage = normalizedContext === "page" && settings.actionBlockVideo;

  if (!blockPage && normalizedContext === "page") {
    return {
      allowed: true,
      hideCard: false,
      reason: `${modeDecision.reason}（当前仅启用封面隐藏）`,
      blockedBy: modeDecision.blockedBy,
      mode: modeDecision.mode,
      matchedAllowKeywords: modeDecision.matchedAllowKeywords,
      matchedBlockKeywords: modeDecision.matchedBlockKeywords,
      ai: modeDecision.ai
    };
  }

  return {
    allowed: !blockPage,
    hideCard,
    reason: modeDecision.reason,
    blockedBy: modeDecision.blockedBy,
    mode: modeDecision.mode,
    matchedAllowKeywords: modeDecision.matchedAllowKeywords,
    matchedBlockKeywords: modeDecision.matchedBlockKeywords,
    ai: modeDecision.ai
  };
}

function failedDecision(message) {
  return {
    allowed: false,
    hideCard: false,
    reason: message,
    blockedBy: "error",
    mode: "",
    matchedAllowKeywords: [],
    matchedBlockKeywords: [],
    ai: createDefaultAiResult(),
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
    return enrichDecision(buildBlockAllDecision(activeTimeRule, normalizedContext), {
      title: "",
      tname: "",
      tags: []
    });
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
      const modeDecision = await evaluateByMode(metadata, effectiveSettings);
      const finalDecision = applyActions(modeDecision, effectiveSettings, normalizedContext);
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