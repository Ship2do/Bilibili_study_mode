# B站学习模式守护（Edge 扩展）

用于学习场景的反分心扩展，支持互斥判定模式、统一动作策略、AI自定义Prompt、时段策略、密码保护。

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

- `weak`：仅匹配屏蔽词（黑名单）
- `strong`：仅匹配学习词（白名单）
- `ai`：AI判定学习向/非学习向，支持前置黑名单过滤

### 2) 统一动作（Actions）

- `actionBlockVideo`：拦截视频页访问
- `actionHideCover`：隐藏推荐/搜索等流里的卡片封面
- 约束：至少开启一个动作

### 3) 时段策略精简

- 仅保留两种时段规则模式：
  - `block_all`：完全禁止访问
  - `custom`：在时段内覆盖判定模式与动作
- 冲突优先级：`block_all > custom`，同级按规则顺序

### 4) 密码锁（降级保护）

- 任何降低专注度的操作需要密码，例如：
  - 切换到更弱模式
  - 关闭拦截或隐藏动作
  - 放宽关键词策略
  - 关闭/放宽时段策略
- 提升专注度的操作不要求密码

## AI Prompt 与可用占位符

AI模式支持自定义Prompt模板，常用占位符包括：

- `{{title}}` 视频标题
- `{{partition}}` 分区
- `{{tags}}` 标签文本
- `{{owner_name}}` UP主名
- `{{owner_mid}}` UP主ID
- `{{owner_sign}}` UP主签名
- `{{description}}` 视频简介
- `{{aid}}` AV号
- `{{bvid}}` BV号
- `{{duration}}` 时长
- `{{pubdate}}` 发布时间戳
- `{{metadata_json}}` 完整元数据JSON

## 目录

- `manifest.json`：扩展配置（MV3）
- `background.js`：规则判定、AI请求、时段策略、密码降级校验
- `content.js`：页面拦截层、封面隐藏、自动不感兴趣（最佳努力）
- `popup.html` + `popup.js`：首页快捷开关与模式切换
- `options.html` + `options.js`：详细设置页

## 安装

1. 打开 `edge://extensions/`
2. 开启“开发人员模式”
3. 点击“加载解压缩的扩展”
4. 选择目录：`d:\桌面\Bilibili_study_mode`

## 兼容范围

- `www.bilibili.com`
- `search.bilibili.com`

## AI接口说明

- 需自行提供可用的兼容接口（默认按 `chat/completions` 请求格式发送）
- 需填写：API URL / API Key / Model
- AI调用可能产生费用