<p align="center">
  <img src="./public/images/logo.png" alt="PremiumMusic Logo" width="140" />
</p>

<h1 align="center">PremiumMusic</h1>

<p align="center">Private NetEase Cloud Music Player</p>
<p align="center">Repository intro: an open-source project for private local music management and playback (Web + Desktop).</p>
<p align="center"><strong>Built with OpenAI Codex GPT-5.3 vibe coding</strong></p>

<p align="center">
  <a href="./README.md">简体中文</a> |
  <a href="./README.en.md">English</a>
</p>

## Overview

PremiumMusic is an open-source private music player project with:

- Web backend + frontend (`src/` + `public/`)
- Desktop client source (`windows_macos_app/`, source only; no `node_modules` or `dist`)

## Features

- Local music scanning and playback
- Audio metadata parsing via `music-metadata`
- Lightweight Web UI
- Electron desktop client (macOS source is open)
- macOS and Windows packaging via Electron Builder

## Screenshots

![Home](./docs/screenshots/01-home.png)
![Playlist](./docs/screenshots/02-playlist.png)
![Lyrics](./docs/screenshots/03-lyrics.png)
![Fullscreen](./docs/screenshots/04-fullscreen.png)

## Project Structure

```text
.
├── windows_macos_app/    # Electron desktop source
├── public/               # Web frontend static assets
├── src/                  # Web backend service
├── Dockerfile
├── nginx-example.conf
└── package.json
```

## Run Locally (Web)

```bash
npm install
npm run start
```

Development mode:

```bash
npm run dev
```

## Run Locally (Desktop / macOS source)

```bash
cd windows_macos_app
npm install
npm run dev
```

## macOS “Damaged and can’t be opened” message

This is usually Gatekeeper blocking an unsigned/unnotarized app, not a corrupted file.

For local testing:

```bash
xattr -dr com.apple.quarantine "/Applications/Premium Music.app"
```

To permanently avoid this warning, sign and notarize the app with an Apple Developer certificate.

## Auto Build & Release (GitHub Actions)

The repository includes an automatic release workflow:

- Trigger: push a tag matching `v*` (e.g. `v1.0.0`)
- Targets: macOS (`dmg`) + Windows (`portable exe`)
- Output: uploaded to GitHub Release assets

Release example:

```bash
git tag v1.0.0
git push origin v1.0.0
```
