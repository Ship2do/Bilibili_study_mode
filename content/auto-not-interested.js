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

const NOT_INTERESTED_TEXT = /不感兴趣|不喜欢|减少此类推荐|不想看|屏蔽此类/;
// 菜单项文案都很短；超出此长度的多半是把整段卡片文本一起算进来的外层容器。
const NOT_INTERESTED_MAX_TEXT_LENGTH = 24;

// querySelectorAll 按文档顺序返回（祖先在后代之前），而 textContent 含全部子孙文本，
// 直接取第一个命中的元素会点到最外层卡片容器（可能直接跳进该视频）。
// 这里改为取最内层命中元素：它不再包含其它命中元素。
function findNotInterestedTarget(root) {
  const scope = root instanceof HTMLElement || root instanceof Document ? root : document;
  const matches = [];
  for (const el of scope.querySelectorAll("button,li,a,span,div")) {
    if (!(el instanceof HTMLElement) || isOverlayElement(el) || !isVisibleElement(el)) continue;
    const text = getElementText(el);
    if (text.length > NOT_INTERESTED_MAX_TEXT_LENGTH || !NOT_INTERESTED_TEXT.test(text)) continue;
    matches.push(el);
  }
  return matches.find(el => !matches.some(other => other !== el && el.contains(other))) || null;
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
      if (!(el instanceof HTMLElement) || isOverlayElement(el) || !isVisibleElement(el)) continue;
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
