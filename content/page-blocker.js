// 「继续观看」放行过的视频记在内存里。上限防止单页应用长时间浏览无限增长。
const BYPASS_LIMIT = 200;

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

function markBypassed(state, videoKey) {
  if (!videoKey) return;
  if (state.bypass.size >= BYPASS_LIMIT && !state.bypass.has(videoKey)) {
    const oldest = state.bypass.keys().next().value;
    if (oldest !== undefined) state.bypass.delete(oldest);
  }
  state.bypass.set(videoKey, Date.now());
}

function isBypassed(state, videoKey) {
  return !!videoKey && state.bypass.has(videoKey);
}

function clearBlockTimers(state) {
  if (state.pauseTimer) { clearInterval(state.pauseTimer); state.pauseTimer = null; }
  if (state.autoDismissTimer) { clearTimeout(state.autoDismissTimer); state.autoDismissTimer = null; }
  if (state.continueTimer) { clearInterval(state.continueTimer); state.continueTimer = null; }
}

// 「继续观看」和「倒计时自动放行」走完全相同的路径
function releaseVideo(state, videoKey) {
  markBypassed(state, videoKey);
  unblockPage(state);
}

// 按钮先禁用再倒计时解锁——这是摩擦力而不是墙，与密码锁里的 tier 定义呼应
function configureContinueButton(refs, presentation, state, videoKey) {
  if (state.continueTimer) { clearInterval(state.continueTimer); state.continueTimer = null; }

  if (!refs || !presentation.allowContinue) {
    if (refs) refs.continueBtn.hidden = true;
    return;
  }

  const button = refs.continueBtn;
  button.hidden = false;
  // 用赋值而不是 addEventListener：反复拦截时不会累积监听器
  button.onclick = () => { if (!button.disabled) releaseVideo(state, videoKey); };

  let remaining = presentation.continueDelaySec;
  const render = () => {
    if (remaining > 0) {
      button.disabled = true;
      button.textContent = `继续观看（${remaining}s）`;
      return;
    }
    button.disabled = false;
    button.textContent = "继续观看";
    if (state.continueTimer) { clearInterval(state.continueTimer); state.continueTimer = null; }
  };

  render();
  if (remaining > 0) {
    state.continueTimer = setInterval(() => { remaining -= 1; render(); }, 1000);
  }
}

function blockPage(rawResult, state) {
  const result = normalizeDecision(rawResult);
  const videoKey = deriveVideoKey(result, state.lastVideoKey);

  // 已经放行过的视频不再拦——设置变更会重置 lastVideoKey，光靠导航判重挡不住
  if (isBypassed(state, videoKey)) { unblockPage(state); return; }

  const presentation = resolvePresentation(state.settings);
  const overlay = ensureOverlay(state.settings);
  if (!overlay) return;

  // 弹窗内部在 shadow root 里，document.querySelector 查不到，统一走 getOverlayRefs()
  const refs = getOverlayRefs();
  const metadata = result.metadata || {};

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
  clearBlockTimers(state);

  // 滚动锁要显式还原：从全屏遮罩切到提示条时如果不还原，旧的 overflow:hidden
  // 会残留，页面永久卡死。
  setScrollLocked(presentation.scrollLock, state);

  if (presentation.pauseVideo) {
    pauseAllVideos();
    state.pauseTimer = setInterval(pauseAllVideos, 700);
  }

  configureContinueButton(refs, presentation, state, videoKey);

  if (presentation.autoDismissSec > 0) {
    state.autoDismissTimer = setTimeout(() => releaseVideo(state, videoKey), presentation.autoDismissSec * 1000);
  }

  scheduleNotInterestedAttempt(videoKey, document, state);
  state.blocked = true;
}

function unblockPage(state) {
  hideOverlay();
  clearBlockTimers(state);
  // 无条件还原，别按当前呈现方式判断——否则切换呈现方式时会漏还原
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
