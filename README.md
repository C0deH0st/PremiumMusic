<p align="center">
  <img src="./public/images/logo.png" alt="PremiumMusic Logo" width="140" />
</p>

<h1 align="center">PremiumMusic</h1>

<p align="center">私有网易云音乐播放器</p>
<p align="center">仓库简介：一个用于本地私有音乐管理与播放的开源项目（Web + Desktop）。</p>
<p align="center"><strong>Built with OpenAI Codex GPT-5.3 vibe coding</strong></p>

<p align="center">
  <a href="./README.md">简体中文</a> |
  <a href="./README.en.md">English</a>
</p>

## 项目简介

PremiumMusic 是一个开源的私有音乐播放器项目，包含：

- Web 服务端与前端（`src/` + `public/`）
- Desktop 客户端源码（`windows_macos_app/`，仅源码，不包含 `node_modules` / `dist`）

## 功能

- 本地音乐扫描与播放
- 音频元数据读取（`music-metadata`）
- 轻量 Web UI
- Electron 桌面客户端（macOS 源码已开源）
- macOS 打包与 Windows 打包（Electron Builder）

## 界面截图

![首页](./docs/screenshots/01-home.png)
![播放列表](./docs/screenshots/02-playlist.png)
![歌词页面](./docs/screenshots/03-lyrics.png)
![全屏模式](./docs/screenshots/04-fullscreen.png)

## 目录结构

```text
.
├── windows_macos_app/    # Electron 客户端源码
├── public/               # Web 前端静态资源
├── src/                  # Web 后端服务
├── Dockerfile
├── nginx-example.conf
└── package.json
```

## 本地运行（Web）

```bash
npm install
npm run start
```

开发模式：

```bash
npm run dev
```

## 本地运行（Desktop / macOS 源码）

```bash
cd windows_macos_app
npm install
npm run dev
```

## macOS “已损坏，无法打开”说明

这是 macOS Gatekeeper 对未签名/未公证应用的拦截，不是文件真的损坏。

本机测试可执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Premium Music.app"
```

若要彻底避免该提示，需要使用 Apple Developer 证书进行签名并公证（notarization）。

## 自动编译与发版（GitHub Actions）

项目已配置自动 Release 工作流：

- 触发条件：推送 tag（格式 `v*`，如 `v1.0.0`）
- 构建目标：macOS（`dmg`）+ Windows（`portable exe`）
- 产物位置：GitHub Release Assets

创建发布示例：

```bash
git tag v1.0.0
git push origin v1.0.0
```
