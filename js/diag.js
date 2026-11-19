// Panel de diagnóstico: responde lo pendiente de confirmar en CAM con una sola foto.
// Se usa en el Kraken (pantalla completa) y en la vista previa del editor (datos que recibe la ventana de configuración).
import { activePreset } from './state.js';

// opts: { onData, getLastData, isReal, getState, getMediaStatus, title }
export function createDiagnostics(container, opts) {
  const el = document.createElement('div');
  el.className = 'diag';
  el.hidden = true;
  container.appendChild(el);
  let count = 0;
  let lastAt = 0;
  opts.onData((d, real) => real && (count++, (lastAt = Date.now())));
  const fmt = (v, u, k = 1) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * k) + u : '—');
  const fontState = (family) => {
    const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === family);
    if (!faces.length) return '✗';
    if (faces.some((f) => f.status === 'loaded')) return '✓';
    return faces.some((f) => f.status === 'error') ? '✗' : '…';
  };
  let timer = null;
  function draw() {
    const state = opts.getState();
    const ms = opts.getMediaStatus();
    const p = activePreset(state);
    const v1 = window.nzxt?.v1 || {};
    const d = opts.getLastData() || {};
    const ago = lastAt ? Math.round((Date.now() - lastAt) / 1000) : null;
    const fonts = [...new Set(p.layers.filter((l) => l.font).map((l) => l.font))];
    const bg = p.bg.source === 'none' ? 'solo color' : ms.error ? '✗ error' : ms.ok ? '✓' : '… cargando';
    // tamaño de letra relativo al lado del contenedor (≈5.5 %: 13 px a 240 px)
    const side = Math.min(container.clientWidth || innerWidth, container.clientHeight || innerHeight);
    el.style.fontSize = Math.max(9, side * 0.055) + 'px';
    const rows = [
      [opts.title, ''],
      ['Datos', opts.isReal() ? `✓ CAM · hace ${ago}s · ${count}` : '✗ demo (sin CAM)'],
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
      row.append(b, v ? ' ' + v : '');
      return row;
    }));
  }
  return {
    toggle(on) {
      if (on === !el.hidden) return;
      el.hidden = !on;
      clearInterval(timer);
      timer = null;
      if (on) draw(), (timer = setInterval(draw, 1000));
    },
  };
}
