const DEFAULT_ALLOW_KEYWORDS = [
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
];

const DEFAULT_BLOCK_KEYWORDS = [
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
];

const DEFAULT_SETTINGS = {
  enabled: true,
  fallbackToMeta: true,
  allowKeywords: DEFAULT_ALLOW_KEYWORDS,
  blockKeywords: DEFAULT_BLOCK_KEYWORDS,
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
  focusLockHasPassword: false
};

const DAY_OPTIONS = [
  { value: 0, label: "周日" },
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" }
];

const MODE_OPTIONS = [
  { value: "normal", label: "普通模式（按全局规则）" },
  { value: "strict", label: "严格模式（自动加严判定）" },
  { value: "custom", label: "自定义模式（独立配置）" },
  { value: "block_all", label: "完全禁止访问" }
];

const enabledInput = document.getElementById("enabled");
const fallbackToMetaInput = document.getElementById("fallbackToMeta");
const hideBlockedCoversInput = document.getElementById("hideBlockedCovers");
const allowKeywordsInput = document.getElementById("allowKeywords");
const blockKeywordsInput = document.getElementById("blockKeywords");
const autoNotInterestedEnabledInput = document.getElementById("autoNotInterestedEnabled");

const aiEnabledInput = document.getElementById("aiEnabled");
const aiOnlyWhenNoTagInput = document.getElementById("aiOnlyWhenNoTag");
const aiBlockEnabledInput = document.getElementById("aiBlockEnabled");
const aiHideEnabledInput = document.getElementById("aiHideEnabled");
const aiApiUrlInput = document.getElementById("aiApiUrl");
const aiModelInput = document.getElementById("aiModel");
const aiApiKeyInput = document.getElementById("aiApiKey");
const aiRequestTimeoutMsInput = document.getElementById("aiRequestTimeoutMs");

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

function showStatus(text) {
  statusEl.textContent = text;
}

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

function uniqueKeywords(raw) {
  const parts = String(raw || "")
    .split(/[\n,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

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
    return text;
  }
  return fallback;
}

function randomRuleId() {
  return `rule_${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyRule() {
  return {
    id: randomRuleId(),
    name: "新规则",
    enabled: true,
    days: [1, 2, 3, 4, 5],
    start: "09:00",
    end: "18:00",
    mode: "normal",
    overrides: {
      enabled: true,
      hideBlockedCovers: false,
      fallbackToMeta: true,
      aiBlockEnabled: true,
      aiHideEnabled: false
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

  const modeValue = String(rule.mode || "normal");
  const modeOptions = MODE_OPTIONS.map((item) => {
    const selected = item.value === modeValue ? "selected" : "";
    return `<option value="${item.value}" ${selected}>${item.label}</option>`;
  }).join("");

  const overrides = rule.overrides || {};
  const isCustom = modeValue === "custom";

  wrapper.innerHTML = `
    <div class="grid3">
      <div class="item">
        <label class="label">规则名称</label>
        <input type="text" class="rule-name" value="${String(rule.name || "").replace(/"/g, "&quot;")}" />
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
        <select class="rule-mode">${modeOptions}</select>
      </div>
    </div>
    <div class="custom-overrides" style="display: ${isCustom ? 'block' : 'none'}; border-top: 1px dashed #d8e2f7; padding-top: 10px; margin-top: 10px;">
      <label class="label">自定义策略：</label>
      <div class="row" style="margin-bottom: 6px;">
        <label class="row" style="margin-right:12px;"><input type="checkbox" class="override-enabled" ${overrides.enabled !== false ? "checked" : ""} />启用视频拦截</label>
        <label class="row" style="margin-right:12px;"><input type="checkbox" class="override-hide-covers" ${overrides.hideBlockedCovers === true ? "checked" : ""} />隐藏被拦截封面</label>
        <label class="row"><input type="checkbox" class="override-fallback-meta" ${overrides.fallbackToMeta !== false ? "checked" : ""} />无标签时标题分区兜底</label>
      </div>
      <div class="row">
        <label class="row" style="margin-right:12px;"><input type="checkbox" class="override-ai-block" ${overrides.aiBlockEnabled !== false ? "checked" : ""} />AI鉴娱后拦截</label>
        <label class="row"><input type="checkbox" class="override-ai-hide" ${overrides.aiHideEnabled === true ? "checked" : ""} />AI鉴娱后隐藏封面</label>
      </div>
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
      if (timeRulesContainer.children.length === 0) {
        renderTimeRules([]);
      }
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

  for (const rule of list) {
    timeRulesContainer.appendChild(createRuleElement(rule));
  }
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
    const mode = String(card.querySelector(".rule-mode")?.value || "normal");
    const days = Array.from(card.querySelectorAll(".rule-day"))
      .filter((input) => input.checked)
      .map((input) => Number(input.dataset.day))
      .filter((num) => Number.isInteger(num) && num >= 0 && num <= 6);

    const overrides = {
      enabled: card.querySelector(".override-enabled")?.checked !== false,
      hideBlockedCovers: card.querySelector(".override-hide-covers")?.checked === true,
      fallbackToMeta: card.querySelector(".override-fallback-meta")?.checked !== false,
      aiBlockEnabled: card.querySelector(".override-ai-block")?.checked !== false,
      aiHideEnabled: card.querySelector(".override-ai-hide")?.checked === true
    };

    if (days.length === 0) {
      continue;
    }

    rules.push({
      id,
      name,
      enabled,
      start,
      end,
      mode: mode,
      overrides,
      days: Array.from(new Set(days)).sort((a, b) => a - b)
    });
  }

  return rules;
}

function fillForm(settings) {
  const source = settings || DEFAULT_SETTINGS;
  currentSettings = { ...DEFAULT_SETTINGS, ...source };

  enabledInput.checked = currentSettings.enabled !== false;
  fallbackToMetaInput.checked = currentSettings.fallbackToMeta !== false;
  hideBlockedCoversInput.checked = currentSettings.hideBlockedCovers === true;
  autoNotInterestedEnabledInput.checked = currentSettings.autoNotInterestedEnabled === true;
  allowKeywordsInput.value = (currentSettings.allowKeywords || []).join("\n");
  blockKeywordsInput.value = (currentSettings.blockKeywords || []).join("\n");

  aiEnabledInput.checked = currentSettings.aiEnabled === true;
  aiOnlyWhenNoTagInput.checked = currentSettings.aiOnlyWhenNoTag !== false;
  aiBlockEnabledInput.checked = currentSettings.aiBlockEnabled !== false;
  aiHideEnabledInput.checked = currentSettings.aiHideEnabled === true;
  aiApiUrlInput.value = String(currentSettings.aiApiUrl || "");
  aiModelInput.value = String(currentSettings.aiModel || "");
  aiApiKeyInput.value = String(currentSettings.aiApiKey || "");
  aiRequestTimeoutMsInput.value = String(
    clampNumber(currentSettings.aiRequestTimeoutMs, 3000, 30000, 12000)
  );

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

function buildPayload() {
  const allowKeywords = uniqueKeywords(allowKeywordsInput.value);
  const blockKeywords = uniqueKeywords(blockKeywordsInput.value);
  const timeRules = readTimeRulesFromDom();

  if (allowKeywords.length === 0) {
    return { error: "请至少填写一个学习关键词" };
  }

  const payload = {
    enabled: enabledInput.checked,
    fallbackToMeta: fallbackToMetaInput.checked,
    hideBlockedCovers: hideBlockedCoversInput.checked,
    autoNotInterestedEnabled: autoNotInterestedEnabledInput.checked,
    allowKeywords,
    blockKeywords,

    aiEnabled: aiEnabledInput.checked,
    aiOnlyWhenNoTag: aiOnlyWhenNoTagInput.checked,
    aiBlockEnabled: aiBlockEnabledInput.checked,
    aiHideEnabled: aiHideEnabledInput.checked,
    aiApiUrl: aiApiUrlInput.value.trim(),
    aiModel: aiModelInput.value.trim(),
    aiApiKey: aiApiKeyInput.value.trim(),
    aiRequestTimeoutMs: clampNumber(aiRequestTimeoutMsInput.value, 3000, 30000, 12000),

    timeStrategyEnabled: timeStrategyEnabledInput.checked,
    timeRules,

    focusLockEnabled: focusLockEnabledInput.checked
  };

  if (payload.timeStrategyEnabled && payload.timeRules.length === 0) {
    return { error: "启用时段策略后，请至少添加一条时段规则" };
  }

  if (payload.aiEnabled) {
    if (!payload.aiApiUrl || !payload.aiModel || !payload.aiApiKey) {
      return { error: "启用AI时，请填写 API URL、Model、API Key" };
    }
    if (!payload.aiBlockEnabled && !payload.aiHideEnabled) {
      return { error: "启用AI后，请至少开启一个动作：拦截或隐藏封面" };
    }
    if (payload.aiHideEnabled && !payload.hideBlockedCovers) {
      return { error: "开启AI封面隐藏前，请先开启“封面隐藏”" };
    }
  }

  const newPassword = String(newPasswordInput.value || "");
  const confirmPassword = String(confirmPasswordInput.value || "");
  if (newPassword || confirmPassword) {
    if (newPassword !== confirmPassword) {
      return { error: "新密码与确认密码不一致" };
    }
    if (newPassword.length < 4) {
      return { error: "密码长度至少为4位" };
    }
  }

  if (payload.focusLockEnabled && !currentSettings.focusLockHasPassword && !newPassword) {
    return { error: "首次开启专注密码锁，请先设置新密码" };
  }

  const auth = {};
  if (newPassword) {
    auth.newPassword = newPassword;
  }
  const unlockPassword = String(unlockPasswordInput.value || "").trim();
  if (unlockPassword) {
    auth.unlockPassword = unlockPassword;
  }

  return {
    payload,
    auth,
    allowCount: allowKeywords.length,
    blockCount: blockKeywords.length
  };
}

async function saveSettings() {
  const built = buildPayload();
  if (built.error) {
    showStatus(built.error);
    return;
  }

  let response = await sendMessage({
    type: "SET_SETTINGS",
    settings: built.payload,
    auth: built.auth
  });

  if (response && !response.ok && response.code === "PASSWORD_REQUIRED" && !built.auth.unlockPassword) {
    const password = window.prompt("该操作会降低专注度，请输入密码：") || "";
    if (!password) {
      showStatus("已取消输入密码");
      return;
    }
    response = await sendMessage({
      type: "SET_SETTINGS",
      settings: built.payload,
      auth: {
        ...built.auth,
        unlockPassword: password
      }
    });
  }

  if (!response || !response.ok) {
    showStatus(`保存失败：${response ? response.error : "未知错误"}`);
    return;
  }

  fillForm(response.settings);
  unlockPasswordInput.value = "";
  showStatus(`保存成功：学习词 ${built.allowCount} 个，屏蔽词 ${built.blockCount} 个`);
}

async function resetSettings() {
  const confirmed = window.confirm("确定恢复默认规则？该操作可能降低专注度。");
  if (!confirmed) {
    return;
  }

  let response = await sendMessage({
    type: "RESET_SETTINGS",
    auth: { unlockPassword: String(unlockPasswordInput.value || "").trim() }
  });

  if (response && !response.ok && response.code === "PASSWORD_REQUIRED") {
    const password = window.prompt("重置会降低专注度，请输入密码：") || "";
    if (!password) {
      showStatus("已取消重置");
      return;
    }
    response = await sendMessage({
      type: "RESET_SETTINGS",
      auth: { unlockPassword: password }
    });
  }

  if (!response || !response.ok) {
    showStatus(`重置失败：${response ? response.error : "未知错误"}`);
    return;
  }

  fillForm(response.settings);
  unlockPasswordInput.value = "";
  showStatus("已恢复默认规则");
}

addTimeRuleButton.addEventListener("click", () => {
  const hasPlaceholder = !timeRulesContainer.querySelector(".time-rule");
  if (hasPlaceholder) {
    timeRulesContainer.innerHTML = "";
  }
  timeRulesContainer.appendChild(createRuleElement(createEmptyRule()));
});

saveButton.addEventListener("click", saveSettings);
resetButton.addEventListener("click", resetSettings);
loadSettings();
