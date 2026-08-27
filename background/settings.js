async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(hash, input) {
  if (!hash || !input) return false;
  return await sha256Hex(String(input)) === String(hash);
}

function ensureAtLeastOneAction(settings) {
  if (settings.actionBlockVideo || settings.actionHideCover) return settings;
  return { ...settings, actionBlockVideo: true };
}

function normalizeSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const legacyKw = normalizeKeywords(src.keywords);
  const allowKeywords = normalizeKeywords(src.allowKeywords).length ? normalizeKeywords(src.allowKeywords)
    : legacyKw.length ? legacyKw : [...DEFAULT_SETTINGS.allowKeywords];
  const blockKeywords = normalizeKeywords(src.blockKeywords).length ? normalizeKeywords(src.blockKeywords)
    : [...DEFAULT_SETTINGS.blockKeywords];
  const mode = normalizeDecisionMode(src.mode || (src.aiEnabled === true ? "ai" : "strong"));

  const base = {
    mode,
    actionBlockVideo: typeof src.actionBlockVideo === "boolean" ? src.actionBlockVideo : src.enabled !== false,
    actionHideCover: typeof src.actionHideCover === "boolean" ? src.actionHideCover : src.hideBlockedCovers === true,
    blockBannerEnabled: typeof src.blockBannerEnabled === "boolean" ? src.blockBannerEnabled : true,
    blockBannerText: String(src.blockBannerText || "").trim() || "学习！",
    allowKeywords, blockKeywords,
    aiPreFilterBlockKeywords: typeof src.aiPreFilterBlockKeywords === "boolean" ? src.aiPreFilterBlockKeywords : true,
    aiApiUrl: String(src.aiApiUrl || "").trim(),
    aiApiKey: String(src.aiApiKey || "").trim(),
    aiModel: String(src.aiModel || "").trim(),
    aiPrompt: normalizeAiPrompt(src.aiPrompt),
    aiRequestTimeoutMs: clampNumber(src.aiRequestTimeoutMs, 3000, 30000, 12000),
    autoNotInterestedEnabled: src.autoNotInterestedEnabled === true,
    timeStrategyEnabled: src.timeStrategyEnabled === true,
    timeRules: [],
    focusLockEnabled: src.focusLockEnabled === true,
    focusLockPasswordHash: String(src.focusLockPasswordHash || "").trim()
  };

  // 外观与拦截呈现字段统一由 schema 归一化，加字段只改 shared/constants.js。
  // 上面那些老字段的兜底含历史迁移分支（enabled / hideBlockedCovers / aiEnabled），
  // 保持手写，不要并进来。
  for (const [key, spec] of Object.entries(UI_SETTINGS_SCHEMA)) {
    base[key] = normalizeBySchema(src[key], spec);
  }

  base.timeRules = normalizeTimeRules(src.timeRules, base);
  return ensureAtLeastOneAction(base);
}

// DEFAULT_SETTINGS 是浅冻结的，structuredClone 返回可写深拷贝，
// 调用方改返回值里的数组也不会污染默认值。
function cloneDefaultSettings() {
  return structuredClone(DEFAULT_SETTINGS);
}

function toPublicSettings(settings) {
  const result = { ...settings };
  delete result.focusLockPasswordHash;
  result.focusLockHasPassword = !!settings.focusLockPasswordHash;
  return result;
}

async function getSettings() {
  const stored = await chrome.storage.sync.get("studyGuardSettings");
  return normalizeSettings(stored.studyGuardSettings);
}

function createFocusError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateActions(settings) {
  if (!settings.actionBlockVideo && !settings.actionHideCover) {
    throw createFocusError("ACTIONS_REQUIRED", "请至少开启一个动作：拦截视频或隐藏封面");
  }
}

function validateTimeRules(rules) {
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || rule.mode !== "custom") continue;
    const ov = rule.overrides || {};
    if (!ov.actionBlockVideo && !ov.actionHideCover) {
      throw createFocusError("RULE_ACTIONS_REQUIRED", `时段规则"${rule.name || "未命名时段"}"至少开启一个动作`);
    }
  }
}

function decisionModeWeight(mode) {
  return mode === "strong" ? 3 : mode === "ai" ? 2 : 1;
}

function ruleStrictnessWeight(rule, base) {
  if (!rule || rule.mode === "block_all") return 24;
  const ov = rule.overrides || {};
  const m = normalizeDecisionMode(ov.decisionMode || base.mode);
  let score = decisionModeWeight(m);
  if (typeof ov.actionBlockVideo === "boolean" ? ov.actionBlockVideo : base.actionBlockVideo) score += 2;
  if (typeof ov.actionHideCover === "boolean" ? ov.actionHideCover : base.actionHideCover) score += 1;
  if (m === "ai" && (typeof ov.aiPreFilterBlockKeywords === "boolean" ? ov.aiPreFilterBlockKeywords : base.aiPreFilterBlockKeywords)) score += 1;
  return score;
}

function timeRulesStrictnessScore(settings) {
  if (!settings.timeStrategyEnabled) return 0;
  let score = 0;
  for (const rule of Array.isArray(settings.timeRules) ? settings.timeRules : []) {
    if (!rule || rule.enabled === false || !rule.days?.length) continue;
    score += rule.days.length * timeRuleDurationMinutes(rule) * ruleStrictnessWeight(rule, settings);
  }
  return score;
}

function includesAllKeywords(needles, haystack) {
  const set = new Set((Array.isArray(haystack) ? haystack : []).map(String));
  return (Array.isArray(needles) ? needles : []).every(n => set.has(String(n)));
}

function hasNewKeywords(base, next) {
  const set = new Set((Array.isArray(base) ? base : []).map(String));
  return (Array.isArray(next) ? next : []).some(n => !set.has(String(n)));
}

// ── 拦截强度的各个维度 ──
//
// 连续值（不透明度、秒数）刻意只分 2~3 档，不做逐点比较：97 调到 96 就索要
// 密码会把设置页变成刑具；完全不比较又等于给密码锁留后门。档位名会显示在
// 设置页的滑块旁，让规则对用户可见、可预期。
//
// 关键：isLessStrict 逐维度比较，不合成加权总分。加权分可以被「补偿攻击」
// 绕过——把遮罩调到看不清、同时把另一个无关维度调严，总分持平就不要密码了。
// 这与 timeRulesStrictnessScore 用加总不同是有意为之：时段规则是同量纲的
// 时长×权重，可以相加；呈现强度是异质维度，不可相加。
function presentationTier(settings) {
  if (settings.blockPresentation === "toast") return 1;
  if (settings.blockPresentation === "card") return 2;
  return 3;
}

function continueTier(settings) {
  if (settings.blockAllowContinue !== true) return 3;
  return Number(settings.blockContinueDelaySec) >= 30 ? 2 : 1;
}

function autoDismissTier(settings) {
  const seconds = Number(settings.blockAutoDismissSec);
  if (!Number.isFinite(seconds) || seconds <= 0) return 3;
  return seconds >= 120 ? 2 : 1;
}

function scrollLockTier(settings) {
  return settings.blockScrollLock === false ? 0 : 1;
}

function pauseVideoTier(settings) {
  return settings.blockPauseVideo === false ? 0 : 1;
}

function opacityTier(settings) {
  const opacity = Number(settings.blockOpacity);
  if (!Number.isFinite(opacity) || opacity >= 90) return 3;
  return opacity >= 75 ? 2 : 1;
}

const STRICTNESS_DIMENSIONS = [
  presentationTier, continueTier, autoDismissTier, scrollLockTier, pauseVideoTier, opacityTier
];

function isLessStrict(current, next) {
  if (current.actionBlockVideo && !next.actionBlockVideo) return true;
  if (current.actionHideCover && !next.actionHideCover) return true;
  if (current.autoNotInterestedEnabled && !next.autoNotInterestedEnabled) return true;
  if (decisionModeWeight(next.mode) < decisionModeWeight(current.mode)) return true;

  if (current.mode === "weak") {
    if (!includesAllKeywords(current.blockKeywords, next.blockKeywords)) return true;
  } else if (current.mode === "strong") {
    if (hasNewKeywords(current.allowKeywords, next.allowKeywords)) return true;
  } else if (current.mode === "ai") {
    if (current.aiPreFilterBlockKeywords && !next.aiPreFilterBlockKeywords) return true;
    if (current.aiPreFilterBlockKeywords && !includesAllKeywords(current.blockKeywords, next.blockKeywords)) return true;
  }

  if (current.timeStrategyEnabled && !next.timeStrategyEnabled) return true;
  if (timeRulesStrictnessScore(next) < timeRulesStrictnessScore(current)) return true;
  if (current.focusLockEnabled && !next.focusLockEnabled) return true;

  // 任一强度维度变弱就要密码。样式类字段不出现在这里，因此天然免密码。
  if (STRICTNESS_DIMENSIONS.some(dimension => dimension(next) < dimension(current))) return true;
  return false;
}

async function setSettings(partial, auth) {
  const current = await getSettings();
  const authInfo = auth && typeof auth === "object" ? auth : {};
  const nextSource = { ...current, ...(partial && typeof partial === "object" ? partial : {}) };
  if (nextSource.actionBlockVideo === false && nextSource.actionHideCover === false) {
    throw createFocusError("ACTIONS_REQUIRED", "请至少开启一个动作：拦截视频或隐藏封面");
  }

  const next = normalizeSettings(nextSource);
  validateActions(next);
  validateTimeRules(next.timeRules);

  const newPassword = String(authInfo.newPassword || "").trim();
  const unlockPassword = String(authInfo.unlockPassword || "").trim();

  if (newPassword) {
    next.focusLockPasswordHash = await sha256Hex(newPassword);
  } else {
    next.focusLockPasswordHash = String(current.focusLockPasswordHash || "");
  }

  if (next.focusLockEnabled && !next.focusLockPasswordHash) {
    throw createFocusError("PASSWORD_SETUP_REQUIRED", "开启专注密码锁前，请先设置密码");
  }

  const needUnlock = current.focusLockEnabled && (
    isLessStrict(current, next) || newPassword || (current.focusLockPasswordHash && !next.focusLockPasswordHash)
  );
  if (needUnlock && !await verifyPassword(current.focusLockPasswordHash, unlockPassword)) {
    throw createFocusError("PASSWORD_REQUIRED", "此操作会降低专注度或修改安全设置，请输入密码");
  }

  await chrome.storage.sync.set({ studyGuardSettings: next });
  checkCache.clear();
  inFlightChecks.clear();
  return next;
}

async function resetSettings(auth) {
  const current = await getSettings();
  if (current.focusLockEnabled) {
    const unlockPassword = String((auth || {}).unlockPassword || "").trim();
    if (!await verifyPassword(current.focusLockPasswordHash, unlockPassword)) {
      throw createFocusError("PASSWORD_REQUIRED", "重置会降低专注度，请输入密码");
    }
  }
  const defaults = cloneDefaultSettings();
  await chrome.storage.sync.set({ studyGuardSettings: defaults });
  checkCache.clear();
  inFlightChecks.clear();
  return defaults;
}

async function ensureDefaultSettings() {
  const stored = await chrome.storage.sync.get("studyGuardSettings");
  if (!stored.studyGuardSettings) {
    await chrome.storage.sync.set({ studyGuardSettings: cloneDefaultSettings() });
    return;
  }
  const normalized = normalizeSettings(stored.studyGuardSettings);
  validateActions(normalized);
  validateTimeRules(normalized.timeRules);
  await chrome.storage.sync.set({ studyGuardSettings: normalized });
}
