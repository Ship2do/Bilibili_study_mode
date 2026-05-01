function parseVideoId(urlText) {
  let url;
  try { url = new URL(urlText, location.origin); } catch (_e) { return null; }

  const bvMatch = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/);
  if (bvMatch) return { bvid: bvMatch[1], key: `bvid:${bvMatch[1]}` };

  const avMatch = url.pathname.match(/\/video\/av(\d+)/i);
  if (avMatch) return { aid: avMatch[1], key: `aid:${avMatch[1]}` };

  const queryBvid = url.searchParams.get("bvid");
  if (queryBvid && /^BV[0-9A-Za-z]+$/.test(queryBvid)) return { bvid: queryBvid, key: `bvid:${queryBvid}` };

  const queryAid = url.searchParams.get("aid");
  if (queryAid && /^\d+$/.test(queryAid)) return { aid: queryAid, key: `aid:${queryAid}` };

  return null;
}

function parseLiveRoomId(urlText) {
  let url;
  try { url = new URL(urlText, location.origin); } catch (_e) { return null; }

  const isLiveHost = url.hostname === "live.bilibili.com";
  const isLivePath = /\/live\/(\d+)/.test(url.pathname);
  if (!isLiveHost && !isLivePath) return null;

  const match = url.pathname.match(/\/(\d+)(?:\/|$|\?)/);
  if (!match) return null;

  return { rid: match[1], key: `room:${match[1]}`, type: "live" };
}
