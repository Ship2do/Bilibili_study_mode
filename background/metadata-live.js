async function fetchLiveRoomMetadata(rid) {
  const room = await fetchJson(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${encodeURIComponent(rid)}`);
  if (room.code !== 0 || !room.data) throw new Error(`直播间接口异常: code=${room.code}`);

  const r = room.data;
  const metadata = {
    aid: "", bvid: "",
    title: r.title ? String(r.title) : "",
    tname: r.area_name ? String(r.area_name) : "",
    desc: r.tags ? String(r.tags) : "",
    duration: null, pubdate: null,
    ownerName: r.anchor_info?.base_info?.uname ? String(r.anchor_info.base_info.uname) : "",
    ownerMid: r.uid ? String(r.uid) : "",
    ownerSign: "",
    tags: r.tags ? String(r.tags).split(",").map(t => t.trim()).filter(Boolean) : []
  };

  try {
    const anchor = await fetchJson(`https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?room_id=${encodeURIComponent(rid)}`);
    if (anchor.code === 0 && anchor.data?.info?.uname) {
      metadata.ownerName = String(anchor.data.info.uname);
    }
  } catch (_e) { /* ignore */ }

  return metadata;
}
