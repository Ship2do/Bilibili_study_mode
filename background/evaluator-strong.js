function evaluateStrongMode(metadata, settings) {
  const allowMatches = findMatches(collectKeywordTexts(metadata), settings.allowKeywords);
  if (allowMatches.length > 0) {
    return createModeDecision(false, "命中学习词", "", "strong", allowMatches, [], createDefaultAiResult());
  }
  return createModeDecision(true, "未命中学习词", "strong_not_learning", "strong", [], [], createDefaultAiResult());
}
