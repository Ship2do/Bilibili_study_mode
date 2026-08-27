const HIDDEN_ATTR = "data-study-guard-hidden";
const HIDDEN_KEY_ATTR = "data-study-guard-video-key";
const HIDDEN_PREV_DISPLAY_ATTR = "data-study-guard-prev-display";

// 直播间的规范链接是 https://live.bilibili.com/<房间号>，路径里并没有 "/live/"，
// 因此必须单独匹配主机名，否则首页/推荐流里的直播卡片一个都收集不到。
const VIDEO_LINK_SELECTOR = "a[href*='/video/'], a[href*='live.bilibili.com'], a[href*='/live/']";

const CARD_CONTAINER_SELECTORS = [
  ".bili-video-card", ".bili-video-card__wrap", ".feed-card", ".floor-single-card",
  ".video-page-card-small", ".video-card", ".card-box", ".recommend-item", ".rec-item",
  ".bili-feed-card", ".vui_video_card", "li", "article"
];

function isOverlayElement(node) {
  return !!(node?.closest?.(`#${OVERLAY_ID}`));
}

function collectVideoGroups() {
  const links = document.querySelectorAll(VIDEO_LINK_SELECTOR);
  const groups = new Map();

  for (const link of links) {
    if (!(link instanceof HTMLElement) || isOverlayElement(link)) continue;
    const href = link.getAttribute("href") || link.href;
    if (!href) continue;

    const isLive = /live\.bilibili\.com/.test(href) || /\/live\/\d/.test(href);
    const videoId = isLive ? parseLiveRoomId(href) : parseVideoId(href);
    if (!videoId) continue;

    let group = groups.get(videoId.key);
    if (!group) {
      group = { videoId, links: [] };
      groups.set(videoId.key, group);
    }
    group.links.push(link);
  }

  return groups;
}

function countVideoLinks(element) {
  return element instanceof HTMLElement ? element.querySelectorAll(VIDEO_LINK_SELECTOR).length : 0;
}

function getContainerMeta(element) {
  if (!(element instanceof HTMLElement)) return null;
  if (element === document.body || element === document.documentElement) return null;

  const classOrId = `${element.className || ""} ${element.id || ""}`.toLowerCase();
  if (/header|footer|nav|menu|tab|toolbar|aside/.test(classOrId)) return null;

  const rect = element.getBoundingClientRect();
  if (rect.height < 36 || rect.width < 56) return null;
  if (rect.height > window.innerHeight * 0.98 && rect.width > window.innerWidth * 0.98) return null;

  const linkCount = countVideoLinks(element);
  if (linkCount < 1 || linkCount > 6) return null;

  return {
    linkCount, classOrId,
    hasMedia: !!element.querySelector("img, picture, video, canvas"),
    area: rect.width * rect.height
  };
}

function findCardContainer(link) {
  const candidates = [];

  for (const selector of CARD_CONTAINER_SELECTORS) {
    const node = link.closest(selector);
    if (!(node instanceof HTMLElement)) continue;
    const meta = getContainerMeta(node);
    if (meta) candidates.push({ node, meta, depth: 0 });
  }

  let current = link.parentElement;
  let depth = 1;
  while (current && current !== document.body && depth < 12) {
    const meta = getContainerMeta(current);
    if (meta) candidates.push({ node: current, meta, depth });
    current = current.parentElement;
    depth++;
  }

  if (candidates.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    let score = 0;
    if (c.meta.hasMedia) score += 4;
    if (/card|item|video|feed|recommend|result|search|matrix|list|grid/.test(c.meta.classOrId)) score += 3;
    score += Math.max(0, 4 - c.meta.linkCount);
    score -= c.depth * 0.2;
    if (score > bestScore) { best = c; bestScore = score; }
  }

  if (best && best.meta.linkCount > 3 && best.depth > 1) {
    const refined = candidates.find(c =>
      c.meta.linkCount <= 3 && (c.meta.hasMedia || /card|item|video|result/.test(c.meta.classOrId))
    );
    if (refined) return refined.node;
  }

  return best?.node || null;
}

function hideCardElement(element, videoKey) {
  if (!(element instanceof HTMLElement) || element.getAttribute(HIDDEN_ATTR) === "1") return;
  element.setAttribute(HIDDEN_ATTR, "1");
  element.setAttribute(HIDDEN_KEY_ATTR, videoKey);
  element.setAttribute(HIDDEN_PREV_DISPLAY_ATTR, element.style.display || "");
  element.style.display = "none";
  element.setAttribute("aria-hidden", "true");
}

function restoreHiddenCards() {
  for (const node of document.querySelectorAll(`[${HIDDEN_ATTR}='1']`)) {
    if (!(node instanceof HTMLElement)) continue;
    node.style.display = node.getAttribute(HIDDEN_PREV_DISPLAY_ATTR) || "";
    node.removeAttribute(HIDDEN_ATTR);
    node.removeAttribute(HIDDEN_KEY_ATTR);
    node.removeAttribute(HIDDEN_PREV_DISPLAY_ATTR);
    node.removeAttribute("aria-hidden");
  }
}
