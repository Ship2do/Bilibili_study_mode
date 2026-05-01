async function fetchVideoMetadata(videoId) {
  const query = videoId.bvid
    ? `bvid=${encodeURIComponent(videoId.bvid)}`
    : `aid=${encodeURIComponent(videoId.aid)}`;

  const view = await fetchJson(`https://api.bilibili.com/x/web-interface/view?${query}`, { credentials: "include" });
  if (view.code !== 0 || !view.data) throw new Error(`view接口异常: code=${view.code}`);

  const v = view.data;
  const metadata = {
    aid: v.aid ? String(v.aid) : "",
    bvid: v.bvid ? String(v.bvid) : "",
    title: v.title ? String(v.title) : "",
    tname: v.tname ? String(v.tname) : "",
    desc: v.desc ? String(v.desc) : "",
    duration: Number.isFinite(Number(v.duration)) ? Number(v.duration) : null,
    pubdate: Number.isFinite(Number(v.pubdate)) ? Number(v.pubdate) : null,
    ownerName: v.owner?.name ? String(v.owner.name) : "",
    ownerMid: v.owner?.mid ? String(v.owner.mid) : "",
    ownerSign: v.owner?.sign ? String(v.owner.sign) : "",
    tags: []
  };

  const tagQuery = metadata.bvid ? `bvid=${encodeURIComponent(metadata.bvid)}` : `aid=${encodeURIComponent(metadata.aid)}`;
  try {
    const tagsResp = await fetchJson(`https://api.bilibili.com/x/tag/archive/tags?${tagQuery}`, { credentials: "include" });
    if (tagsResp.code === 0 && Array.isArray(tagsResp.data)) {
      metadata.tags = tagsResp.data.map(i => String(i.tag_name || "").trim()).filter(Boolean);
    }
  } catch (e) {
    console.warn("[StudyGuard] 标签接口请求失败", e);
  }

  return metadata;
}
