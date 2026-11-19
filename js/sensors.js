// Métricas disponibles y formatos de visualización.
// CAM entrega: temperaturas en °C, carga 0..1, frecuencia en MHz, potencia en W, RAM en MiB.

const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : undefined);

export const METRICS = [
  { id: 'cpu_temp', label: 'Temp. CPU', group: 'CPU', kind: 'temp', get: (d) => first(d.cpus)?.temperature },
  { id: 'cpu_load', label: 'Uso de CPU', group: 'CPU', kind: 'percent', get: (d) => ratio(first(d.cpus)?.load) },
  { id: 'cpu_freq', label: 'Frecuencia CPU', group: 'CPU', kind: 'freq', get: (d) => first(d.cpus)?.frequency },
  { id: 'cpu_power', label: 'Consumo CPU', group: 'CPU', kind: 'power', get: (d) => first(d.cpus)?.power },
  { id: 'gpu_temp', label: 'Temp. GPU', group: 'GPU', kind: 'temp', get: (d) => first(d.gpus)?.temperature },
  { id: 'gpu_load', label: 'Uso de GPU', group: 'GPU', kind: 'percent', get: (d) => ratio(first(d.gpus)?.load) },
  { id: 'gpu_freq', label: 'Frecuencia GPU', group: 'GPU', kind: 'freq', get: (d) => first(d.gpus)?.frequency },
  { id: 'gpu_power', label: 'Consumo GPU', group: 'GPU', kind: 'power', get: (d) => first(d.gpus)?.power },
  { id: 'liquid_temp', label: 'Temp. líquido', group: 'Kraken', kind: 'temp', get: (d) => d.kraken?.liquidTemperature },
  { id: 'ram_used', label: 'Uso de memoria', group: 'RAM', kind: 'ram', get: (d) => ram(d) },
  { id: 'ram_free', label: 'Memoria libre', group: 'RAM', kind: 'ram', get: (d) => ramFree(d) },
  { id: 'ram_total', label: 'Memoria total', group: 'RAM', kind: 'ramsize', get: (d) => d.ram?.totalSize },
];

// Capa "Reloj": hora o fecha local, con los formatos de FORMATS.time / FORMATS.date.
export const CLOCKS = [
  { id: 'time', label: 'Hora' },
  { id: 'date', label: 'Fecha' },
];
export const clockById = (id) => CLOCKS.find((c) => c.id === id) || CLOCKS[0];

function ratio(v) {
  return typeof v === 'number' ? v * 100 : undefined;
}
function ram(d) {
  const used = d.ram?.inUse, total = d.ram?.totalSize;
  if (typeof used !== 'number') return undefined;
  return { mb: used, pct: total ? (used / total) * 100 : undefined };
}
function ramFree(d) {
  const used = d.ram?.inUse, total = d.ram?.totalSize;
  if (typeof used !== 'number' || typeof total !== 'number') return undefined;
  return { mb: total - used, pct: ((total - used) / total) * 100 };
}

export const metricById = (id) => METRICS.find((m) => m.id === id) || METRICS[0];

const fx = (v, d) => v.toFixed(d);
const gb = (mb) => mb / 1024;

// Cada formato: id, etiqueta de ejemplo y función (valor, opciones) -> texto.
export const FORMATS = {
  temp: [
    { id: 'd0u', ex: '50°C', f: (v, o) => `${fx(t(v, o), 0)}°${o.unit}` },
    { id: 'd1u', ex: '50.0°C', f: (v, o) => `${fx(t(v, o), 1)}°${o.unit}` },
    { id: 'd0deg', ex: '50°', f: (v, o) => `${fx(t(v, o), 0)}°` },
    { id: 'd1deg', ex: '50.0°', f: (v, o) => `${fx(t(v, o), 1)}°` },
    { id: 'd0', ex: '50', f: (v, o) => fx(t(v, o), 0) },
    { id: 'd1', ex: '50.0', f: (v, o) => fx(t(v, o), 1) },
  ],
  percent: pctFormats((v) => v),
  ram: [
    { id: 'pct0', ex: '37%', f: (v) => pct(v.pct, 0, true) },
    { id: 'pct1', ex: '37.0%', f: (v) => pct(v.pct, 1, true) },
    { id: 'pfx0', ex: '%37', f: (v) => '%' + pct(v.pct, 0) },
    { id: 'pfx1', ex: '%37.0', f: (v) => '%' + pct(v.pct, 1) },
    { id: 'num0', ex: '37', f: (v) => pct(v.pct, 0) },
    { id: 'num1', ex: '37.0', f: (v) => pct(v.pct, 1) },
    { id: 'mb', ex: '13846', f: (v) => fx(v.mb, 0) },
    { id: 'mbu', ex: '13846 MB', f: (v) => `${fx(v.mb, 0)} MB` },
    { id: 'gb0', ex: '13 GB', f: (v) => `${fx(gb(v.mb), 0)} GB` },
    { id: 'gb1', ex: '13.5 GB', f: (v) => `${fx(gb(v.mb), 1)} GB` },
    { id: 'gb1n', ex: '13.5', f: (v) => fx(gb(v.mb), 1) },
  ],
  ramsize: [
    { id: 'gb0', ex: '16 GB', f: (v) => `${fx(gb(v), 0)} GB` },
    { id: 'gb1', ex: '15.9 GB', f: (v) => `${fx(gb(v), 1)} GB` },
    { id: 'mbu', ex: '16384 MB', f: (v) => `${fx(v, 0)} MB` },
    { id: 'mb', ex: '16384', f: (v) => fx(v, 0) },
  ],
  freq: [
    { id: 'mhzu', ex: '4650 MHz', f: (v) => `${fx(v, 0)} MHz` },
    { id: 'mhz', ex: '4650', f: (v) => fx(v, 0) },
    { id: 'ghz2', ex: '4.65 GHz', f: (v) => `${fx(v / 1000, 2)} GHz` },
    { id: 'ghz1', ex: '4.7 GHz', f: (v) => `${fx(v / 1000, 1)} GHz` },
    { id: 'ghz1n', ex: '4.7', f: (v) => fx(v / 1000, 1) },
  ],
  power: [
    { id: 'wu', ex: '120 W', f: (v) => `${fx(v, 0)} W` },
    { id: 'wu0', ex: '120W', f: (v) => `${fx(v, 0)}W` },
    { id: 'w', ex: '120', f: (v) => fx(v, 0) },
  ],
  time: [
    { id: 'HHmm', ex: '17:05', f: (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}` },
    { id: 'HHmmss', ex: '17:05:09', f: (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` },
    { id: 'hmma', ex: '5:05 PM', f: (d) => `${d.getHours() % 12 || 12}:${p2(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}` },
    { id: 'hmm', ex: '5:05', f: (d) => `${d.getHours() % 12 || 12}:${p2(d.getMinutes())}` },
  ],
  date: [
    { id: 'ddmm', ex: '19/11', f: (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}` },
    { id: 'ddmmyyyy', ex: '19/11/2026', f: (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` },
    { id: 'dmon', ex: '19 nov', f: (d) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '') },
    { id: 'wday', ex: 'jueves', f: (d) => d.toLocaleDateString('es-MX', { weekday: 'long' }) },
    { id: 'wdaydmon', ex: 'jue 19 nov', f: (d) => d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '') },
  ],
};

function pctFormats(map) {
  return [
    { id: 'pct0', ex: '37%', f: (v) => pct(map(v), 0, true) },
    { id: 'pct1', ex: '37.0%', f: (v) => pct(map(v), 1, true) },
    { id: 'pfx0', ex: '%37', f: (v) => '%' + pct(map(v), 0) },
    { id: 'pfx1', ex: '%37.0', f: (v) => '%' + pct(map(v), 1) },
    { id: 'num0', ex: '37', f: (v) => pct(map(v), 0) },
    { id: 'num1', ex: '37.0', f: (v) => pct(map(v), 1) },
  ];
}
function pct(v, d, sign) {
  if (typeof v !== 'number') return '--';
  return fx(v, d) + (sign ? '%' : '');
}
function t(v, o) {
  return o.unit === 'F' ? (v * 9) / 5 + 32 : v;
}
function p2(n) {
  return String(n).padStart(2, '0');
}

export function formatsFor(kind) {
  return FORMATS[kind] || [];
}

export function formatMetric(layer, data) {
  const m = metricById(layer.metric);
  const list = formatsFor(m.kind);
  const fmt = list.find((f) => f.id === layer.format) || list[0];
  let v;
  try {
    v = m.get(data || {});
  } catch {
    v = undefined;
  }
  const empty = v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v));
  const body = empty ? '--' : fmt.f(v, { unit: layer.unit || 'C' });
  return `${layer.prefix || ''}${body}${layer.suffix || ''}`;
}

export function formatClock(layer, now = new Date()) {
  const list = formatsFor(clockById(layer.clock).id);
  const fmt = list.find((f) => f.id === layer.format) || list[0];
  return `${layer.prefix || ''}${fmt.f(now)}${layer.suffix || ''}`;
}

// Datos de demostración para cuando no estamos dentro de CAM.
export function demoData(tick = 0) {
  const w = (base, amp, speed) => base + Math.sin(tick / speed) * amp;
  return {
    cpus: [{ temperature: w(53, 6, 7), load: w(0.24, 0.12, 5) / 1, frequency: w(4400, 250, 4), power: w(68, 20, 6) }],
    gpus: [{ temperature: w(48, 5, 9), load: w(0.18, 0.1, 6), frequency: w(2100, 200, 5), power: w(95, 30, 8) }],
    ram: { totalSize: 16384, inUse: w(13846, 400, 10), modules: [] },
    kraken: { liquidTemperature: w(31.5, 1, 15) },
  };
}
