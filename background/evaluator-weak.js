function createModeDecision(shouldBlock, reason, blockedBy, mode, matchedAllow, matchedBlock, ai) {
  return {
    shouldBlock: shouldBlock === true,
    reason: String(reason || ""),
    blockedBy: String(blockedBy || ""),
    mode: String(mode || ""),
    matchedAllowKeywords: Array.isArray(matchedAllow) ? matchedAllow : [],
    matchedBlockKeywords: Array.isArray(matchedBlock) ? matchedBlock : [],
    ai: ai && typeof ai === "object" ? ai : createDefaultAiResult()
  };
}

function evaluateWeakMode(metadata, settings) {
  const blockMatches = findMatches(collectKeywordTexts(metadata), settings.blockKeywords);
  if (blockMatches.length > 0) {
    return createModeDecision(true, "命中屏蔽词", "weak_block_keyword", "weak", [], blockMatches, createDefaultAiResult());
  }
  return createModeDecision(false, "未命中屏蔽词", "", "weak", [], [], createDefaultAiResult());
}
