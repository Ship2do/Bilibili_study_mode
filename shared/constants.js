const DEFAULT_ALLOW_KEYWORDS = [
  "学习", "知识", "科普", "课程", "公开课", "教育",
  "数学", "英语", "编程", "科学", "考研", "四六级"
];

const DEFAULT_BLOCK_KEYWORDS = [
  "游戏", "手游", "电竞", "娱乐", "搞笑", "鬼畜", "整活",
  "抽卡", "直播", "明星", "综艺", "追番", "番剧",
  "二次元", "舞蹈", "音乐", "vlog"
];

const DEFAULT_AI_PROMPT_TEMPLATE =
  "标题为{{title}}的视频，分区是{{partition}}，标签是{{tags}}，请你判断是否为娱乐类视频。";

const ACCENT_PRESETS = ["crimson", "indigo", "teal", "amber", "rose", "slate"];

// 外观与拦截呈现的设置项集中在这张表里，默认值和归一化规则都由它派生，
// 加字段只改这一处。判定逻辑相关的老字段仍写在 LEGACY_DEFAULTS 里，
// 它们的兜底规则含历史迁移分支，不适合塞进通用 schema。
//
// 两类字段的区别很重要：
//   样式类 —— 纯观感，不进 isLessStrict()，改动不需要专注密码；
//   强度类 —— 会真正削弱拦截力度，进 isLessStrict()，受专注密码锁保护。
// 判断依据是「改了之后是不是更容易看到被拦的视频」，不是「改的是不是外观」。
const UI_SETTINGS_SCHEMA = Object.freeze({
  // ── 样式类 ──
  // uiAccent 在界面上叫「主题色」，字段名保持不变以免动到已有用户的存储
  uiTheme: { type: "enum", values: ["auto", "light", "dark"], default: "auto" },
  uiAccent: { type: "accent", default: "crimson" },
  blockBannerDensity: { type: "int", min: 0, max: 36, default: 18 },
  blockBannerColor: { type: "enum", values: ["red", "orange", "amber", "green", "blue", "purple", "slate"], default: "red" },
  blockShowVideoInfo: { type: "bool", default: true },

  // ── 强度类 ──
  blockPresentation: { type: "enum", values: ["overlay", "card", "toast"], default: "overlay" },
  blockAllowContinue: { type: "bool", default: false },
  blockContinueDelaySec: { type: "int", min: 0, max: 60, default: 10 },
  blockAutoDismissSec: { type: "int", min: 0, max: 600, default: 0 },
  blockScrollLock: { type: "bool", default: true },
  blockPauseVideo: { type: "bool", default: true },
  blockOpacity: { type: "int", min: 60, max: 100, default: 97 }
});

// 本文件会被设置页单独加载（不带 shared/utils.js），所以这里的归一化必须自包含，
// 不能依赖 utils 里的 clampNumber。
function normalizeBySchema(raw, spec) {
  switch (spec.type) {
    case "bool":
      // 默认 true 的字段用「不等于 false」，默认 false 的用「严格等于 true」，
      // 这样老数据里缺这个键时也能落到期望的默认值。
      return spec.default === true ? raw !== false : raw === true;
    case "enum": {
      const value = String(raw === undefined || raw === null ? "" : raw).trim().toLowerCase();
      return spec.values.includes(value) ? value : spec.default;
    }
    case "accent": {
      const value = String(raw === undefined || raw === null ? "" : raw).trim().toLowerCase();
      if (ACCENT_PRESETS.includes(value)) return value;
      return /^#[0-9a-f]{6}$/.test(value) ? value : spec.default;
    }
    case "int": {
      const num = Number(raw);
      if (!Number.isFinite(num)) return spec.default;
      return Math.min(spec.max, Math.max(spec.min, Math.round(num)));
    }
    case "text":
      return String(raw === undefined || raw === null ? "" : raw).trim().slice(0, spec.maxLength);
    default:
      return raw === undefined ? spec.default : raw;
  }
}

function defaultsFromSchema(schema) {
  const result = {};
  for (const [key, spec] of Object.entries(schema)) result[key] = spec.default;
  return result;
}

const LEGACY_DEFAULTS = {
  mode: "strong",
  actionBlockVideo: true,
  actionHideCover: false,
  blockBannerEnabled: true,
  blockBannerText: "学习！",
  allowKeywords: [...DEFAULT_ALLOW_KEYWORDS],
  blockKeywords: [...DEFAULT_BLOCK_KEYWORDS],
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
};

const DEFAULT_SETTINGS = Object.freeze({
  ...LEGACY_DEFAULTS,
  ...defaultsFromSchema(UI_SETTINGS_SCHEMA)
});
