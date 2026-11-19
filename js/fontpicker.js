// Selector de fuentes propio (combobox).
// - Al abrir muestra el catálogo completo; filtra solo mientras se escribe.
// - Cada opción se dibuja con su propia fuente, cargando solo los glifos de su nombre (&text=) cuando entra en pantalla.
// - Acepta cualquier nombre escrito a mano (Enter o "Usar …").
// - Vista en vivo: clic en una opción o flechas la aplican sin cerrar, para comparar.
//   Enter o clic fuera la confirman; Esc vuelve a la fuente que había al abrir.
import { FONT_CATALOG } from './fonts.js';
import { isFontLoaded } from './render.js';

const CATS = [['', 'Todas'], ['s', 'Sans'], ['r', 'Serif'], ['d', 'Display'], ['h', 'Manuscrita'], ['m', 'Mono']];
const CAT_LABEL = Object.fromEntries(CATS);
const MAX_ROWS = 400; // con filtro activo se muestran todas las coincidencias; sin filtro se pagina al hacer scroll
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const previewed = new Set();
function loadPreview(family) {
  // si la fuente completa ya está cargada no hace falta (y un subconjunto posterior la taparía)
  if (previewed.has(family) || isFontLoaded(family)) return;
  previewed.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&text=${encodeURIComponent(family)}&display=swap`;
  document.head.appendChild(link);
}

export function createFontPicker({ value, onChange }) {
  let current = value || '';
  let atOpen = current; // fuente al abrir, para Esc
  let typedSincePreview = false;
  let query = '';
  let cat = '';
  let open = false;
  let items = [];
  let active = -1;
  let shown = 0;

  const input = document.createElement('input');
  Object.assign(input, { type: 'text', value: current, spellcheck: false, autocomplete: 'off' });
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');
  const toggle = document.createElement('button');
  Object.assign(toggle, { type: 'button', className: 'fcombo-toggle', tabIndex: -1, textContent: '▾', title: 'Ver todas las fuentes' });
  const panel = document.createElement('div');
  panel.className = 'fcombo-panel';
  panel.hidden = true;
  const chips = document.createElement('div');
  chips.className = 'fcombo-chips';
  const list = document.createElement('div');
  list.className = 'fcombo-list';
  list.setAttribute('role', 'listbox');
  const foot = document.createElement('div');
  foot.className = 'fcombo-foot';
  panel.append(chips, list, foot);
  const root = document.createElement('div');
  root.className = 'fcombo';
  const row = document.createElement('div');
  row.className = 'fcombo-row';
  row.append(input, toggle);
  root.append(row, panel);

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (loadPreview(e.target.dataset.family), io.unobserve(e.target))),
    { root: list, rootMargin: '120px 0px' },
  );

  function renderChips() {
    chips.replaceChildren(...CATS.map(([k, label]) => {
      const b = document.createElement('button');
      Object.assign(b, { type: 'button', className: 'fchip' + (k === cat ? ' on' : ''), textContent: label, tabIndex: -1 });
      b.addEventListener('mousedown', (e) => e.preventDefault()); // no robar el foco del input
      b.addEventListener('click', () => { cat = k; renderChips(); filter(); });
      return b;
    }));
  }

  function filter() {
    const q = norm(query);
    let list_ = cat ? FONT_CATALOG.filter((f) => f[1] === cat) : FONT_CATALOG;
    if (q) {
      const starts = [], has = [];
      for (const f of list_) {
        const n = norm(f[0]);
        if (n.startsWith(q)) starts.push(f);
        else if (n.includes(q)) has.push(f);
      }
      list_ = starts.concat(has);
    }
    items = list_;
    const exact = q && FONT_CATALOG.some((f) => norm(f[0]) === q);
    // opción para usar un nombre escrito a mano que no está en el catálogo
    const custom = q && !exact ? query.trim() : null;
    list.replaceChildren();
    list.scrollTop = 0;
    // "Usar …" siempre visible arriba, pero si hay coincidencias Enter elige la primera del catálogo
    if (custom) list.append(option(custom, null, true));
    shown = 0;
    appendRows();
    active = custom && items.length ? 1 : rows().length ? 0 : -1;
    if (!q) {
      const i = items.findIndex((f) => f[0] === current);
      if (i >= 0) {
        while (shown <= i) appendRows();
        active = i;
      }
    }
    highlight(!q);
    foot.textContent = q ? `${items.length} coincidencias` : `${items.length} fuentes · escribe para filtrar o usa cualquier nombre de Google Fonts`;
  }

  function appendRows() {
    const next = items.slice(shown, shown + MAX_ROWS);
    list.append(...next.map((f) => option(f[0], f[1], false)));
    shown += next.length;
  }
  list.addEventListener('scroll', () => {
    if (shown < items.length && list.scrollTop + list.clientHeight > list.scrollHeight - 200) appendRows();
  });

  function option(name, c, custom) {
    const o = document.createElement('div');
    o.className = 'fopt' + (name === current ? ' cur' : '') + (custom ? ' custom' : '');
    o.setAttribute('role', 'option');
    o.dataset.family = name;
    const n = document.createElement('span');
    n.className = 'fopt-name';
    n.textContent = custom ? `Usar “${name}”` : name;
    if (!custom) {
      n.style.fontFamily = `"${name}", system-ui, sans-serif`;
      io.observe(o);
    }
    const k = document.createElement('span');
    k.className = 'fopt-cat';
    k.textContent = custom ? 'Google Fonts o instalada en tu PC' : CAT_LABEL[c] || '';
    o.append(n, k);
    o.addEventListener('mousedown', (e) => e.preventDefault());
    o.addEventListener('click', () => {
      active = [...rows()].indexOf(o);
      highlight(false);
      preview(name);
    });
    return o;
  }

  const rows = () => list.querySelectorAll('.fopt');
  function highlight(center) {
    rows().forEach((r, i) => r.classList.toggle('active', i === active));
    const el = rows()[active];
    if (el) el.scrollIntoView({ block: center ? 'center' : 'nearest' });
  }

  function openPanel() {
    if (open) return;
    open = true;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    query = ''; // al abrir siempre se ve el catálogo completo
    atOpen = current;
    typedSincePreview = false;
    renderChips();
    filter();
    input.select();
  }
  function closePanel() {
    if (!open) return;
    open = false;
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }
  const canonical = (name) => {
    const v = (name || '').trim();
    const hit = FONT_CATALOG.find((f) => norm(f[0]) === norm(v));
    return hit ? hit[0] : v; // 'bebas neue' → 'Bebas Neue'
  };
  // Aplica una fuente sin cerrar el panel (vista en vivo en el lienzo).
  function preview(name) {
    const v = canonical(name);
    if (!v) return;
    typedSincePreview = false;
    if (!query) input.value = v; // si está filtrando, no borrar lo que escribió
    rows().forEach((r) => r.classList.toggle('cur', r.dataset.family === v));
    if (v === current) return;
    current = v;
    onChange(v);
  }
  function choose(name) {
    const v = canonical(name);
    if (!v) return revert();
    preview(v);
    input.value = v;
    closePanel();
  }
  // cerrar dejando la fuente que se ve ahora
  function accept() {
    input.value = current;
    closePanel();
  }
  // Esc: volver a la fuente que había al abrir
  function revert() {
    if (current !== atOpen) (current = atOpen), onChange(atOpen);
    input.value = current;
    closePanel();
  }

  input.addEventListener('focus', openPanel);
  input.addEventListener('click', openPanel);
  input.addEventListener('input', () => {
    if (!open) openPanel();
    query = input.value;
    typedSincePreview = true;
    filter();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open) openPanel();
      const n = rows().length;
      if (!n) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      if (active >= n - 5 && shown < items.length) appendRows();
      highlight(false);
      preview(rows()[active].dataset.family);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const el = rows()[active];
      choose(open && el ? el.dataset.family : input.value);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      revert();
      e.preventDefault();
    }
  });
  input.addEventListener('blur', () => {
    if (!open) return;
    // clic fuera = confirmar. Si escribió un nombre y no eligió nada después, se usa lo escrito.
    const v = input.value.trim();
    if (typedSincePreview && v) choose(v);
    else accept();
  });
  toggle.addEventListener('mousedown', (e) => e.preventDefault());
  toggle.addEventListener('click', () => (open ? accept() : (input.focus(), openPanel())));

  return root;
}
