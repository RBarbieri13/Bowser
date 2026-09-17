const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const allowed = (value, choices, fallback) => choices.includes(value) ? value : fallback;
export function tableColumnWidth(column, prefs = {}) {
  const min = Number.isFinite(column.minWidth) ? column.minWidth : 44;
  const max = Number.isFinite(column.maxWidth) ? column.maxWidth : 700;
  const supplied = own(prefs.widths, column.key) ? prefs.widths[column.key] : undefined;
  const value = Number.isFinite(supplied) ? supplied : Number.isFinite(column.width) ? column.width : 100;
  return Math.round(Math.max(min, Math.min(max, value)));
}
export function validateTablePreferences(input, columns, defaults = {}, includeViews = true) {
  const supplied = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const source = { ...defaults, ...supplied };
  const keys = columns.map(column => column.key);
  const valid = new Set(keys);
  const required = new Set(columns.filter(column => column.required).map(column => column.key));
  const order = Array.isArray(source.order) ? [...new Set(source.order.filter(key => valid.has(key)))] : [];
  const fixed = new Set(columns.filter(column => column.orderable === false).map(column => column.key));
  const ordered = [...order, ...keys.filter(key => !order.includes(key))].filter(key => !fixed.has(key));
  const alignedOrder = columns.map(column => fixed.has(column.key) ? column.key : ordered.shift());
  const hidden = Array.isArray(source.hidden) ? [...new Set(source.hidden.filter(key => valid.has(key) && !required.has(key)))] : [];
  const widths = Object.fromEntries(columns.map(column => [column.key, tableColumnWidth(column, source)]));
  const sorts = Array.isArray(source.sorts) ? source.sorts.filter((sort, index, all) => sort && valid.has(sort.key) && typeof sort.desc === 'boolean' && all.findIndex(other => other?.key === sort.key) === index).slice(0, columns.length).map(({key,desc}) => ({key,desc})) : [];
  const result = {
    hidden, order: alignedOrder, widths,
    density: allowed(source.density, ['compact', 'comfortable'], 'compact'),
    numberFormat: allowed(source.numberFormat, ['source', 'integer', 'decimal'], 'source'),
    heatmap: typeof source.heatmap === 'boolean' ? source.heatmap : true,
    autoFit: typeof source.autoFit === 'boolean' ? source.autoFit : false,
    sorts,
  };
  if (includeViews) result.savedViews = Array.isArray(source.savedViews) ? source.savedViews.filter(view => view && typeof view.name === 'string' && view.name.trim() && view.value && typeof view.value === 'object').slice(0, 12).map(view => ({name: view.name.trim().slice(0, 60), value: validateTablePreferences(view.value, columns, {}, false)})) : [];
  return result;
}
export function visibleTableColumns(columns, prefs = {}) {
  const valid = validateTablePreferences(prefs, columns);
  const lookup = new Map(columns.map(column => [column.key, column]));
  return valid.order.filter(key => !valid.hidden.includes(key)).map(key => lookup.get(key));
}
export function toggleTableSort(prefs, key, shift = false) {
  const existing = (prefs.sorts || []).find(sort => sort.key === key);
  const next = { key, desc: existing ? !existing.desc : false };
  return {...prefs, sorts: shift ? existing ? prefs.sorts.map(sort => sort.key === key ? next : sort) : [...(prefs.sorts || []), next] : [next]};
}
export function sortTableRows(rows, sorts = [], getValue = (row, key) => row[key]) {
  const missing = value => value == null || (typeof value === 'number' && !Number.isFinite(value));
  return rows.map((row, index) => ({row, index})).sort((a, b) => {
    for (const {key, desc} of sorts) {
      const x = getValue(a.row, key), y = getValue(b.row, key);
      if (missing(x) && missing(y)) continue;
      if (missing(x)) return 1;
      if (missing(y)) return -1;
      const comparison = typeof x === 'number' && typeof y === 'number' ? x-y : String(x).localeCompare(String(y), undefined, {numeric: true, sensitivity: 'base'});
      if (comparison) return desc ? -comparison : comparison;
    }
    return a.index-b.index;
  }).map(({row}) => row);
}
export function formatTableValue(value, column = {}, prefs = {}) {
  if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return '—';
  if (typeof value !== 'number') return String(value);
  const digits = prefs.numberFormat === 'integer' ? 0 : prefs.numberFormat === 'decimal' ? 1 : Number.isInteger(column.decimals) ? column.decimals : column.type === 'percent' ? 1 : Number.isInteger(value) ? 0 : 2;
  const number = new Intl.NumberFormat('en-US', {maximumFractionDigits: digits, minimumFractionDigits: prefs.numberFormat === 'decimal' || (prefs.numberFormat !== 'integer' && column.type === 'percent') ? digits : 0}).format(value);
  return column.type === 'currency' ? `$${number}` : column.type === 'percent' ? `${number}%` : number;
}
