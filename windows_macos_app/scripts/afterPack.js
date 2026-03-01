const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const targetPath = path.join(context.appOutDir, 'ffmpeg.dll');
  if (fs.existsSync(targetPath)) return;

  const sourcePath = path.join(context.packager.info.projectDir, 'node_modules', 'electron', 'dist', 'ffmpeg.dll');
  if (!fs.existsSync(sourcePath)) {
    console.warn('[afterPack] ffmpeg.dll source not found:', sourcePath);
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
  console.log('[afterPack] copied ffmpeg.dll to', targetPath);
};
