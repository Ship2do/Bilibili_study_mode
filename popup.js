const statusEl = document.getElementById("status");
const openOptionsButton = document.getElementById("openOptions");
const resetButton = document.getElementById("reset");
const toggles = Array.from(document.querySelectorAll("input[type='checkbox'][data-key]"));

let currentSettings = null;

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

function applySettingsToView(settings) {
  currentSettings = settings;
  for (const input of toggles) {
    const key = input.dataset.key;
    input.checked = !!(settings && settings[key] === true);
  }
}

async function loadSettings() {
  const response = await sendMessage({ type: "GET_SETTINGS" });
  if (!response || !response.ok) {
    showStatus(`读取失败：${response ? response.error : "未知错误"}`);
    return;
  }
  applySettingsToView(response.settings);
  showStatus("设置已加载");
}

async function savePatch(patch, previousSettings) {
  let response = await sendMessage({
    type: "SET_SETTINGS",
    settings: patch
  });

  if (response && !response.ok && response.code === "PASSWORD_REQUIRED") {
    const password = window.prompt("该操作会降低专注度，请输入密码：") || "";
    if (!password) {
      return { ok: false, error: "已取消输入密码", cancelled: true };
    }
    response = await sendMessage({
      type: "SET_SETTINGS",
      settings: patch,
      auth: { unlockPassword: password }
    });
  }

  if (response && !response.ok && response.code === "PASSWORD_SETUP_REQUIRED") {
    return {
      ok: false,
      error: "请先在“详细设置”里设置密码，再开启专注密码锁"
    };
  }

  if (!response || !response.ok) {
    const message = response ? response.error : "未知错误";
    return { ok: false, error: message };
  }

  const nextSettings = response.settings || previousSettings;
  applySettingsToView(nextSettings);
  return { ok: true };
}

for (const input of toggles) {
  input.addEventListener("change", async () => {
    if (!currentSettings) {
      input.checked = false;
      return;
    }

    const key = input.dataset.key;
    const previousValue = !!currentSettings[key];
    const nextValue = input.checked === true;
    if (previousValue === nextValue) {
      return;
    }

    const previousSettings = { ...currentSettings };
    const result = await savePatch({ [key]: nextValue }, previousSettings);
    if (!result.ok) {
      applySettingsToView(previousSettings);
      showStatus(result.error || "保存失败");
      return;
    }
    showStatus("已保存");
  });
}

openOptionsButton.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
});

resetButton.addEventListener("click", async () => {
  const confirmed = window.confirm("确定要恢复默认规则吗？");
  if (!confirmed) {
    return;
  }

  let response = await sendMessage({ type: "RESET_SETTINGS" });
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
  applySettingsToView(response.settings);
  showStatus("已恢复默认规则");
});

loadSettings();
