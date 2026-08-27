/*
 * 警示横幅的构建逻辑。设置页的预览和真正的拦截界面都调这里，
 * 保证「所见即所得」——两边各写一份迟早会对不上。
 *
 * 这个文件同时被内容脚本（content_scripts）和扩展页（<script src>）加载，
 * 所以不能依赖任何一边独有的 API。
 */

const BANNER_COLOR_PRESETS = {
  red:    { name: "警示红", light: "#d13438", dark: "#a82327" },
  orange: { name: "橙",     light: "#dd6b20", dark: "#b0541a" },
  amber:  { name: "琥珀",   light: "#c98a00", dark: "#9c6b00" },
  green:  { name: "绿",     light: "#0f9d58", dark: "#0b7742" },
  blue:   { name: "蓝",     light: "#2563eb", dark: "#1b47b0" },
  purple: { name: "紫",     light: "#7c3aed", dark: "#5f2bb8" },
  slate:  { name: "石墨",   light: "#475569", dark: "#334155" }
};

const BANNER_COLOR_ORDER = ["red", "orange", "amber", "green", "blue", "purple", "slate"];

function resolveBannerColor(name, scheme) {
  const preset = BANNER_COLOR_PRESETS[name] || BANNER_COLOR_PRESETS.red;
  return scheme === "dark" ? preset.dark : preset.light;
}

// 固定种子：同一份设置每次渲染出来的排布完全一样，预览才有意义
function seededRandom(seed) {
  let value = seed;
  return function () {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/*
 * 生成一层铺满父容器的横幅。父容器需要是 position: relative/fixed 且 overflow: hidden。
 *
 * 尺寸用绝对像素而不是百分比：调用方只要让「舞台」保持接近屏幕的比例，
 * 再整体 CSS 缩放，看到的比例就和真实拦截界面一致。
 *
 * 横幅是静止的——之前那套 translateX 动画既不循环也谈不上滚动，反而显得卡顿。
 */
/*
 * 让预览舞台自动贴合容器宽度。
 *
 * 用 ResizeObserver 而不是在渲染时手动读 clientWidth：预览所在的面板可能当时
 * 还是隐藏的（引导页的步骤、设置页的折叠区），那时宽度是 0，会把舞台缩成
 * scale(0) 整个看不见。容器高度交给 CSS 的 aspect-ratio，JS 不碰。
 */
function autoScaleBannerStage(stage) {
  const frame = stage.parentElement;
  const apply = width => {
    if (width > 0) stage.style.transform = `scale(${width / 1600})`;
  };
  apply(frame.clientWidth);
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(entries => apply(entries[0].contentRect.width)).observe(frame);
  }
}

function buildBannerLayer(doc, options) {
  const container = doc.createElement("div");
  container.className = "sg-banners";
  container.style.cssText = "position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0;";

  const density = Math.max(0, Math.round(Number(options.density) || 0));
  if (density === 0) return container;

  const text = String(options.text || "学习！");
  const color = options.color;
  const rowHeight = Number(options.rowHeight) || 30;
  const fontSize = Number(options.fontSize) || 16;
  const repeated = Array(25).fill(text).join("　　　");
  const random = seededRandom(42);

  for (let i = 0; i < density; i++) {
    const angle = Math.round(random() * 90 - 45);
    const topPercent = (i / density) * 130 - 15;

    const row = doc.createElement("div");
    row.style.cssText = `
      position: absolute; left: -90%; top: ${topPercent}%;
      width: 280%; height: ${rowHeight}px; line-height: ${rowHeight}px;
      font-size: ${fontSize}px; font-weight: 700; letter-spacing: 2px;
      color: rgba(255, 255, 255, 0.94); background: ${color};
      text-align: center; white-space: nowrap;
      transform: rotate(${angle}deg);
      text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.35);
    `;
    row.textContent = repeated;
    container.appendChild(row);
  }

  return container;
}
