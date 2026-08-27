# B站学习模式守护（Edge 扩展）[![Edge 商店](https://img.shields.io/badge/Edge-扩展商店-blue.svg)](https://microsoftedge.microsoft.com/addons/detail/jachmidhanilfknhankklemigokhpbkm)

用于学习场景的反分心扩展，支持互斥判定模式、统一动作策略、AI自定义Prompt、时段策略、密码保护、直播拦截、亮/暗主题与拦截界面自定义。

## 目录结构

```
shared/                      # 共享模块（background 与设置页共用）
  constants.js               # 默认设置、UI 设置 schema、关键词、Prompt 模板
  utils.js                   # 工具函数（关键词匹配、模式规范化等）
  banner.js                  # 警示横幅构建（拦截界面与设置页预览共用）

ui/                          # 三个扩展页共用的样式层
  tokens.css                 # 设计令牌唯一来源（亮/暗、尺度、字体、圆角）
  base.css                   # 令牌驱动的通用组件
  options.css / popup.css / welcome.css
  theme.js                   # applyTheme()：主题、强调色、字体、圆角

background/                  # 后台服务模块
  background.js              # 入口：生命周期监听、缓存清理
  settings.js                # 设置读写、校验、密码锁、严格度判定
  keyword-matcher.js         # 关键词文本收集
  evaluator-weak.js          # 弱模式判定（黑名单）
  evaluator-strong.js        # 强模式判定（白名单）
  evaluator-ai.js            # AI模式（Prompt 构建、API 调用、结果解析）
  time-rules.js              # 时段策略（规则匹配、优先级、设置覆盖）
  metadata-video.js          # 视频元数据获取（B站 view + tag API）
  metadata-live.js           # 直播间元数据获取（B站直播 API）
  message-handler.js         # 消息路由、视频校验、缓存、批量检查

content/                     # 内容脚本模块
  content.js                 # 入口：导航监听、状态管理、初始化
  overlay-theme.js           # 拦截界面的调色板与 CSS 模板
  overlay.js                 # 拦截界面（Shadow DOM 隔离、主题令牌下发）
  page-blocker.js            # 页面拦截（呈现方式、滚动锁定、视频暂停、出口控制）
  card-hider.js              # 封面隐藏（批量检查、卡片隐藏/恢复）
  video-groups.js            # 视频/直播链接收集、卡片容器识别
  live-parser.js             # 视频/直播 URL 解析
  auto-not-interested.js     # 自动标记"不感兴趣"

popup.html + popup.js        # 弹窗快捷开关、模式与主题切换
options.html + options.js    # 详细设置页
welcome.html + welcome.js    # 首装引导（六步向导 + 实地试跑）
```

## 核心设计

### 三种互斥模式

| 模式 | 逻辑 | 拦截原因 |
|------|------|---------|
| `weak`（弱模式） | 命中屏蔽词 → 拦截 | 命中屏蔽词 |
| `strong`（强模式） | 未命中学习词 → 拦截 | 未命中学习词 |
| `ai`（AI模式） | AI判定为娱乐 → 拦截 | AI返回的原因 |

### 统一动作

- `actionBlockVideo`：拦截视频页访问
- `actionHideCover`：隐藏推荐/搜索流中的卡片封面
- 约束：至少开启一个动作

### 直播拦截

- 支持 `live.bilibili.com` 上的娱乐性质直播
- 直播间元数据通过B站直播API获取（标题、分区、标签、主播）
- 直播卡片链接形如 `https://live.bilibili.com/<房间号>`（路径中不含 `/live/`），链接收集按主机名匹配

### 时段策略

- `block_all`：完全禁止访问
- `custom`：在时段内覆盖判定模式与动作
- 优先级：`block_all > custom`，同级按规则顺序

### 外观与拦截界面自定义

- 主题：亮色 / 暗色 / 跟随系统，六种强调色预设，三档字体与圆角
- 拦截界面：自定义标题与鼓励语、是否显示视频信息、横幅密度/速度/色相（带实时预览）
- 三种拦截呈现方式：

| 方式 | 效果 | 滚动锁 | 横幅 |
|------|------|--------|------|
| 全屏遮罩（默认） | 完全挡住页面 | 跟随设置 | 支持 |
| 毛玻璃卡片 | 页面可见但拦住点击 | 跟随设置 | 否 |
| 顶部提示条 | 不阻断观看 | 强制关闭 | 否 |

拦截界面注入在 Shadow DOM 里，并对宿主的关键样式与全部可继承属性做了
`!important` 加固——否则B站的全局规则（`div { ... !important }`、
`* { letter-spacing: ... !important }`）会击穿遮罩底色和中文字距。

### 密码锁

密码锁只管**拦截强度**，不管**样式**：

- **样式（自由改）**：明暗、主题色、横幅文案 / 密度 / 颜色、是否显示视频信息
- **强度（需要密码）**：呈现方式降级、「继续观看」出口、自动放行、取消滚动锁、取消视频暂停、遮罩调淡

强度按 6 个独立维度逐一比较，任一维变弱即要求密码。刻意不合成加权总分——
加权分可以被补偿攻击绕过（把遮罩调到看不清、同时把无关维度调严，总分持平就
不用密码了）。连续值（不透明度、秒数）只分 2~3 档，档位名直接显示在滑块旁，
让「调到哪里会要密码」对用户可预期。

提升专注度的操作一律不要求密码。

### 首次使用引导

首次安装会自动打开六步引导：选判定模式 → 配关键词（六个学科预设包一键填充）
→ 外观 → 密码锁 → 用刚配的规则实地试跑三个示例视频。

引导支持弱 / 强 / AI 三种模式（选 AI 时第三步改为填接口配置）。默认预选**弱模式**而非冷启动的强模式——新用户直接用白名单会几乎全站
被拦，这是最大的首次体验陷阱。选强模式且关键词为 0 时「下一步」会被禁用。

升级不会打扰老用户，只在图标上挂一个角标。

## AI Prompt 设置

默认模板：`标题为{{title}}的视频，分区是{{partition}}，标签是{{tags}}，请你判断是否为娱乐类视频。`

系统自动添加JSON输出格式要求：`{"is_learning": true/false, "reason": "简短原因"}`

设置页提供可点击的占位符按钮（标题、分区、标签、UP主、简介、时长、BV号、完整元数据）。

### API URL

填写 Base URL 即可，系统自动补全 `/v1/chat/completions`：

| 输入 | 补全为 |
|------|--------|
| `https://api.deepseek.com` | `https://api.deepseek.com/v1/chat/completions` |
| `https://api.openai.com` | `https://api.openai.com/v1/chat/completions` |
| 已含完整路径 | 原样使用 |

### 接口域名授权

扩展只固定申请 B站相关域名。AI 接口域名由你自己填写，因此改为**按需授权**：在设置页保存时，浏览器会请求访问该域名的权限，API URL 下方会显示当前授权状态。

> 从 2.1.0 之前的版本升级：AI 模式需要在设置页**重新保存一次**以完成授权，否则 AI 判定会失败（此时会按安全策略拦截）。

## 安装

### Edge 浏览器（推荐）

[![Edge 商店](https://img.shields.io/badge/Edge-扩展商店-blue.svg)](https://microsoftedge.microsoft.com/addons/detail/jachmidhanilfknhankklemigokhpbkm)

### 本地安装

1. 打开 `edge://extensions/`
2. 开启"开发人员模式"
3. 点击"加载解压缩的扩展"
4. 选择本目录

## 兼容范围

- `www.bilibili.com`（视频页与推荐流）
- `search.bilibili.com`（搜索结果）
- `live.bilibili.com`（直播间）
- AI 接口域名：按需授权，由设置页在保存时申请

浏览器要求 **Chrome / Edge 123 以上**（样式令牌用了 CSS 的 `light-dark()`，
它让亮暗主题只写一份、跟随系统时零 JS 零闪烁）。
