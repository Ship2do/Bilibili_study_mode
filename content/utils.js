function sendMessage(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false, allowed: false,
          reason: `扩展通信失败：${chrome.runtime.lastError.message}`,
          matchedKeywords: [], matchedAllowKeywords: [], matchedBlockKeywords: [],
          metadata: { title: "", tname: "", tags: [] }
        });
        return;
      }
      resolve(response);
    });
  });
}

function emptyDecision(reason) {
  return {
    allowed: false, hideCard: false, reason: reason || "未收到校验结果",
    matchedKeywords: [], matchedAllowKeywords: [], matchedBlockKeywords: [],
    metadata: { title: "", tname: "", tags: [] }
  };
}

function normalizeDecision(result) {
  const src = result && typeof result === "object" ? result : emptyDecision();
  const allow = Array.isArray(src.matchedAllowKeywords) ? src.matchedAllowKeywords : [];
  const block = Array.isArray(src.matchedBlockKeywords) ? src.matchedBlockKeywords : [];
  return {
    allowed: src.allowed === true,
    hideCard: src.hideCard === true,
    reason: String(src.reason || ""),
    blockedBy: String(src.blockedBy || ""),
    mode: String(src.mode || ""),
    matchedKeywords: Array.isArray(src.matchedKeywords) ? src.matchedKeywords : (src.allowed ? allow : block),
    matchedAllowKeywords: allow,
    matchedBlockKeywords: block,
    metadata: src.metadata && typeof src.metadata === "object" ? src.metadata : { title: "", tname: "", tags: [] }
  };
}
