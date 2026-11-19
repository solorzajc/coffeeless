// Dibuja un preset en un contenedor. Lo usan tanto la pantalla del Kraken como la vista previa del editor.
import { getMedia } from './state.js';
import { formatMetric, formatClock } from './sensors.js';
import { FONT_CATALOG } from './fonts.js';

const loadedFonts = new Set();
const SYSTEM_FONTS = new Set(['system-ui', 'sans-serif', 'serif', 'monospace', 'Arial', 'Georgia', 'Impact', 'Verdana', 'Courier New', 'Segoe UI']);

let weightsOf;
// Pesos a pedir: rango completo si es variable ("100..900"), lista si son estáticos ("400;700").
function weightSpec(family) {
  weightsOf ??= new Map(FONT_CATALOG.map((f) => [f[0], f[2]]));
  const w = weightsOf.get(family);
  return w && w !== '400' ? `:wght@${w}` : '';
}
export const isFontLoaded = (family) => loadedFonts.has(family);

export function ensureFont(family) {
  if (!family || loadedFonts.has(family) || SYSTEM_FONTS.has(family)) return;
  loadedFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}${weightSpec(family)}&display=swap`;
  document.head.appendChild(link);
}
ensureFont('Inter'); // fuente por defecto, también desde Google Fonts

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

export const UNUSABLE_URL_MSG = 'Este enlace no se puede usar como fondo. Prueba con otro, o descarga el archivo y súbelo desde "Archivo de mi PC".';

// Descarta enlaces que sabemos que no funcionan desde una página estática.
// Páginas de pin y videos HLS (.m3u8): solo existen como HLS y están bloqueados por CORS (confirmado).
export function resolveMediaUrl(url) {
  const u = (url || '').trim();
  if (!u) return { url: '' };
  const unusable =
    /pinterest\.[a-z.]+\/pin\//i.test(u) || /(^|\/\/)pin\.it\//i.test(u) || /\.m3u8(\?|#|$)/i.test(u) || /\/\/v\d*\.pinimg\.com\/videos\//i.test(u);
  if (unusable) return { url: '', error: UNUSABLE_URL_MSG };
  return { url: u };
}

export function createRenderer(container, { onMediaStatus: notify } = {}) {
  let mediaStatus = {};
  const onMediaStatus = (st) => ((mediaStatus = st), notify?.(st));
  const canvas = document.createElement('div');
  canvas.className = 'cl-canvas';
  const bgWrap = document.createElement('div');
  bgWrap.className = 'cl-bg';
  const layersEl = document.createElement('div');
  layersEl.className = 'cl-layers';
  canvas.append(bgWrap, layersEl);
  container.appendChild(canvas);

  let preset = null;
  let data = {};
  let bgKey = '';
  let bgEl = null;
  let objectUrl = null;
  const nodes = new Map(); // id -> elemento

  function setScale(px) {
    const size = preset?.size || 240;
    canvas.style.width = canvas.style.height = size + 'px';
    canvas.style.transform = `scale(${px / size})`;
  }

  async function updateBg(bg) {
    canvas.style.background = bg.color || '#000';
    const key = `${bg.source}|${bg.source === 'url' ? bg.url : bg.mediaId}`;
    if (key !== bgKey) {
      bgKey = key;
      mediaStatus = {};
      bgWrap.innerHTML = '';
      bgEl = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl), (objectUrl = null);
      let src = '', isVideo = false;
      if (bg.source === 'url' && bg.url) {
        const r = resolveMediaUrl(bg.url);
        if (r.error) onMediaStatus?.({ error: r.error });
        else if (r.note) onMediaStatus?.({ note: r.note });
        src = r.url;
        isVideo = VIDEO_EXT.test(src);
      } else if (bg.source === 'local' && bg.mediaId) {
        const blob = await getMedia(bg.mediaId).catch(() => null);
        if (key !== bgKey) return; // cambió mientras cargaba
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          src = objectUrl;
          isVideo = (blob.type || '').startsWith('video/');
        } else onMediaStatus?.({ error: 'No encontré el archivo subido en este navegador. Vuelve a subirlo.' });
      }
      if (src) {
        bgEl = makeMedia(src, isVideo, key);
        bgWrap.appendChild(bgEl);
      }
    }
    if (bgEl) {
      bgEl.style.objectFit = bg.fit || 'cover';
      bgEl.style.opacity = bg.opacity ?? 1;
      bgEl.style.transform = `translate(${(bg.offsetX || 0) * 100}%, ${(bg.offsetY || 0) * 100}%) rotate(${bg.rotate || 0}deg) scale(${bg.scale || 1})`;
    }
  }

  function makeMedia(src, isVideo, key) {
    const el = isVideo ? document.createElement('video') : document.createElement('img');
    el.className = 'cl-bg-media';
    if (isVideo) Object.assign(el, { autoplay: true, muted: true, loop: true, playsInline: true });
    el.onerror = () => {
      if (key !== bgKey) return;
      if (!isVideo) {
        // quizá es un video sin extensión
        const v = makeMedia(src, true, key);
        v.onerror = () => key === bgKey && onMediaStatus?.({ error: 'No se pudo cargar el archivo. Revisa que la URL abra el GIF, imagen o video directamente.' });
        el.replaceWith(v);
        bgEl = v;
        updateBg(preset.bg);
      } else onMediaStatus?.({ error: 'No se pudo cargar el archivo. Revisa que la URL abra el GIF, imagen o video directamente.' });
    };
    el.onload = el.onloadeddata = () => key === bgKey && onMediaStatus?.({ ok: true });
    el.src = src;
    if (isVideo) el.play?.().catch(() => {});
    return el;
  }

  function styleLayer(el, l) {
    el.style.left = l.x + 'px';
    el.style.top = l.y + 'px';
    el.style.transform = `translate(-50%, -50%) rotate(${l.rotate || 0}deg)`;
    el.style.opacity = l.opacity ?? 1;
    el.style.display = l.visible === false ? 'none' : '';
    if (l.type === 'shape') {
      const kind = l.shape || 'rect';
      // la línea usa solo la opacidad de la capa (sin opacidad de relleno aparte)
      el.style.background = hexA(l.fill, kind === 'line' ? 1 : l.fillOpacity ?? 1);
      if (kind === 'line') {
        const t = Math.max(1, l.thickness || 1);
        el.style.width = l.w + 'px';
        el.style.height = t + 'px';
        el.style.borderRadius = l.cap === 'square' ? '0' : t / 2 + 'px';
        el.style.border = 'none';
      } else {
        el.style.width = l.w + 'px';
        el.style.height = l.h + 'px';
        el.style.borderRadius = kind === 'ellipse' ? '50%' : Math.min(l.radius || 0, Math.min(l.w, l.h) / 2) + 'px';
        el.style.border = l.borderWidth ? `${l.borderWidth}px solid ${l.borderColor}` : 'none';
      }
    } else {
      ensureFont(l.font);
      el.style.fontFamily = `"${l.font}", system-ui, sans-serif`;
      el.style.fontSize = l.size + 'px';
      el.style.fontWeight = l.weight;
      el.style.color = l.color;
      el.style.letterSpacing = (l.letterSpacing || 0) + 'px';
      el.style.webkitTextStroke = l.strokeWidth ? `${l.strokeWidth}px ${l.strokeColor}` : '';
      el.style.paintOrder = 'stroke fill';
      el.style.textShadow = l.shadow ? `0 0 ${l.shadow}px ${l.shadowColor}, 0 ${Math.ceil(l.shadow / 3)}px ${l.shadow}px ${l.shadowColor}` : 'none';
    }
  }

  function textOf(l) {
    if (l.type === 'sensor') return formatMetric(l, data);
    if (l.type === 'clock') return formatClock(l);
    return l.text;
  }
  function refreshLive(types) {
    if (!preset) return;
    for (const l of preset.layers) if (types.includes(l.type)) {
      const el = nodes.get(l.id);
      if (el) el.textContent = textOf(l);
    }
  }
  // El reloj avanza por su cuenta, aunque CAM no mande datos.
  setInterval(() => refreshLive(['clock']), 1000);

  function setPreset(p) {
    preset = p;
    updateBg(p.bg);
    const seen = new Set();
    p.layers.forEach((l, i) => {
      seen.add(l.id);
      let el = nodes.get(l.id);
      if (!el || el.dataset.type !== l.type) {
        el?.remove();
        el = document.createElement('div');
        el.className = 'cl-layer cl-' + l.type;
        el.dataset.id = l.id;
        el.dataset.type = l.type;
        nodes.set(l.id, el);
      }
      if (layersEl.children[i] !== el) layersEl.insertBefore(el, layersEl.children[i] || null);
      styleLayer(el, l);
      if (l.type !== 'shape') el.textContent = textOf(l);
    });
    for (const [id, el] of nodes) if (!seen.has(id)) el.remove(), nodes.delete(id);
  }

  function setData(d) {
    data = d || {};
    refreshLive(['sensor']);
  }

  return { canvas, setPreset, setData, setScale, nodeFor: (id) => nodes.get(id), mediaStatus: () => mediaStatus };
}

function hexA(hex, a) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
