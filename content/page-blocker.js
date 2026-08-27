function pauseAllVideos() {
  for (const video of document.querySelectorAll("video")) {
    if (!video.paused) video.pause();
  }
}

function setScrollLocked(locked, state) {
  if (!document.documentElement || !document.body) return;
  if (locked) {
    if (!state.blocked) {
      state.htmlOverflow = document.documentElement.style.overflow;
      state.bodyOverflow = document.body.style.overflow;
    }
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  } else {
    document.documentElement.style.overflow = state.htmlOverflow;
    document.body.style.overflow = state.bodyOverflow;
  }
}

function blockPage(rawResult, state) {
  const result = normalizeDecision(rawResult);
  const overlay = ensureOverlay(state.settings);
  if (!overlay) return;

  // 弹窗内部在 shadow root 里，document.querySelector 查不到，统一走 getOverlayRefs()
  const refs = getOverlayRefs();
  const metadata = result.metadata || {};
  const videoKey = deriveVideoKey(result, state.lastVideoKey);

  if (refs) {
    refs.badge.textContent = getModeLabel(result.mode);
    refs.title.textContent = String(state.settings.blockTitleText || "").trim() || "已拦截";
    refs.reason.textContent = `原因：${getBlockReasonText(result)}`;
    refs.encourage.textContent = pickEncouragement(state.settings.blockEncourageText, videoKey);

    const showInfo = state.settings.blockShowVideoInfo !== false;
    refs.videoInfo.hidden = !showInfo;
    refs.videoInfo.textContent = showInfo
      ? `标题：${metadata.title || "未知"} ｜ 分区：${metadata.tname || "未知"}`
      : "";
  }

  showOverlay();
  setScrollLocked(true, state);
  pauseAllVideos();

  scheduleNotInterestedAttempt(videoKey, document, state);

  if (state.pauseTimer) clearInterval(state.pauseTimer);
  state.pauseTimer = setInterval(pauseAllVideos, 700);
  state.blocked = true;
}

function unblockPage(state) {
  hideOverlay();
  if (state.pauseTimer) { clearInterval(state.pauseTimer); state.pauseTimer = null; }
  setScrollLocked(false, state);
  state.blocked = false;
}

function deriveVideoKey(decision, fallback) {
  const m = decision?.metadata || {};
  if (m.bvid) return `bvid:${m.bvid}`;
  if (m.aid) return `aid:${m.aid}`;
  if (m.rid) return `room:${m.rid}`;
  return fallback ? String(fallback) : "";
}
