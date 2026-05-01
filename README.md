# B站学习模式守护（Edge 扩展）

用于学习场景的反分心扩展，支持互斥判定模式、统一动作策略、AI自定义Prompt、时段策略、密码保护、直播拦截。

## 功能结构

- 首页（插件弹窗）提供快速操作
  - 快速模式切换：`weak` / `strong` / `ai`
  - 拦截视频（actionBlockVideo）
  - 隐藏封面（actionHideCover）
  - 自动不感兴趣
  - 时段策略
  - 专注密码锁
- 详细设置页用于配置关键词、AI参数、AI Prompt、时段规则、密码

## 核心设计

### 1) 三种互斥模式（Mode）

- `weak`（弱模式）：仅匹配屏蔽词（黑名单），命中即拦截
- `strong`（强模式）：仅匹配学习词（白名单），未命中即拦截
- `ai`（AI模式）：AI判定是否为娱乐类视频，支持前置黑名单过滤

### 2) 统一动作（Actions）

- `actionBlockVideo`：拦截视频页访问
- `actionHideCover`：隐藏推荐/搜索等流里的卡片封面
- 约束：至少开启一个动作

### 3) 拦截弹窗

拦截视频时弹窗仅显示：
- 当前模式（弱模式 / 强模式 / AI模式）
- 拦截原因（弱模式：命中屏蔽词；强模式：未命中学习词；AI模式：AI返回的原因）
- 视频标题与分区

### 4) 直播拦截

- 支持拦截 `live.bilibili.com` 上的娱乐性质直播
- 直播间元数据（标题、分区、标签、主播）通过B站直播API获取
- 与普通视频使用相同的判定逻辑和关键词匹配

### 5) 时段策略精简

- 仅保留两种时段规则模式：
  - `block_all`：完全禁止访问
  - `custom`：在时段内覆盖判定模式与动作
- 冲突优先级：`block_all > custom`，同级按规则顺序

### 6) 密码锁（降级保护）

- 任何降低专注度的操作需要密码，例如：
  - 切换到更弱模式
  - 关闭拦截或隐藏动作
  - 放宽关键词策略
  - 关闭/放宽时段策略
- 提升专注度的操作不要求密码

## AI Prompt 设置

### 默认模板

```
标题为{{title}}的视频，分区是{{partition}}，标签是{{tags}}，请你判断是否为娱乐类视频。
```

系统会自动在AI请求中添加JSON输出格式要求，用户无需手动添加。AI返回格式：

```json
{"is_learning": true/false, "reason": "简短原因"}
```

### 可用占位符

设置页提供可点击的占位符按钮，点击后自动插入到Prompt光标位置：

| 按钮 | 占位符 | 说明 |
|------|--------|------|
| 标题 | `{{title}}` | 视频标题 |
| 分区 | `{{partition}}` | 视频分区 |
| 标签 | `{{tags}}` | 视频标签 |
| UP主 | `{{owner_name}}` | UP主昵称 |
| 简介 | `{{description}}` | 视频简介 |
| 时长 | `{{duration}}` | 视频时长 |
| BV号 | `{{bvid}}` | 视频BV号 |
| 完整元数据 | `{{metadata_json}}` | 完整元数据JSON |

其他可用占位符（需手动输入）：`{{owner_mid}}`、`{{owner_sign}}`、`{{aid}}`、`{{pubdate}}`

### API URL 说明

填写 Base URL 即可，系统会自动补全路径：

| 输入 | 自动补全为 |
|------|-----------|
| `https://api.deepseek.com` | `https://api.deepseek.com/v1/chat/completions` |
| `https://api.openai.com` | `https://api.openai.com/v1/chat/completions` |
| `https://api.deepseek.com/v1` | `https://api.deepseek.com/v1/chat/completions` |
| 已包含完整路径的URL | 原样使用 |

## 目录

- `manifest.json`：扩展配置（MV3）
- `background.js`：规则判定、AI请求、时段策略、密码降级校验、直播元数据获取
- `content.js`：页面拦截层、封面隐藏、自动不感兴趣、直播链接识别
- `popup.html` + `popup.js`：首页快捷开关与模式切换
- `options.html` + `options.js`：详细设置页（含占位符按钮）

## 安装

1. 打开 `edge://extensions/`
2. 开启"开发人员模式"
3. 点击"加载解压缩的扩展"
4. 选择目录：`d:\桌面\Bilibili_study_mode`

## 兼容范围

- `www.bilibili.com`（视频页面与推荐流）
- `search.bilibili.com`（搜索结果）
- `live.bilibili.com`（直播间）

## AI接口说明

- 需自行提供可用的兼容接口（OpenAI格式的 `chat/completions` 接口）
- 需填写：API URL（Base URL即可） / API Key / Model
- AI调用可能产生费用
