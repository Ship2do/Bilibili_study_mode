# B站学习模式守护（Edge 扩展）[![Edge 商店](https://img.shields.io/badge/Edge-扩展商店-blue.svg)](https://microsoftedge.microsoft.com/addons/detail/jachmidhanilfknhankklemigokhpbkm)

用于学习场景的反分心扩展，支持互斥判定模式、统一动作策略、AI自定义Prompt、时段策略、密码保护、直播拦截。

## 目录结构

```
shared/                      # 共享模块（仅 background 使用）
  constants.js               # 默认设置、关键词、Prompt 模板
  utils.js                   # 工具函数（关键词匹配、模式规范化等）

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
  overlay.js                 # 拦截弹窗 UI
  page-blocker.js            # 页面拦截（滚动锁定、视频暂停）
  card-hider.js              # 封面隐藏（批量检查、卡片隐藏/恢复）
  video-groups.js            # 视频/直播链接收集、卡片容器识别
  live-parser.js             # 视频/直播 URL 解析
  auto-not-interested.js     # 自动标记"不感兴趣"

popup.html + popup.js        # 弹窗快捷开关与模式切换
options.html + options.js    # 详细设置页（含占位符按钮）
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

### 密码锁

- 降低专注度的操作需要密码（切换弱模式、关闭动作、放宽策略等）
- 提升专注度的操作不要求密码

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
