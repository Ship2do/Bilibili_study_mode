const OVERLAY_ID = "__study_guard_overlay__";

function getModeLabel(mode) {
  if (mode === "weak") return "弱模式";
  if (mode === "strong") return "强模式";
  if (mode === "ai") return "AI模式";
  return "学习模式";
}

function getBlockReasonText(result) {
  const { mode, reason } = result;
  if (mode === "weak") return "命中屏蔽词";
  if (mode === "strong") return "未命中学习词";
  if (mode === "ai") return reason || "AI判定为非学习向";
  return reason || "该视频未通过学习模式规则";
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  const el = (tag, styles) => {
    const e = document.createElement(tag);
    Object.assign(e.style, styles);
    return e;
  };

  overlay = el("div", {
    position: "fixed", inset: "0", zIndex: "2147483647", display: "none",
    alignItems: "center", justifyContent: "center",
    background: "rgba(11, 14, 24, 0.96)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    color: "#f6f9ff"
  });
  overlay.id = OVERLAY_ID;

  const panel = el("div", {
    width: "min(760px, 92vw)", background: "#111829", border: "1px solid #27314a",
    borderRadius: "8px", padding: "24px", boxSizing: "border-box",
    boxShadow: "0 24px 56px rgba(0, 0, 0, 0.45)"
  });

  const title = el("h1", { margin: "0 0 12px", fontSize: "24px", fontWeight: "700", lineHeight: "1.35" });
  title.textContent = "该视频已被学习模式拦截";

  const reason = el("p", { margin: "0 0 10px", color: "#ced9ee", fontSize: "15px", lineHeight: "1.65" });
  reason.className = "sg-reason";

  const videoInfo = el("p", { margin: "0 0 18px", color: "#9fb0d4", fontSize: "14px", lineHeight: "1.7" });
  videoInfo.className = "sg-video-info";

  const actions = el("div", { display: "flex", flexWrap: "wrap", gap: "10px" });

  const homeBtn = el("button", {
    border: "0", borderRadius: "6px", padding: "10px 16px",
    background: "#4c8dff", color: "#fff", fontSize: "14px", fontWeight: "600", cursor: "pointer"
  });
  homeBtn.type = "button";
  homeBtn.textContent = "返回B站首页";
  homeBtn.addEventListener("click", () => { location.href = "https://www.bilibili.com/"; });

  const optBtn = el("button", {
    border: "1px solid #31405f", borderRadius: "6px", padding: "10px 16px",
    background: "#1c2740", color: "#d7e4ff", fontSize: "14px", fontWeight: "600", cursor: "pointer"
  });
  optBtn.type = "button";
  optBtn.textContent = "调整规则";
  optBtn.addEventListener("click", () => { chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }); });

  actions.append(homeBtn, optBtn);
  panel.append(title, reason, videoInfo, actions);
  overlay.append(panel);
  (document.documentElement || document.body)?.appendChild(overlay);

  return overlay;
}
