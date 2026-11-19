// Punto de entrada. CAM abre la misma URL dos veces:
//  - con ?kraken=1 en un navegador oculto que se transmite a la pantalla del Kraken
//  - sin parámetro en la ventana de configuración (aquí va el editor)
import { loadState, activePreset, readRev, STORAGE_KEY } from './state.js';
import { createRenderer } from './render.js';
import { demoData } from './sensors.js';

const params = new URLSearchParams(location.search);
const isKraken = params.get('kraken') === '1';

// Recibir datos de CAM sin pisar lo que CAM ya haya definido en window.nzxt.v1
const listeners = new Set();
let lastData = null;
let realData = false;
window.nzxt = window.nzxt || {};
window.nzxt.v1 = window.nzxt.v1 || {};
window.nzxt.v1.onMonitoringDataUpdate = (d) => {
  lastData = d;
  realData = true;
  listeners.forEach((fn) => fn(d, true));
};
export const onData = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const hasRealData = () => realData;

// Si CAM no manda datos (navegador normal), usar datos de demostración.
let tick = 0;
setInterval(() => {
  tick++;
  if (!realData) listeners.forEach((fn) => fn(demoData(tick), false));
}, 1000);

if (isKraken) startDisplay();
else import('./editor.js').then((m) => m.startEditor({ onData, hasRealData, getLastData: () => lastData }));

function startDisplay() {
  document.body.classList.add('kraken');
  const root = document.getElementById('app');
  let mediaStatus = { pending: true };
  const r = createRenderer(root, { onMediaStatus: (st) => (mediaStatus = st) });
  let state = loadState();
  let rev = state.rev;
  const fit = () => r.setScale(window.nzxt?.v1?.width || Math.min(innerWidth, innerHeight) || 240);
  const apply = () => {
    r.setPreset(activePreset(state));
    fit();
    diag.toggle(params.get('debug') === '1' || !!state.debug);
  };
  const diag = createDiagnostics(() => ({ state, mediaStatus }));
  apply();
  addEventListener('resize', fit);
  onData((d) => r.setData(d));
  // Cambios desde el editor: evento storage + sondeo de respaldo
  const reload = () => {
    const nr = readRev();
    if (nr !== rev) {
      state = loadState();
      rev = state.rev;
      mediaStatus = { pending: true };
      apply();
    }
  };
  addEventListener('storage', (e) => e.key === STORAGE_KEY && reload());
  setInterval(reload, 1000);
}

// Panel de diagnóstico sobre el Kraken: responde lo pendiente de confirmar en CAM con una sola foto.
function createDiagnostics(get) {
  const el = document.createElement('div');
  el.className = 'diag';
  el.hidden = true;
  document.body.appendChild(el);
  let count = 0;
  let lastAt = 0;
  onData((d, real) => real && (count++, (lastAt = Date.now())));
  const fmt = (v, u, k = 1) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * k) + u : '—');
  const fontState = (family) => {
    const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === family);
    if (!faces.length) return '✗';
    if (faces.some((f) => f.status === 'loaded')) return '✓';
    return faces.some((f) => f.status === 'error') ? '✗' : '…';
  };
  let timer = null;
  function draw() {
    const { state, mediaStatus } = get();
    const p = activePreset(state);
    const v1 = window.nzxt?.v1 || {};
    const d = lastData || {};
    const ago = lastAt ? Math.round((Date.now() - lastAt) / 1000) : null;
    const fonts = [...new Set(p.layers.filter((l) => l.font).map((l) => l.font))];
    const bg = p.bg.source === 'none' ? 'solo color' : mediaStatus.error ? '✗ error' : mediaStatus.pending ? '… cargando' : '✓';
    const rows = [
      ['Datos', realData ? `✓ CAM · hace ${ago}s · ${count}` : '✗ demo (sin CAM)'],
      ['CPU', `${fmt(d.cpus?.[0]?.temperature, '°')} ${fmt(d.cpus?.[0]?.load, '%', 100)}`],
      ['GPU', `${fmt(d.gpus?.[0]?.temperature, '°')} ${fmt(d.gpus?.[0]?.load, '%', 100)}`],
      ['Líquido', fmt(d.kraken?.liquidTemperature, '°')],
      ['CAM', `${v1.width ?? '—'}×${v1.height ?? '—'} ${v1.shape ?? ''}`.trim()],
      ['Ventana', `${innerWidth}×${innerHeight}`],
      ['Fondo', bg],
      ['Fuentes', fonts.map((f) => `${f} ${fontState(f)}`).join(' · ') || '—'],
      ['Preset', `${p.name} · rev ${state.rev || 0}`],
    ];
    el.replaceChildren(...rows.map(([k, v]) => {
      const row = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = k;
      row.append(b, ' ' + v);
      return row;
    }));
  }
  return {
    toggle(on) {
      el.hidden = !on;
      clearInterval(timer);
      timer = null;
      if (on) draw(), (timer = setInterval(draw, 1000));
    },
  };
}
