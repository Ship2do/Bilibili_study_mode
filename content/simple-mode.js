// 简洁首页：把 www.bilibili.com 首页整个替换成「logo + 搜索框」启动页。
//
// 为什么是独立脚本而不是挂在 content.js 上：
//  - 它必须以 document_start 运行，在首帧渲染前把隐藏类挂到 <html> 上，
//    否则用户会先看到完整首页、再看着它消失——这种闪屏等于告诉你大脑
//    「刚才有个花花绿绿的页面」，诱惑已经完成了传递。
//  - 它比其他内容脚本跑得早，不能依赖任何共享模块；设置直接读 storage，
//    归一化规则与后台保持一致（masterEnabled 默认开、simpleHomeEnabled 严格等于 true）。
//
// 搜索框是唯一出口，这是刻意的：搜索是目的性行为（想学什么才搜什么），
// 推荐流是被投喂。跳转到 search.bilibili.com 后判定照常工作，不受影响。
//
// 明暗不直接用 prefers-color-scheme：插件自己的 uiTheme（跟随系统/亮/暗）
// 是更高优先级——用户在插件里选了「暗色」，启动页就该是暗的，
// 只有 uiTheme 为 auto 时才跟随系统（此时监听系统变化即时切换）。

const SIMPLE_HOME_PATH = /^\/(index\.html)?$/;
const SIMPLE_CLASS = "sg-simple-home";
const SIMPLE_DARK_CLASS = "sg-simple-dark";
const SIMPLE_ROOT_ID = "sg-simple-root";

const SIMPLE_CSS = `
html.${SIMPLE_CLASS} body > :not(#${SIMPLE_ROOT_ID}) { display: none !important; }
html.${SIMPLE_CLASS} body {
  margin: 0 !important;
  background: #f3f3f3 !important;
  overflow: auto !important;
}
html.${SIMPLE_CLASS} #${SIMPLE_ROOT_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f3f3;
  font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}
html.${SIMPLE_CLASS} #${SIMPLE_ROOT_ID}[hidden] { display: none !important; }
#sg-simple-box { display: flex; flex-direction: column; align-items: center; gap: 28px; padding: 0 24px; }
#sg-simple-brand { display: flex; align-items: center; gap: 14px; user-select: none; }
#sg-simple-brand svg { display: block; }
#sg-simple-brand span { font-size: 30px; font-weight: 600; color: #505050; letter-spacing: .06em; }
#sg-simple-form {
  display: flex; align-items: center; gap: 10px;
  width: min(640px, 90vw);
}
#sg-simple-input {
  flex: 1; height: 52px; padding: 0 26px;
  border: none; border-radius: 26px; outline: none;
  background: #fff; color: #18191c;
  font-size: 16px;
  box-shadow: 0 2px 10px rgba(0,0,0,.08);
}
#sg-simple-input::placeholder { color: #9499a0; }
#sg-simple-input:focus { box-shadow: 0 2px 14px rgba(251,114,153,.35); }
#sg-simple-submit {
  width: 52px; height: 52px; flex: 0 0 auto;
  border: none; border-radius: 50%; cursor: pointer;
  background: #fb7299; color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 10px rgba(251,114,153,.4);
  transition: transform .12s ease, background .12s ease;
}
#sg-simple-submit:hover { background: #fc8bab; transform: scale(1.05); }
#sg-simple-submit:focus-visible { outline: 3px solid rgba(251,114,153,.5); outline-offset: 2px; }
#sg-simple-note { font-size: 12px; color: #9499a0; user-select: none; }
html.${SIMPLE_DARK_CLASS} body { background: #17171a !important; }
html.${SIMPLE_DARK_CLASS} #${SIMPLE_ROOT_ID} { background: #17171a; }
html.${SIMPLE_DARK_CLASS} #sg-simple-brand span { color: #d6d7d8; }
html.${SIMPLE_DARK_CLASS} #sg-simple-input { background: #242527; color: #e3e5e7; }
html.${SIMPLE_DARK_CLASS} #sg-simple-note { color: #6e7378; }
`;

// 自绘小电视（粉底、白眼、双天线），不引用B站资源文件，离线可用
const SIMPLE_LOGO_SVG = `
<svg viewBox="0 0 29 26" width="46" height="41" aria-hidden="true">
  <path d="M6.6 2.4 10.4 6.1" stroke="#fb7299" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M22.4 2.4 18.6 6.1" stroke="#fb7299" stroke-width="2.6" stroke-linecap="round"/>
  <rect x="1.5" y="6" width="26" height="18.5" rx="5.4" fill="#fb7299"/>
  <rect x="7.6" y="11.4" width="5" height="6.6" rx="1.5" fill="#fff"/>
  <rect x="16.4" y="11.4" width="5" height="6.6" rx="1.5" fill="#fff"/>
</svg>`;

const MAGNIFIER_SVG = `
<svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true">
  <circle cx="9" cy="9" r="6" fill="none" stroke="#fff" stroke-width="2.2"/>
  <path d="M13.6 13.6 18 18" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;

let simpleHomeOn = false;
let simpleUiTheme = "auto";

function simpleHomePathActive() {
  return SIMPLE_HOME_PATH.test(location.pathname);
}

function resolveSimpleScheme() {
  if (simpleUiTheme === "dark") return "dark";
  if (simpleUiTheme === "light") return "light";
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readSimpleHomeSettings() {
  chrome.storage.sync.get("studyGuardSettings", ({ studyGuardSettings }) => {
    const settings = studyGuardSettings && typeof studyGuardSettings === "object"
      ? studyGuardSettings : {};
    simpleHomeOn = settings.masterEnabled !== false && settings.simpleHomeEnabled === true;
    simpleUiTheme = ["auto", "light", "dark"].includes(settings.uiTheme) ? settings.uiTheme : "auto";
    applySimpleHome();
  });
}

function ensureSimpleStyle() {
  if (document.getElementById("sg-simple-style")) return;
  const style = document.createElement("style");
  style.id = "sg-simple-style";
  style.textContent = SIMPLE_CSS;
  // document_start 阶段 head/body 都可能不存在，样式挂到 <html> 上同样生效
  (document.head || document.documentElement).appendChild(style);
}

function buildSimpleRoot() {
  if (document.getElementById(SIMPLE_ROOT_ID)) return;

  const root = document.createElement("div");
  root.id = SIMPLE_ROOT_ID;
  root.innerHTML = `
    <div id="sg-simple-box">
      <div id="sg-simple-brand">${SIMPLE_LOGO_SVG}<span>哔哩哔哩</span></div>
      <form id="sg-simple-form" action="https://search.bilibili.com/all" method="get" target="_self">
        <input id="sg-simple-input" name="keyword" type="text" autocomplete="off"
               placeholder="搜索想学的内容，回车进入B站搜索" />
        <button id="sg-simple-submit" type="submit" aria-label="搜索">${MAGNIFIER_SVG}</button>
      </form>
      <p id="sg-simple-note">简洁模式已开启：推荐流已隐藏，搜索不受影响。可在扩展面板中关闭。</p>
    </div>`;
  document.body.appendChild(root);

  const form = root.querySelector("#sg-simple-form");
  const input = root.querySelector("#sg-simple-input");
  const goSearch = () => {
    const q = input.value.trim();
    if (q) location.href = "https://search.bilibili.com/all?keyword=" + encodeURIComponent(q);
  };
  // 跳转一律走 location.href：原生表单提交可能被页面的 CSP form-action 拦掉，
  // 且部分内嵌环境对合成键盘事件不触发隐式提交。keydown 兜底 Enter，submit
  // 兜底按钮点击与真实键盘的隐式提交；form 本身保留 action 作为无 JS 时的降级。
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    goSearch();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      goSearch();
    }
  });
  input.focus();
}

function applySimpleHome() {
  const on = simpleHomeOn && simpleHomePathActive();
  document.documentElement.classList.toggle(SIMPLE_CLASS, on);
  document.documentElement.classList.toggle(SIMPLE_DARK_CLASS, on && resolveSimpleScheme() === "dark");
  if (!on) return;
  ensureSimpleStyle();
  if (document.body) buildSimpleRoot();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.studyGuardSettings) readSimpleHomeSettings();
});

// uiTheme 为「跟随系统」时，系统明暗切换要立即反映到启动页上
if (typeof matchMedia === "function") {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applySimpleHome);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applySimpleHome);
}

readSimpleHomeSettings();
