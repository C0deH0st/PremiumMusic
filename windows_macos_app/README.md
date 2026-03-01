# CloudMusic macOS App

独立 Electron 客户端，不影响现有 Web 版（`src/` + `public/`）。

## 功能

- 输入后端地址后连接到你的 CloudMusic Web 服务
- 协议可选：`https` / `http`
- 输入 `xxx.com` 会自动连接到 `https://xxx.com/music`（或你选择的 `http`）
- 输入 `xxx.com/music` 会按该路径连接
- 输入完整 URL（`https://xxx.com/music`）会直接使用

## 开发运行

```bash
cd windows_macos_app
npm install
npm run dev
```

## 打包 macOS App

```bash
cd windows_macos_app
npm install
npm run build:mac
```

产物默认在 `windows_macos_app/dist/` 下（`.dmg`）。

## 常见问题：提示“已损坏，无法打开”

这是 macOS 对未签名/未公证应用的 Gatekeeper 限制，不是程序文件本身损坏。

本机测试可执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Premium Music.app"
```

若要彻底避免该提示，需要使用 Apple Developer 证书进行签名并公证（notarization）。
