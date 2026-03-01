const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mm = require('music-metadata');
const axios = require('axios');

axios.defaults.timeout = 10000;
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const app = express();
const PORT = process.env.PORT || 3001;
const MUSIC_DIR = process.env.MUSIC_DIR || '/music';
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '../cache');
const LYRICS_CACHE_DIR = path.join(CACHE_DIR, 'lyrics');
const COVER_CACHE_DIR = path.join(CACHE_DIR, 'covers');
const BASE_PATH_RAW = process.env.BASE_PATH ?? '/music';
const BASE_PATH = BASE_PATH_RAW
  ? `/${BASE_PATH_RAW.replace(/^\/+|\/+$/g, '')}`
  : '';
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.wav', '.ogg']);
const AUDIO_MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

app.use(cors());
const router = express.Router();
router.use(express.static(path.join(__dirname, '../public')));

function decodeSongId(id) {
  try {
    return Buffer.from(id.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString('utf8');
  } catch (err) {
    return '';
  }
}

function findLocalCoverPath(filePath) {
  const dirName = path.dirname(filePath);
  const coverFiles = ['cover.jpg', 'folder.jpg', 'album.jpg', 'cover.png', 'folder.png', 'album.png'];

  for (const cf of coverFiles) {
    const coverPath = path.join(dirName, cf);
    if (fs.existsSync(coverPath)) {
      return coverPath;
    }
  }

  return null;
}

// 缓存歌曲列表
let songsCache = [];
let cacheTime = 0;
let isRefreshing = false;
let backgroundRefreshTimer = null;

// 缓存配置
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
const BACKGROUND_REFRESH_INTERVAL = 60 * 1000; // 后台刷新间隔 1分钟
const STALE_THRESHOLD = 0.8; // 缓存过期前80%时间开始后台刷新

// 获取音乐目录下的所有音频文件
async function scanMusicDirectory(dir) {
  const songs = [];
  
  async function scanRecursive(currentDir) {
    try {
      const files = fs.readdirSync(currentDir);
      
      for (const file of files) {
        const fullPath = path.join(currentDir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          await scanRecursive(fullPath);
        } else if (AUDIO_EXTENSIONS.has(path.extname(file).toLowerCase())) {
          try {
            const metadata = await mm.parseFile(fullPath);
            const common = metadata.common;
            
            const localCoverPath = findLocalCoverPath(fullPath);
            const localCover = localCoverPath
              ? `${BASE_PATH}/api/local-cover?file=${encodeURIComponent(fullPath)}`
              : null;
            const hasEmbeddedCover = Array.isArray(common.picture) && common.picture.length > 0;
            const songId = Buffer.from(fullPath).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
            const songTitle = common.title || path.parse(file).name;
            const songArtist = common.artist || '未知艺术家';
            const coverUrl = `${BASE_PATH}/api/cover/${songId}`;
            
            songs.push({
              id: songId,
              filename: file,
              filepath: fullPath,
              relativePath: path.relative(MUSIC_DIR, fullPath),
              folder: path.basename(path.dirname(fullPath)),
              title: common.title || path.parse(file).name,
              artist: common.artist || '未知艺术家',
              album: common.album || '未知专辑',
              duration: metadata.format.duration || 0,
              hasEmbeddedCover,
              localCover: localCover,
              cover: coverUrl
            });
          } catch (err) {
            console.error(`Error parsing ${file}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error(`Error scanning ${currentDir}:`, err.message);
    }
  }
  
  await scanRecursive(dir);
  return songs;
}

// 后台刷新缓存
async function backgroundRefreshCache() {
  if (isRefreshing) return;
  
  const now = Date.now();
  const age = now - cacheTime;
  
  // 如果缓存不存在或已过期，立即刷新
  if (songsCache.length === 0 || age >= CACHE_TTL) {
    await refreshCacheInternal();
    return;
  }
  
  // 如果缓存即将过期，在后台刷新
  if (age >= CACHE_TTL * STALE_THRESHOLD) {
    // 异步刷新，不阻塞
    refreshCacheInternal().catch(err => {
      console.error('Background refresh failed:', err.message);
    });
  }
}

// 启动后台刷新定时器（延迟启动，避免阻塞）
function startBackgroundRefresh() {
  if (backgroundRefreshTimer) return;
  
  backgroundRefreshTimer = setInterval(() => {
    backgroundRefreshCache();
  }, BACKGROUND_REFRESH_INTERVAL);
  
  // 延迟 3 秒后再触发首次后台检查，避免启动时阻塞
  setTimeout(() => {
    backgroundRefreshCache();
  }, 3000);
}

// 内部刷新缓存函数
async function refreshCacheInternal() {
  if (isRefreshing) return;
  
  isRefreshing = true;
  
  try {
    if (!fs.existsSync(MUSIC_DIR)) {
      fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    if (!fs.existsSync(LYRICS_CACHE_DIR)) {
      fs.mkdirSync(LYRICS_CACHE_DIR, { recursive: true });
    }
    if (!fs.existsSync(COVER_CACHE_DIR)) {
      fs.mkdirSync(COVER_CACHE_DIR, { recursive: true });
    }
    
    const newSongs = await scanMusicDirectory(MUSIC_DIR);
    songsCache = newSongs;
    cacheTime = Date.now();
    
    console.log(`Cache refreshed: ${newSongs.length} songs`);
  } catch (err) {
    console.error('Error refreshing cache:', err);
    throw err;
  } finally {
    isRefreshing = false;
  }
}

function getCacheKey(title, artist) {
  const cleanName = (name) => {
    if (!name) return '';
    return name.replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase();
  };
  return `${cleanName(artist)}_${cleanName(title)}`;
}

function getLyricsCachePath(title, artist) {
  const key = getCacheKey(title, artist);
  return path.join(LYRICS_CACHE_DIR, `${key}.json`);
}

function saveLyricsCache(title, artist, lyrics) {
  try {
    const cachePath = getLyricsCachePath(title, artist);
    const data = JSON.stringify({ title, artist, lyrics, cachedAt: Date.now() });
    fs.writeFileSync(cachePath, data, 'utf8');
    console.log(`Lyrics cached: ${title} - ${artist}`);
  } catch (e) {
    console.log('Failed to save lyrics cache:', e.message);
  }
}

function getLyricsCache(title, artist) {
  try {
    const cachePath = getLyricsCachePath(title, artist);
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const cacheAge = Date.now() - data.cachedAt;
      const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
      if (cacheAge < CACHE_TTL) {
        console.log(`Lyrics cache hit: ${title} - ${artist}`);
        return data.lyrics;
      }
    }
  } catch (e) {
    console.log('Failed to read lyrics cache:', e.message);
  }
  return null;
}

function getCoverCachePath(title, artist) {
  const key = getCacheKey(title, artist);
  return path.join(COVER_CACHE_DIR, `${key}.jpg`);
}

async function saveCoverCache(title, artist, coverUrl) {
  try {
    const cachePath = getCoverCachePath(title, artist);
    const response = await axios.get(coverUrl, { timeout: 15000, responseType: 'arraybuffer' });
    fs.writeFileSync(cachePath, Buffer.from(response.data));
    console.log(`Cover cached: ${title} - ${artist}`);
    return cachePath;
  } catch (e) {
    console.log('Failed to save cover cache:', e.message);
    return null;
  }
}

function getCoverCache(title, artist) {
  try {
    const cachePath = getCoverCachePath(title, artist);
    if (fs.existsSync(cachePath)) {
      const stats = fs.statSync(cachePath);
      const cacheAge = Date.now() - stats.mtimeMs;
      const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
      if (cacheAge < CACHE_TTL) {
        console.log(`Cover cache hit: ${title} - ${artist}`);
        return cachePath;
      }
    }
  } catch (e) {
    console.log('Failed to read cover cache:', e.message);
  }
  return null;
}

// 本地封面图片服务
router.get('/api/local-cover', async (req, res) => {
  const filePath = req.query.file;
  if (!filePath) return res.status(400).send('Missing file parameter');

  const coverPath = findLocalCoverPath(filePath);
  if (coverPath) {
    const ext = path.extname(coverPath).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    return fs.createReadStream(coverPath).pipe(res);
  }

  res.status(404).send('Cover not found');
});

// 封面服务：内嵌封面 -> 联网缓存 -> 联网API
router.get('/api/cover/:id', async (req, res) => {
  const filepath = decodeSongId(req.params.id);
  if (!filepath || !fs.existsSync(filepath)) {
    return res.status(404).send('File not found');
  }

  try {
    const metadata = await mm.parseFile(filepath);
    const common = metadata.common;
    const picture = metadata.common?.picture?.[0];
    
    if (picture?.data) {
      const mimeType = picture.format || 'image/jpeg';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(picture.data));
    }

    const title = common.title || path.parse(filepath).name;
    const artist = common.artist || '未知艺术家';
    const cachedCoverPath = getCoverCache(title, artist);
    
    if (cachedCoverPath) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return fs.createReadStream(cachedCoverPath).pipe(res);
    }

    const cleanTitle = (name) => {
      if (!name) return '';
      return name.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, '').replace(/[-–—]/g, ' ').trim();
    };
    const cleanSong = cleanTitle(title);
    const cleanArtist = cleanTitle(artist);

    let coverUrl = null;

    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanSong + ' ' + cleanArtist)}&media=music&entity=song&limit=5`;
      const itunesRes = await axios.get(itunesUrl, { timeout: 8000 });
      
      if (itunesRes.data && itunesRes.data.results && itunesRes.data.results.length > 0) {
        const itunesResult = itunesRes.data.results[0];
        if (itunesResult.artworkUrl100) {
          coverUrl = itunesResult.artworkUrl100.replace('100x100', '600x600');
          console.log('Cover found from iTunes');
        }
      }
    } catch (e) {
      console.log('iTunes cover fetch failed:', e.message);
    }

    if (!coverUrl) {
      try {
        const qqSearchUrl = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?new_json=1&cr=1&pid=1&simpl=1&w=${encodeURIComponent(cleanSong + ' ' + cleanArtist)}&format=json`;
        const qqRes = await axios.get(qqSearchUrl, { 
          timeout: 8000,
          headers: {
            'Referer': 'https://y.qq.com/',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
          }
        });
        
        if (qqRes.data && qqRes.data.data && qqRes.data.data.song && qqRes.data.data.song.list && qqRes.data.data.song.list.length > 0) {
          const song = qqRes.data.data.song.list[0];
          if (song.album && song.album.picUrl) {
            coverUrl = song.album.picUrl;
            console.log('Cover found from QQ Music');
          }
        }
      } catch (e) {
        console.log('QQ Music cover fetch failed:', e.message);
      }
    }

    if (coverUrl) {
      const cachedPath = await saveCoverCache(title, artist, coverUrl);
      if (cachedPath) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return fs.createReadStream(cachedPath).pipe(res);
      }
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const response = await axios.get(coverUrl, { timeout: 15000, responseType: 'arraybuffer' });
      return res.send(Buffer.from(response.data));
    }

    return res.status(404).send('Cover not found');
  } catch (err) {
    console.error(`Error loading cover for ${filepath}:`, err.message);
    return res.status(500).send('Failed to read cover');
  }
});

// 获取所有歌曲列表
router.get('/api/songs', async (req, res) => {
  const now = Date.now();
  const cacheAge = now - cacheTime;
  
  // 如果缓存有效，直接返回
  if (songsCache.length > 0 && cacheAge < CACHE_TTL) {
    return res.json({
      songs: songsCache,
      cached: true,
      cacheAge: cacheAge
    });
  }
  
  // 如果正在刷新中，等待刷新完成
  if (isRefreshing) {
    // 如果已经有缓存，等待刷新完成
    if (songsCache.length > 0) {
      try {
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (!isRefreshing) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          // 超时保护
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        });
        
        return res.json({
          songs: songsCache,
          cached: false,
          cacheAge: Date.now() - cacheTime
        });
      } catch (e) {
        return res.json({
          songs: songsCache,
          cached: true,
          cacheAge: Date.now() - cacheTime
        });
      }
    } else {
      // 没有缓存但正在刷新，需要等待
      try {
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (!isRefreshing || songsCache.length > 0) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          // 超时保护
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 30000); // 首次扫描可能需要更长时间
        });
        
        return res.json({
          songs: songsCache,
          cached: false,
          cacheAge: Date.now() - cacheTime
        });
      } catch (e) {
        return res.status(500).json({ error: 'Failed to load songs' });
      }
    }
  }
  
  // 缓存不存在或已过期，需要扫描
  try {
    await refreshCacheInternal();
    return res.json({
      songs: songsCache,
      cached: false,
      cacheAge: 0
    });
  } catch (err) {
    console.error('Error scanning music:', err);
    // 如果有旧缓存，返回旧缓存
    if (songsCache.length > 0) {
      return res.json({
        songs: songsCache,
        cached: true,
        cacheAge: Date.now() - cacheTime,
        stale: true
      });
    }
    return res.status(500).json({ error: 'Failed to scan music directory' });
  }
});

// 获取缓存状态
router.get('/api/cache-status', (req, res) => {
  const now = Date.now();
  const cacheAge = now - cacheTime;
  
  res.json({
    hasCache: songsCache.length > 0,
    songCount: songsCache.length,
    cacheAge: cacheAge,
    isExpired: cacheAge >= CACHE_TTL,
    isRefreshing: isRefreshing,
    ttl: CACHE_TTL
  });
});

// 预热缓存
router.post('/api/warmup', async (req, res) => {
  try {
    await refreshCacheInternal();
    res.json({ success: true, count: songsCache.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 刷新歌曲列表
router.post('/api/refresh', async (req, res) => {
  try {
    await refreshCacheInternal();
    res.json({ success: true, count: songsCache.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取歌词 - 优先内嵌歌词
router.get('/api/lyrics/:id', async (req, res) => {
  const filepath = decodeSongId(req.params.id);
  
  if (!filepath || !fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  try {
    const metadata = await mm.parseFile(filepath);
    
    // 1. 优先使用内嵌歌词
    if (metadata.common.lyrics && metadata.common.lyrics.length > 0) {
      return res.json({ source: 'embedded', lyrics: metadata.common.lyrics });
    }
    
    // 2. 尝试本地 lrc 文件
    const fileInfo = path.parse(filepath);
    const lrcPath = path.join(fileInfo.dir, `${fileInfo.name}.lrc`);
    if (fs.existsSync(lrcPath)) {
      const lrcContent = fs.readFileSync(lrcPath, 'utf8');
      return res.json({ source: 'local', lyrics: parseLRC(lrcContent) });
    }
    
    // 3. 检查歌词缓存
    const title = metadata.common.title || path.parse(filepath).name;
    const artist = metadata.common.artist || '';
    
    const cachedLyrics = getLyricsCache(title, artist);
    if (cachedLyrics && cachedLyrics.length > 0) {
      return res.json({ source: 'cache', lyrics: cachedLyrics });
    }
    
    // 4. 调用外部API获取歌词
    try {
      const lyricsData = await fetchLyricsFromAPI(title, artist);
      if (lyricsData && lyricsData.length > 0) {
        saveLyricsCache(title, artist, lyricsData);
        return res.json({ source: 'api', lyrics: lyricsData });
      }
    } catch (e) {
      console.error('Lyrics API error:', e.message);
    }
    
    res.json({ source: 'none', lyrics: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 解析LRC格式歌词
function parseLRC(lrcContent) {
  const lines = lrcContent.split('\n');
  const lyrics = [];
  
  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const ms = parseInt(match[3].padEnd(3, '0'));
      const time = minutes * 60 + seconds + ms / 1000;
      const text = match[4].trim();
      
      if (text) {
        lyrics.push({ time, text });
      }
    }
  }
  
  return lyrics.sort((a, b) => a.time - b.time);
}

// 从多个API获取歌词 - 依次尝试，成功则返回
async function fetchLyricsFromAPI(songName, artist) {
  const cleanName = (name) => {
    if (!name) return '';
    return name.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, '').replace(/[-–—]/g, ' ').trim();
  };
  const cleanSong = cleanName(songName);
  const cleanArtist = cleanName(artist);

  if (!cleanSong) {
    console.log('No song name provided for lyrics search');
    return null;
  }

  const searchQueries = [
    { artist: cleanArtist, song: cleanSong },
    { artist: '', song: cleanSong.split(' ')[0] },
    { artist: cleanArtist, song: cleanSong.replace(/[\u4e00-\u9fa5]/g, '') }
  ].filter(q => q.song);

  const apis = [
    // 1. LRCLIB - 主推荐，稳定且支持同步歌词
    async () => {
      for (const query of searchQueries) {
        try {
          const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(query.artist || '')}&track_name=${encodeURIComponent(query.song)}`;
          const res = await axios.get(url, { timeout: 10000 });
          if (res.data && res.data.syncedLyrics) {
            return { lyrics: parseLRC(res.data.syncedLyrics), source: 'lrclib' };
          } else if (res.data && res.data.plainLyrics) {
            const lines = res.data.plainLyrics.split('\n').filter(l => l.trim());
            return { 
              lyrics: lines.map((text, i) => ({ time: i * 3, text })), 
              source: 'lrclib' 
            };
          }
        } catch (e) {
          console.log('lrclib failed:', e.message);
        }
      }
      return null;
    },

    // 2. LRCLIB 搜索API - 如果直接获取失败，尝试搜索
    async () => {
      try {
        const searchUrl = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanSong)}&limit=3`;
        const res = await axios.get(searchUrl, { timeout: 10000 });
        if (res.data && res.data.length > 0) {
          const best = res.data[0];
          if (best.syncedLyrics) {
            return { lyrics: parseLRC(best.syncedLyrics), source: 'lrclib-search' };
          } else if (best.plainLyrics) {
            const lines = best.plainLyrics.split('\n').filter(l => l.trim());
            return { 
              lyrics: lines.map((text, i) => ({ time: i * 3, text })), 
              source: 'lrclib-search' 
            };
          }
        }
      } catch (e) {
        console.log('lrclib search failed:', e.message);
      }
      return null;
    },
    
    // 3. lyrics.ovh - 免费API
    async () => {
      for (const query of searchQueries) {
        if (!query.artist) continue;
        try {
          const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(query.artist)}/${encodeURIComponent(query.song)}`;
          const res = await axios.get(url, { timeout: 8000 });
          if (res.data && res.data.lyrics) {
            const lines = res.data.lyrics.split('\n').filter(l => l.trim() && !l.includes('****'));
            return { 
              lyrics: lines.map((text, i) => ({ time: i * 3, text })), 
              source: 'lyrics.ovh' 
            };
          }
        } catch (e) {
          console.log('lyrics.ovh failed:', e.message);
        }
      }
      return null;
    }
  ];
  
  for (const api of apis) {
    try {
      const result = await api();
      if (result && result.lyrics && result.lyrics.length > 0) {
        console.log(`Lyrics found from ${result.source}`);
        return result.lyrics;
      }
    } catch (e) {
      console.log('API error:', e.message);
      continue;
    }
  }
  
  console.log('No lyrics found from any API');
  return null;
}

// 播放音乐流
router.get('/api/play/:id', (req, res) => {
  const filepath = decodeSongId(req.params.id);
  
  if (!filepath || !fs.existsSync(filepath)) {
    return res.status(404).send('File not found');
  }

  const ext = path.extname(filepath).toLowerCase();
  const contentType = AUDIO_MIME_TYPES[ext] || 'application/octet-stream';
  
  const stat = fs.statSync(filepath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType
    });
    
    fs.createReadStream(filepath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType
    });
    
    fs.createReadStream(filepath).pipe(res);
  }
});

// 注意：移除了 fs.watch 递归监听功能
// 如需文件变化自动刷新，请使用前端的刷新按钮或调用 /api/refresh

if (BASE_PATH) {
  app.get('/', (req, res) => {
    res.redirect(302, `${BASE_PATH}/`);
  });
}

app.use(BASE_PATH || '/', router);

// 启动服务器
app.listen(PORT, () => {
  console.log(`CloudMusic Player running on port ${PORT}`);
  console.log(`Music directory: ${MUSIC_DIR}`);
  console.log(`Base path: ${BASE_PATH}`);
  console.log(`Cache TTL: ${CACHE_TTL / 1000}s`);
  
  // 启动后台刷新
  startBackgroundRefresh();
});
