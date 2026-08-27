// 单页应用会长时间不刷新，决策缓存需要封顶，否则随浏览无限增长。
const DECISION_CACHE_LIMIT = 500;

function rememberDecision(state, videoKey, decision) {
  if (state.decisionCache.size >= DECISION_CACHE_LIMIT && !state.decisionCache.has(videoKey)) {
    const oldest = state.decisionCache.keys().next().value;
    if (oldest !== undefined) state.decisionCache.delete(oldest);
  }
  state.decisionCache.set(videoKey, decision);
}

function hideGroup(group, decision, state) {
  let firstContainer = null;
  for (const link of group.links) {
    const container = findCardContainer(link);
    if (!container) continue;
    if (!firstContainer) firstContainer = container;
    hideCardElement(container, group.videoId.key);
    if (container === link) {
      const hint = "（已被学习模式隐藏）";
      if (!String(link.title || "").includes(hint)) {
        link.title = `${link.title || ""}${hint}`.trim();
      }
    }
  }
  scheduleNotInterestedAttempt(group.videoId.key, firstContainer || document, state);
  rememberDecision(state, group.videoId.key, decision);
}

function shouldHideCard(decision) {
  return decision?.hideCard === true;
}

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

async function checkSingleVideo(videoId, context) {
  return normalizeDecision(await sendMessage({ type: "CHECK_VIDEO", videoId, context: context || "page" }));
}

async function checkVideosInBatch(videoIds) {
  const list = Array.isArray(videoIds) ? videoIds : [];
  if (list.length === 0) return {};

  const response = await sendMessage({ type: "BATCH_CHECK_VIDEOS", videoIds: list, context: "card" });

  if (response?.ok && response.results && typeof response.results === "object") {
    const normalized = {};
    for (const videoId of list) {
      if (videoId?.key) normalized[videoId.key] = normalizeDecision(response.results[videoId.key]);
    }
    return normalized;
  }

  const fallback = {};
  for (const [key, decision] of await Promise.all(
    list.map(async v => [v.key, await checkSingleVideo(v, "card")])
  )) {
    fallback[key] = decision;
  }
  return fallback;
}

async function filterVideoCards(state) {
  if (!state.settings.actionHideCover) {
    restoreHiddenCards();
    state.decisionCache.clear();
    return;
  }

  if (state.cardScanRunning) { state.cardScanQueued = true; return; }
  state.cardScanRunning = true;

  try {
    const groups = Array.from(collectVideoGroups().values());
    if (groups.length === 0) return;

    const pending = [];
    for (const group of groups) {
      const cached = state.decisionCache.get(group.videoId.key);
      if (cached) {
        if (shouldHideCard(cached)) hideGroup(group, cached, state);
        continue;
      }
      pending.push(group);
    }
    if (pending.length === 0) return;

    const videoGroups = pending.filter(g => g.videoId.type !== "live");
    const liveGroups = pending.filter(g => g.videoId.type === "live");

    for (const chunk of chunkArray(videoGroups, 12)) {
      const batchResults = await checkVideosInBatch(chunk.map(g => g.videoId));
      for (const group of chunk) {
        const decision = normalizeDecision(batchResults[group.videoId.key] || emptyDecision());
        if (shouldHideCard(decision)) hideGroup(group, decision, state);
        else rememberDecision(state, group.videoId.key, decision);
      }
    }

    for (const group of liveGroups) {
      const decision = await checkSingleVideo(group.videoId, "card");
      if (shouldHideCard(decision)) hideGroup(group, decision, state);
      else rememberDecision(state, group.videoId.key, decision);
    }
  } finally {
    state.cardScanRunning = false;
    if (state.cardScanQueued) { state.cardScanQueued = false; scheduleCardScan(120); }
  }
}
