function normalizeWeekDays(raw) {
  return Array.from(new Set(
    (Array.isArray(raw) ? raw : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
  )).sort((a, b) => a - b);
}

function normalizeTimeRuleMode(mode) {
  return String(mode || "").trim().toLowerCase() === "block_all" ? "block_all" : "custom";
}

function normalizeRuleOverrides(raw, fallback) {
  const s = raw && typeof raw === "object" ? raw : {};
  const base = fallback || DEFAULT_SETTINGS;
  return {
    decisionMode: normalizeDecisionMode(s.decisionMode || s.mode || base.mode),
    actionBlockVideo: typeof s.actionBlockVideo === "boolean" ? s.actionBlockVideo : base.actionBlockVideo,
    actionHideCover: typeof s.actionHideCover === "boolean" ? s.actionHideCover : base.actionHideCover,
    aiPreFilterBlockKeywords: typeof s.aiPreFilterBlockKeywords === "boolean" ? s.aiPreFilterBlockKeywords : base.aiPreFilterBlockKeywords !== false
  };
}

function normalizeTimeRules(raw, fallbackSettings) {
  const list = Array.isArray(raw) ? raw : [];
  const normalized = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const days = normalizeWeekDays(item.days);
    if (days.length === 0) continue;

    const mode = normalizeTimeRuleMode(item.mode);
    const rawOv = item.overrides && typeof item.overrides === "object" ? { ...item.overrides } : {};

    if (typeof rawOv.actionBlockVideo !== "boolean" && Object.prototype.hasOwnProperty.call(rawOv, "enabled")) {
      rawOv.actionBlockVideo = rawOv.enabled !== false;
    }
    if (typeof rawOv.actionHideCover !== "boolean" && Object.prototype.hasOwnProperty.call(rawOv, "hideBlockedCovers")) {
      rawOv.actionHideCover = rawOv.hideBlockedCovers === true;
    }
    if (typeof rawOv.aiPreFilterBlockKeywords !== "boolean" && Object.prototype.hasOwnProperty.call(rawOv, "aiBlockEnabled")) {
      rawOv.aiPreFilterBlockKeywords = rawOv.aiBlockEnabled !== false;
    }

    const overrides = normalizeRuleOverrides(rawOv, fallbackSettings);
    if (mode === "custom" && !overrides.actionBlockVideo && !overrides.actionHideCover) continue;

    normalized.push({
      id: String(item.id || randomId("rule")),
      name: String(item.name || "").trim() || "未命名时段",
      enabled: item.enabled !== false,
      days, mode, overrides,
      start: normalizeTimeText(item.start, "00:00"),
      end: normalizeTimeText(item.end, "23:59")
    });
  }
  return normalized;
}

function toMinuteOfDay(timeText) {
  const [h, m] = String(timeText || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function timeRuleDurationMinutes(rule) {
  const start = toMinuteOfDay(rule.start);
  const end = toMinuteOfDay(rule.end);
  if (start === end) return 24 * 60;
  return end > start ? end - start : 24 * 60 - start + end;
}

function isRuleActiveAt(rule, date) {
  if (!rule || rule.enabled === false) return false;
  const days = Array.isArray(rule.days) ? rule.days : [];
  if (days.length === 0) return false;

  const nowDay = date.getDay();
  const nowMin = date.getHours() * 60 + date.getMinutes();
  const start = toMinuteOfDay(rule.start);
  const end = toMinuteOfDay(rule.end);

  if (start === end) return days.includes(nowDay);
  if (end > start) return days.includes(nowDay) && nowMin >= start && nowMin < end;
  if (days.includes(nowDay) && nowMin >= start) return true;
  return days.includes((nowDay + 6) % 7) && nowMin < end;
}

function getActiveTimeRule(settings, nowDate) {
  if (!settings.timeStrategyEnabled) return null;
  const rules = Array.isArray(settings.timeRules) ? settings.timeRules : [];
  const now = nowDate instanceof Date ? nowDate : new Date();
  const weights = { block_all: 99, custom: 1 };
  let selected = null;
  let selectedIdx = -1;
  let selectedWeight = -1;

  rules.forEach((rule, idx) => {
    if (!isRuleActiveAt(rule, now)) return;
    const w = weights[rule.mode] || 1;
    if (w > selectedWeight || (w === selectedWeight && selectedIdx >= 0 && idx < selectedIdx)) {
      selected = rule;
      selectedIdx = idx;
      selectedWeight = w;
    }
  });
  return selected;
}

function buildBlockAllDecision(rule, context) {
  const ruleName = rule?.name || "时段策略";
  return {
    allowed: false,
    hideCard: context === "card",
    reason: `当前时段"${ruleName}"禁止访问`,
    blockedBy: "time_block_all",
    mode: "time_block_all",
    matchedAllowKeywords: [],
    matchedBlockKeywords: [],
    ai: createDefaultAiResult(),
    timeRule: rule || null
  };
}

function applyRuleToSettings(settings, rule) {
  if (!rule || rule.mode !== "custom") return settings;
  const ov = rule.overrides || {};
  let next = {
    ...settings,
    mode: normalizeDecisionMode(ov.decisionMode || settings.mode),
    actionBlockVideo: typeof ov.actionBlockVideo === "boolean" ? ov.actionBlockVideo : settings.actionBlockVideo,
    actionHideCover: typeof ov.actionHideCover === "boolean" ? ov.actionHideCover : settings.actionHideCover,
    aiPreFilterBlockKeywords: typeof ov.aiPreFilterBlockKeywords === "boolean" ? ov.aiPreFilterBlockKeywords : settings.aiPreFilterBlockKeywords
  };
  if (!next.actionBlockVideo && !next.actionHideCover) next.actionBlockVideo = true;
  return next;
}
