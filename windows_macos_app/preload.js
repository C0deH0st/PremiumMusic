const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cloudMusicBridge', {
  buildCandidates(rawInput) {
    return ipcRenderer.invoke('cloudmusic:build-candidates', rawInput);
  },
  onOpenConnectPage(callback) {
    const handler = () => callback();
    ipcRenderer.on('cloudmusic:open-connect-page', handler);
    return () => ipcRenderer.removeListener('cloudmusic:open-connect-page', handler);
  }
});
