// Estado persistente: presets en localStorage y archivos locales en IndexedDB.
// El navegador del Kraken y el de configuración de CAM comparten el mismo almacenamiento.

const KEY = 'coffeeless.state.v1';
export const BASE = 240; // tamaño lógico de diseño (Kraken Plus: 240×240)

export const uid = () => Math.random().toString(36).slice(2, 10);

export function newLayer(type, extra = {}) {
  const common = { id: uid(), type, name: '', x: BASE / 2, y: BASE / 2, rotate: 0, opacity: 1, visible: true, locked: false };
  if (type === 'sensor')
    return { ...common, metric: 'cpu_temp', format: 'd0u', unit: 'C', prefix: '', suffix: '', ...textStyle(), ...extra };
  if (type === 'text') return { ...common, text: 'Texto', ...textStyle(), ...extra };
  if (type === 'shape')
    return { ...common, w: 120, h: 40, radius: 8, fill: '#000000', fillOpacity: 0.6, borderColor: '#ffffff', borderWidth: 0, ...extra };
  throw new Error('tipo desconocido ' + type);
}

function textStyle() {
  return {
    font: 'Inter',
    size: 36,
    weight: 600,
    color: '#ffffff',
    letterSpacing: 0,
    strokeColor: '#000000',
    strokeWidth: 0,
    shadow: 0,
    shadowColor: '#000000',
  };
}

export function newPreset(name = 'Mi pantalla') {
  return {
    id: uid(),
    name,
    size: BASE,
    bg: { source: 'none', color: '#000000', url: '', mediaId: null, mediaName: '', fit: 'cover', scale: 1, rotate: 0, offsetX: 0, offsetY: 0, opacity: 1 },
    layers: [
      newLayer('sensor', { name: 'CPU', metric: 'cpu_temp', format: 'd0u', x: 120, y: 95, size: 44 }),
      newLayer('sensor', { name: 'RAM', metric: 'ram_used', format: 'pct0', x: 120, y: 150, size: 30 }),
    ],
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.presets) && s.presets.length) return s;
    }
  } catch {}
  const p = newPreset();
  return { version: 1, rev: 0, activeId: p.id, presets: [p] };
}

export function saveState(state) {
  state.rev = (state.rev || 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('No se pudo guardar', e);
  }
}

export function readRev() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}').rev || 0;
  } catch {
    return 0;
  }
}

export const STORAGE_KEY = KEY;

export function activePreset(state) {
  return state.presets.find((p) => p.id === state.activeId) || state.presets[0];
}

// ---------- IndexedDB para archivos subidos ----------
let dbp;
function db() {
  if (!dbp)
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('coffeeless', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('media');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('media', mode);
    const req = fn(t.objectStore('media'));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}
export const putMedia = async (blob, id = uid()) => (await tx('readwrite', (s) => s.put(blob, id)), id);
export const getMedia = (id) => tx('readonly', (s) => s.get(id));
export const deleteMedia = (id) => tx('readwrite', (s) => s.delete(id));

// ---------- Exportar / importar ----------
const blobToDataURL = (b) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export async function exportPreset(preset) {
  const out = JSON.parse(JSON.stringify(preset));
  if (out.bg.source === 'local' && out.bg.mediaId) {
    const blob = await getMedia(out.bg.mediaId);
    if (blob) out.bg.embedded = await blobToDataURL(blob);
  }
  return { app: 'coffeeless', version: 1, preset: out };
}

export async function importPreset(json) {
  const p = json?.preset || json;
  if (!p || !Array.isArray(p.layers) || !p.bg) throw new Error('El archivo no es un preset válido');
  p.id = uid();
  p.layers.forEach((l) => (l.id = uid()));
  if (p.bg.embedded) {
    const blob = await (await fetch(p.bg.embedded)).blob();
    p.bg.mediaId = await putMedia(blob);
    delete p.bg.embedded;
  }
  return p;
}
