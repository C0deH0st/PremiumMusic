# PremiumMusic - Private NetEase Cloud Music Player

A private music player service built with Node.js + Express, designed to provide a NetEase Cloud Music-like playback experience in local or private environments.

## Features

- Local music library management and playback
- Web frontend interface
- Backend API service (Express)
- Audio metadata parsing via `music-metadata`

## Tech Stack

- Node.js
- Express
- Axios
- music-metadata

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start server

```bash
npm run start
```

Or for development:

```bash
npm run dev
```

Default entry point: `src/server.js`

## Project Structure

```text
.
├── src/                 # Backend service
├── public/              # Frontend static assets
├── Dockerfile
├── nginx-example.conf
└── package.json
```

## 中文

Chinese documentation is available at [README.md](./README.md).
