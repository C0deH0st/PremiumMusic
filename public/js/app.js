const API_BASE = '/music';
const MOBILE_BREAKPOINT = 700;
const BACKGROUND_MODE_KEY = 'backgroundMode';
const BACKGROUND_MODES = ['effect2', 'starry'];
const { createApp, ref, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;

function getSkyConfig() {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

  return isMobile
    ? { staticStars: 150, shootingStars: 2 }
    : { staticStars: 230, shootingStars: 5 };
}

function normalizeBackgroundMode(mode) {
  return BACKGROUND_MODES.includes(mode) ? mode : 'effect2';
}

function createStaticStars(starrySkyEl, count) {
  const starColors = ['#ffffff', '#f8fbff', '#dce9ff', '#b9d1ff', '#fff2cc', '#ffe0a8', '#c6f2ff'];

  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'star';

    const rand = Math.random();
    let size;
    let opacity;
    let duration;
    let glowSize;
    let cls;

    if (rand < 0.3) {
      cls = 'distant';
      size = Math.random() * 0.8 + 0.3;
      opacity = Math.random() * 0.25 + 0.2;
      duration = Math.random() * 6 + 5;
      glowSize = size * 0.9;
    } else if (rand < 0.6) {
      cls = 'mid';
      size = Math.random() * 1.2 + 0.8;
      opacity = Math.random() * 0.35 + 0.35;
      duration = Math.random() * 4 + 2.8;
      glowSize = size * 1.2;
    } else if (rand < 0.85) {
      cls = 'near';
      size = Math.random() * 1.5 + 1.2;
      opacity = Math.random() * 0.3 + 0.55;
      duration = Math.random() * 2.8 + 1.8;
      glowSize = size * 1.4;
    } else {
      cls = 'bright';
      size = Math.random() * 2 + 2;
      opacity = Math.random() * 0.25 + 0.75;
      duration = Math.random() * 2.2 + 1.2;
      glowSize = size * 1.8;
    }

    const starColor = starColors[Math.floor(Math.random() * starColors.length)];
    star.classList.add(cls);
    star.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;width:${size}px;height:${size}px;--duration:${duration}s;--opacity:${opacity};--glow-size:${glowSize}px;--glow-color:${starColor};background:${starColor};animation-delay:${Math.random() * duration}s`;
    starrySkyEl.appendChild(star);
  }
}

function createShootingStars(starrySkyEl, count) {
  for (let i = 0; i < count; i++) {
    const shootingStar = document.createElement('div');
    shootingStar.className = 'shooting-star';
    const duration = 1.2 + Math.random() * 1.1;
    const delay = Math.random() * 6 + i * 0.85;
    shootingStar.style.cssText = `left:${Math.random() * 58 + 4}%;top:${Math.random() * 30 + 2}%;--tx:${520 + Math.random() * 360}px;--ty:${250 + Math.random() * 180}px;--duration:${duration}s;animation-delay:${delay}s;animation-fill-mode:both`;
    shootingStar.style.animation = `shoot ${duration}s linear ${delay}s infinite`;
    starrySkyEl.appendChild(shootingStar);
  }
}

function clearStarNodes(starrySkyEl) {
  starrySkyEl.querySelectorAll('.star, .shooting-star').forEach((node) => node.remove());
}

function countStarNodes(starrySkyEl) {
  return starrySkyEl.querySelectorAll('.star, .shooting-star').length;
}

const BACKGROUND_SHADER_VERTEX = `
attribute vec4 aVertexPosition;
attribute vec2 aTextureCoord;
varying vec2 vTextureCoord;
void main() {
  gl_Position = aVertexPosition;
  vTextureCoord = aTextureCoord;
}
`;

const EFFECT2_ETHER_FRAGMENT = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
varying vec2 vTextureCoord;

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float mapField(vec3 p) {
  p.xz *= rot(iTime * 0.42);
  p.xy *= rot(iTime * 0.31);
  vec3 q = p * 2.0 + iTime;
  return length(p + vec3(sin(iTime * 0.7))) * log(length(p) + 1.0) +
    sin(q.x + sin(q.z + sin(q.y))) * 0.5 - 1.0;
}

void main() {
  vec2 fragCoord = vTextureCoord * iResolution;
  vec2 p = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);

  vec3 cl = vec3(0.0);
  float d = 2.45;

  for (int i = 0; i <= 5; i++) {
    vec3 p3d = vec3(0.0, 0.0, 5.0) + normalize(vec3(p, -1.0)) * d;
    float rz = mapField(p3d);
    float f = clamp((rz - mapField(p3d + 0.1)) * 0.5, -0.1, 1.0);
    vec3 baseColor = vec3(0.1, 0.3, 0.4) + vec3(5.0, 2.5, 3.0) * f;
    cl = cl * baseColor + smoothstep(2.5, 0.0, rz) * 0.7 * baseColor;
    d += min(rz, 1.0);
  }

  vec2 m = iMouse * 2.0 - 1.0;
  float mouseDist = length(p - m * 0.35);
  float mouseGlow = smoothstep(0.65, 0.0, mouseDist);
  cl += vec3(0.5, 0.3, 0.7) * mouseGlow * 0.26;

  gl_FragColor = vec4(cl, 1.0);
}
`;

const BACKGROUND_SHADER_FRAGMENTS = {
  effect2: EFFECT2_ETHER_FRAGMENT
};

function createBackgroundShaderController(canvas, appRootEl) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
  if (!gl) return null;

  const programCache = new Map();
  const uniformCache = new Map();
  let currentProgram = null;
  let currentMode = null;
  let animationFrame = 0;
  let startTime = 0;
  const mouse = { x: 0.5, y: 0.5 };

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1.0, -1.0,
    1.0, -1.0,
    1.0, 1.0,
    -1.0, 1.0
  ]), gl.STATIC_DRAW);

  const textureBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0
  ]), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function getProgram(mode) {
    if (programCache.has(mode)) return programCache.get(mode);
    const fragmentSource = BACKGROUND_SHADER_FRAGMENTS[mode];
    if (!fragmentSource) return null;

    const vertexShader = compileShader(gl.VERTEX_SHADER, BACKGROUND_SHADER_VERTEX);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    programCache.set(mode, program);
    uniformCache.set(mode, {
      iResolution: gl.getUniformLocation(program, 'iResolution'),
      iTime: gl.getUniformLocation(program, 'iTime'),
      iMouse: gl.getUniformLocation(program, 'iMouse'),
      aVertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
      aTextureCoord: gl.getAttribLocation(program, 'aTextureCoord')
    });
    return program;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(window.innerWidth * dpr));
    const height = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw(now) {
    if (!currentProgram || !currentMode) return;

    const uniforms = uniformCache.get(currentMode);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(currentProgram);

    gl.uniform2f(uniforms.iResolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.iTime, (now - startTime) / 1000);
    gl.uniform2f(uniforms.iMouse, mouse.x, mouse.y);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(uniforms.aVertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(uniforms.aVertexPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
    gl.vertexAttribPointer(uniforms.aTextureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(uniforms.aTextureCoord);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function tick(now) {
    draw(now);
    animationFrame = requestAnimationFrame(tick);
  }

  function onMouseMove(event) {
    mouse.x = Math.max(0, Math.min(1, event.clientX / window.innerWidth));
    mouse.y = Math.max(0, Math.min(1, 1 - event.clientY / window.innerHeight));
  }

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  resize();
  appRootEl?.classList.add('webgl-bg-ready');

  return {
    setMode(mode) {
      if (!BACKGROUND_SHADER_FRAGMENTS[mode]) {
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }
        canvas.classList.remove('active');
        currentMode = null;
        currentProgram = null;
        return;
      }

      const nextProgram = getProgram(mode);
      if (!nextProgram) return;
      currentMode = mode;
      currentProgram = nextProgram;
      resize();
      canvas.classList.add('active');

      if (!animationFrame) {
        startTime = performance.now();
        animationFrame = requestAnimationFrame(tick);
      }
    },
    resize,
    destroy() {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener('mousemove', onMouseMove);
      appRootEl?.classList.remove('webgl-bg-ready');
      programCache.forEach((program) => gl.deleteProgram(program));
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(textureBuffer);
      gl.deleteBuffer(indexBuffer);
    }
  };
}

const PlaylistSidebar = {
  props: {
    isPlaylistVisible: { type: Boolean, required: true },
    songCount: { type: String, required: true },
    filteredGroups: { type: Object, required: true },
    filteredSongs: { type: Array, required: true },
    currentSong: { type: Object, default: null },
    isGroupCollapsed: { type: Function, required: true },
    formatTime: { type: Function, required: true }
  },
  emits: ['toggle-playlist', 'toggle-group', 'play-song', 'cover-error'],
  data() {
    return {
      visibleCoverIds: {},
      coverObserver: null,
      observedCoverItems: new WeakSet()
    };
  },
  mounted() {
    this.$nextTick(() => this.observeVisibleCovers());
  },
  updated() {
    this.$nextTick(() => this.observeVisibleCovers());
  },
  beforeUnmount() {
    this.coverObserver?.disconnect();
    this.coverObserver = null;
  },
  methods: {
    shouldRenderCover(songId) {
      return Boolean(this.visibleCoverIds[songId]);
    },
    markCoverVisible(songId) {
      if (!songId || this.visibleCoverIds[songId]) return;
      this.visibleCoverIds = {
        ...this.visibleCoverIds,
        [songId]: true
      };
    },
    initCoverObserver() {
      if (this.coverObserver || !('IntersectionObserver' in window)) return;
      const root = this.$el?.querySelector('.playlist') || null;
      this.coverObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const songId = entry.target?.dataset?.songId;
          this.markCoverVisible(songId);
          observer.unobserve(entry.target);
        });
      }, {
        root,
        rootMargin: '120px 0px',
        threshold: 0.01
      });
    },
    observeVisibleCovers() {
      const songItems = this.$el?.querySelectorAll('.song-item[data-song-id]');
      if (!songItems?.length) return;

      if (!('IntersectionObserver' in window)) {
        songItems.forEach((item) => this.markCoverVisible(item.dataset.songId));
        return;
      }

      this.initCoverObserver();
      songItems.forEach((item) => {
        if (this.observedCoverItems.has(item)) return;
        this.observedCoverItems.add(item);
        this.coverObserver?.observe(item);
      });
    }
  },
  template: `
    <aside class="playlist-sidebar" :class="{ hidden: !isPlaylistVisible }">
      <div class="sidebar-header">
        <h2>播放列表</h2>
        <span class="song-count">{{ songCount }}</span>
        <button class="playlist-toggle" @click="$emit('toggle-playlist')" :title="isPlaylistVisible ? '隐藏播放列表' : '显示播放列表'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path v-if="isPlaylistVisible" d="M15 18l-6-6 6-6"></path>
            <path v-else d="M9 18l6-6-6-6"></path>
          </svg>
        </button>
      </div>
      <div class="playlist">
        <div class="playlist-group" v-for="(songs, folder) in filteredGroups" :key="folder">
          <div class="group-header" @click="$emit('toggle-group', folder)">
            <span class="group-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>
            <span class="group-name">{{ folder }}</span>
            <span class="group-count">{{ songs.length }} 首</span>
            <span class="group-toggle">{{ isGroupCollapsed(folder) ? '▶' : '▼' }}</span>
          </div>
          <div class="group-songs" v-show="!isGroupCollapsed(folder)">
            <div
              class="song-item"
              v-for="item in songs"
              :key="item.index"
              :data-song-id="item.song.id"
              :class="{ active: currentSong && currentSong.id === item.song.id }"
              @click="$emit('play-song', item)"
            >
              <div class="song-cover">
                <img v-if="item.song.cover && shouldRenderCover(item.song.id)" :src="item.song.cover" :alt="item.song.title" loading="lazy" decoding="async" fetchpriority="low" @error="$emit('cover-error', $event)">
                <div v-else class="cover-placeholder">♪</div>
              </div>
              <div class="song-info">
                <div class="song-title">{{ item.song.title }}</div>
                <div class="song-artist">{{ item.song.artist }}</div>
              </div>
              <div class="song-duration">{{ formatTime(item.song.duration) }}</div>
            </div>
          </div>
        </div>
        <div v-if="filteredSongs.length === 0" class="no-results">没有找到歌曲</div>
      </div>
    </aside>
  `
};

const LyricsPanel = {
  props: {
    isPlaying: { type: Boolean, required: true },
    currentSong: { type: Object, default: null },
    lyrics: { type: Array, required: true },
    displayLyrics: { type: Array, required: true },
    tonearmAnimation: { type: String, default: 'none' },
    isPC: { type: Boolean, default: false }
  },
  emits: ['cover-error', 'toggle-pc-fullscreen'],
  setup(props) {
    const tonearmEl = ref(null);
    const isHoveringClose = ref(false);
    
    return { tonearmEl, isHoveringClose };
  },
  template: `
    <div class="lyrics-panel">
      <button v-if="isPC" class="pc-fullscreen-btn" @click="$emit('toggle-pc-fullscreen')" title="全屏显示">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
        </svg>
      </button>
      <div class="lyrics-vinyl">
        <div class="vinyl-container">
          <div 
            ref="tonearmEl" 
            class="tonearm" 
            :class="{ 
              playing: isPlaying,
              entering: tonearmAnimation === 'entering',
              exiting: tonearmAnimation === 'exiting'
            }"
          >
            <div class="tonearm-base"></div>
            <div class="tonearm-counterweight"></div>
            <div class="tonearm-pivot"></div>
            <div class="tonearm-arm">
              <div class="tonearm-head">
                <div class="tonearm-stylus"></div>
              </div>
            </div>
          </div>
          <div class="vinyl-disc" :class="{ playing: isPlaying }">
            <div class="vinyl-cover">
              <img v-if="currentSong?.cover" :key="'panel-' + (currentSong?.id || 'none')" :src="currentSong.cover" :alt="currentSong.title" @error="$emit('cover-error', $event)">
              <div v-else class="vinyl-placeholder">♪</div>
            </div>
            <div class="vinyl-label" v-if="currentSong">
              <div class="vinyl-label-title">{{ currentSong.title }}</div>
              <div class="vinyl-label-artist">{{ currentSong.artist }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="vinyl-lyrics">
        <div class="vinyl-lyrics-container">
          <template v-if="lyrics.length > 0">
            <div
              v-for="(line, index) in displayLyrics"
              :key="index"
              class="vinyl-lyrics-line"
              :class="{ active: line.isCurrent }"
            >{{ line.text || ' ' }}</div>
          </template>
          <div v-else class="vinyl-lyrics-empty">暂无歌词</div>
        </div>
      </div>
    </div>
  `
};

createApp({
  components: {
    PlaylistSidebar,
    LyricsPanel
  },
  setup() {
    const songs = ref([]);
    const currentSong = ref(null);
    const currentIndex = ref(-1);
    const isPlaying = ref(false);
    const playMode = ref('sequence');
    const volume = ref(1);
    const isMuted = ref(false);
    const searchQuery = ref('');
    const isMobileSearchVisible = ref(false);
    const collapsedGroups = ref(new Set());
    const isPlaylistVisible = ref(true);
    const lyrics = ref([]);
    const currentLyricIndex = ref(-1);
    const currentTime = ref(0);
    const duration = ref(0);
    const isMobileViewport = ref(window.innerWidth <= MOBILE_BREAKPOINT);
    const isMobileTitleOverflow = ref(false);
    const isFullscreen = ref(false);
    const isPC = computed(() => window.innerWidth > MOBILE_BREAKPOINT);
    const isPCFullscreen = ref(false);
    const pcFullscreenShowClose = ref(false);
    const currentBackground = ref(normalizeBackgroundMode(localStorage.getItem(BACKGROUND_MODE_KEY)));

    const starrySkyRef = ref(null);
    const shaderCanvasRef = ref(null);
    const searchInputRef = ref(null);
    const progressBarRef = ref(null);
    const fullscreenLyricsRef = ref(null);
    const fullscreenLyricsContentRef = ref(null);
    const pcFullscreenLyricsContentRef = ref(null);
    const fullscreenTitleRef = ref(null);
    const fullscreenTitleTextRef = ref(null);
    const tonearmAnimation = ref('none');
    const currentBackgroundLabel = computed(() => {
      switch (currentBackground.value) {
        case 'starry':
          return '星空';
        default:
          return '效果2';
      }
    });

    // 唱针动画控制
    function triggerTonearmEntry() {
      tonearmAnimation.value = 'entering';
      // 动画结束后清除状态
      setTimeout(() => {
        tonearmAnimation.value = 'none';
      }, 1200);
    }

    function triggerTonearmExit() {
      tonearmAnimation.value = 'exiting';
      // 动画结束后清除状态
      setTimeout(() => {
        tonearmAnimation.value = 'none';
      }, 1000);
    }

    const audioPlayer = new Audio();
    let titleResizeObserver = null;
    let resizeTimeout = null;
    let progressDragging = false;
    let removeGlobalListeners = [];
    let backgroundShaderController = null;

    const groupedSongs = computed(() => {
      const groups = {};
      songs.value.forEach((song, index) => {
        const folder = song.folder || '未知文件夹';
        if (!groups[folder]) {
          groups[folder] = [];
        }
        groups[folder].push({ song, index });
      });

      return Object.keys(groups)
        .sort()
        .reduce((acc, key) => {
          acc[key] = groups[key];
          return acc;
        }, {});
    });

    const filteredSongs = computed(() => {
      if (!searchQuery.value) return songs.value;

      const query = searchQuery.value.toLowerCase();
      return songs.value.filter((song) =>
        song.title.toLowerCase().includes(query)
        || song.artist.toLowerCase().includes(query)
        || (song.album && song.album.toLowerCase().includes(query))
      );
    });

    const filteredGroups = computed(() => {
      if (!searchQuery.value) return groupedSongs.value;

      const query = searchQuery.value.toLowerCase();
      const groups = {};

      songs.value.forEach((song, index) => {
        if (
          song.title.toLowerCase().includes(query)
          || song.artist.toLowerCase().includes(query)
          || (song.album && song.album.toLowerCase().includes(query))
        ) {
          const folder = song.folder || '未知文件夹';
          if (!groups[folder]) {
            groups[folder] = [];
          }
          groups[folder].push({ song, index });
        }
      });

      return groups;
    });

    const modeIcon = computed(() => {
      const icons = {
        sequence: '<path d="M725.333333 170.666667V88.234667a21.333333 21.333333 0 0 1 34.986667-16.426667l175.786667 146.474667a21.333333 21.333333 0 0 1-13.696 37.717333H85.333333V170.666667h640zM85.333333 768h853.333334v85.333333H85.333333v-85.333333z m0-298.666667h853.333334v85.333334H85.333333v-85.333334z"></path>',
        loop: '<path d="M911.788443 228.143992L684.489776 0.859776l-61.296945 61.30417 123.395866 123.38864H89.301065v327.921315h86.700064V272.252649h570.587568L623.192831 395.64129l61.296945 61.30417 227.298667-227.276992-0.758626-0.76585zM783.428999 751.747351H229.133818l123.38864-123.381416-61.30417-61.31862-227.298666 227.284217 0.758625 0.758625-0.758625 0.758626 227.298666 227.291441 61.30417-61.311395-123.38864-123.381415h640.995244V513.871276h-86.700063z"></path><path d="M445.681676 364.559317h86.700064v294.874141h-86.700064z"></path>',
        random: '<path d="M753.564731 337.471035c-45.8697 0-160.259984 113.849978-243.789399 194.548928C383.134027 654.383848 263.508509 773.284865 167.764911 773.284865l-58.892295 0c-24.068162 0-43.581588-19.526729-43.581588-43.581588s19.513426-43.581588 43.581588-43.581588l58.892295 0c60.504002 0 183.002964-121.68134 281.432741-216.784348 119.79641-115.744117 223.254713-219.029482 304.368102-219.029482l56.209186 0-59.641355-57.828057c-17.033955-16.993023-17.060561-42.902112-0.057305-59.927881 17.002232-17.030885 44.596707-17.064654 61.631686-0.065492l134.207631 133.874033c8.192589 8.172123 12.794397 19.238157 12.794397 30.803563 0 11.564383-4.601808 22.604834-12.794397 30.776957L811.706943 461.72599c-8.505721 8.486278-19.646456 12.522198-30.78719 12.522198-11.166317 0-22.333658-4.676509-30.844495-13.199627-17.003256-17.025769-16.975627-45.432749 0.057305-62.425771l59.641355-61.151755L753.564731 337.471035zM811.706943 561.66105c-17.034978-16.999163-44.629453-16.972557-61.631686 0.058328-17.003256 17.024745-16.975627 46.257533 0.057305 63.250556l59.641355 61.150732-56.209186 0c-35.793204 0-95.590102-52.946886-154.87637-108.373243-17.576307-16.435321-45.161572-16.3422-61.594847 1.226944-16.444531 17.568121-15.523555 46.393633 2.053776 62.823837 90.322122 84.458577 151.246703 131.484613 214.417441 131.484613l56.209186 0-59.641355 57.824987c-17.033955 16.993023-17.060561 43.736107-0.057305 60.761875 8.511861 8.523117 19.678178 12.369725 30.844495 12.369725 11.140735 0 22.281469-4.453429 30.78719-12.939707L945.914574 757.311055c8.192589-8.173147 12.794397-19.315928 12.794397-30.881334 0-11.564383-4.601808-22.682605-12.794397-30.855752L811.706943 561.66105zM108.871593 337.471035l58.892295 0c45.932122 0 114.40154 58.455343 168.915108 107.942431 8.352225 7.576559 18.832927 12.140505 29.29214 12.140505 11.852956 0 23.673166-4.394077 32.270984-13.857613 16.182564-17.807574 14.859429-46.823422-2.958378-62.998823-85.247546-77.381391-156.561755-130.388652-227.519854-130.388652l-58.892295 0c-24.068162 0-43.581588 19.526729-43.581588 43.581588S84.804455 337.471035 108.871593 337.471035z"></path>'
      };
      return icons[playMode.value];
    });

    const songCount = computed(() => `${songs.value.length} 首`);
    const progressPercent = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0));

    function getLyricIndexByTime(timeInSeconds) {
      if (!lyrics.value.length) return -1;

      let targetIndex = -1;
      for (let i = 0; i < lyrics.value.length; i++) {
        const lineTime = Number(lyrics.value[i]?.time);
        if (Number.isFinite(lineTime) && timeInSeconds >= lineTime) {
          targetIndex = i;
        }
      }
      return targetIndex;
    }

    function getEffectiveLyricIndex() {
      const currentT = currentTime.value || audioPlayer.currentTime || 0;
      const indexByTime = getLyricIndexByTime(currentT);
      if (indexByTime >= 0) return indexByTime;
      return currentLyricIndex.value >= 0 ? currentLyricIndex.value : -1;
    }

    const displayLyrics = computed(() => {
      if (!lyrics.value.length) return [];

      const currentIdx = getEffectiveLyricIndex();
      const centerIdx = currentIdx >= 0 ? currentIdx : 0;
      const result = [];

      for (let i = -1; i <= 1; i++) {
        const idx = centerIdx + i;
        if (idx >= 0 && idx < lyrics.value.length) {
          result.push({
            text: lyrics.value[idx].text,
            isCurrent: idx === currentIdx && currentIdx >= 0
          });
        } else {
          result.push({ text: ' ', isCurrent: false });
        }
      }

      return result;
    });

    const fullscreenDisplayLyrics = computed(() => {
      if (!lyrics.value.length) return [];
      const effectiveIndex = getEffectiveLyricIndex();

      // 移动端和PC全屏歌词都显示9行，围绕当前行居中
      const result = [];
      const centerIndex = effectiveIndex >= 0 ? effectiveIndex : 0;
      for (let offset = -4; offset <= 4; offset++) {
        const idx = centerIndex + offset;
        if (idx >= 0 && idx < lyrics.value.length) {
          result.push({
            key: `lyrics-${idx}`,
            text: lyrics.value[idx].text || ' ',
            isCurrent: idx === effectiveIndex
          });
        } else {
          result.push({
            key: `lyrics-empty-${offset}`,
            text: ' ',
            isCurrent: false
          });
        }
      }
      return result;
    });

    function renderStarrySky() {
      const starrySkyEl = starrySkyRef.value;
      if (!starrySkyEl) return;

      if (currentBackground.value !== 'starry') {
        clearStarNodes(starrySkyEl);
        starrySkyEl.dataset.expectedCount = '0';
        return;
      }

      const config = getSkyConfig();
      clearStarNodes(starrySkyEl);
      starrySkyEl.dataset.expectedCount = String(config.staticStars + config.shootingStars);
      createStaticStars(starrySkyEl, config.staticStars);
      createShootingStars(starrySkyEl, config.shootingStars);
    }

    function ensureStarrySky() {
      const starrySkyEl = starrySkyRef.value;
      if (!starrySkyEl) return;

      if (currentBackground.value !== 'starry') {
        if (countStarNodes(starrySkyEl) > 0) {
          clearStarNodes(starrySkyEl);
        }
        starrySkyEl.dataset.expectedCount = '0';
        return;
      }

      const config = getSkyConfig();
      const expectedCount = config.staticStars + config.shootingStars;
      const cachedExpected = Number(starrySkyEl.dataset.expectedCount || 0);

      if (countStarNodes(starrySkyEl) !== expectedCount || cachedExpected !== expectedCount) {
        renderStarrySky();
      }
    }

    function ensureShaderBackground() {
      if (!backgroundShaderController || !shaderCanvasRef.value) return;
      backgroundShaderController.setMode(currentBackground.value);
    }

    function cycleBackground() {
      const currentIndex = BACKGROUND_MODES.indexOf(currentBackground.value);
      const nextIndex = (currentIndex + 1) % BACKGROUND_MODES.length;
      currentBackground.value = BACKGROUND_MODES[nextIndex];
    }

    function updateFullscreenTitleOverflow() {
      const fullscreenEl = fullscreenLyricsRef.value;
      const titleEl = fullscreenTitleRef.value;
      const titleTextEl = fullscreenTitleTextRef.value;
      if (!fullscreenEl || !titleEl || !titleTextEl) return;

      if (!isFullscreen.value) {
        isMobileTitleOverflow.value = false;
        titleTextEl.style.removeProperty('--title-scroll-distance');
        return;
      }

      const overflowDistance = Math.ceil(titleTextEl.scrollWidth - titleEl.getBoundingClientRect().width);
      const titleLengthFallback = (currentSong.value?.title || '').trim().length > 10;
      if (overflowDistance > 2 || titleLengthFallback) {
        isMobileTitleOverflow.value = true;
        titleTextEl.style.setProperty('--title-scroll-distance', `${Math.max(overflowDistance, 24) + 28}px`);
      } else {
        isMobileTitleOverflow.value = false;
        titleTextEl.style.removeProperty('--title-scroll-distance');
      }
    }

    function refreshFullscreenTitleOverflow() {
      nextTick(() => {
        updateFullscreenTitleOverflow();
        requestAnimationFrame(() => updateFullscreenTitleOverflow());
        setTimeout(() => updateFullscreenTitleOverflow(), 120);
      });
    }

    function scrollFullscreenLyricsToActive(behavior = 'auto') {
      const container = fullscreenLyricsContentRef.value;
      if (!container || !isFullscreen.value) return;

      const activeLine = container.querySelector('.lyrics-line.active');
      if (!activeLine) return;

      const targetScrollTop = activeLine.offsetTop - (container.clientHeight / 2) + (activeLine.offsetHeight / 2);
      container.scrollTo({ top: targetScrollTop, behavior });
    }

    function scrollPCFullscreenLyricsToActive(behavior = 'auto') {
      const container = pcFullscreenLyricsContentRef.value;
      if (!container || !isPCFullscreen.value) return;
      // 9 行固定模式下，歌词通过 flex 居中，不应再执行滚动定位
      if (container.classList.contains('mobile-fixed')) {
        container.scrollTop = 0;
        return;
      }

      const activeLine = container.querySelector('.lyrics-line.active');
      if (!activeLine) return;

      const targetScrollTop = activeLine.offsetTop - (container.clientHeight / 2) + (activeLine.offsetHeight / 2);
      container.scrollTo({ top: targetScrollTop, behavior });
    }

    function formatTime(seconds) {
      if (!seconds || Number.isNaN(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    async function loadSongs() {
      try {
        const res = await fetch(`${API_BASE}/api/songs`);
        const data = await res.json();
        
        // 兼容新旧API响应格式
        songs.value = Array.isArray(data) ? data : (data.songs || []);
        
        // 如果是从缓存返回的，显示缓存状态（可选）
        if (data.cached !== undefined) {
          console.log(`Songs loaded from ${data.cached ? 'cache' : 'scan'}, age: ${Math.round(data.cacheAge / 1000)}s`);
        }
        
        // 加载歌曲后将所有文件夹设为折叠状态
        const folders = Object.keys(groupedSongs.value);
        folders.forEach(folder => {
          collapsedGroups.value.add(folder);
        });
      } catch (err) {
        console.error('Failed to load songs:', err);
      }
    }
    
    async function loadLyrics(songId) {
      try {
        const res = await fetch(`${API_BASE}/api/lyrics/${songId}`);
        const data = await res.json();
        lyrics.value = data.lyrics || [];
      } catch (e) {
        console.error('Failed to load lyrics:', e);
        lyrics.value = [];
      }
    }

    async function playSong(song, index) {
      currentSong.value = song;
      currentIndex.value = index;
      isPlaying.value = true;
      currentLyricIndex.value = -1;
      currentTime.value = 0;
      duration.value = 0;

      audioPlayer.src = `${API_BASE}/api/play/${song.id}`;
      try {
        await audioPlayer.play();
      } catch (error) {
        console.warn('Audio autoplay blocked:', error);
      }
      document.title = currentSong.value ? `${currentSong.value.title} - ${currentSong.value.artist} | Premium Music` : 'Premium Music';
      updateMediaSession(song);

      await loadLyrics(song.id);
      currentLyricIndex.value = getLyricIndexByTime(audioPlayer.currentTime || 0);
    }

    function updateMediaSession(song) {
      if (!('mediaSession' in navigator)) return;

      // 构建 artwork 数组，iOS Safari需要https的封面图片
      const artwork = [];
      if (song.cover) {
        // 确保URL是https
        let coverUrl = song.cover;
        if (coverUrl.startsWith('http://')) {
          coverUrl = coverUrl.replace('http://', 'https://');
        }
        
        // iOS Safari通知栏需要多个尺寸的artwork
        artwork.push(
          { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: coverUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: coverUrl, sizes: '512x512', type: 'image/jpeg' }
        );
      }

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title,
          artist: song.artist,
          album: song.album || '',
          artwork: artwork
        });
      } catch (e) {
        console.error('Failed to update mediaSession metadata:', e);
      }
    }

    // iOS Safari需要在用户交互后设置播放状态
    function updateMediaSessionPlaybackState(isPlaying) {
      if (!('mediaSession' in navigator)) return;
      
      try {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      } catch (e) {
        console.error('Failed to update playback state:', e);
      }
    }

    function togglePlay() {
      if (!currentSong.value) {
        if (songs.value.length > 0) {
          playSong(songs.value[0], 0);
        }
        return;
      }
      if (isPlaying.value) {
        audioPlayer.pause();
      } else {
        audioPlayer.play();
      }
    }

    function playNext() {
      if (!songs.value.length) return;
      // 切歌时触发唱针退出动画
      if (currentSong.value) {
        triggerTonearmExit();
      }
      currentIndex.value = playMode.value === 'random'
        ? Math.floor(Math.random() * songs.value.length)
        : (currentIndex.value + 1) % songs.value.length;
      // 延迟播放新歌曲，让退出动画有时间播放
      setTimeout(() => {
        playSong(songs.value[currentIndex.value], currentIndex.value);
        triggerTonearmEntry();
      }, 300);
    }

    function playPrev() {
      if (!songs.value.length) return;
      // 切歌时触发唱针退出动画
      if (currentSong.value) {
        triggerTonearmExit();
      }
      currentIndex.value = playMode.value === 'random'
        ? Math.floor(Math.random() * songs.value.length)
        : (currentIndex.value - 1 + songs.value.length) % songs.value.length;
      // 延迟播放新歌曲，让退出动画有时间播放
      setTimeout(() => {
        playSong(songs.value[currentIndex.value], currentIndex.value);
        triggerTonearmEntry();
      }, 300);
    }

    function cyclePlayMode() {
      const modes = ['sequence', 'loop', 'random'];
      playMode.value = modes[(modes.indexOf(playMode.value) + 1) % modes.length];
      localStorage.setItem('playMode', playMode.value);
    }

    function toggleMute() {
      isMuted.value = !isMuted.value;
      audioPlayer.muted = isMuted.value;
    }

    function setVolume(val) {
      const normalized = Math.max(0, Math.min(1, val));
      volume.value = normalized;
      audioPlayer.volume = normalized;
      isMuted.value = false;
      localStorage.setItem('volume', String(normalized));
    }

    function seek(percent) {
      if (!audioPlayer.duration) return;
      audioPlayer.currentTime = Math.max(0, Math.min(1, percent)) * audioPlayer.duration;
    }

    function toggleGroup(folder) {
      if (collapsedGroups.value.has(folder)) {
        collapsedGroups.value.delete(folder);
      } else {
        collapsedGroups.value.add(folder);
      }
    }

    function handlePlaySongFromList(item) {
      if (!item || !item.song) return;
      // 如果当前有歌曲在播放,触发唱针退出动画
      if (currentSong.value) {
        triggerTonearmExit();
      }
      // 延迟播放新歌曲,让退出动画有时间播放
      setTimeout(() => {
        playSong(item.song, item.index);
        triggerTonearmEntry();
      }, 300);
    }

    function togglePlaylist() {
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        isPlaylistVisible.value = true;
        return;
      }
      isPlaylistVisible.value = !isPlaylistVisible.value;
    }

    function isGroupCollapsed(folder) {
      return collapsedGroups.value.has(folder);
    }

    function handleCoverError(event) {
      event.target.onerror = null;
      event.target.src = `${API_BASE}/images/default-cover.svg`;
    }

    function handleSeek(event) {
      const rect = event.currentTarget.getBoundingClientRect();
      seek((event.clientX - rect.left) / rect.width);
    }

    function handleVolumeClick(event) {
      const rect = event.currentTarget.getBoundingClientRect();
      setVolume((event.clientX - rect.left) / rect.width);
    }

    function toggleMobileSearch() {
      isMobileSearchVisible.value = !isMobileSearchVisible.value;
      if (isMobileSearchVisible.value) {
        nextTick(() => searchInputRef.value?.focus());
      }
    }

    function toggleFullscreen() {
      isFullscreen.value = !isFullscreen.value;

      nextTick(() => {
        refreshFullscreenTitleOverflow();
        if (!isFullscreen.value) return;

        if (isMobileViewport.value) {
          if (fullscreenLyricsContentRef.value) {
            fullscreenLyricsContentRef.value.scrollTop = 0;
          }
          return;
        }

        scrollFullscreenLyricsToActive('auto');
      });
    }

    function closeFullscreen() {
      isFullscreen.value = false;
    }

    function handleFullscreenBgClick(event) {
      if (event.currentTarget === event.target) {
        closeFullscreen();
      }
    }

    function handleMobilePlayerBarClick(event) {
      if (window.innerWidth <= MOBILE_BREAKPOINT && !event.target.closest('.control-btn, .progress-bar, .volume-control')) {
        toggleFullscreen();
      }
    }

    function handleResize() {
      isMobileViewport.value = window.innerWidth <= MOBILE_BREAKPOINT;

      if (!isMobileViewport.value) {
        isMobileSearchVisible.value = false;
      }

      if (isMobileViewport.value) {
        isPlaylistVisible.value = true;
      }

      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        ensureStarrySky();
        backgroundShaderController?.resize();
      }, 200);

      refreshFullscreenTitleOverflow();
    }

    function onProgressDrag(event) {
      if (!progressDragging || !progressBarRef.value) return;
      const rect = progressBarRef.value.getBoundingClientRect();
      const percent = (event.clientX - rect.left) / rect.width;
      seek(percent);
    }

    function onProgressDragStart(event) {
      progressDragging = true;
      onProgressDrag(event);
      event.preventDefault();
    }

    function onProgressDragEnd() {
      progressDragging = false;
    }

    // PC全屏歌词相关函数
    function togglePCFullscreen() {
      isPCFullscreen.value = !isPCFullscreen.value;
      pcFullscreenShowClose.value = false;
      
      if (isPCFullscreen.value) {
        nextTick(() => {
          scrollPCFullscreenLyricsToActive('auto');
        });
      }
    }

    function closePCFullscreen() {
      isPCFullscreen.value = false;
      pcFullscreenShowClose.value = false;
    }

    function handlePCFullscreenMouseMove() {
      if (isPCFullscreen.value) {
        pcFullscreenShowClose.value = true;
      }
    }

    function onKeydown(event) {
      // ESC键关闭PC全屏
      if (event.key === 'Escape' && isPCFullscreen.value) {
        closePCFullscreen();
        return;
      }

      if (event.target.tagName === 'INPUT') return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + 5);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setVolume(volume.value + 0.1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setVolume(volume.value - 0.1);
      } else if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
      }
    }

    function onVisibilityChange() {
      if (!document.hidden) ensureStarrySky();
    }

    audioPlayer.addEventListener('timeupdate', () => {
      currentTime.value = audioPlayer.currentTime;
      if (!lyrics.value.length) return;
      const newIndex = getLyricIndexByTime(audioPlayer.currentTime);
      if (newIndex !== currentLyricIndex.value) {
        currentLyricIndex.value = newIndex;
      }
    });

    audioPlayer.addEventListener('play', () => {
      isPlaying.value = true;
      updateMediaSessionPlaybackState(true);
    });

    audioPlayer.addEventListener('pause', () => {
      isPlaying.value = false;
      updateMediaSessionPlaybackState(false);
    });

    audioPlayer.addEventListener('ended', () => {
      if (playMode.value === 'loop' && currentSong.value) {
        playSong(currentSong.value, currentIndex.value);
        return;
      }
      playNext();
    });

    audioPlayer.addEventListener('loadedmetadata', () => {
      duration.value = audioPlayer.duration;
    });

    watch(volume, (newVal) => {
      audioPlayer.volume = newVal;
    });

    watch([currentSong, isMobileViewport, isFullscreen], () => {
      refreshFullscreenTitleOverflow();
    });

    watch(currentLyricIndex, (newIndex) => {
      if (newIndex < 0) return;
      if (!isMobileViewport.value) {
        scrollFullscreenLyricsToActive('auto');
      }
      if (isPCFullscreen.value) {
        nextTick(() => {
          scrollPCFullscreenLyricsToActive('smooth');
        });
      }
    });

    watch(currentBackground, (mode) => {
      localStorage.setItem(BACKGROUND_MODE_KEY, mode);
      nextTick(() => {
        if (mode === 'starry') {
          renderStarrySky();
        }
        ensureStarrySky();
        ensureShaderBackground();
      });
    });

    onMounted(async () => {
      backgroundShaderController = createBackgroundShaderController(
        shaderCanvasRef.value,
        document.getElementById('app')
      );
      ensureShaderBackground();
      ensureStarrySky();
      await loadSongs();

      const savedVolume = localStorage.getItem('volume');
      if (savedVolume) {
        const parsedVolume = parseFloat(savedVolume);
        if (!Number.isNaN(parsedVolume)) {
          volume.value = parsedVolume;
          audioPlayer.volume = parsedVolume;
        }
      }

      const savedMode = localStorage.getItem('playMode');
      if (savedMode) {
        playMode.value = savedMode;
      }

      if ('ResizeObserver' in window) {
        titleResizeObserver = new ResizeObserver(() => refreshFullscreenTitleOverflow());
        if (fullscreenTitleRef.value) {
          titleResizeObserver.observe(fullscreenTitleRef.value);
        }
        if (fullscreenTitleTextRef.value) {
          titleResizeObserver.observe(fullscreenTitleTextRef.value);
        }
      }

      document.addEventListener('mousemove', onProgressDrag);
      document.addEventListener('mouseup', onProgressDragEnd);
      document.addEventListener('keydown', onKeydown);
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('resize', handleResize);

      removeGlobalListeners = [
        () => document.removeEventListener('mousemove', onProgressDrag),
        () => document.removeEventListener('mouseup', onProgressDragEnd),
        () => document.removeEventListener('keydown', onKeydown),
        () => document.removeEventListener('visibilitychange', onVisibilityChange),
        () => window.removeEventListener('resize', handleResize)
      ];

      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
          if (!currentSong.value) {
            if (songs.value.length > 0) playSong(songs.value[0], 0);
          } else {
            audioPlayer.play();
          }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          audioPlayer.pause();
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
          playPrev();
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          playNext();
        });
      }
    });

    onBeforeUnmount(() => {
      clearTimeout(resizeTimeout);
      titleResizeObserver?.disconnect();
      removeGlobalListeners.forEach((cleanup) => cleanup());
      backgroundShaderController?.destroy();
    });

    return {
      songs,
      currentSong,
      currentIndex,
      isPlaying,
      playMode,
      volume,
      isMuted,
      searchQuery,
      isMobileSearchVisible,
      collapsedGroups,
      isPlaylistVisible,
      lyrics,
      currentLyricIndex,
      currentTime,
      duration,
      groupedSongs,
      filteredSongs,
      filteredGroups,
      modeIcon,
      songCount,
      displayLyrics,
      fullscreenDisplayLyrics,
      progressPercent,
      isMobileViewport,
      isMobileTitleOverflow,
      isFullscreen,
      isPC,
      isPCFullscreen,
      pcFullscreenShowClose,
      currentBackground,
      currentBackgroundLabel,
      starrySkyRef,
      shaderCanvasRef,
      searchInputRef,
      progressBarRef,
      fullscreenLyricsRef,
      fullscreenLyricsContentRef,
      pcFullscreenLyricsContentRef,
      fullscreenTitleRef,
      fullscreenTitleTextRef,
      tonearmAnimation,
      formatTime,
      playSong,
      handlePlaySongFromList,
      togglePlay,
      playNext,
      playPrev,
      cyclePlayMode,
      toggleMute,
      setVolume,
      seek,
      toggleGroup,
      togglePlaylist,
      isGroupCollapsed,
      handleCoverError,
      handleSeek,
      onProgressDragStart,
      handleVolumeClick,
      toggleMobileSearch,
      toggleFullscreen,
      closeFullscreen,
      handleFullscreenBgClick,
      handleMobilePlayerBarClick,
      togglePCFullscreen,
      closePCFullscreen,
      cycleBackground,
      handlePCFullscreenMouseMove
    };
  }
}).mount('#app');
