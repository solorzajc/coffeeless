// Editor: corre en la ventana de configuración de CAM (o en cualquier navegador para diseñar).
import { loadState, saveState, activePreset, newPreset, newLayer, putMedia, deleteMedia, exportPreset, importPreset, uid } from './state.js';
import { createRenderer, ensureFont, resolveMediaUrl } from './render.js';
import { icon as svgIcon } from './icons.js';
import { METRICS, metricById, formatsFor } from './sensors.js';

const FONTS = [
  'Inter', 'Fasthand', 'Freehand', 'Rye', 'Ultra', 'Abril Fatface', 'Bebas Neue', 'Anton', 'Oswald', 'Teko', 'Rajdhani',
  'Orbitron', 'Audiowide', 'Michroma', 'Syncopate', 'Unbounded', 'Russo One', 'Black Ops One', 'Bungee', 'Monoton',
  'Righteous', 'Rubik Mono One', 'Press Start 2P', 'Silkscreen', 'VT323', 'Share Tech Mono', 'Major Mono Display',
  'Space Mono', 'Space Grotesk', 'JetBrains Mono', 'Roboto Mono', 'Montserrat', 'Poppins', 'Roboto', 'Exo 2', 'Saira',
  'Permanent Marker', 'Caveat', 'Pacifico', 'Lobster', 'Cinzel', 'Playfair Display', 'DM Serif Display', 'UnifrakturMaguntia',
];

const PREVIEW = 360; // px en pantalla para la vista previa

export function startEditor({ onData, hasRealData }) {
  let state = loadState();
  let preset = activePreset(state);
  let selectedId = null;
  let showGuide = true;
  let advancedOpen = false;
  let propsLayerId = null;

  const app = document.getElementById('app');
  app.innerHTML = '';
  app.className = 'editor';

  // ---------- estructura ----------
  const presetSelect = h('select', { class: 'preset-select', onchange: (e) => switchPreset(e.target.value) });
  const liveBadge = h('span', { class: 'badge' });
  const header = h('header', {},
    h('div', { class: 'brand' }, h('b', {}, 'coffeeless'), h('span', { class: 'muted' }, ' · Kraken LCD')),
    h('div', { class: 'preset-bar' },
      presetSelect,
      btn('Nuevo', () => addPreset(newPreset('Pantalla ' + (state.presets.length + 1)))),
      btn('Duplicar', () => addPreset({ ...clone(preset), id: uid(), name: preset.name + ' (copia)' })),
      btn('Renombrar', renamePreset),
      btn('Eliminar', removePreset, 'danger'),
      btn('Exportar', doExport),
      btn('Importar', () => importInput.click()),
    ),
    liveBadge,
  );
  const importInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: doImport });

  const stage = h('div', { class: 'stage' });
  const frame = h('div', { class: 'frame', style: `width:${PREVIEW}px;height:${PREVIEW}px` });
  const guide = h('div', { class: 'guide' });
  const selBox = h('div', { class: 'selbox' });
  frame.append(guide, selBox);
  const mediaMsg = h('div', { class: 'media-msg' });
  stage.append(
    frame,
    h('div', { class: 'stage-tools' },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { showGuide = e.target.checked; guide.hidden = !showGuide; } }), ' Guía del borde de la bomba (solo en el editor)'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!state.debug, onchange: (e) => { state.debug = e.target.checked; commit(); } }), ' Diagnóstico en el Kraken (datos, resolución, fuentes, fondo)'),
    ),
    mediaMsg,
    h('p', { class: 'hint' }, 'Arrastra los elementos en la vista previa. Flechas: mover 1 px (Shift: 10 px). Supr: borrar.'),
  );

  const bgPanel = h('section', { class: 'card' });
  const layerList = h('div', { class: 'layer-list' });
  const propsPanel = h('section', { class: 'card props' });
  const side = h('aside', { class: 'side' },
    bgPanel,
    h('section', { class: 'card' },
      h('div', { class: 'card-title' }, 'Capas'),
      h('div', { class: 'add-row' },
        btn('+ Sensor', () => addLayer('sensor')),
        btn('+ Texto', () => addLayer('text')),
        btn('+ Forma', () => addLayer('shape')),
      ),
      layerList,
    ),
    propsPanel,
  );

  app.append(header, h('main', {}, stage, side), importInput);

  const renderer = createRenderer(frame, { onMediaStatus: showMediaStatus });
  frame.insertBefore(renderer.canvas, guide);

  // ---------- datos ----------
  onData((d, real) => {
    renderer.setData(d);
    liveBadge.textContent = real ? '● Datos en vivo de CAM' : '○ Datos de demostración';
    liveBadge.classList.toggle('live', real);
    requestAnimationFrame(drawSelection);
  });

  // ---------- guardar ----------
  let saveT;
  function commit({ list = false, props = false } = {}) {
    renderer.setPreset(preset);
    renderer.setScale(PREVIEW);
    clearTimeout(saveT);
    saveT = setTimeout(() => saveState(state), 120);
    if (list) renderLayerList();
    if (props) renderProps();
    requestAnimationFrame(drawSelection);
  }

  // ---------- presets ----------
  function renderPresetSelect() {
    presetSelect.innerHTML = '';
    state.presets.forEach((p) => presetSelect.append(h('option', { value: p.id, selected: p.id === preset.id }, p.name)));
  }
  function switchPreset(id) {
    state.activeId = id;
    preset = activePreset(state);
    selectedId = null;
    mediaMsg.textContent = '';
    refreshAll();
  }
  function addPreset(p) {
    state.presets.push(p);
    switchPreset(p.id);
  }
  function renamePreset() {
    const n = prompt('Nombre del preset', preset.name);
    if (n && n.trim()) (preset.name = n.trim()), refreshAll();
  }
  async function removePreset() {
    if (state.presets.length === 1) return alert('Necesitas al menos un preset.');
    if (!confirm(`¿Eliminar "${preset.name}"?`)) return;
    if (preset.bg.mediaId) deleteMedia(preset.bg.mediaId).catch(() => {});
    state.presets = state.presets.filter((p) => p.id !== preset.id);
    switchPreset(state.presets[0].id);
  }
  async function doExport() {
    const data = await exportPreset(preset);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${slug(preset.name)}.coffeeless.json` });
    document.body.append(a);
    a.click();
    a.remove();
  }
  async function doImport(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const p = await importPreset(JSON.parse(await file.text()));
      addPreset(p);
    } catch (err) {
      alert('No se pudo importar: ' + err.message);
    }
  }

  // ---------- fondo ----------
  function renderBg() {
    const bg = preset.bg;
    const file = h('input', {
      type: 'file', accept: 'image/*,video/mp4,video/webm',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const old = bg.mediaId;
        bg.mediaId = await putMedia(f);
        bg.mediaName = f.name;
        bg.source = 'local';
        if (old) deleteMedia(old).catch(() => {});
        commit();
        renderBg();
      },
    });
    const urlInput = h('input', { type: 'url', placeholder: 'https://…gif / .png / .mp4', value: bg.url || '' });
    const applyUrl = () => {
      bg.url = urlInput.value.trim();
      bg.source = 'url';
      const r = resolveMediaUrl(bg.url);
      showMediaStatus(r.error ? { error: r.error } : { ok: true });
      commit();
      renderBg();
    };
    urlInput.addEventListener('change', applyUrl);

    bgPanel.innerHTML = '';
    put(bgPanel, 
      h('div', { class: 'card-title' }, 'Fondo'),
      field('Origen', select(bg, 'source', [['none', 'Solo color'], ['url', 'URL (GIF, imagen o video)'], ['local', 'Archivo de mi PC']], () => (commit(), renderBg()))),
      bg.source === 'url' ? field('URL', h('div', { class: 'row' }, urlInput, btn('Cargar', applyUrl))) : null,
      bg.source === 'local' ? field('Archivo', h('div', { class: 'col' }, file, bg.mediaName ? h('small', { class: 'muted' }, 'Actual: ' + bg.mediaName) : null)) : null,
      h('div', { class: 'grid2' },
        field('Color de fondo', color(bg, 'color')),
        bg.source !== 'none' ? field('Ajuste', select(bg, 'fit', [['cover', 'Cubrir'], ['contain', 'Contener'], ['fill', 'Estirar']])) : null,
      ),
      bg.source !== 'none'
        ? h('div', { class: 'grid2' },
            field('Escala', slider(bg, 'scale', 0.1, 4, 0.01)),
            field('Rotación', slider(bg, 'rotate', -180, 180, 1, '°')),
            field('Desplazamiento X', slider(bg, 'offsetX', -1, 1, 0.01)),
            field('Desplazamiento Y', slider(bg, 'offsetY', -1, 1, 0.01)),
            field('Opacidad', slider(bg, 'opacity', 0, 1, 0.01)),
          )
        : null,
    );
  }

  function showMediaStatus(s) {
    mediaMsg.className = 'media-msg ' + (s.error ? 'err' : s.note ? 'note' : 'ok');
    mediaMsg.textContent = s.error || s.note || '';
  }

  // ---------- capas ----------
  const labelOf = (l) => l.name || (l.type === 'sensor' ? metricById(l.metric).label : l.type === 'text' ? l.text : 'Forma');

  function renderLayerList() {
    layerList.innerHTML = '';
    if (!preset.layers.length) layerList.append(h('p', { class: 'muted' }, 'Sin capas. Agrega un sensor, texto o forma.'));
    [...preset.layers].reverse().forEach((l) => {
      const idx = preset.layers.indexOf(l);
      layerList.append(
        h('div', { class: 'layer' + (l.id === selectedId ? ' sel' : '') + (l.visible === false ? ' hidden-layer' : ''), onclick: () => selectLayer(l.id) },
          h('span', { class: 'ico' }, svgIcon(l.type)),
          h('span', { class: 'lname' }, labelOf(l)),
          ibtn(l.visible === false ? 'eyeOff' : 'eye', l.visible === false ? 'Mostrar' : 'Ocultar', () => ((l.visible = l.visible === false), commit({ list: true }))),
          ibtn(l.locked ? 'lock' : 'unlock', l.locked ? 'Desbloquear' : 'Bloquear', () => ((l.locked = !l.locked), commit({ list: true }))),
          ibtn('up', 'Subir', () => move(idx, 1)),
          ibtn('down', 'Bajar', () => move(idx, -1)),
          ibtn('copy', 'Duplicar', () => {
            const c = { ...clone(l), id: uid(), x: l.x + 8, y: l.y + 8 };
            preset.layers.splice(idx + 1, 0, c);
            selectedId = c.id;
            commit({ list: true, props: true });
          }),
          ibtn('trash', 'Eliminar', () => removeLayer(l.id)),
        ),
      );
    });
  }
  function move(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= preset.layers.length) return;
    const arr = preset.layers;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    commit({ list: true });
  }
  function addLayer(type) {
    const l = newLayer(type, type === 'shape' ? { x: 120, y: 120 } : {});
    preset.layers.push(l);
    selectedId = l.id;
    commit({ list: true, props: true });
  }
  function removeLayer(id) {
    preset.layers = preset.layers.filter((l) => l.id !== id);
    if (selectedId === id) selectedId = null;
    commit({ list: true, props: true });
  }
  function selectLayer(id) {
    if (selectedId === id) return;
    selectedId = id;
    renderLayerList();
    renderProps();
    drawSelection();
  }
  const selected = () => preset.layers.find((l) => l.id === selectedId);

  // ---------- propiedades ----------
  function renderProps() {
    const l = selected();
    if (l?.id !== propsLayerId) (propsLayerId = l?.id), (advancedOpen = false);
    propsPanel.innerHTML = '';
    if (!l) {
      put(propsPanel, h('div', { class: 'card-title' }, 'Propiedades'), h('p', { class: 'muted' }, 'Selecciona una capa para editarla.'));
      return;
    }
    const up = () => commit({ list: true });
    put(propsPanel, h('div', { class: 'card-title with-ico' }, svgIcon(l.type), labelOf(l)));
    put(propsPanel, field('Nombre (opcional)', text(l, 'name', up)));

    if (l.type === 'sensor') {
      const groups = [...new Set(METRICS.map((m) => m.group))];
      const metricSel = h('select', {
        onchange: (e) => {
          const prevKind = metricById(l.metric).kind;
          l.metric = e.target.value;
          const kind = metricById(l.metric).kind;
          if (kind !== prevKind) l.format = formatsFor(kind)[0].id;
          commit({ list: true, props: true });
        },
      }, ...groups.map((g) => h('optgroup', { label: g }, ...METRICS.filter((m) => m.group === g).map((m) => h('option', { value: m.id, selected: m.id === l.metric }, m.label)))));
      const kind = metricById(l.metric).kind;
      put(propsPanel, 
        h('div', { class: 'grid2' },
          field('Sensor', metricSel),
          field('Formato', select(l, 'format', formatsFor(kind).map((f) => [f.id, f.ex]))),
          kind === 'temp' ? field('Unidad', select(l, 'unit', [['C', 'Celsius (°C)'], ['F', 'Fahrenheit (°F)']])) : null,
        ),
      );
    }
    if (l.type === 'text') put(propsPanel, field('Texto', text(l, 'text', up)));
    if (l.type === 'sensor' || l.type === 'text') put(propsPanel, ...textControls(l));
    if (l.type === 'shape')
      put(propsPanel, 
        h('div', { class: 'grid2' },
          field('Ancho', slider(l, 'w', 1, 480, 1, 'px')),
          field('Alto', slider(l, 'h', 1, 480, 1, 'px')),
          field('Esquinas', slider(l, 'radius', 0, 240, 1, 'px')),
          field('Relleno', color(l, 'fill')),
          field('Opacidad del relleno', slider(l, 'fillOpacity', 0, 1, 0.01)),
          field('Borde', color(l, 'borderColor')),
          field('Grosor del borde', slider(l, 'borderWidth', 0, 30, 1, 'px')),
        ),
      );
    put(propsPanel, 
      h('div', { class: 'grid2' },
        field('Posición X', slider(l, 'x', -120, 360, 1, 'px')),
        field('Posición Y', slider(l, 'y', -120, 360, 1, 'px')),
        field('Rotación', slider(l, 'rotate', -180, 180, 1, '°')),
        field('Opacidad', slider(l, 'opacity', 0, 1, 0.01)),
      ),
      h('div', { class: 'row' },
        btn('Centrar horizontal', () => ((l.x = preset.size / 2), commit({ props: true }))),
        btn('Centrar vertical', () => ((l.y = preset.size / 2), commit({ props: true }))),
      ),
    );
    // "Avanzado" siempre al final de la capa, contraído al cambiar de capa
    if (l.type === 'sensor')
      put(propsPanel,
        h('details', { class: 'advanced', open: advancedOpen, ontoggle: (e) => (advancedOpen = e.target.open) },
          h('summary', {}, 'Avanzado'),
          h('p', { class: 'muted' }, 'Para etiquetas como “CPU” es mejor usar una capa de texto aparte.'),
          h('div', { class: 'grid2' },
            field('Texto antes del valor', text(l, 'prefix')),
            field('Texto después del valor', text(l, 'suffix')),
          ),
        ),
      );
  }

  function textControls(l) {
    const fontInput = h('input', { type: 'text', list: 'font-list', value: l.font });
    const applyFont = () => { const v = fontInput.value.trim(); if (v) { l.font = v; ensureFont(v); commit(); } };
    fontInput.addEventListener('change', applyFont);
    return [
      h('div', { class: 'grid2' },
        field(h('span', {}, 'Fuente ', h('a', { href: 'https://fonts.google.com/', target: '_blank', rel: 'noopener' }, '(Google Fonts)')), fontInput),
        field('Grosor', select(l, 'weight', [300, 400, 500, 600, 700, 800, 900].map((w) => [w, String(w)]), null, Number)),
        field('Tamaño', slider(l, 'size', 6, 200, 1, 'px')),
        field('Color', color(l, 'color')),
        field('Espaciado', slider(l, 'letterSpacing', -10, 30, 0.5, 'px')),
        field('Contorno', slider(l, 'strokeWidth', 0, 12, 0.5, 'px')),
        field('Color de contorno', color(l, 'strokeColor')),
        field('Sombra', slider(l, 'shadow', 0, 40, 1, 'px')),
        field('Color de sombra', color(l, 'shadowColor')),
      ),
    ];
  }

  // ---------- controles genéricos ----------
  function field(label, control) {
    if (!control) return null;
    return h('label', { class: 'field' }, h('span', { class: 'flabel' }, label), control);
  }
  function text(obj, key, after) {
    return h('input', { type: 'text', value: obj[key] ?? '', oninput: (e) => { obj[key] = e.target.value; commit(); after?.(); } });
  }
  function color(obj, key) {
    return h('input', { type: 'color', value: obj[key] || '#000000', oninput: (e) => { obj[key] = e.target.value; commit(); } });
  }
  function select(obj, key, options, after, cast = (v) => v) {
    return h('select', { onchange: (e) => { obj[key] = cast(e.target.value); commit(); after?.(); } },
      ...options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(obj[key]) }, label)));
  }
  function slider(obj, key, min, max, step, unit = '') {
    const num = h('input', { type: 'number', min, max, step, value: round(obj[key] ?? 0, step), class: 'num' });
    const rng = h('input', { type: 'range', min, max, step, value: obj[key] ?? 0 });
    const set = (v) => { if (Number.isNaN(v)) return; obj[key] = v; commit(); };
    rng.addEventListener('input', () => { num.value = rng.value; set(parseFloat(rng.value)); });
    num.addEventListener('input', () => { rng.value = num.value; set(parseFloat(num.value)); });
    return h('div', { class: 'slider', 'data-key': key }, rng, num, unit ? h('span', { class: 'unit' }, unit) : null);
  }

  // ---------- arrastrar en la vista previa ----------
  let drag = null;
  frame.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.cl-layer');
    const l = el && preset.layers.find((x) => x.id === el.dataset.id);
    if (!l) { selectLayer(null); return; }
    selectLayer(l.id);
    if (l.locked) return;
    drag = { l, sx: e.clientX, sy: e.clientY, x: l.x, y: l.y };
    frame.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  frame.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = preset.size / PREVIEW;
    drag.l.x = Math.round(drag.x + (e.clientX - drag.sx) * k);
    drag.l.y = Math.round(drag.y + (e.clientY - drag.sy) * k);
    commit();
  });
  frame.addEventListener('pointerup', () => {
    if (drag) (drag = null), renderProps();
  });

  addEventListener('keydown', (e) => {
    const l = selected();
    if (!l || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const d = e.shiftKey ? 10 : 1;
    const moves = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    if (moves[e.key] && !l.locked) {
      l.x += moves[e.key][0];
      l.y += moves[e.key][1];
      commit({ props: true });
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      removeLayer(l.id);
      e.preventDefault();
    }
  });

  function drawSelection() {
    const l = selected();
    const el = l && renderer.nodeFor(l.id);
    if (!el || l.visible === false) return (selBox.hidden = true);
    const fr = frame.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    selBox.hidden = false;
    Object.assign(selBox.style, { left: r.left - fr.left - 3 + 'px', top: r.top - fr.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
  }

  // ---------- inicio ----------
  const dl = h('datalist', { id: 'font-list' }, ...FONTS.map((f) => h('option', { value: f })));
  document.body.append(dl);

  function refreshAll() {
    renderPresetSelect();
    renderBg();
    renderLayerList();
    renderProps();
    commit();
  }
  refreshAll();
  liveBadge.textContent = hasRealData() ? '● Datos en vivo de CAM' : '○ Datos de demostración';
}

// ---------- utilidades DOM ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
function btn(label, fn, cls = '') {
  return h('button', { type: 'button', class: 'btn ' + cls, onclick: fn }, label);
}
function ibtn(name, title, fn) {
  return h('button', { type: 'button', class: 'ibtn', title, 'aria-label': title, onclick: (e) => { e.stopPropagation(); fn(); } }, svgIcon(name));
}
const put = (el, ...c) => el.append(...c.flat().filter((x) => x !== null && x !== undefined && x !== false));
const clone = (o) => JSON.parse(JSON.stringify(o));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'preset';
const round = (v, step) => {
  const d = String(step).split('.')[1]?.length || 0;
  return Number(v).toFixed(d);
};
