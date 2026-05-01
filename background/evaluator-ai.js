function hasAiConfig(settings) {
  return !!(settings.aiApiUrl && settings.aiApiKey && settings.aiModel);
}

function createDefaultAiResult() {
  return { used: false, isLearning: false, confidence: null, reason: "", error: "" };
}

function normalizeAiPrompt(raw) {
  return String(raw || "").trim() || DEFAULT_AI_PROMPT_TEMPLATE;
}

function normalizeAiApiUrl(rawUrl) {
  const url = String(rawUrl || "").trim().replace(/\/+$/, "");
  if (!url) return "";
  if (/\/(chat\/completions|messages|completions|generate)$/i.test(url)) return url;
  if (/\/v\d+$/i.test(url)) return url + "/chat/completions";
  try {
    const parsed = new URL(url);
    if (!parsed.pathname || parsed.pathname === "/") return url + "/v1/chat/completions";
  } catch (_e) { /* ignore */ }
  return url;
}

function stringifyPromptValue(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function buildPromptVariables(metadata) {
  return {
    title: metadata.title || "",
    partition: metadata.tname || "",
    tags: Array.isArray(metadata.tags) ? metadata.tags.join("、") : "",
    owner_name: metadata.ownerName || "",
    owner_mid: metadata.ownerMid || "",
    owner_sign: metadata.ownerSign || "",
    description: metadata.desc || "",
    aid: metadata.aid || "",
    bvid: metadata.bvid || "",
    duration: metadata.duration ?? "",
    pubdate: metadata.pubdate ?? "",
    metadata_json: JSON.stringify(metadata, null, 2)
  };
}

function renderPromptTemplate(template, metadata) {
  const text = normalizeAiPrompt(template);
  const vars = buildPromptVariables(metadata);
  return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? stringifyPromptValue(vars[key]) : "";
  });
}

function stripCodeFence(text) {
  const source = String(text || "").trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : source;
}

function extractTextFromAiResponse(data) {
  if (!data || typeof data !== "object") return "";
  const chatContent = data.choices?.[0]?.message?.content;
  if (typeof chatContent === "string") return chatContent;
  if (Array.isArray(chatContent)) {
    return chatContent.map(p => typeof p === "string" ? p : (p?.text || "")).join("\n").trim();
  }
  if (typeof data.output_text === "string") return data.output_text;
  if (Array.isArray(data.output)) {
    const segments = [];
    for (const item of data.output) {
      if (item?.content) {
        for (const c of item.content) {
          if (c?.text) segments.push(c.text);
        }
      }
    }
    if (segments.length > 0) return segments.join("\n").trim();
  }
  return "";
}

function parseBooleanLike(value) {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "yes", "1", "learning", "study", "allow", "allowed", "pass"].includes(v)) return true;
    if (["false", "no", "0", "entertainment", "block", "blocked", "deny"].includes(v)) return false;
  }
  return null;
}

function parseAiDecisionText(text) {
  const raw = stripCodeFence(text);
  if (!raw) throw new Error("AI返回为空");

  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_e) { /* not JSON */ }

  if (parsed && typeof parsed === "object") {
    let isLearning = null;
    for (const key of ["is_learning", "isLearning", "learning", "allow", "allowed", "pass"]) {
      const v = parseBooleanLike(parsed[key]);
      if (v !== null) { isLearning = v; break; }
    }
    if (isLearning === null) {
      for (const key of ["is_entertainment", "isEntertainment", "entertainment"]) {
        const v = parseBooleanLike(parsed[key]);
        if (v !== null) { isLearning = !v; break; }
      }
    }
    if (isLearning === null && typeof parsed.decision === "string") {
      const d = parsed.decision.trim().toLowerCase();
      if (d === "learning" || d === "study") isLearning = true;
      if (d === "entertainment") isLearning = false;
    }
    if (isLearning === null) throw new Error("AI返回未包含可识别的学习判定字段");

    return {
      isLearning,
      confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : null,
      reason: String(parsed.reason || parsed.explanation || parsed.note || "").trim()
    };
  }

  const lower = raw.toLowerCase();
  if (/is[_\s-]*learning[^a-z0-9]*(true|yes|1)/i.test(lower)) return { isLearning: true, confidence: null, reason: "" };
  if (/is[_\s-]*learning[^a-z0-9]*(false|no|0)/i.test(lower)) return { isLearning: false, confidence: null, reason: "" };
  if (/is[_\s-]*entertainment[^a-z0-9]*(true|yes|1)/i.test(lower)) return { isLearning: false, confidence: null, reason: "" };
  if (/is[_\s-]*entertainment[^a-z0-9]*(false|no|0)/i.test(lower)) return { isLearning: true, confidence: null, reason: "" };

  throw new Error("无法解析AI返回结果");
}

async function callAiJudge(metadata, settings) {
  const userPrompt = renderPromptTemplate(settings.aiPrompt, metadata);
  const body = {
    model: settings.aiModel,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "你是B站内容判定器。根据输入信息判断是否为娱乐类视频。必须严格输出JSON格式，不要输出任何其它文本。JSON格式：{\"is_learning\":true/false,\"reason\":\"简短原因\"}"
      },
      { role: "user", content: userPrompt }
    ]
  };

  const headers = { "Content-Type": "application/json" };
  if (settings.aiApiKey) headers.Authorization = `Bearer ${settings.aiApiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), settings.aiRequestTimeoutMs);

  try {
    const response = await fetch(normalizeAiApiUrl(settings.aiApiUrl), {
      method: "POST", headers, body: JSON.stringify(body), signal: controller.signal
    });
    if (!response.ok) throw new Error(`AI接口状态异常: HTTP ${response.status}`);
    return parseAiDecisionText(extractTextFromAiResponse(await response.json()));
  } catch (error) {
    throw new Error(error.name === "AbortError" ? "AI请求超时" : error.message);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function evaluateAiMode(metadata, settings) {
  const blockMatches = findMatches(collectKeywordTexts(metadata), settings.blockKeywords);

  if (settings.aiPreFilterBlockKeywords && blockMatches.length > 0) {
    return createModeDecision(true, "命中屏蔽词", "ai_prefilter_block_keyword", "ai", [], blockMatches, createDefaultAiResult());
  }

  if (!hasAiConfig(settings)) {
    return createModeDecision(true, "AI模式配置不完整，已按安全策略拦截", "ai_config_missing", "ai", [], blockMatches, {
      used: false, isLearning: false, confidence: null, reason: "", error: "AI配置不完整"
    });
  }

  try {
    const aiResult = await callAiJudge(metadata, settings);
    const aiInfo = { used: true, isLearning: aiResult.isLearning === true, confidence: aiResult.confidence, reason: aiResult.reason || "", error: "" };

    if (aiResult.isLearning) {
      return createModeDecision(false, aiResult.reason || "AI判定为学习向", "", "ai", [], blockMatches, aiInfo);
    }
    return createModeDecision(true, aiResult.reason || "AI判定为非学习向", "ai_not_learning", "ai", [], blockMatches, aiInfo);
  } catch (error) {
    return createModeDecision(true, `AI判定失败：${error.message}`, "ai_error", "ai", [], blockMatches, {
      used: true, isLearning: false, confidence: null, reason: "", error: error.message
    });
  }
}
