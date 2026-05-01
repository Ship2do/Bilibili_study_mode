(function initStudyGuard() {
  const OVERLAY_ID = "__study_guard_overlay__";
  const HIDDEN_ATTR = "data-study-guard-hidden";
  const HIDDEN_KEY_ATTR = "data-study-guard-video-key";
  const HIDDEN_PREV_DISPLAY_ATTR = "data-study-guard-prev-display";
  const CARD_CONTAINER_SELECTORS = [
    ".bili-video-card",
    ".bili-video-card__wrap",
    ".feed-card",
    ".floor-single-card",
    ".video-page-card-small",
    ".video-card",
    ".card-box",
    ".recommend-item",
    ".rec-item",
    ".bili-feed-card",
    ".vui_video_card",
    "li",
    "article"
  ];

  const STATE = {
    lastHref: location.href,
    lastVideoKey: "",
    requestId: 0,
    blocked: false,
    pauseTimer: null,
    htmlOverflow: "",
    bodyOverflow: "",
    cardScanTimer: null,
    cardScanRunning: false,
    cardScanQueued: false,
    cardObserver: null,
    decisionCache: new Map(),
    settings: {
      actionHideCover: false,
      autoNotInterestedEnabled: false
    },
    notInterestedHandled: new Set()
  };

  function emptyDecision(reason) {
    return {
      allowed: false,
      hideCard: false,
      reason: reason || "未收到校验结果",
      matchedKeywords: [],
      matchedAllowKeywords: [],
      matchedBlockKeywords: [],
      metadata: { title: "", tname: "", tags: [] }
    };
  }

  function normalizeDecision(result) {
    const source = result && typeof result === "object" ? result : emptyDecision();
    const matchedAllowKeywords = Array.isArray(source.matchedAllowKeywords)
      ? source.matchedAllowKeywords
      : [];
    const matchedBlockKeywords = Array.isArray(source.matchedBlockKeywords)
      ? source.matchedBlockKeywords
      : [];
    return {
      allowed: source.allowed === true,
      hideCard: source.hideCard === true,
      reason: String(source.reason || ""),
      blockedBy: String(source.blockedBy || ""),
      mode: String(source.mode || ""),
      matchedKeywords: Array.isArray(source.matchedKeywords)
        ? source.matchedKeywords
        : source.allowed
          ? matchedAllowKeywords
          : matchedBlockKeywords,
      matchedAllowKeywords,
      matchedBlockKeywords,
      metadata:
        source.metadata && typeof source.metadata === "object"
          ? source.metadata
          : { title: "", tname: "", tags: [] }
    };
  }

  function parseVideoId(urlText) {
    let url;
    try {
      url = new URL(urlText, location.origin);
    } catch (_error) {
      return null;
    }

    const bvMatch = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/);
    if (bvMatch) {
      const bvid = bvMatch[1];
      return { bvid, key: `bvid:${bvid}` };
    }

    const avMatch = url.pathname.match(/\/video\/av(\d+)/i);
    if (avMatch) {
      const aid = avMatch[1];
      return { aid, key: `aid:${aid}` };
    }

    const queryBvid = url.searchParams.get("bvid");
    if (queryBvid && /^BV[0-9A-Za-z]+$/.test(queryBvid)) {
      return { bvid: queryBvid, key: `bvid:${queryBvid}` };
    }

    const queryAid = url.searchParams.get("aid");
    if (queryAid && /^\d+$/.test(queryAid)) {
      return { aid: queryAid, key: `aid:${queryAid}` };
    }

    return null;
  }

  function parseLiveRoomId(urlText) {
    let url;
    try {
      url = new URL(urlText, location.origin);
    } catch (_error) {
      return null;
    }

    const isLiveHost = url.hostname === "live.bilibili.com";
    const isLivePath = /\/live\/(\d+)/.test(url.pathname);

    if (!isLiveHost && !isLivePath) {
      return null;
    }

    const match = url.pathname.match(/\/(\d+)(?:\/|$|\?)/);
    if (!match) {
      return null;
    }

    const rid = match[1];
    return { rid, key: `room:${rid}`, type: "live" };
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            allowed: false,
            reason: `扩展通信失败：${chrome.runtime.lastError.message}`,
            matchedKeywords: [],
            matchedAllowKeywords: [],
            matchedBlockKeywords: [],
            metadata: { title: "", tname: "", tags: [] }
          });
          return;
        }
        resolve(response);
      });
    });
  }

  async function refreshRuntimeSettings() {
    const response = await sendMessage({ type: "GET_SETTINGS" });
    if (response && response.ok && response.settings && typeof response.settings === "object") {
      STATE.settings = {
        ...STATE.settings,
        actionHideCover: response.settings.actionHideCover === true,
        autoNotInterestedEnabled: response.settings.autoNotInterestedEnabled === true
      };
      return;
    }
    STATE.settings = {
      ...STATE.settings,
      actionHideCover: false,
      autoNotInterestedEnabled: false
    };
  }

  function isCoverHidingEnabled() {
    return STATE.settings && STATE.settings.actionHideCover === true;
  }

  function isAutoNotInterestedEnabled() {
    return STATE.settings && STATE.settings.autoNotInterestedEnabled === true;
  }

  async function checkSingleVideo(videoId, context) {
    const response = await sendMessage({
      type: "CHECK_VIDEO",
      videoId,
      context: context || "page"
    });
    return normalizeDecision(response);
  }

  async function checkVideosInBatch(videoIds) {
    const list = Array.isArray(videoIds) ? videoIds : [];
    if (list.length === 0) {
      return {};
    }

    const response = await sendMessage({
      type: "BATCH_CHECK_VIDEOS",
      videoIds: list,
      context: "card"
    });

    if (response && response.ok && response.results && typeof response.results === "object") {
      const normalized = {};
      for (const videoId of list) {
        if (!videoId || !videoId.key) {
          continue;
        }
        normalized[videoId.key] = normalizeDecision(response.results[videoId.key]);
      }
      return normalized;
    }

    const fallbackResults = {};
    const pairs = await Promise.all(
      list.map(async (videoId) => [videoId.key, await checkSingleVideo(videoId, "card")])
    );
    for (const [key, decision] of pairs) {
      fallbackResults[key] = decision;
    }
    return fallbackResults;
  }

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      return overlay;
    }

    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(11, 14, 24, 0.96)";
    overlay.style.fontFamily =
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    overlay.style.color = "#f6f9ff";

    const panel = document.createElement("div");
    panel.style.width = "min(760px, 92vw)";
    panel.style.background = "#111829";
    panel.style.border = "1px solid #27314a";
    panel.style.borderRadius = "8px";
    panel.style.padding = "24px";
    panel.style.boxSizing = "border-box";
    panel.style.boxShadow = "0 24px 56px rgba(0, 0, 0, 0.45)";

    const title = document.createElement("h1");
    title.textContent = "该视频已被学习模式拦截";
    title.style.margin = "0 0 12px";
    title.style.fontSize = "24px";
    title.style.fontWeight = "700";
    title.style.lineHeight = "1.35";

    const reason = document.createElement("p");
    reason.className = "sg-reason";
    reason.style.margin = "0 0 10px";
    reason.style.color = "#ced9ee";
    reason.style.fontSize = "15px";
    reason.style.lineHeight = "1.65";

    const videoInfo = document.createElement("p");
    videoInfo.className = "sg-video-info";
    videoInfo.style.margin = "0 0 18px";
    videoInfo.style.color = "#9fb0d4";
    videoInfo.style.fontSize = "14px";
    videoInfo.style.lineHeight = "1.7";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.flexWrap = "wrap";
    actions.style.gap = "10px";

    const homeButton = document.createElement("button");
    homeButton.type = "button";
    homeButton.textContent = "返回B站首页";
    homeButton.style.border = "0";
    homeButton.style.borderRadius = "6px";
    homeButton.style.padding = "10px 16px";
    homeButton.style.background = "#4c8dff";
    homeButton.style.color = "#fff";
    homeButton.style.fontSize = "14px";
    homeButton.style.fontWeight = "600";
    homeButton.style.cursor = "pointer";

    const optionsButton = document.createElement("button");
    optionsButton.type = "button";
    optionsButton.textContent = "调整规则";
    optionsButton.style.border = "1px solid #31405f";
    optionsButton.style.borderRadius = "6px";
    optionsButton.style.padding = "10px 16px";
    optionsButton.style.background = "#1c2740";
    optionsButton.style.color = "#d7e4ff";
    optionsButton.style.fontSize = "14px";
    optionsButton.style.fontWeight = "600";
    optionsButton.style.cursor = "pointer";

    homeButton.addEventListener("click", () => {
      location.href = "https://www.bilibili.com/";
    });

    optionsButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
    });

    actions.append(homeButton, optionsButton);
    panel.append(title, reason, videoInfo, actions);
    overlay.append(panel);

    const parent = document.documentElement || document.body;
    if (parent) {
      parent.appendChild(overlay);
    }

    return overlay;
  }

  function pauseAllVideos() {
    const videos = document.querySelectorAll("video");
    for (const video of videos) {
      if (!video.paused) {
        video.pause();
      }
    }
  }

  function setScrollLocked(locked) {
    if (!document.documentElement || !document.body) {
      return;
    }

    if (locked) {
      if (!STATE.blocked) {
        STATE.htmlOverflow = document.documentElement.style.overflow;
        STATE.bodyOverflow = document.body.style.overflow;
      }
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      return;
    }

    document.documentElement.style.overflow = STATE.htmlOverflow;
    document.body.style.overflow = STATE.bodyOverflow;
  }

  function getBlockReasonText(result) {
    const mode = result.mode || "";
    const blockedBy = result.blockedBy || "";
    const reason = result.reason || "";

    if (mode === "weak") {
      return "命中屏蔽词";
    }
    if (mode === "strong") {
      return "未命中学习词";
    }
    if (mode === "ai") {
      return reason || "AI判定为非学习向";
    }
    return reason || "该视频未通过学习模式规则";
  }

  function getModeLabel(mode) {
    if (mode === "weak") return "弱模式";
    if (mode === "strong") return "强模式";
    if (mode === "ai") return "AI模式";
    return "学习模式";
  }

  function blockPage(rawResult) {
    const result = normalizeDecision(rawResult);
    const overlay = ensureOverlay();
    if (!overlay) {
      return;
    }

    const titleEl = overlay.querySelector("h1");
    const reasonEl = overlay.querySelector(".sg-reason");
    const videoInfoEl = overlay.querySelector(".sg-video-info");
    const metadata = result.metadata || {};

    if (titleEl) {
      titleEl.textContent = getModeLabel(result.mode);
    }
    if (reasonEl) {
      reasonEl.textContent = `原因：${getBlockReasonText(result)}`;
    }
    if (videoInfoEl) {
      const title = metadata.title || "未知";
      const tname = metadata.tname || "未知";
      videoInfoEl.textContent = `标题：${title} | 分区：${tname}`;
    }

    overlay.style.display = "flex";
    setScrollLocked(true);
    pauseAllVideos();

    const videoKey = deriveVideoKey(result, STATE.lastVideoKey);
    scheduleNotInterestedAttempt(videoKey, document);

    if (STATE.pauseTimer) {
      clearInterval(STATE.pauseTimer);
    }
    STATE.pauseTimer = setInterval(pauseAllVideos, 700);
    STATE.blocked = true;
  }

  function unblockPage() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.style.display = "none";
    }
    if (STATE.pauseTimer) {
      clearInterval(STATE.pauseTimer);
      STATE.pauseTimer = null;
    }
    setScrollLocked(false);
    STATE.blocked = false;
  }

  async function fetchVideoMetadataForPage(videoId) {
    const response = await sendMessage({
      type: "CHECK_VIDEO",
      videoId,
      context: "page"
    });
    return normalizeDecision(response);
  }

  async function evaluateCurrentPage() {
    const videoId = parseVideoId(location.href);
    const liveId = !videoId ? parseLiveRoomId(location.href) : null;
    const currentId = videoId || liveId;

    if (!currentId) {
      STATE.lastHref = location.href;
      STATE.lastVideoKey = "";
      unblockPage();
      return;
    }

    if (STATE.lastVideoKey === currentId.key && STATE.lastHref === location.href) {
      return;
    }

    STATE.lastVideoKey = currentId.key;
    STATE.lastHref = location.href;
    const requestId = ++STATE.requestId;
    const result = await checkSingleVideo(currentId, "page");

    if (requestId !== STATE.requestId) {
      return;
    }

    if (result.allowed) {
      unblockPage();
      return;
    }

    blockPage(result);
  }

  function isOverlayElement(node) {
    return !!(node && node.closest && node.closest(`#${OVERLAY_ID}`));
  }

  function collectVideoGroups() {
    const links = document.querySelectorAll("a[href*='/video/'], a[href*='/live/']");
    const groups = new Map();

    for (const link of links) {
      if (!(link instanceof HTMLElement)) {
        continue;
      }
      if (isOverlayElement(link)) {
        continue;
      }
      const href = link.getAttribute("href") || link.href;
      if (!href) {
        continue;
      }

      const isLiveLink = /live\.bilibili\.com/.test(href) || /\/live\//.test(href);
      const videoId = isLiveLink ? parseLiveRoomId(href) : parseVideoId(href);
      if (!videoId) {
        continue;
      }

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
    if (!(element instanceof HTMLElement)) {
      return 0;
    }
    return element.querySelectorAll("a[href*='/video/'], a[href*='/live/']").length;
  }

  function getContainerMeta(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }
    if (element === document.body || element === document.documentElement) {
      return null;
    }

    const classOrId = `${element.className || ""} ${element.id || ""}`.toLowerCase();
    if (/header|footer|nav|menu|tab|toolbar|aside/.test(classOrId)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    if (rect.height < 36 || rect.width < 56) {
      return null;
    }
    if (rect.height > window.innerHeight * 0.98 && rect.width > window.innerWidth * 0.98) {
      return null;
    }

    const linkCount = countVideoLinks(element);
    if (linkCount < 1 || linkCount > 6) {
      return null;
    }

    return {
      linkCount,
      classOrId,
      hasMedia: !!element.querySelector("img, picture, video, canvas"),
      area: rect.width * rect.height
    };
  }

  function scoreContainer(meta, depth) {
    let score = 0;
    if (meta.hasMedia) {
      score += 4;
    }
    if (/card|item|video|feed|recommend|result|search|matrix|list|grid/.test(meta.classOrId)) {
      score += 3;
    }
    score += Math.max(0, 4 - meta.linkCount);
    score -= depth * 0.2;
    return score;
  }

  function findCardContainer(link) {
    const candidates = [];

    for (const selector of CARD_CONTAINER_SELECTORS) {
      const node = link.closest(selector);
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const meta = getContainerMeta(node);
      if (!meta) {
        continue;
      }
      candidates.push({ node, meta, depth: 0 });
    }

    let current = link.parentElement;
    let depth = 1;
    while (current && current !== document.body && depth < 12) {
      const meta = getContainerMeta(current);
      if (meta) {
        candidates.push({ node: current, meta, depth });
      }
      current = current.parentElement;
      depth += 1;
    }

    if (candidates.length === 0) {
      return null;
    }

    let best = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const score = scoreContainer(candidate.meta, candidate.depth);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    if (!best) {
      return null;
    }

    // 避免把整块大容器（如整个推荐区）误认为单个卡片容器
    if (best.meta.linkCount > 3 && best.depth > 1) {
      const refined = candidates.find(
        (candidate) =>
          candidate.meta.linkCount <= 3 &&
          (candidate.meta.hasMedia || /card|item|video|result/.test(candidate.meta.classOrId))
      );
      if (refined) {
        return refined.node;
      }
    }

    return best.node;
  }

  function hideCardElement(element, videoKey) {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    if (element.getAttribute(HIDDEN_ATTR) === "1") {
      return;
    }
    element.setAttribute(HIDDEN_ATTR, "1");
    element.setAttribute(HIDDEN_KEY_ATTR, videoKey);
    element.setAttribute(HIDDEN_PREV_DISPLAY_ATTR, element.style.display || "");
    element.style.display = "none";
    element.setAttribute("aria-hidden", "true");
  }

  function restoreHiddenCards() {
    const hiddenNodes = document.querySelectorAll(`[${HIDDEN_ATTR}='1']`);
    for (const node of hiddenNodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const prevDisplay = node.getAttribute(HIDDEN_PREV_DISPLAY_ATTR) || "";
      node.style.display = prevDisplay;
      node.removeAttribute(HIDDEN_ATTR);
      node.removeAttribute(HIDDEN_KEY_ATTR);
      node.removeAttribute(HIDDEN_PREV_DISPLAY_ATTR);
      node.removeAttribute("aria-hidden");
    }
  }

  function isVisibleElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getElementText(element) {
    return String((element && element.textContent) || "")
      .replace(/\s+/g, "")
      .trim();
  }

  function looksLikeNotInterestedText(text) {
    if (!text) {
      return false;
    }
    return /不感兴趣|不喜欢|减少此类推荐|不想看|屏蔽此类/.test(text);
  }

  function findNotInterestedTarget(root) {
    const scope = root instanceof HTMLElement || root instanceof Document ? root : document;
    const candidates = scope.querySelectorAll("button,li,a,span,div");
    for (const element of candidates) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      if (!isVisibleElement(element)) {
        continue;
      }
      const text = getElementText(element);
      if (!looksLikeNotInterestedText(text)) {
        continue;
      }
      return element;
    }
    return null;
  }

  function clickElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    try {
      element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
      element.click();
      return true;
    } catch (_error) {
      return false;
    }
  }

  function findMenuTrigger(root) {
    const scope = root instanceof HTMLElement ? root : document;
    const selectors = [
      "button[aria-label*='更多']",
      "button[title*='更多']",
      "[class*='more'] button",
      "button[class*='more']",
      "[class*='menu'] button",
      "button[class*='menu']",
      "[class*='triple']",
      "[class*='dots']",
      "button"
    ];

    for (const selector of selectors) {
      const candidates = scope.querySelectorAll(selector);
      for (const element of candidates) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        if (!isVisibleElement(element)) {
          continue;
        }
        const text = getElementText(element);
        const classText = `${element.className || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase();
        const isLikely =
          /更多|more|菜单|menu|三点|⋯|\.{3}/.test(text) ||
          /more|menu|triple|dots|action/.test(classText);
        if (isLikely) {
          return element;
        }
      }
    }
    return null;
  }

  function deriveVideoKey(decision, fallback) {
    const metadata = decision && decision.metadata ? decision.metadata : {};
    if (metadata && metadata.bvid) {
      return `bvid:${metadata.bvid}`;
    }
    if (metadata && metadata.aid) {
      return `aid:${metadata.aid}`;
    }
    if (metadata && metadata.rid) {
      return `room:${metadata.rid}`;
    }
    if (fallback) {
      return String(fallback);
    }
    return "";
  }

  function scheduleNotInterestedAttempt(videoKey, root) {
    if (!isAutoNotInterestedEnabled()) {
      return;
    }
    if (!videoKey || STATE.notInterestedHandled.has(videoKey)) {
      return;
    }
    STATE.notInterestedHandled.add(videoKey);

    const tries = [120, 520, 1400];
    for (const delay of tries) {
      setTimeout(() => {
        const directTarget = findNotInterestedTarget(root || document);
        if (directTarget && clickElement(directTarget)) {
          return;
        }

        const trigger = findMenuTrigger(root || document);
        if (trigger) {
          clickElement(trigger);
        }

        setTimeout(() => {
          const globalTarget = findNotInterestedTarget(document);
          if (globalTarget) {
            clickElement(globalTarget);
          }
        }, 220);
      }, delay);
    }
  }

  function shouldHideCard(decision) {
    return !!(decision && decision.hideCard === true);
  }

  function hideGroup(group, decision) {
    let firstContainer = null;
    for (const link of group.links) {
      const container = findCardContainer(link);
      if (!container) {
        continue;
      }
      if (!firstContainer) {
        firstContainer = container;
      }
      hideCardElement(container, group.videoId.key);
      if (container === link) {
        const hiddenHint = "（已被学习模式隐藏）";
        if (!String(link.title || "").includes(hiddenHint)) {
          link.title = `${link.title || ""}${hiddenHint}`.trim();
        }
      }
    }
    scheduleNotInterestedAttempt(group.videoId.key, firstContainer || document);
    STATE.decisionCache.set(group.videoId.key, decision);
  }

  function chunkArray(list, size) {
    const chunks = [];
    for (let i = 0; i < list.length; i += size) {
      chunks.push(list.slice(i, i + size));
    }
    return chunks;
  }

  async function filterVideoCards() {
    if (!isCoverHidingEnabled()) {
      restoreHiddenCards();
      STATE.decisionCache.clear();
      return;
    }

    if (STATE.cardScanRunning) {
      STATE.cardScanQueued = true;
      return;
    }

    STATE.cardScanRunning = true;
    try {
      const groups = Array.from(collectVideoGroups().values());
      if (groups.length === 0) {
        return;
      }

      const pending = [];
      for (const group of groups) {
        const cached = STATE.decisionCache.get(group.videoId.key);
        if (cached) {
          if (shouldHideCard(cached)) {
            hideGroup(group, cached);
          }
          continue;
        }
        pending.push(group);
      }

      if (pending.length === 0) {
        return;
      }

      const videoGroups = [];
      const liveGroups = [];
      for (const group of pending) {
        if (group.videoId.type === "live") {
          liveGroups.push(group);
        } else {
          videoGroups.push(group);
        }
      }

      if (videoGroups.length > 0) {
        const chunks = chunkArray(videoGroups, 12);
        for (const chunk of chunks) {
          const videoIds = chunk.map((group) => group.videoId);
          const batchResults = await checkVideosInBatch(videoIds);

          for (const group of chunk) {
            const decision = normalizeDecision(
              batchResults[group.videoId.key] || emptyDecision("未收到校验结果")
            );
            if (shouldHideCard(decision)) {
              hideGroup(group, decision);
            } else {
              STATE.decisionCache.set(group.videoId.key, decision);
            }
          }
        }
      }

      for (const group of liveGroups) {
        const decision = await checkSingleVideo(group.videoId, "card");
        if (shouldHideCard(decision)) {
          hideGroup(group, decision);
        } else {
          STATE.decisionCache.set(group.videoId.key, decision);
        }
      }
    } finally {
      STATE.cardScanRunning = false;
      if (STATE.cardScanQueued) {
        STATE.cardScanQueued = false;
        scheduleCardScan(120);
      }
    }
  }

  function scheduleCardScan(delayMs) {
    if (!isCoverHidingEnabled()) {
      return;
    }
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 180;
    if (STATE.cardScanTimer) {
      clearTimeout(STATE.cardScanTimer);
    }
    STATE.cardScanTimer = setTimeout(() => {
      STATE.cardScanTimer = null;
      filterVideoCards();
    }, delay);
  }

  function resetFiltering() {
    STATE.decisionCache.clear();
    restoreHiddenCards();
    scheduleCardScan(80);
  }

  function onMaybeNavigate() {
    if (location.href !== STATE.lastHref) {
      evaluateCurrentPage();
      scheduleCardScan(220);
    }
  }

  function wrapHistoryMethod(methodName) {
    const original = history[methodName];
    if (typeof original !== "function") {
      return;
    }
    history[methodName] = function wrappedHistoryMethod(...args) {
      const result = original.apply(this, args);
      setTimeout(onMaybeNavigate, 0);
      return result;
    };
  }

  function startCardObserver() {
    if (STATE.cardObserver || !document.body) {
      return;
    }
    STATE.cardObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "childList" &&
          (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
        ) {
          scheduleCardScan(200);
          return;
        }
      }
    });
    STATE.cardObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  window.addEventListener("popstate", () => setTimeout(onMaybeNavigate, 0));

  setInterval(() => {
    onMaybeNavigate();
    scheduleCardScan(450);
  }, 2200);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.studyGuardSettings) {
      STATE.lastVideoKey = "";
      STATE.requestId += 1;
      STATE.notInterestedHandled.clear();
      evaluateCurrentPage();
      refreshRuntimeSettings().then(() => {
        if (isCoverHidingEnabled()) {
          resetFiltering();
          return;
        }
        STATE.decisionCache.clear();
        restoreHiddenCards();
      });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      refreshRuntimeSettings().finally(() => {
        evaluateCurrentPage();
        startCardObserver();
        scheduleCardScan(120);
      });
    });
  } else {
    refreshRuntimeSettings().finally(() => {
      evaluateCurrentPage();
      startCardObserver();
      scheduleCardScan(120);
    });
  }
})();
