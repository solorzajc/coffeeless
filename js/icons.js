// Iconos SVG inline propios: todos en viewBox 24×24, trazo de 2 px, mismo tamaño y centrado.
const PATHS = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:
    '<path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.8M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.7-1.5"/>',
  up: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  sensor: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  text: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  shape: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
  rect: '<rect x="3" y="6" width="18" height="12" rx="2"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  line: '<path d="M4 12h16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  magnet: '<path d="M5 4.5h5V12a2 2 0 0 0 4 0V4.5h5V12a7 7 0 0 1-14 0z"/><path d="M5 8.5h5M14 8.5h5"/>',
  guide: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="6.5" stroke-dasharray="2.6 2.4"/>',
  diag: '<circle cx="10.5" cy="10.5" r="7"/><path d="M15.5 15.5L21 21"/><path d="M6.5 10.5h1.5l1.2-2.5 2 5 1.3-2.5h1.5"/>',
  layers: '<path d="M12 4.5l9 5-9 5-9-5z"/><path d="M3 14.5l9 5 9-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6"/><path d="M12 17h.01"/>',
};

export function icon(name) {
  const span = document.createElement('span');
  span.className = 'svgi';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return span;
}
