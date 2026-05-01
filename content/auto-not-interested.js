function getElementText(element) {
  return String(element?.textContent || "").replace(/\s+/g, "").trim();
}

function isVisibleElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findNotInterestedTarget(root) {
  const scope = root instanceof HTMLElement || root instanceof Document ? root : document;
  for (const el of scope.querySelectorAll("button,li,a,span,div")) {
    if (el instanceof HTMLElement && isVisibleElement(el) && /不感兴趣|不喜欢|减少此类推荐|不想看|屏蔽此类/.test(getElementText(el))) {
      return el;
    }
  }
  return null;
}

function clickElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  try {
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
    element.click();
    return true;
  } catch (_e) { return false; }
}

function findMenuTrigger(root) {
  const scope = root instanceof HTMLElement ? root : document;
  for (const selector of [
    "button[aria-label*='更多']", "button[title*='更多']",
    "[class*='more'] button", "button[class*='more']",
    "[class*='menu'] button", "button[class*='menu']",
    "[class*='triple']", "[class*='dots']", "button"
  ]) {
    for (const el of scope.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement) || !isVisibleElement(el)) continue;
      const text = getElementText(el);
      const cls = `${el.className || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
      if (/更多|more|菜单|menu|三点|⋯|\.{3}/.test(text) || /more|menu|triple|dots|action/.test(cls)) {
        return el;
      }
    }
  }
  return null;
}

function scheduleNotInterestedAttempt(videoKey, root, state) {
  if (!state.settings.autoNotInterestedEnabled) return;
  if (!videoKey || state.notInterestedHandled.has(videoKey)) return;
  state.notInterestedHandled.add(videoKey);

  for (const delay of [120, 520, 1400]) {
    setTimeout(() => {
      const target = findNotInterestedTarget(root || document);
      if (target && clickElement(target)) return;

      const trigger = findMenuTrigger(root || document);
      if (trigger) clickElement(trigger);

      setTimeout(() => {
        const globalTarget = findNotInterestedTarget(document);
        if (globalTarget) clickElement(globalTarget);
      }, 220);
    }, delay);
  }
}
