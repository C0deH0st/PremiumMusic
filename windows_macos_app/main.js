const path = require('path');
const { app, BrowserWindow, ipcMain, Menu } = require('electron');

function buildCandidates(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return [];

  const defaultPath = '/music';

  const normalizeFromUrl = (u) => {
    const protocol = u.protocol === 'http:' ? 'http:' : 'https:';
    const host = u.host;
    if (!host) return '';
    const pathname = u.pathname && u.pathname !== '/' ? u.pathname : defaultPath;
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return `${protocol}//${host}${normalizedPath}${u.search || ''}${u.hash || ''}`;
  };

  if (/^https?:\/\//i.test(raw)) {
    try {
      const normalized = normalizeFromUrl(new URL(raw));
      return normalized ? [normalized] : [];
    } catch (_) {
      return [];
    }
  }

  const stripped = raw.replace(/^\/+/, '');
  const slashIndex = stripped.indexOf('/');
  const host = slashIndex === -1 ? stripped : stripped.slice(0, slashIndex);
  const pathPart = slashIndex === -1 ? '' : stripped.slice(slashIndex);

  if (!host || /\s/.test(host)) return [];

  const pathname = pathPart ? (pathPart.startsWith('/') ? pathPart : `/${pathPart}`) : defaultPath;

  return [
    `https://${host}${pathname}`,
    `http://${host}${pathname}`
  ];
}

function buildAppMenu() {
  const appVersion = app.getVersion();
  const template = [
    {
      label: 'Premium Music',
      submenu: [
        {
          label: '关于 Premium Music',
          click: () => app.showAboutPanel()
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: '服务器',
      submenu: [
        {
          label: '更改连接地址',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            win?.webContents.send('cloudmusic:open-connect-page');
          }
        }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  app.setAboutPanelOptions({
    applicationName: 'Premium Music',
    applicationVersion: appVersion,
    version: appVersion,
    copyright: `Copyright © ${new Date().getFullYear()} Premium Music`
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: 'Premium Music',
    backgroundColor: '#0a0f17',
    icon: path.join(__dirname, 'assets', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('cloudmusic:build-candidates', (_event, rawInput) => {
  return buildCandidates(rawInput);
});

app.whenReady().then(() => {
  buildAppMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
