# PremiumMusic - 私有网易云音乐播放器

一个基于 Node.js + Express 的私有音乐播放器服务，用于在本地或私有环境中提供类网易云音乐风格的播放体验。

## 功能特性

- 本地音乐资源管理与播放
- Web 前端界面
- 后端 API 服务（Express）
- 支持解析音频元数据（`music-metadata`）

## 技术栈

- Node.js
- Express
- Axios
- music-metadata

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务

```bash
npm run start
```

或开发模式：

```bash
npm run dev
```

默认入口：`src/server.js`

## 项目结构

```text
.
├── src/                 # 后端服务
├── public/              # 前端静态资源
├── Dockerfile
├── nginx-example.conf
└── package.json
```

## English

For the English version, see [README.en.md](./README.en.md).
