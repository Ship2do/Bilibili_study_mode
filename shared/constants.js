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

const DEFAULT_SETTINGS = Object.freeze({
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
});
