// DEFAULT_SETTINGS / DEFAULT_AI_PROMPT_TEMPLATE 等常量来自 shared/constants.js，
// 该文件在 options.html 里先于本文件加载——这里不要再声明同名 const，
// 否则同一全局词法环境重复声明会让整个 options.js 抛 SyntaxError。
//
// 设置页面对的是 toPublicSettings() 的形状：没有 focusLockPasswordHash，
// 取而代之的是布尔的 focusLockHasPassword。
const UI_DEFAULTS = (() => {
  const defaults = structuredClone(DEFAULT_SETTINGS);
  delete defaults.focusLockPasswordHash;
  defaults.focusLockHasPassword = false;
  return defaults;
})();

const DAY_OPTIONS = [
  { value: 0, label: "周日" }, { value: 1, label: "周一" },
  { value: 2, label: "周二" }, { value: 3, label: "周三" },
  { value: 4, label: "周四" }, { value: 5, label: "周五" },
  { value: 6, label: "周六" }
];

const DECISION_MODE_OPTIONS = [
  { value: "weak", label: "弱硬判断（仅黑名单）" },
  { value: "strong", label: "强硬判断（仅白名单）" },
  { value: "ai", label: "AI判断" }
];

const TIME_RULE_MODE_OPTIONS = [
  { value: "custom", label: "自定义" },
  { value: "block_all", label: "完全禁止访问" }
];

const modeInputs = Array.from(document.querySelectorAll("input[name='mode']"));
const actionBlockVideoInput = document.getElementById("actionBlockVideo");
const actionHideCoverInput = document.getElementById("actionHideCover");
const autoNotInterestedEnabledInput = document.getElementById("autoNotInterestedEnabled");

const blockBannerEnabledInput = document.getElementById("blockBannerEnabled");
const blockBannerTextInput = document.getElementById("blockBannerText");
const bannerPreview = document.getElementById("bannerPreview");
const blockBannerDensityInput = document.getElementById("blockBannerDensity");
const blockBannerSpeedInput = document.getElementById("blockBannerSpeed");
const blockBannerHueInput = document.getElementById("blockBannerHue");
const bannerDensityLabel = document.getElementById("bannerDensityLabel");
const bannerSpeedLabel = document.getElementById("bannerSpeedLabel");
const bannerHueLabel = document.getElementById("bannerHueLabel");
const blockShowVideoInfoInput = document.getElementById("blockShowVideoInfo");
const blockTitleTextInput = document.getElementById("blockTitleText");
const blockEncourageTextInput = document.getElementById("blockEncourageText");

const presentationInputs = Array.from(document.querySelectorAll("input[name='blockPresentation']"));
const blockOpacityInput = document.getElementById("blockOpacity");
const blockOpacityLabel = document.getElementById("blockOpacityLabel");
const blockScrollLockInput = document.getElementById("blockScrollLock");
const blockPauseVideoInput = document.getElementById("blockPauseVideo");
const blockAllowContinueInput = document.getElementById("blockAllowContinue");
const blockContinueDelaySecInput = document.getElementById("blockContinueDelaySec");
const blockAutoDismissSecInput = document.getElementById("blockAutoDismissSec");

const allowChipsWrap = document.getElementById("allowChips");
const allowChipInput = document.getElementById("allowChipInput");
const blockChipsWrap = document.getElementById("blockChips");
const blockChipInput = document.getElementById("blockChipInput");

const aiPreFilterBlockKeywordsInput = document.getElementById("aiPreFilterBlockKeywords");
const aiApiUrlInput = document.getElementById("aiApiUrl");
const aiModelInput = document.getElementById("aiModel");
const aiApiKeyInput = document.getElementById("aiApiKey");
const aiRequestTimeoutMsInput = document.getElementById("aiRequestTimeoutMs");
const aiPromptInput = document.getElementById("aiPrompt");
const aiPermissionHint = document.getElementById("aiPermissionHint");

const uiThemeInput = document.getElementById("uiTheme");
const uiFontInput = document.getElementById("uiFont");
const uiRadiusInput = document.getElementById("uiRadius");
const accentRow = document.getElementById("accentRow");

const timeStrategyEnabledInput = document.getElementById("timeStrategyEnabled");
const addTimeRuleButton = document.getElementById("addTimeRule");
const timeRulesContainer = document.getElementById("timeRulesContainer");

const focusLockEnabledInput = document.getElementById("focusLockEnabled");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const unlockPasswordInput = document.getElementById("unlockPassword");

const saveButton = document.getElementById("save");
const resetButton = document.getElementById("reset");
const statusEl = document.getElementById("status");

let currentSettings = structuredClone(UI_DEFAULTS);

function showStatus(text) { statusEl.textContent = text; }

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function normalizeDecisionMode(mode) {
  const v = String(mode || "").trim().toLowerCase();
  if (v === "weak") return "weak";
  if (v === "ai") return "ai";
  return "strong";
}

function normalizeRuleMode(mode) {
  return String(mode || "").trim().toLowerCase() === "block_all" ? "block_all" : "custom";
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function normalizeTimeText(value, fallback) {
  const text = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

function randomRuleId() {
  return `rule_${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function getSelectedMode() {
  const selected = modeInputs.find((input) => input.checked);
  return normalizeDecisionMode(selected ? selected.value : "strong");
}

function setSelectedMode(mode) {
  const normalized = normalizeDecisionMode(mode);
  for (const input of modeInputs) input.checked = input.value === normalized;
}

// ── Chip-based keyword input ──

function renderChips(wrap, input, keywords) {
  wrap.querySelectorAll(".chip").forEach((el) => el.remove());
  const list = Array.isArray(keywords) ? keywords : [];
  for (const kw of list) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.dataset.value = kw;
    chip.innerHTML = `<span class="chip-text">${escapeHtml(kw)}</span><span class="chip-x">&times;</span>`;
    chip.querySelector(".chip-x").addEventListener("click", (e) => {
      e.stopPropagation();
      chip.remove();
    });
    wrap.insertBefore(chip, input);
  }
}

function readChips(wrap) {
  return Array.from(wrap.querySelectorAll(".chip")).map((el) => el.dataset.value).filter(Boolean);
}

function setupChipInput(wrap, input) {
  wrap.addEventListener("click", () => input.focus());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      const existing = readChips(wrap);
      if (existing.includes(value)) { input.value = ""; return; }
      renderChips(wrap, input, [...existing, value]);
      input.value = "";
    }
    if (e.key === "Backspace" && input.value === "") {
      const chips = wrap.querySelectorAll(".chip");
      if (chips.length) chips[chips.length - 1].remove();
    }
  });
}

setupChipInput(allowChipsWrap, allowChipInput);
setupChipInput(blockChipsWrap, blockChipInput);

// ── 外观 ──

const ACCENT_OPTIONS = [
  { value: "crimson", label: "绯红" },
  { value: "indigo", label: "靛蓝" },
  { value: "teal", label: "青碧" },
  { value: "amber", label: "琥珀" },
  { value: "rose", label: "玫红" },
  { value: "slate", label: "石墨" }
];

function renderAccentOptions() {
  accentRow.innerHTML = "";
  for (const option of ACCENT_OPTIONS) {
    const swatch = document.createElement("label");
    swatch.className = "accent-swatch";
    swatch.title = option.label;

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "uiAccent";
    input.value = option.value;
    input.addEventListener("change", previewAppearance);

    // 色块本身也走 tokens.css 的 light-dark()，这样它显示的就是当前明暗下的真实颜色
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

function setSelectedAccent(value) {
  const normalized = String(value || "crimson").trim().toLowerCase();
  const inputs = Array.from(accentRow.querySelectorAll("input"));
  const match = inputs.find(input => input.value === normalized) || inputs[0];
  for (const input of inputs) input.checked = input === match;
}

// 外观是纯样式，改了立刻生效，不必先保存——所见即所得
function previewAppearance() {
  applyTheme({
    uiTheme: uiThemeInput.value,
    uiFont: uiFontInput.value,
    uiRadius: uiRadiusInput.value,
    uiAccent: getSelectedAccent()
  });
}

renderAccentOptions();
for (const input of [uiThemeInput, uiFontInput, uiRadiusInput]) {
  input.addEventListener("change", previewAppearance);
}

// ── 拦截界面外观：实时预览 ──
// 用与拦截界面同一套 hue/speed/density 参数渲染几条缩小版横幅，
// 让「密度」「速度」「色相」这三个抽象滑块可见即可得。
function renderBannerPreview() {
  if (!bannerPreview) return;
  const text = blockBannerTextInput.value.trim() || "学习！";
  const density = Number(blockBannerDensityInput.value);
  const speed = Number(blockBannerSpeedInput.value);
  const hue = Number(blockBannerHueInput.value);
  const enabled = blockBannerEnabledInput.checked && density > 0;

  bannerPreview.innerHTML = "";
  if (!enabled) {
    const empty = document.createElement("span");
    empty.className = "hint";
    empty.textContent = "横幅已关闭";
    bannerPreview.appendChild(empty);
    return;
  }

  // 预览区只有真实屏幕的一小块，按比例缩条数，保持观感一致
  const rows = Math.max(1, Math.round(density / 4));
  for (let i = 0; i < rows; i++) {
    const shift = ((i * 37) % 11) - 5;
    const row = document.createElement("div");
    // 角度走自定义属性，让 keyframes 里的 transform 能把旋转和平移合起来，
    // 否则动画的 transform 会整个覆盖掉内联的 rotate
    row.style.cssText = `
      --preview-angle: ${((i * 53) % 40) - 20}deg;
      position: absolute; left: -60%; width: 220%; height: 20px; line-height: 20px;
      top: ${(i / rows) * 120 - 10}%;
      background: hsl(${(hue + shift + 360) % 360} 70% 46%);
      color: #fff; font-size: 12px; font-weight: 700; text-align: center; white-space: nowrap;
      animation: sg-preview-scroll ${16 - speed}s linear infinite ${i % 2 ? "reverse" : "normal"};
    `;
    row.textContent = Array(20).fill(text).join("　　");
    bannerPreview.appendChild(row);
  }
}

function describeDensity(value) {
  if (value === 0) return "关闭";
  if (value <= 8) return `${value} · 稀疏`;
  if (value <= 22) return `${value} · 适中`;
  return `${value} · 密集`;
}

function describeSpeed(value) {
  if (value <= 3) return `${value} · 缓慢`;
  if (value <= 7) return `${value} · 适中`;
  return `${value} · 快速`;
}

// 档位名要和 background/settings.js 里 opacityTier 的分档一致，
// 用户才能预期「调到哪里会要密码」。
function describeOpacity(value) {
  if (value >= 90) return `${value}% · 不透明`;
  if (value >= 75) return `${value}% · 半透明`;
  return `${value}% · 淡`;
}

function refreshBlockAppearance() {
  bannerDensityLabel.textContent = describeDensity(Number(blockBannerDensityInput.value));
  bannerSpeedLabel.textContent = describeSpeed(Number(blockBannerSpeedInput.value));
  bannerHueLabel.textContent = `${blockBannerHueInput.value}°`;
  renderBannerPreview();
}

function refreshBlockStrength() {
  blockOpacityLabel.textContent = describeOpacity(Number(blockOpacityInput.value));
  // 提示条模式下这几项由呈现方式强制决定，置灰避免误导
  const kind = getSelectedPresentation();
  const isToast = kind === "toast";
  blockScrollLockInput.disabled = isToast;
  blockAllowContinueInput.disabled = isToast;
  blockContinueDelaySecInput.disabled = isToast;
  blockOpacityInput.disabled = isToast;
}

function getSelectedPresentation() {
  const checked = presentationInputs.find(input => input.checked);
  return checked ? checked.value : "overlay";
}

for (const input of [blockBannerEnabledInput, blockBannerTextInput, blockBannerDensityInput,
  blockBannerSpeedInput, blockBannerHueInput]) {
  input.addEventListener("input", refreshBlockAppearance);
  input.addEventListener("change", refreshBlockAppearance);
}
for (const input of [...presentationInputs, blockOpacityInput]) {
  input.addEventListener("input", refreshBlockStrength);
  input.addEventListener("change", refreshBlockStrength);
}

// ── Time rules ──

function createEmptyRule() {
  return {
    id: randomRuleId(), name: "新规则", enabled: true,
    days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00", mode: "custom",
    overrides: {
      decisionMode: getSelectedMode(),
      actionBlockVideo: actionBlockVideoInput.checked,
      actionHideCover: actionHideCoverInput.checked,
      aiPreFilterBlockKeywords: aiPreFilterBlockKeywordsInput.checked
    }
  };
}

function createRuleElement(rule) {
  const ruleId = String(rule.id || randomRuleId());
  const wrapper = document.createElement("div");
  wrapper.className = "time-rule";
  wrapper.dataset.ruleId = ruleId;

  const selectedDays = Array.isArray(rule.days) ? rule.days : [];
  const dayHtml = DAY_OPTIONS.map((day) => {
    const checked = selectedDays.includes(day.value) ? "checked" : "";
    return `<label class="day"><input type="checkbox" class="rule-day" data-day="${day.value}" ${checked} />${day.label}</label>`;
  }).join("");

  const ruleMode = normalizeRuleMode(rule.mode);
  const ruleModeOptions = TIME_RULE_MODE_OPTIONS.map((item) => {
    const selected = item.value === ruleMode ? "selected" : "";
    return `<option value="${item.value}" ${selected}>${item.label}</option>`;
  }).join("");

  const overrides = rule.overrides && typeof rule.overrides === "object" ? rule.overrides : {};
  const decisionMode = normalizeDecisionMode(overrides.decisionMode || "strong");
  const decisionModeOptions = DECISION_MODE_OPTIONS.map((item) => {
    const selected = item.value === decisionMode ? "selected" : "";
    return `<option value="${item.value}" ${selected}>${item.label}</option>`;
  }).join("");

  const actionBlockVideo = overrides.actionBlockVideo !== false;
  const actionHideCover = overrides.actionHideCover === true;
  const aiPreFilterBlockKeywords = overrides.aiPreFilterBlockKeywords !== false;
  const isCustom = ruleMode === "custom";

  wrapper.innerHTML = `
    <div class="grid3">
      <div class="item">
        <label class="label">规则名称</label>
        <input type="text" class="rule-name" value="${escapeHtml(rule.name || "")}" />
      </div>
      <div class="item">
        <label class="label">开始时间</label>
        <input type="time" class="rule-start" value="${normalizeTimeText(rule.start, "09:00")}" />
      </div>
      <div class="item">
        <label class="label">结束时间</label>
        <input type="time" class="rule-end" value="${normalizeTimeText(rule.end, "18:00")}" />
      </div>
      <div class="item">
        <label class="row"><input type="checkbox" class="rule-enabled" ${rule.enabled !== false ? "checked" : ""} />启用该时段</label>
      </div>
      <div class="item col-span-2">
        <label class="label">时段策略</label>
        <select class="rule-mode">${ruleModeOptions}</select>
      </div>
    </div>
    <div class="custom-overrides${isCustom ? "" : " is-hidden"}">
      <div class="grid2 mb-2">
        <div class="item">
          <label class="label">判定模式</label>
          <select class="override-decision-mode">${decisionModeOptions}</select>
        </div>
      </div>
      <div class="row row-wrap mb-2">
        <label class="row">
          <input type="checkbox" class="override-action-block" ${actionBlockVideo ? "checked" : ""} /> 拦截视频
        </label>
        <label class="row">
          <input type="checkbox" class="override-action-hide" ${actionHideCover ? "checked" : ""} /> 隐藏封面
        </label>
        <label class="row">
          <input type="checkbox" class="override-ai-prefilter" ${aiPreFilterBlockKeywords ? "checked" : ""} /> AI先走屏蔽词过滤
        </label>
      </div>
      <p class="hint">自定义时段同样要求至少开启一个动作。</p>
    </div>
    <div class="item mt-3">
      <label class="label">生效星期</label>
      <div class="days">${dayHtml}</div>
    </div>
    <div class="rule-actions">
      <button type="button" class="remove-rule">删除规则</button>
    </div>
  `;

  const modeSelect = wrapper.querySelector(".rule-mode");
  const overridesPanel = wrapper.querySelector(".custom-overrides");
  modeSelect.addEventListener("change", (e) => {
    overridesPanel.classList.toggle("is-hidden", e.target.value !== "custom");
  });

  const removeButton = wrapper.querySelector(".remove-rule");
  if (removeButton) {
    removeButton.addEventListener("click", () => {
      wrapper.remove();
      if (!timeRulesContainer.querySelector(".time-rule")) renderTimeRules([]);
    });
  }

  return wrapper;
}

function renderTimeRules(rules) {
  timeRulesContainer.innerHTML = "";
  const list = Array.isArray(rules) ? rules : [];
  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "暂未添加时段规则";
    timeRulesContainer.appendChild(empty);
    return;
  }
  for (const rule of list) timeRulesContainer.appendChild(createRuleElement(rule));
}

function readTimeRulesFromDom() {
  const cards = Array.from(timeRulesContainer.querySelectorAll(".time-rule"));
  const rules = [];
  for (const card of cards) {
    const id = card.dataset.ruleId || randomRuleId();
    const name = String(card.querySelector(".rule-name")?.value || "").trim() || "未命名时段";
    const enabled = card.querySelector(".rule-enabled")?.checked === true;
    const start = normalizeTimeText(card.querySelector(".rule-start")?.value, "00:00");
    const end = normalizeTimeText(card.querySelector(".rule-end")?.value, "23:59");
    const mode = normalizeRuleMode(card.querySelector(".rule-mode")?.value || "custom");
    const days = Array.from(card.querySelectorAll(".rule-day"))
      .filter((input) => input.checked)
      .map((input) => Number(input.dataset.day))
      .filter((num) => Number.isInteger(num) && num >= 0 && num <= 6);
    if (days.length === 0) continue;
    const overrides = {
      decisionMode: normalizeDecisionMode(card.querySelector(".override-decision-mode")?.value || "strong"),
      actionBlockVideo: card.querySelector(".override-action-block")?.checked === true,
      actionHideCover: card.querySelector(".override-action-hide")?.checked === true,
      aiPreFilterBlockKeywords: card.querySelector(".override-ai-prefilter")?.checked !== false
    };
    rules.push({ id, name, enabled, start, end, mode, overrides, days: [...new Set(days)].sort() });
  }
  return rules;
}

// ── Form fill / build ──

function fillForm(settings) {
  const source = settings || UI_DEFAULTS;
  currentSettings = { ...structuredClone(UI_DEFAULTS), ...source };

  uiThemeInput.value = currentSettings.uiTheme || "auto";
  uiFontInput.value = currentSettings.uiFont || "system";
  uiRadiusInput.value = currentSettings.uiRadius || "soft";
  setSelectedAccent(currentSettings.uiAccent);
  previewAppearance();

  setSelectedMode(currentSettings.mode);
  actionBlockVideoInput.checked = currentSettings.actionBlockVideo !== false;
  actionHideCoverInput.checked = currentSettings.actionHideCover === true;
  autoNotInterestedEnabledInput.checked = currentSettings.autoNotInterestedEnabled === true;

  blockBannerEnabledInput.checked = currentSettings.blockBannerEnabled !== false;
  blockBannerTextInput.value = String(currentSettings.blockBannerText || "学习！");
  blockBannerDensityInput.value = String(currentSettings.blockBannerDensity ?? 18);
  blockBannerSpeedInput.value = String(currentSettings.blockBannerSpeed ?? 5);
  blockBannerHueInput.value = String(currentSettings.blockBannerHue ?? 355);
  blockShowVideoInfoInput.checked = currentSettings.blockShowVideoInfo !== false;
  blockTitleTextInput.value = String(currentSettings.blockTitleText || "");
  blockEncourageTextInput.value = String(currentSettings.blockEncourageText || "");

  const presentation = ["overlay", "card", "toast"].includes(currentSettings.blockPresentation)
    ? currentSettings.blockPresentation : "overlay";
  for (const input of presentationInputs) input.checked = input.value === presentation;
  blockOpacityInput.value = String(currentSettings.blockOpacity ?? 97);
  blockScrollLockInput.checked = currentSettings.blockScrollLock !== false;
  blockPauseVideoInput.checked = currentSettings.blockPauseVideo !== false;
  blockAllowContinueInput.checked = currentSettings.blockAllowContinue === true;
  blockContinueDelaySecInput.value = String(currentSettings.blockContinueDelaySec ?? 10);
  blockAutoDismissSecInput.value = String(currentSettings.blockAutoDismissSec ?? 0);

  refreshBlockAppearance();
  refreshBlockStrength();

  renderChips(allowChipsWrap, allowChipInput, currentSettings.allowKeywords || []);
  renderChips(blockChipsWrap, blockChipInput, currentSettings.blockKeywords || []);

  aiPreFilterBlockKeywordsInput.checked = currentSettings.aiPreFilterBlockKeywords !== false;
  aiApiUrlInput.value = String(currentSettings.aiApiUrl || "");
  aiModelInput.value = String(currentSettings.aiModel || "");
  aiApiKeyInput.value = String(currentSettings.aiApiKey || "");
  aiPromptInput.value = String(currentSettings.aiPrompt || DEFAULT_AI_PROMPT_TEMPLATE);
  aiRequestTimeoutMsInput.value = String(clampNumber(currentSettings.aiRequestTimeoutMs, 3000, 30000, 12000));

  timeStrategyEnabledInput.checked = currentSettings.timeStrategyEnabled === true;
  renderTimeRules(Array.isArray(currentSettings.timeRules) ? currentSettings.timeRules : []);

  focusLockEnabledInput.checked = currentSettings.focusLockEnabled === true;
  newPasswordInput.value = "";
  confirmPasswordInput.value = "";
  unlockPasswordInput.value = "";

  refreshAiPermissionHint();
}

async function loadSettings() {
  const response = await sendMessage({ type: "GET_SETTINGS" });
  if (!response || !response.ok) {
    showStatus(`加载失败：${response ? response.error : "未知错误"}`);
    return;
  }
  fillForm(response.settings);
  showStatus("设置已加载");
}

function modeLabel(mode) {
  if (mode === "weak") return "弱模式";
  if (mode === "ai") return "AI模式";
  return "强模式";
}

// ── AI 接口域名授权 ──
// 扩展不再申请 <all_urls>，AI 接口所在域名改为保存时按需申请。

function aiOriginPattern(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || "").trim());
    return parsed.protocol === "https:" ? `${parsed.origin}/*` : "";
  } catch (_e) {
    return "";
  }
}

// 必须在任何 await 之前同步调用 chrome.permissions.request，否则用户手势丢失、授权弹窗不会出现。
function requestAiHostPermission(rawUrl) {
  const pattern = aiOriginPattern(rawUrl);
  if (!pattern || !chrome.permissions) return Promise.resolve(true);
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: [pattern] }, (granted) => {
      resolve(chrome.runtime.lastError ? false : granted === true);
    });
  });
}

async function refreshAiPermissionHint() {
  if (!aiPermissionHint) return;
  const raw = aiApiUrlInput.value.trim();
  if (!raw) { aiPermissionHint.textContent = ""; return; }

  const pattern = aiOriginPattern(raw);
  if (!pattern) {
    aiPermissionHint.textContent = "AI 接口需要填写完整的 https 地址";
    return;
  }
  if (!chrome.permissions) { aiPermissionHint.textContent = ""; return; }

  const granted = await new Promise((resolve) => {
    chrome.permissions.contains({ origins: [pattern] }, (has) => {
      resolve(chrome.runtime.lastError ? false : has === true);
    });
  });
  aiPermissionHint.textContent = granted
    ? `已授权访问 ${pattern}`
    : `尚未授权访问 ${pattern}，保存时会请求授权`;
}

aiApiUrlInput.addEventListener("input", () => { refreshAiPermissionHint(); });

function buildPayload() {
  const mode = getSelectedMode();
  const actionBlockVideo = actionBlockVideoInput.checked;
  const actionHideCover = actionHideCoverInput.checked;
  const allowKeywords = readChips(allowChipsWrap);
  const blockKeywords = readChips(blockChipsWrap);
  const timeRules = readTimeRulesFromDom();

  if (!actionBlockVideo && !actionHideCover)
    return { error: "请至少开启一个动作：拦截视频或隐藏封面" };
  if (mode === "strong" && allowKeywords.length === 0)
    return { error: "强模式下，请至少填写一个学习关键词" };

  const aiApiUrl = aiApiUrlInput.value.trim();
  const aiModel = aiModelInput.value.trim();
  const aiApiKey = aiApiKeyInput.value.trim();
  const aiPrompt = aiPromptInput.value.trim() || DEFAULT_AI_PROMPT_TEMPLATE;
  const aiConfigReady = !!(aiApiUrl && aiModel && aiApiKey);

  if (mode === "ai" && !aiConfigReady)
    return { error: "AI模式下，请填写 AI API URL、Model、API Key" };
  if (timeStrategyEnabledInput.checked && timeRules.length === 0)
    return { error: "启用时段策略后，请至少添加一条时段规则" };

  for (const rule of timeRules) {
    if (rule.mode !== "custom") continue;
    if (!rule.overrides.actionBlockVideo && !rule.overrides.actionHideCover)
      return { error: `时段规则"${rule.name}"至少开启一个动作` };
    if (rule.overrides.decisionMode === "strong" && allowKeywords.length === 0)
      return { error: `时段规则"${rule.name}"使用强模式时，需要至少一个学习关键词` };
    if (rule.overrides.decisionMode === "ai" && !aiConfigReady)
      return { error: `时段规则"${rule.name}"使用AI模式时，请先填写完整AI配置` };
  }

  const payload = {
    uiTheme: uiThemeInput.value,
    uiFont: uiFontInput.value,
    uiRadius: uiRadiusInput.value,
    uiAccent: getSelectedAccent(),
    mode, actionBlockVideo, actionHideCover,
    autoNotInterestedEnabled: autoNotInterestedEnabledInput.checked,
    blockBannerEnabled: blockBannerEnabledInput.checked,
    blockBannerText: String(blockBannerTextInput.value || "").trim() || "学习！",
    blockBannerDensity: clampNumber(blockBannerDensityInput.value, 0, 36, 18),
    blockBannerSpeed: clampNumber(blockBannerSpeedInput.value, 1, 10, 5),
    blockBannerHue: clampNumber(blockBannerHueInput.value, 0, 359, 355),
    blockShowVideoInfo: blockShowVideoInfoInput.checked,
    blockTitleText: String(blockTitleTextInput.value || "").trim(),
    blockEncourageText: String(blockEncourageTextInput.value || "").trim(),
    blockPresentation: getSelectedPresentation(),
    blockOpacity: clampNumber(blockOpacityInput.value, 60, 100, 97),
    blockScrollLock: blockScrollLockInput.checked,
    blockPauseVideo: blockPauseVideoInput.checked,
    blockAllowContinue: blockAllowContinueInput.checked,
    blockContinueDelaySec: clampNumber(blockContinueDelaySecInput.value, 0, 60, 10),
    blockAutoDismissSec: clampNumber(blockAutoDismissSecInput.value, 0, 600, 0),
    allowKeywords, blockKeywords,
    aiPreFilterBlockKeywords: aiPreFilterBlockKeywordsInput.checked,
    aiApiUrl, aiModel, aiApiKey, aiPrompt,
    aiRequestTimeoutMs: clampNumber(aiRequestTimeoutMsInput.value, 3000, 30000, 12000),
    timeStrategyEnabled: timeStrategyEnabledInput.checked,
    timeRules,
    focusLockEnabled: focusLockEnabledInput.checked
  };

  const newPassword = String(newPasswordInput.value || "");
  const confirmPassword = String(confirmPasswordInput.value || "");
  if (newPassword || confirmPassword) {
    if (newPassword !== confirmPassword) return { error: "新密码与确认密码不一致" };
    if (newPassword.length < 4) return { error: "密码长度至少为4位" };
  }
  if (payload.focusLockEnabled && !currentSettings.focusLockHasPassword && !newPassword)
    return { error: "首次开启专注密码锁，请先设置新密码" };

  const auth = {};
  if (newPassword) auth.newPassword = newPassword;
  const unlockPassword = String(unlockPasswordInput.value || "").trim();
  if (unlockPassword) auth.unlockPassword = unlockPassword;

  return { payload, auth, mode, allowCount: allowKeywords.length, blockCount: blockKeywords.length };
}

function aiModeInUse(payload) {
  if (payload.mode === "ai") return true;
  return payload.timeRules.some(rule => rule.mode === "custom" && rule.overrides.decisionMode === "ai");
}

async function saveSettings() {
  const built = buildPayload();
  if (built.error) { showStatus(built.error); return; }

  let permissionWarning = "";
  if (built.payload.aiApiUrl) {
    const granted = await requestAiHostPermission(built.payload.aiApiUrl);
    if (!granted && aiModeInUse(built.payload)) {
      permissionWarning = "（未授权访问该 AI 接口域名，AI 判定会失败）";
    }
  }

  let response = await sendMessage({ type: "SET_SETTINGS", settings: built.payload, auth: built.auth });

  if (response && !response.ok && response.code === "PASSWORD_REQUIRED" && !built.auth.unlockPassword) {
    const password = window.prompt("该操作会降低专注度，请输入密码：") || "";
    if (!password) { showStatus("已取消输入密码"); return; }
    response = await sendMessage({ type: "SET_SETTINGS", settings: built.payload, auth: { ...built.auth, unlockPassword: password } });
  }

  if (!response || !response.ok) { showStatus(`保存失败：${response ? response.error : "未知错误"}`); return; }

  fillForm(response.settings);
  unlockPasswordInput.value = "";
  showStatus(`保存成功：${modeLabel(built.mode)}，学习词 ${built.allowCount} 个，屏蔽词 ${built.blockCount} 个${permissionWarning}`);
}

async function resetSettings() {
  if (!window.confirm("确定恢复默认规则？该操作可能降低专注度。")) return;

  let response = await sendMessage({ type: "RESET_SETTINGS", auth: { unlockPassword: String(unlockPasswordInput.value || "").trim() } });

  if (response && !response.ok && response.code === "PASSWORD_REQUIRED") {
    const password = window.prompt("重置会降低专注度，请输入密码：") || "";
    if (!password) { showStatus("已取消重置"); return; }
    response = await sendMessage({ type: "RESET_SETTINGS", auth: { unlockPassword: password } });
  }

  if (!response || !response.ok) { showStatus(`重置失败：${response ? response.error : "未知错误"}`); return; }

  fillForm(response.settings);
  unlockPasswordInput.value = "";
  showStatus("已恢复默认规则");
}

addTimeRuleButton.addEventListener("click", () => {
  if (!timeRulesContainer.querySelector(".time-rule")) timeRulesContainer.innerHTML = "";
  timeRulesContainer.appendChild(createRuleElement(createEmptyRule()));
});

saveButton.addEventListener("click", saveSettings);
resetButton.addEventListener("click", resetSettings);
loadSettings();

// ── Placeholder buttons ──

const PLACEHOLDER_DEFS = [
  { key: "title", label: "标题" }, { key: "partition", label: "分区" },
  { key: "tags", label: "标签" }, { key: "owner_name", label: "UP主" },
  { key: "description", label: "简介" }, { key: "duration", label: "时长" },
  { key: "bvid", label: "BV号" }, { key: "metadata_json", label: "完整元数据" }
];

(function initPlaceholderButtons() {
  const container = document.getElementById("placeholderButtons");
  if (!container) return;
  for (const def of PLACEHOLDER_DEFS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "placeholder-btn";
    btn.textContent = def.label;
    btn.dataset.placeholder = `{{${def.key}}}`;
    btn.addEventListener("click", () => {
      const textarea = aiPromptInput;
      if (!textarea) return;
      const ph = btn.dataset.placeholder;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, start) + ph + textarea.value.slice(end);
      textarea.setSelectionRange(start + ph.length, start + ph.length);
      textarea.focus();
    });
    container.appendChild(btn);
  }
})();

// ── Banner preview ──

if (blockBannerTextInput && bannerPreview) {
  blockBannerTextInput.addEventListener("input", () => {
    bannerPreview.textContent = blockBannerTextInput.value || "学习！";
  });
}
