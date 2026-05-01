function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function normalizeTimeText(value, fallback) {
  const text = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(text)) {
    const [h, m] = text.split(":").map(Number);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return fallback;
}

function normalizeDecisionMode(mode) {
  const v = String(mode || "").trim().toLowerCase();
  if (v === "weak") return "weak";
  if (v === "ai") return "ai";
  return "strong";
}

function normalizeKeywords(raw) {
  const values = Array.isArray(raw) ? raw : [];
  return Array.from(new Set(
    values.map(item => String(item || "").trim()).filter(Boolean)
  ));
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function findMatches(texts, keywords) {
  const textList = (Array.isArray(texts) ? texts : []).map(normalizeText).filter(Boolean);
  const matched = new Set();
  for (const keyword of normalizeKeywords(keywords)) {
    const needle = normalizeText(keyword);
    if (needle && textList.some(text => text.includes(needle))) {
      matched.add(keyword);
    }
  }
  return Array.from(matched);
}

function modeLabel(mode) {
  if (mode === "weak") return "弱模式";
  if (mode === "ai") return "AI模式";
  return "强模式";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
