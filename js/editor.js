// Editor: corre en la ventana de configuración de CAM (o en cualquier navegador para diseñar).
import { loadState, saveState, activePreset, newPreset, newLayer, putMedia, deleteMedia, exportPreset, importPreset, uid } from './state.js';
import { createRenderer, ensureFont, resolveMediaUrl, availableWeights } from './render.js';
import { icon as svgIcon } from './icons.js';
import { createDiagnostics } from './diag.js';
import { createFontPicker } from './fontpicker.js';
import { METRICS, metricById, formatsFor, CLOCKS, clockById } from './sensors.js';


const PREVIEW = 360; // px en pantalla para la vista previa
const BG = '__bg'; // id de selección del fondo
const WEIGHT_NAMES = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

export function startEditor({ onData, hasRealData, getLastData }) {
  let state = loadState();
  // El diagnóstico se apaga cada vez que se abre el editor (se activa a mano cuando hace falta).
  if (state.debug) (state.debug = false), saveState(state);
  let preset = activePreset(state);
  let selectedId = null;
  let showGuide = true;
  let advancedOpen = false;
  let propsLayerId = null;

  const app = document.getElementById('app');
  app.innerHTML = '';
  app.className = 'editor';

  // ---------- estructura ----------
  // CAM no muestra prompt()/confirm()/alert(), así que todo se resuelve dentro de la barra.
  const presetSelect = h('select', { class: 'preset-select', onchange: (e) => switchPreset(e.target.value) });
  const nameInput = h('input', { type: 'text', class: 'preset-name', hidden: true, maxlength: 60, 'aria-label': 'Nombre del preset' });
  const presetActions = h('div', { class: 'preset-actions' });
  const barMsg = h('span', { class: 'bar-msg', role: 'status' });
  const liveBadge = h('span', { class: 'badge' });
  const header = h('header', {},
    h('div', { class: 'brand' }, h('b', {}, 'coffeeless'), h('span', { class: 'muted' }, ' · Kraken LCD')),
    h('div', { class: 'preset-bar' }, presetSelect, nameInput, presetActions, barMsg),
    liveBadge,
  );
  const importInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: doImport });

  const stage = h('div', { class: 'stage' });
  const frame = h('div', { class: 'frame', style: `width:${PREVIEW}px;height:${PREVIEW}px` });
  const guide = h('div', { class: 'guide' });
  const selBox = h('div', { class: 'selbox' }, h('span', { class: 'selbox-lock' }, svgIcon('lock')));
  const rotHandle = h('div', { class: 'rot-handle', title: 'Arrastra para rotar el fondo', hidden: true });
  const snapV = h('div', { class: 'snap-guide v', hidden: true });
  const snapH = h('div', { class: 'snap-guide h', hidden: true });
  frame.append(guide, selBox, rotHandle, snapV, snapH);
  const mediaMsg = h('div', { class: 'media-msg' });
  stage.append(
    frame,
    h('div', { class: 'stage-tools' },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { showGuide = e.target.checked; guide.hidden = !showGuide; } }), ' Guía del borde de la bomba (solo en el editor)'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!state.debug, onchange: (e) => { state.debug = e.target.checked; commit(); } }), ' Diagnóstico (en el Kraken y en esta vista previa)'),
    ),
    mediaMsg,
    h('p', { class: 'hint' }, 'Arrastra los elementos en la vista previa. Flechas: mover 1 px (Shift: 10 px). Supr: borrar. Las capas bloqueadas no se mueven y los clics las atraviesan. Al arrastrar se alinea con el lienzo y otras capas (Alt: sin imán).'),
    h('p', { class: 'hint' }, 'Con «Fondo» seleccionado en Capas: arrastra para moverlo, rueda para escalar, Shift+arrastrar o el asa de arriba para rotar.'),
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
        btn('+ Reloj', () => addLayer('clock')),
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
  const diag = createDiagnostics(frame, {
    title: 'Diagnóstico · editor',
    onData, getLastData, isReal: hasRealData, getState: () => state, getMediaStatus: renderer.mediaStatus,
  });

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
    diag.toggle(!!state.debug);
    requestAnimationFrame(drawSelection);
  }

  // ---------- presets ----------
  function renderPresetSelect() {
    presetSelect.innerHTML = '';
    state.presets.forEach((p) => presetSelect.append(h('option', { value: p.id, selected: p.id === preset.id }, p.name)));
  }
  function switchPreset(id) {
    if (barMode !== 'normal') (barMode = 'normal'), renderPresetBar();
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
  // Barra: modo normal, renombrando o confirmando eliminación.
  let barMode = 'normal';
  let msgT;
  function say(text, kind = '') {
    clearTimeout(msgT);
    barMsg.textContent = text;
    barMsg.className = 'bar-msg ' + kind;
    if (text) msgT = setTimeout(() => (barMsg.textContent = ''), 5000);
  }
  function renderPresetBar() {
    presetActions.innerHTML = '';
    presetSelect.hidden = barMode === 'rename';
    nameInput.hidden = barMode !== 'rename';
    if (barMode === 'rename')
      put(presetActions, btn('Guardar', finishRename, 'primary'), btn('Cancelar', () => endRename(false)));
    else if (barMode === 'delete')
      put(presetActions,
        h('span', { class: 'confirm-q' }, `¿Eliminar “${preset.name}”?`),
        btn('Sí, eliminar', removePreset, 'danger solid'),
        btn('Cancelar', () => setBarMode('normal')));
    else
      put(presetActions,
        btn('Nuevo', () => (addPreset(newPreset('Pantalla ' + (state.presets.length + 1))), startRename())),
        btn('Duplicar', () => (addPreset({ ...clone(preset), id: uid(), name: preset.name + ' (copia)' }), startRename())),
        btn('Renombrar', startRename),
        btn('Eliminar', () => (state.presets.length === 1 ? say('Necesitas al menos un preset.', 'err') : setBarMode('delete')), 'danger'),
        btn('Exportar', doExport),
        btn('Importar', () => importInput.click()));
  }
  function setBarMode(m) {
    barMode = m;
    renderPresetBar();
  }
  function startRename() {
    setBarMode('rename');
    nameInput.value = preset.name;
    nameInput.focus();
    nameInput.select();
  }
  function endRename(save) {
    if (barMode !== 'rename') return;
    const n = nameInput.value.trim();
    if (save && n) preset.name = n;
    setBarMode('normal');
    renderPresetSelect();
    commit();
  }
  const finishRename = () => endRename(true);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finishRename();
    else if (e.key === 'Escape') endRename(false);
  });
  // al hacer clic fuera, guardar (salvo que el clic sea en Guardar/Cancelar)
  nameInput.addEventListener('blur', (e) => { if (!presetActions.contains(e.relatedTarget)) finishRename(); });
  function removePreset() {
    if (preset.bg.mediaId) deleteMedia(preset.bg.mediaId).catch(() => {});
    const name = preset.name;
    state.presets = state.presets.filter((p) => p.id !== preset.id);
    barMode = 'normal';
    switchPreset(state.presets[0].id);
    say(`Eliminado “${name}”.`);
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
      say('No se pudo importar: ' + err.message, 'err');
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
        ? h('div', { class: 'row' },
            btn(selectedId === BG ? 'Fondo seleccionado ✓' : 'Mover / escalar / rotar', () => selectLayer(BG)),
            h('small', { class: 'muted' }, 'o elige «Fondo» en Capas'))
        : null,
    );
  }

  function showMediaStatus(s) {
    mediaMsg.className = 'media-msg ' + (s.error ? 'err' : s.note ? 'note' : 'ok');
    mediaMsg.textContent = s.error || s.note || '';
  }

  // ---------- capas ----------
  const SHAPES = [['rect', 'Rectángulo'], ['ellipse', 'Elipse'], ['line', 'Línea']];
  const shapeLabel = (l) => SHAPES.find(([k]) => k === (l.shape || 'rect'))[1];
  const labelOf = (l) =>
    l.name ||
    (l.type === 'sensor' ? metricById(l.metric).label : l.type === 'clock' ? clockById(l.clock).label : l.type === 'text' ? l.text : shapeLabel(l));
  const iconOf = (l) => (l.type === 'shape' ? l.shape || 'rect' : l.type);

  function renderLayerList() {
    layerList.innerHTML = '';
    if (!preset.layers.length) layerList.append(h('p', { class: 'muted' }, 'Sin capas. Agrega un sensor, reloj, texto o forma.'));
    [...preset.layers].reverse().forEach((l) => {
      const idx = preset.layers.indexOf(l);
      layerList.append(
        h('div', { class: 'layer' + (l.id === selectedId ? ' sel' : '') + (l.visible === false ? ' hidden-layer' : ''), onclick: () => selectLayer(l.id) },
          h('span', { class: 'ico' }, svgIcon(iconOf(l))),
          h('span', { class: 'lname' }, labelOf(l)),
          ibtn(l.visible === false ? 'eyeOff' : 'eye', l.visible === false ? 'Mostrar' : 'Ocultar', () => ((l.visible = l.visible === false), commit({ list: true }))),
          ibtn(l.locked ? 'lock' : 'unlock', l.locked ? 'Desbloquear' : 'Bloquear', () => ((l.locked = !l.locked), commit({ list: true, props: l.id === selectedId }))),
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
    // el fondo siempre va al final (debajo de todo)
    layerList.append(
      h('div', { class: 'layer bg-layer' + (selectedId === BG ? ' sel' : ''), onclick: () => selectLayer(BG) },
        h('span', { class: 'ico' }, svgIcon('image')),
        h('span', { class: 'lname' }, 'Fondo', preset.bg.source === 'none' ? h('span', { class: 'muted' }, ' · solo color') : null),
      ),
    );
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
    if (id === BG) return;
    preset.layers = preset.layers.filter((l) => l.id !== id);
    if (selectedId === id) selectedId = null;
    commit({ list: true, props: true });
  }
  function selectLayer(id) {
    if (selectedId === id) return;
    const bgChanged = (selectedId === BG) !== (id === BG);
    selectedId = id;
    renderLayerList();
    renderProps();
    if (bgChanged) renderBg();
    drawSelection();
  }
  const selected = () => preset.layers.find((l) => l.id === selectedId);

  // ---------- propiedades ----------
  function renderProps() {
    if (selectedId === BG) return renderBgProps();
    const l = selected();
    if (l?.id !== propsLayerId) (propsLayerId = l?.id), (advancedOpen = false);
    propsPanel.innerHTML = '';
    if (!l) {
      put(propsPanel, h('div', { class: 'card-title' }, 'Propiedades'), h('p', { class: 'muted' }, 'Selecciona una capa para editarla.'));
      return;
    }
    const up = () => commit({ list: true });
    put(propsPanel, h('div', { class: 'card-title with-ico' }, svgIcon(iconOf(l)), labelOf(l)));
    if (l.locked)
      put(propsPanel, h('div', { class: 'lock-note' }, svgIcon('lock'),
        h('span', {}, 'Bloqueada: no se mueve en la vista previa y los clics la atraviesan. Puedes editarla aquí.'),
        btn('Desbloquear', () => ((l.locked = false), commit({ list: true, props: true })))));
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
    if (l.type === 'clock') {
      const clockSel = h('select', {
        onchange: (e) => {
          l.clock = e.target.value;
          l.format = formatsFor(l.clock)[0].id;
          commit({ list: true, props: true });
        },
      }, ...CLOCKS.map((c) => h('option', { value: c.id, selected: c.id === l.clock }, c.label)));
      put(propsPanel,
        h('div', { class: 'grid2' },
          field('Mostrar', clockSel),
          field('Formato', select(l, 'format', formatsFor(clockById(l.clock).id).map((f) => [f.id, f.ex]))),
        ),
      );
    }
    if (l.type === 'text') put(propsPanel, field('Texto', text(l, 'text', up)));
    if (l.type !== 'shape') put(propsPanel, ...textControls(l));
    if (l.type === 'shape') put(propsPanel, ...shapeControls(l));
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
    if (l.type === 'sensor' || l.type === 'clock')
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

  function renderBgProps() {
    const bg = preset.bg;
    propsPanel.innerHTML = '';
    put(propsPanel, h('div', { class: 'card-title with-ico' }, svgIcon('image'), 'Fondo'));
    if (bg.source === 'none') {
      put(propsPanel, h('p', { class: 'muted' }, 'El fondo es solo color. Elige una URL o un archivo en el panel «Fondo» para poder moverlo, escalarlo y rotarlo.'));
      return;
    }
    put(propsPanel,
      h('p', { class: 'muted' }, 'Arrastra en la vista previa para moverlo, rueda para escalar, Shift+arrastrar o el asa para rotar. Los controles sirven de ajuste fino.'),
      h('div', { class: 'grid2' },
        field('Escala', slider(bg, 'scale', 0.1, 4, 0.01)),
        field('Rotación', slider(bg, 'rotate', -180, 180, 1, '°')),
        field('Desplazamiento X', slider(bg, 'offsetX', -1, 1, 0.01)),
        field('Desplazamiento Y', slider(bg, 'offsetY', -1, 1, 0.01)),
        field('Opacidad', slider(bg, 'opacity', 0, 1, 0.01)),
      ),
      h('div', { class: 'row' },
        btn('Restablecer posición', () => (Object.assign(bg, { scale: 1, rotate: 0, offsetX: 0, offsetY: 0 }), commit({ props: true }))),
      ),
    );
  }

  function shapeControls(l) {
    const kind = l.shape || 'rect';
    const picker = h('div', { class: 'seg', role: 'radiogroup' },
      ...SHAPES.map(([k, label]) =>
        h('button', {
          type: 'button', class: 'seg-btn' + (k === kind ? ' on' : ''), 'aria-pressed': String(k === kind),
          onclick: () => { if (k !== kind) (l.shape = k), commit({ list: true, props: true }); },
        }, svgIcon(k), label)));
    if (kind === 'line')
      return [
        field('Forma', picker),
        h('div', { class: 'grid2' },
          field('Largo', slider(l, 'w', 1, 480, 1, 'px')),
          field('Grosor', slider(l, 'thickness', 1, 40, 1, 'px')),
          field('Color', color(l, 'fill')),
          field('Extremos', select(l, 'cap', [['round', 'Redondos'], ['square', 'Rectos']])),
        ),
      ];
    return [
      field('Forma', picker),
      h('div', { class: 'grid2' },
        field('Ancho', slider(l, 'w', 1, 480, 1, 'px')),
        field('Alto', slider(l, 'h', 1, 480, 1, 'px')),
        field('Relleno', color(l, 'fill')),
        field('Opacidad del relleno', slider(l, 'fillOpacity', 0, 1, 0.01)),
        field('Borde', color(l, 'borderColor')),
        field('Grosor del borde', slider(l, 'borderWidth', 0, 30, 1, 'px')),
        kind === 'rect' ? field('Esquinas', slider(l, 'radius', 0, 240, 1, 'px')) : null,
      ),
    ];
  }

  function textControls(l) {
    const weightSel = h('select', { onchange: (e) => { l.weight = Number(e.target.value); commit(); } });
    const fillWeights = () => weightSel.replaceChildren(...weightOptions(l.font, l.weight).map(([v, label]) => h('option', { value: v, selected: v === l.weight }, label)));
    fillWeights();
    const fontPicker = createFontPicker({
      value: l.font,
      onChange: (v) => {
        l.font = v;
        ensureFont(v);
        // si la fuente nueva no tiene ese grosor, usar el más cercano que sí tenga
        const avail = availableWeights(v);
        if (avail && !avail.includes(l.weight) && !(l.weight === 700 && Math.max(...avail) < 600))
          l.weight = avail.reduce((a, b) => (Math.abs(b - l.weight) < Math.abs(a - l.weight) ? b : a));
        fillWeights();
        commit();
      },
    });
    return [
      h('div', { class: 'grid2' },
        field(h('span', {}, 'Fuente ', h('a', { href: 'https://fonts.google.com/', target: '_blank', rel: 'noopener' }, '(Google Fonts)')), fontPicker, 'div'),
        field('Grosor', weightSel),
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

  // Grosores que la fuente trae de verdad. Si solo tiene delgados, se ofrece una negrita simulada (el navegador la engrosa).
  function weightOptions(font, cur) {
    const avail = availableWeights(font) || [100, 200, 300, 400, 500, 600, 700, 800, 900];
    const opts = avail.map((w) => [w, `${w} · ${WEIGHT_NAMES[w] || ''}`.trim()]);
    if (Math.max(...avail) < 600) opts.push([700, '700 · Negrita simulada']);
    if (!opts.some(([w]) => w === cur)) opts.push([cur, `${cur} · no disponible en esta fuente`]);
    return opts.sort((a, b) => a[0] - b[0]);
  }

  // ---------- controles genéricos ----------
  // tag 'div' para controles compuestos (un <label> reenviaría los clics al primer input)
  function field(label, control, tag = 'label') {
    if (!control) return null;
    return h(tag, { class: 'field' }, h('span', { class: 'flabel' }, label), control);
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

  // ---------- vista previa: selección y arrastre ----------
  // Capa bajo el puntero, de arriba hacia abajo, saltando bloqueadas y ocultas (estilo Figma).
  function layerAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!el.classList.contains('cl-layer')) continue;
      const l = preset.layers.find((q) => q.id === el.dataset.id);
      if (l && !l.locked && l.visible !== false) return l;
    }
    return null;
  }
  const PX = () => preset.size / PREVIEW; // px de diseño por px de pantalla
  function bgCenter() {
    const fr = frame.getBoundingClientRect();
    const bg = preset.bg;
    return { x: fr.left + fr.width * (0.5 + (bg.offsetX || 0)), y: fr.top + fr.height * (0.5 + (bg.offsetY || 0)) };
  }
  const angleTo = (c, e) => (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI;
  const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  const startRotate = (e) => {
    const c = bgCenter();
    return { mode: 'rotate', c, a0: angleTo(c, e), r0: preset.bg.rotate || 0, sx: e.clientX, sy: e.clientY };
  };

  let drag = null;
  rotHandle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    drag = { ...startRotate(e), moved: true };
    rotHandle.setPointerCapture(e.pointerId);
  });
  rotHandle.addEventListener('pointermove', (e) => onDragMove(e));
  rotHandle.addEventListener('pointerup', () => endDrag());

  frame.addEventListener('pointerdown', (e) => {
    const bg = preset.bg;
    // Con el fondo seleccionado, arrastrar en cualquier punto lo mueve (o lo rota con Shift);
    // un clic sin arrastre selecciona lo que haya debajo.
    if (selectedId === BG && bg.source !== 'none') {
      drag = e.shiftKey ? startRotate(e) : { mode: 'bg', sx: e.clientX, sy: e.clientY, x: bg.offsetX || 0, y: bg.offsetY || 0 };
      drag.click = { x: e.clientX, y: e.clientY };
    } else {
      const l = layerAt(e.clientX, e.clientY);
      selectLayer(l ? l.id : null);
      if (!l) return;
      drag = { mode: 'layer', l, sx: e.clientX, sy: e.clientY, x: l.x, y: l.y, snap: snapContext(l) };
    }
    frame.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  frame.addEventListener('pointermove', (e) => onDragMove(e));
  frame.addEventListener('pointerup', () => endDrag());

  function onDragMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    const bg = preset.bg;
    if (drag.mode === 'layer') {
      let nx = drag.x + dx * PX(), ny = drag.y + dy * PX();
      if (!e.altKey) ({ nx, ny } = snap(drag.snap, nx, ny));
      else hideGuides();
      drag.l.x = Math.round(nx);
      drag.l.y = Math.round(ny);
    } else if (drag.mode === 'bg') {
      bg.offsetX = clamp(+(drag.x + dx / PREVIEW).toFixed(3), -1, 1);
      bg.offsetY = clamp(+(drag.y + dy / PREVIEW).toFixed(3), -1, 1);
    } else if (drag.mode === 'rotate') {
      bg.rotate = Math.round(wrap180(drag.r0 + angleTo(drag.c, e) - drag.a0));
    }
    commit();
  }
  // ---------- snapping: bordes y centro del lienzo, y bordes/centros de las otras capas ----------
  const SNAP_PX = 5; // tolerancia en px de pantalla
  function snapContext(l) {
    const size = preset.size;
    const k = PX();
    const cr = renderer.canvas.getBoundingClientRect();
    const box = (el) => {
      const r = el.getBoundingClientRect();
      const x0 = (r.left - cr.left) * k, y0 = (r.top - cr.top) * k, w = r.width * k, hh = r.height * k;
      return { xs: [x0, x0 + w / 2, x0 + w], ys: [y0, y0 + hh / 2, y0 + hh], w, h: hh };
    };
    const xs = [0, size / 2, size], ys = [0, size / 2, size];
    for (const o of preset.layers) {
      if (o.id === l.id || o.visible === false) continue;
      const el = renderer.nodeFor(o.id);
      if (!el) continue;
      const b = box(el);
      xs.push(...b.xs);
      ys.push(...b.ys);
    }
    const self = renderer.nodeFor(l.id);
    const b = self ? box(self) : { w: 0, h: 0 };
    return { xs, ys, hw: b.w / 2, hh: b.h / 2 };
  }
  // la capa se ancla en su centro: se prueban su borde izq./sup., centro y borde der./inf.
  function snapAxis(pos, half, targets, thr) {
    let best = null;
    for (const off of [-half, 0, half])
      for (const t of targets) {
        const d = Math.abs(pos + off - t);
        if (d <= thr && (!best || d < best.d)) best = { d, pos: t - off, line: t };
      }
    return best;
  }
  function snap(ctx, nx, ny) {
    const thr = SNAP_PX * PX();
    const sx = snapAxis(nx, ctx.hw, ctx.xs, thr);
    const sy = snapAxis(ny, ctx.hh, ctx.ys, thr);
    showSnapLine(snapV, sx && sx.line, 'left');
    showSnapLine(snapH, sy && sy.line, 'top');
    return { nx: sx ? sx.pos : nx, ny: sy ? sy.pos : ny };
  }
  function showSnapLine(el, line, prop) {
    el.hidden = line === null || line === undefined || line === false;
    if (!el.hidden) el.style[prop] = line / PX() + 'px';
  }
  const hideGuides = () => ((snapV.hidden = true), (snapH.hidden = true));

  function endDrag() {
    if (!drag) return;
    hideGuides();
    const d = drag;
    drag = null;
    if (d.moved) return renderProps();
    // clic sin arrastre con el fondo seleccionado: seleccionar lo que haya debajo
    if (d.click) {
      const l = layerAt(d.click.x, d.click.y);
      selectLayer(l ? l.id : null);
    }
  }

  // Rueda = escala del fondo (solo con el fondo seleccionado)
  let wheelT;
  frame.addEventListener('wheel', (e) => {
    if (selectedId !== BG || preset.bg.source === 'none') return;
    e.preventDefault();
    const bg = preset.bg;
    bg.scale = clamp(+((bg.scale || 1) * Math.exp(-e.deltaY * 0.0015)).toFixed(3), 0.1, 4);
    commit();
    clearTimeout(wheelT);
    wheelT = setTimeout(() => renderProps(), 150);
  }, { passive: false });

  addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const d = e.shiftKey ? 10 : 1;
    const moves = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    if (selectedId === BG) {
      if (moves[e.key] && preset.bg.source !== 'none') {
        const bg = preset.bg;
        bg.offsetX = clamp(+((bg.offsetX || 0) + moves[e.key][0] / preset.size).toFixed(3), -1, 1);
        bg.offsetY = clamp(+((bg.offsetY || 0) + moves[e.key][1] / preset.size).toFixed(3), -1, 1);
        commit({ props: true });
        e.preventDefault();
      }
      return;
    }
    const l = selected();
    if (!l) return;
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
    const isBg = selectedId === BG && preset.bg.source !== 'none';
    rotHandle.hidden = !isBg;
    selBox.classList.toggle('bg', isBg);
    if (isBg) {
      // el fondo puede salirse del lienzo: se marca el lienzo completo y el asa de rotación arriba
      selBox.hidden = false;
      selBox.classList.remove('locked');
      Object.assign(selBox.style, { left: '0px', top: '0px', width: PREVIEW + 'px', height: PREVIEW + 'px' });
      return;
    }
    const l = selected();
    const el = l && renderer.nodeFor(l.id);
    if (!el || l.visible === false) return (selBox.hidden = true);
    const fr = frame.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    selBox.hidden = false;
    selBox.classList.toggle('locked', !!l.locked);
    Object.assign(selBox.style, { left: r.left - fr.left - 3 + 'px', top: r.top - fr.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
  }

  // ---------- inicio ----------

  function refreshAll() {
    renderPresetSelect();
    renderPresetBar();
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
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'preset';
const round = (v, step) => {
  const d = String(step).split('.')[1]?.length || 0;
  return Number(v).toFixed(d);
};
