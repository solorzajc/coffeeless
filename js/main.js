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
  const r = createRenderer(root);
  let state = loadState();
  let rev = state.rev;
  const fit = () => r.setScale(window.nzxt?.v1?.width || Math.min(innerWidth, innerHeight) || 240);
  const apply = () => {
    r.setPreset(activePreset(state));
    fit();
  };
  apply();
  addEventListener('resize', fit);
  onData((d) => r.setData(d));
  // Cambios desde el editor: evento storage + sondeo de respaldo
  const reload = () => {
    const nr = readRev();
    if (nr !== rev) {
      state = loadState();
      rev = state.rev;
      apply();
    }
  };
  addEventListener('storage', (e) => e.key === STORAGE_KEY && reload());
  setInterval(reload, 1000);
}
