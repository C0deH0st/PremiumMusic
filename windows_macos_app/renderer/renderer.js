const hostInput = document.getElementById('hostInput');
const connectBtn = document.getElementById('connectBtn');
const statusText = document.getElementById('statusText');
const musicView = document.getElementById('musicView');
const connectScreen = document.getElementById('connectScreen');

const STORAGE_KEY = 'premium-music-desktop-connection';
let activeAttempt = 0;

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? '#ff9c9c' : '#9ea8bc';
}

function setConnectingState(connecting) {
  connectBtn.disabled = connecting;
  connectBtn.textContent = connecting ? '连接中...' : '连接';
}

function showConnectScreen() {
  connectScreen.classList.add('active');
  hostInput.focus();
  hostInput.select();
}

function hideConnectScreen() {
  connectScreen.classList.remove('active');
}

function saveHost(host) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ host }));
}

function loadHost() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return '';
    return JSON.parse(raw)?.host || '';
  } catch (_err) {
    return '';
  }
}

function loadUrlWithResult(url, attemptId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;

    const cleanup = () => {
      musicView.removeEventListener('did-stop-loading', onStop);
      musicView.removeEventListener('did-fail-load', onFail);
      if (timeoutId) clearTimeout(timeoutId);
    };

    const onStop = () => {
      if (settled || attemptId !== activeAttempt) return;
      settled = true;
      cleanup();
      resolve(url);
    };

    const onFail = (event) => {
      if (event.errorCode === -3) return;
      if (settled || attemptId !== activeAttempt) return;
      settled = true;
      cleanup();
      reject(new Error(event.errorDescription || 'load failed'));
    };

    timeoutId = setTimeout(() => {
      if (settled || attemptId !== activeAttempt) return;
      settled = true;
      cleanup();
      reject(new Error('timeout'));
    }, 10000);

    musicView.addEventListener('did-stop-loading', onStop);
    musicView.addEventListener('did-fail-load', onFail);
    musicView.src = url;
  });
}

async function connectByInput(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) {
    setStatus('请输入域名或地址，例如：xxx.com', true);
    hostInput.focus();
    return;
  }

  const candidates = await window.cloudMusicBridge.buildCandidates(input);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    setStatus('地址格式无效，请检查输入', true);
    return;
  }

  activeAttempt += 1;
  const attemptId = activeAttempt;
  setConnectingState(true);

  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i];
    setStatus(`尝试连接：${url}`);
    try {
      await loadUrlWithResult(url, attemptId);
      if (attemptId !== activeAttempt) return;
      saveHost(input);
      setStatus(`已连接：${url}`);
      hideConnectScreen();
      setConnectingState(false);
      return;
    } catch (_err) {
      continue;
    }
  }

  if (attemptId === activeAttempt) {
    setStatus('连接失败，请检查服务地址或证书', true);
    setConnectingState(false);
  }
}

connectBtn.addEventListener('click', () => connectByInput(hostInput.value));

hostInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    connectByInput(hostInput.value);
  }
});

musicView.addEventListener('did-start-loading', () => {
  if (!connectScreen.classList.contains('active')) {
    const current = musicView.getURL();
    setStatus(`加载中：${current || '目标页面'}`);
  }
});

musicView.addEventListener('did-fail-load', (event) => {
  if (event.errorCode === -3) return;
  if (!connectScreen.classList.contains('active')) {
    setStatus(`加载失败：${event.errorDescription || '未知错误'}`, true);
    showConnectScreen();
  }
});

window.cloudMusicBridge.onOpenConnectPage(() => {
  showConnectScreen();
});

window.addEventListener('DOMContentLoaded', () => {
  const savedHost = loadHost();
  if (savedHost) {
    hostInput.value = savedHost;
    connectByInput(savedHost);
  } else {
    showConnectScreen();
  }
});
