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
  const overlay = ensureOverlay();
  if (!overlay) return;

  const titleEl = overlay.querySelector("h1");
  const reasonEl = overlay.querySelector(".sg-reason");
  const videoInfoEl = overlay.querySelector(".sg-video-info");
  const metadata = result.metadata || {};

  if (titleEl) titleEl.textContent = getModeLabel(result.mode);
  if (reasonEl) reasonEl.textContent = `原因：${getBlockReasonText(result)}`;
  if (videoInfoEl) videoInfoEl.textContent = `标题：${metadata.title || "未知"} | 分区：${metadata.tname || "未知"}`;

  overlay.style.display = "flex";
  setScrollLocked(true, state);
  pauseAllVideos();

  const videoKey = deriveVideoKey(result, state.lastVideoKey);
  scheduleNotInterestedAttempt(videoKey, document, state);

  if (state.pauseTimer) clearInterval(state.pauseTimer);
  state.pauseTimer = setInterval(pauseAllVideos, 700);
  state.blocked = true;
}

function unblockPage(state) {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.style.display = "none";
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
