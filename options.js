const DEFAULT_AI_PROMPT_TEMPLATE = [
  "标题为{{title}}的视频，分区是{{partition}}，标签是{{tags}}，请你判断是否为娱乐类视频。"
].join("\n");

const DEFAULT_ALLOW_KEYWORDS = [
  "学习", "知识", "科普", "课程", "公开课", "教育",
  "数学", "英语", "编程", "科学", "考研", "四六级"
];

const DEFAULT_BLOCK_KEYWORDS = [
  "游戏", "手游", "电竞", "娱乐", "搞笑", "鬼畜", "整活",
  "抽卡", "直播", "明星", "综艺", "追番", "番剧",
  "二次元", "舞蹈", "音乐", "vlog"
];

const DEFAULT_SETTINGS = {
  mode: "strong",
  actionBlockVideo: true,
  actionHideCover: false,
  blockBannerEnabled: true,
  blockBannerText: "学习！",
  allowKeywords: DEFAULT_ALLOW_KEYWORDS,
  blockKeywords: DEFAULT_BLOCK_KEYWORDS,
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
  focusLockHasPassword: false
};

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

let currentSettings = { ...DEFAULT_SETTINGS };

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
      <div class="item" style="grid-column: span 2;">
        <label class="label">时段策略</label>
        <select class="rule-mode">${ruleModeOptions}</select>
      </div>
    </div>
    <div class="custom-overrides" style="display: ${isCustom ? "block" : "none"};">
      <div class="grid2" style="margin-bottom: 8px;">
        <div class="item">
          <label class="label">判定模式</label>
          <select class="override-decision-mode">${decisionModeOptions}</select>
        </div>
      </div>
      <div class="row" style="margin-bottom: 6px; flex-wrap: wrap;">
        <label class="row" style="margin-right: 12px;">
          <input type="checkbox" class="override-action-block" ${actionBlockVideo ? "checked" : ""} /> 拦截视频
        </label>
        <label class="row" style="margin-right: 12px;">
          <input type="checkbox" class="override-action-hide" ${actionHideCover ? "checked" : ""} /> 隐藏封面
        </label>
        <label class="row">
          <input type="checkbox" class="override-ai-prefilter" ${aiPreFilterBlockKeywords ? "checked" : ""} /> AI先走屏蔽词过滤
        </label>
      </div>
      <p class="hint">自定义时段同样要求至少开启一个动作。</p>
    </div>
    <div class="item" style="margin-top: 10px;">
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
    overridesPanel.style.display = e.target.value === "custom" ? "block" : "none";
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
  const source = settings || DEFAULT_SETTINGS;
  currentSettings = { ...DEFAULT_SETTINGS, ...source };

  setSelectedMode(currentSettings.mode);
  actionBlockVideoInput.checked = currentSettings.actionBlockVideo !== false;
  actionHideCoverInput.checked = currentSettings.actionHideCover === true;
  autoNotInterestedEnabledInput.checked = currentSettings.autoNotInterestedEnabled === true;

  blockBannerEnabledInput.checked = currentSettings.blockBannerEnabled !== false;
  blockBannerTextInput.value = String(currentSettings.blockBannerText || "学习！");
  if (bannerPreview) bannerPreview.textContent = blockBannerTextInput.value || "学习！";

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
    mode, actionBlockVideo, actionHideCover,
    autoNotInterestedEnabled: autoNotInterestedEnabledInput.checked,
    blockBannerEnabled: blockBannerEnabledInput.checked,
    blockBannerText: String(blockBannerTextInput.value || "").trim() || "学习！",
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

async function saveSettings() {
  const built = buildPayload();
  if (built.error) { showStatus(built.error); return; }

  let response = await sendMessage({ type: "SET_SETTINGS", settings: built.payload, auth: built.auth });

  if (response && !response.ok && response.code === "PASSWORD_REQUIRED" && !built.auth.unlockPassword) {
    const password = window.prompt("该操作会降低专注度，请输入密码：") || "";
    if (!password) { showStatus("已取消输入密码"); return; }
    response = await sendMessage({ type: "SET_SETTINGS", settings: built.payload, auth: { ...built.auth, unlockPassword: password } });
  }

  if (!response || !response.ok) { showStatus(`保存失败：${response ? response.error : "未知错误"}`); return; }

  fillForm(response.settings);
  unlockPasswordInput.value = "";
  showStatus(`保存成功：${modeLabel(built.mode)}，学习词 ${built.allowCount} 个，屏蔽词 ${built.blockCount} 个`);
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
