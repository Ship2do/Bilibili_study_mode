/*
 * 首装引导。状态全在内存里，只有最后一步才落一次 SET_SETTINGS。
 *
 * 注意：引导流里的默认值可以和冷启动默认值不同——冷启动默认强模式（白名单），
 * 但对新用户来说那是最大的体验陷阱，所以这里默认预选弱模式。这正是引导存在的意义。
 */

const STEP_COUNT = 6;

// 每包 8~12 个词，覆盖常见学习场景
const KEYWORD_PACKS = [
  { name: "考研", words: ["考研", "数学一", "政治", "英语一", "专业课", "真题", "冲刺", "背诵", "复试"] },
  { name: "编程开发", words: ["编程", "算法", "数据结构", "Python", "Java", "前端", "后端", "源码", "项目实战"] },
  { name: "语言学习", words: ["英语", "四六级", "雅思", "托福", "口语", "语法", "单词", "听力", "日语"] },
  { name: "理工基础", words: ["高数", "线性代数", "概率论", "物理", "化学", "电路", "力学", "公式推导", "实验"] },
  { name: "考公考证", words: ["考公", "行测", "申论", "事业编", "教资", "注会", "法考", "一建"] },
  { name: "职业技能", words: ["PPT", "Excel", "剪辑", "设计", "摄影", "运营", "求职", "简历", "职场"] }
];

const ACCENT_OPTIONS = [
  { value: "crimson", label: "绯红" },
  { value: "indigo", label: "靛蓝" },
  { value: "teal", label: "青碧" },
  { value: "amber", label: "琥珀" },
  { value: "rose", label: "玫红" },
  { value: "slate", label: "石墨" }
];

const TRIAL_SAMPLES = [
  { title: "线性代数 第3讲 矩阵的秩", tname: "科学科普", tags: ["数学", "考研"] },
  { title: "英雄联盟 年度高光集锦", tname: "游戏", tags: ["游戏", "电竞"] },
  { title: "我的一天 vlog｜随手拍", tname: "日常", tags: ["生活", "vlog"] }
];

const stepsEl = document.getElementById("steps");
const stepCountEl = document.getElementById("stepCount");
const screens = Array.from(document.querySelectorAll(".screen"));
const backButton = document.getElementById("back");
const nextButton = document.getElementById("next");
const skipButton = document.getElementById("skip");
const statusEl = document.getElementById("status");

const modeInputs = Array.from(document.querySelectorAll("input[name='mode']"));
const presentationInputs = Array.from(document.querySelectorAll("input[name='blockPresentation']"));
const uiThemeInput = document.getElementById("uiTheme");
const accentRow = document.getElementById("accentRow");

const keywordTitle = document.getElementById("keywordTitle");
const keywordLead = document.getElementById("keywordLead");
const keywordPane = document.getElementById("keywordPane");
const packRow = document.getElementById("packRow");
const keywordChips = document.getElementById("keywordChips");
const keywordChipInput = document.getElementById("keywordChipInput");
const keywordCount = document.getElementById("keywordCount");

const aiPane = document.getElementById("aiPane");
const aiApiUrlInput = document.getElementById("aiApiUrl");
const aiModelInput = document.getElementById("aiModel");
const aiApiKeyInput = document.getElementById("aiApiKey");
const aiCount = document.getElementById("aiCount");

const blockBannerEnabledInput = document.getElementById("blockBannerEnabled");
const blockBannerTextInput = document.getElementById("blockBannerText");
const blockBannerDensityInput = document.getElementById("blockBannerDensity");
const bannerDensityLabel = document.getElementById("bannerDensityLabel");
const bannerColorRow = document.getElementById("bannerColorRow");
const bannerPreview = document.getElementById("bannerPreview");
const bannerFields = document.getElementById("bannerFields");
const bannerColorField = document.getElementById("bannerColorField");
const bannerPreviewField = document.getElementById("bannerPreviewField");

const focusLockEnabledInput = document.getElementById("focusLockEnabled");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const passwordFields = document.getElementById("passwordFields");

const trialList = document.getElementById("trialList");

let step = 0;

function sendMessage(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, response => {
      resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : response);
    });
  });
}

function showStatus(text) { statusEl.textContent = text || ""; }

// ── 关键词 chip ──

function readKeywords() {
  return Array.from(keywordChips.querySelectorAll(".chip")).map(el => el.dataset.value).filter(Boolean);
}

function addKeywords(words) {
  const existing = new Set(readKeywords());
  for (const raw of words) {
    const word = String(raw || "").trim();
    if (!word || existing.has(word)) continue;
    existing.add(word);

    const chip = document.createElement("span");
    chip.className = "chip";
    chip.dataset.value = word;
    chip.tabIndex = 0;

    const text = document.createElement("span");
    text.className = "chip-text";
    text.textContent = word;

    const remove = document.createElement("span");
    remove.className = "chip-x";
    remove.textContent = "×";
    remove.addEventListener("click", event => { event.stopPropagation(); chip.remove(); refreshKeywordCount(); });

    chip.addEventListener("keydown", event => {
      if (event.key === "Delete" || event.key === "Backspace") { chip.remove(); refreshKeywordCount(); }
    });

    chip.append(text, remove);
    keywordChips.insertBefore(chip, keywordChipInput);
  }
  refreshKeywordCount();
}

function refreshKeywordCount() {
  const count = readKeywords().length;
  const isStrong = getSelectedMode() === "strong";
  keywordCount.textContent = isStrong
    ? `当前 ${count} 个学习关键词${count < 3 ? "——太少了，会拦掉绝大多数视频" : ""}`
    : `当前 ${count} 个屏蔽关键词`;
  keywordCount.classList.toggle("is-warn", isStrong && count < 3);
  refreshNav();
}

function refreshAiCount() {
  const ready = [aiApiUrlInput, aiModelInput, aiApiKeyInput].every(input => input.value.trim());
  aiCount.textContent = ready ? "AI 配置已填写完整" : "三项都填完才能继续";
  aiCount.classList.toggle("is-warn", !ready);
  refreshNav();
}

keywordChips.addEventListener("click", () => keywordChipInput.focus());
keywordChipInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    addKeywords([keywordChipInput.value]);
    keywordChipInput.value = "";
  }
  if (event.key === "Backspace" && keywordChipInput.value === "") {
    const chips = keywordChips.querySelectorAll(".chip");
    if (chips.length) { chips[chips.length - 1].remove(); refreshKeywordCount(); }
  }
});

function renderPacks() {
  packRow.innerHTML = "";
  for (const pack of KEYWORD_PACKS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pack-btn";
    button.textContent = `+ ${pack.name}`;
    button.addEventListener("click", () => addKeywords(pack.words));
    packRow.appendChild(button);
  }
}

// ── 外观 ──

function renderAccents() {
  accentRow.innerHTML = "";
  for (const option of ACCENT_OPTIONS) {
    const swatch = document.createElement("label");
    swatch.className = "accent-swatch";
    swatch.title = option.label;

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "uiAccent";
    input.value = option.value;
    input.checked = option.value === "crimson";
    input.addEventListener("change", previewAppearance);

    const dot = document.createElement("span");
    dot.className = "accent-dot";
    dot.dataset.accent = option.value;

    swatch.append(input, dot);
    accentRow.appendChild(swatch);
  }
}

function getSelectedAccent() {
  const checked = accentRow.querySelector("input:checked");
  return checked ? checked.value : "crimson";
}

function getSelectedMode() {
  const checked = modeInputs.find(input => input.checked);
  return checked ? checked.value : "weak";
}

function getSelectedPresentation() {
  const checked = presentationInputs.find(input => input.checked);
  return checked ? checked.value : "overlay";
}

function previewAppearance() {
  applyTheme({ uiTheme: uiThemeInput.value, uiAccent: getSelectedAccent() });
  renderBannerPreview();
}

// ── 横幅 ──

function currentScheme() {
  const theme = uiThemeInput.value;
  if (theme === "light" || theme === "dark") return theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function renderBannerColorOptions() {
  bannerColorRow.innerHTML = "";
  for (const name of BANNER_COLOR_ORDER) {
    const swatch = document.createElement("label");
    swatch.className = "accent-swatch";
    swatch.title = BANNER_COLOR_PRESETS[name].name;

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "blockBannerColor";
    input.value = name;
    input.checked = name === "red";
    input.addEventListener("change", renderBannerPreview);

    const dot = document.createElement("span");
    dot.className = "accent-dot";
    dot.style.background = resolveBannerColor(name, currentScheme());

    swatch.append(input, dot);
    bannerColorRow.appendChild(swatch);
  }
}

function getSelectedBannerColor() {
  const checked = bannerColorRow.querySelector("input:checked");
  return checked ? checked.value : "red";
}

// 与真正的拦截界面共用 shared/banner.js 的构建函数，舞台整体缩放，所见即所得
function renderBannerPreview() {
  const enabled = blockBannerEnabledInput.checked;
  for (const el of [bannerFields, bannerColorField, bannerPreviewField]) {
    el.classList.toggle("is-hidden", !enabled);
  }
  bannerDensityLabel.textContent = `${blockBannerDensityInput.value} 条`;
  if (!enabled) return;

  bannerPreview.innerHTML = "";
  bannerPreview.appendChild(buildBannerLayer(document, {
    text: blockBannerTextInput.value.trim() || "学习！",
    density: Number(blockBannerDensityInput.value),
    color: resolveBannerColor(getSelectedBannerColor(), currentScheme())
  }));
}

// ── 表单 -> SET_SETTINGS ──
// 抽成不碰 DOM 的纯函数，才能脱离浏览器直接测
function buildOnboardingPayload(choices) {
  const mode = ["weak", "strong", "ai"].includes(choices.mode) ? choices.mode : "weak";
  const keywords = Array.from(new Set((choices.keywords || []).map(w => String(w || "").trim()).filter(Boolean)));

  if (mode === "strong" && keywords.length === 0) {
    return { error: "强模式下至少要有一个学习关键词，否则几乎所有视频都会被拦" };
  }

  const aiApiUrl = String(choices.aiApiUrl || "").trim();
  const aiModel = String(choices.aiModel || "").trim();
  const aiApiKey = String(choices.aiApiKey || "").trim();
  if (mode === "ai" && !(aiApiUrl && aiModel && aiApiKey)) {
    return { error: "AI 模式需要填写 API URL、Model 和 API Key" };
  }

  const password = String(choices.password || "");
  if (choices.focusLockEnabled) {
    if (password.length < 4) return { error: "密码至少 4 位" };
    if (password !== String(choices.confirmPassword || "")) return { error: "两次输入的密码不一致" };
  }

  const payload = {
    mode,
    uiTheme: ["auto", "light", "dark"].includes(choices.uiTheme) ? choices.uiTheme : "auto",
    uiAccent: choices.uiAccent || "crimson",
    blockPresentation: ["overlay", "card", "toast"].includes(choices.blockPresentation)
      ? choices.blockPresentation : "overlay",
    blockBannerEnabled: choices.blockBannerEnabled !== false,
    blockBannerText: String(choices.blockBannerText || "").trim() || "学习！",
    blockBannerDensity: Math.min(36, Math.max(0, Math.round(Number(choices.blockBannerDensity) || 18))),
    blockBannerColor: BANNER_COLOR_PRESETS[choices.blockBannerColor] ? choices.blockBannerColor : "red",
    focusLockEnabled: choices.focusLockEnabled === true
  };

  // 强模式配的是白名单，弱模式配的是黑名单——同一个输入框，落到不同字段
  if (mode === "strong") payload.allowKeywords = keywords;
  else if (mode === "weak") payload.blockKeywords = keywords;
  else Object.assign(payload, { aiApiUrl, aiModel, aiApiKey });

  const auth = {};
  if (choices.focusLockEnabled && password) auth.newPassword = password;

  return { payload, auth };
}

function collectChoices() {
  return {
    mode: getSelectedMode(),
    keywords: readKeywords(),
    aiApiUrl: aiApiUrlInput.value,
    aiModel: aiModelInput.value,
    aiApiKey: aiApiKeyInput.value,
    uiTheme: uiThemeInput.value,
    uiAccent: getSelectedAccent(),
    blockPresentation: getSelectedPresentation(),
    blockBannerEnabled: blockBannerEnabledInput.checked,
    blockBannerText: blockBannerTextInput.value,
    blockBannerDensity: blockBannerDensityInput.value,
    blockBannerColor: getSelectedBannerColor(),
    focusLockEnabled: focusLockEnabledInput.checked,
    password: newPasswordInput.value,
    confirmPassword: confirmPasswordInput.value
  };
}

// ── 试跑 ──

async function runTrial() {
  trialList.innerHTML = "";
  const mode = getSelectedMode();

  // AI 判定要真实调接口，引导里不试跑（也不该在这一步烧用户的配额）
  if (mode === "ai") {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "AI 模式需要真实调用接口才能判定，这里不做试跑。装好后打开任意视频即可看到效果。";
    trialList.appendChild(note);
    return;
  }

  const keywords = readKeywords();
  const override = mode === "strong" ? { mode, allowKeywords: keywords } : { mode, blockKeywords: keywords };

  for (const sample of TRIAL_SAMPLES) {
    const response = await sendMessage({ type: "PREVIEW_DECISION", metadata: sample, settings: override });
    const decision = response && response.ok ? response.decision : null;

    const item = document.createElement("div");
    item.className = "trial-item";

    const verdict = document.createElement("span");
    verdict.className = `trial-verdict ${decision && decision.shouldBlock ? "is-block" : "is-pass"}`;
    verdict.textContent = decision && decision.shouldBlock ? "会拦" : "放行";

    const body = document.createElement("div");
    body.className = "trial-body";

    const title = document.createElement("div");
    title.className = "trial-title";
    title.textContent = `${sample.title}（${sample.tname}）`;

    const reason = document.createElement("div");
    reason.className = "trial-reason";
    reason.textContent = decision ? decision.reason : (response && response.error) || "试跑失败";

    body.append(title, reason);
    item.append(verdict, body);
    trialList.appendChild(item);
  }
}

// ── 步骤导航 ──

function renderSteps() {
  stepsEl.innerHTML = "";
  for (let i = 0; i < STEP_COUNT; i++) {
    const dot = document.createElement("span");
    dot.className = "step-dot";
    if (i < step) dot.classList.add("is-done");
    else if (i === step) dot.classList.add("is-current");
    stepsEl.appendChild(dot);
  }
  stepCountEl.textContent = `第 ${step + 1} / ${STEP_COUNT} 步`;
}

// 强模式 + 0 关键词直接卡住「下一步」，从流程上堵死「装完全站被拦」；
// AI 模式配置不全同理，否则装完只会看到「AI配置不完整，已按安全策略拦截」。
function canAdvance() {
  if (step !== 2) return true;
  const mode = getSelectedMode();
  if (mode === "strong") return readKeywords().length > 0;
  if (mode === "ai") return [aiApiUrlInput, aiModelInput, aiApiKeyInput].every(input => input.value.trim());
  return true;
}

function refreshNav() {
  backButton.disabled = step === 0;
  nextButton.disabled = !canAdvance();
  nextButton.textContent = step === STEP_COUNT - 1 ? "完成，开始使用" : "下一步";
  skipButton.hidden = step === STEP_COUNT - 1;
}

function renderStep() {
  for (const screen of screens) {
    screen.classList.toggle("is-active", Number(screen.dataset.step) === step);
  }
  renderSteps();
  refreshNav();
  showStatus("");

  if (step === 2) {
    const mode = getSelectedMode();
    const isAi = mode === "ai";
    keywordPane.classList.toggle("is-hidden", isAi);
    aiPane.classList.toggle("is-hidden", !isAi);

    if (isAi) {
      keywordTitle.textContent = "填一下 AI 接口";
      keywordLead.textContent = "扩展会把视频的标题、分区、标签发给这个接口，由它判断是不是娱乐向。";
      refreshAiCount();
    } else {
      const isStrong = mode === "strong";
      keywordTitle.textContent = isStrong ? "配一下学习关键词（白名单）" : "配一下屏蔽关键词（黑名单）";
      keywordLead.textContent = isStrong
        ? "只有标题、分区或标签命中这些词的视频才会放行。点下面的学科包可以一键填充。"
        : "命中这些词的视频会被拦下。已经预填了常见的娱乐类词，可以自己增删。";
      // 学科包装的是「学习关键词」，弱模式配的是黑名单，用不上
      packRow.classList.toggle("is-hidden", !isStrong);
      refreshKeywordCount();
    }
  }

  if (step === 3) renderBannerPreview();

  if (step === 5) {
    trialList.textContent = "正在按你的规则试算…";
    runTrial();
  }
}

// 切模式要换关键词库：黑白名单不是一回事，不能沿用
function resetKeywordsForMode() {
  for (const chip of keywordChips.querySelectorAll(".chip")) chip.remove();
  if (getSelectedMode() === "weak") addKeywords(DEFAULT_BLOCK_KEYWORDS);
  else refreshKeywordCount();
}

for (const input of modeInputs) input.addEventListener("change", resetKeywordsForMode);
for (const input of [aiApiUrlInput, aiModelInput, aiApiKeyInput]) {
  input.addEventListener("input", refreshAiCount);
}
uiThemeInput.addEventListener("change", previewAppearance);
for (const input of [blockBannerEnabledInput, blockBannerTextInput, blockBannerDensityInput]) {
  input.addEventListener("input", renderBannerPreview);
  input.addEventListener("change", renderBannerPreview);
}
autoScaleBannerStage(bannerPreview);
focusLockEnabledInput.addEventListener("change", () => {
  passwordFields.classList.toggle("is-hidden", !focusLockEnabledInput.checked);
});

backButton.addEventListener("click", () => {
  if (step === 0) return;
  step -= 1;
  renderStep();
});

nextButton.addEventListener("click", async () => {
  if (!canAdvance()) return;
  if (step < STEP_COUNT - 1) {
    step += 1;
    renderStep();
    return;
  }
  await finish();
});

skipButton.addEventListener("click", () => {
  // 跳过就是用默认设置，不写任何东西
  window.close();
});

// 扩展不再固定申请 <all_urls>，AI 接口域名要在保存时按需申请。
// 必须在任何 await 之前同步调用，否则用户手势丢失、授权弹窗不会出现。
function requestAiHostPermission(rawUrl) {
  let pattern = "";
  try {
    const parsed = new URL(String(rawUrl || "").trim());
    if (parsed.protocol === "https:") pattern = `${parsed.origin}/*`;
  } catch (_e) { /* 地址不合法，交给后台报错 */ }
  if (!pattern || !chrome.permissions) return Promise.resolve(true);
  return new Promise(resolve => {
    chrome.permissions.request({ origins: [pattern] }, granted => {
      resolve(chrome.runtime.lastError ? false : granted === true);
    });
  });
}

async function finish() {
  const choices = collectChoices();
  const built = buildOnboardingPayload(choices);
  if (built.error) { showStatus(built.error); return; }

  let permissionWarning = "";
  if (choices.mode === "ai") {
    const granted = await requestAiHostPermission(choices.aiApiUrl);
    if (!granted) permissionWarning = "（未授权访问该 AI 接口域名，AI 判定会失败，可在设置页重新保存以授权）";
  }

  nextButton.disabled = true;
  showStatus("正在保存…");
  const response = await sendMessage({ type: "SET_SETTINGS", settings: built.payload, auth: built.auth });

  if (!response || !response.ok) {
    nextButton.disabled = false;
    showStatus(`保存失败：${response ? response.error : "未知错误"}`);
    return;
  }

  showStatus(`已保存${permissionWarning}，正在打开B站…`);
  chrome.tabs.create({ url: "https://www.bilibili.com/" });
  window.close();
}

// ── 初始化 ──

renderPacks();
renderAccents();
renderBannerColorOptions();
modeInputs.find(input => input.value === "weak").checked = true;
presentationInputs.find(input => input.value === "overlay").checked = true;
passwordFields.classList.add("is-hidden");
addKeywords(DEFAULT_BLOCK_KEYWORDS);
previewAppearance();
renderStep();
