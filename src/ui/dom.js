// h('div', { class: 'card', onclick: fn }, child, 'text', [more]) builds DOM elements.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  appendAll(el, children);
  return el;
}

function appendAll(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function stars(n) {
  return h('span', { class: 'stars', title: `${n} star${n === 1 ? '' : 's'}` }, '★'.repeat(n) + '☆'.repeat(5 - n));
}

export function teamLabel(state, teamId, { rank = true } = {}) {
  const t = state.teams[teamId];
  const i = state.rankings.indexOf(teamId);
  const r = rank && i >= 0 && i < 25 ? `#${i + 1} ` : '';
  return `${r}${t.name}`;
}

export function recordText(r) {
  return `${r.w}-${r.l}`;
}

// Shows a modal dialog built from `content`. Returns a close() function.
export function modal(content) {
  const back = h('div', { class: 'modal-back', onclick: (e) => e.target === back && close() }, h('div', { class: 'modal' }, content));
  function close() {
    back.remove();
  }
  document.body.append(back);
  return close;
}

// Relative luminance of a #RRGGBB color, 0 (black) to 1 (white).
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Team accent that stays visible on the dark background: the primary color,
// or the secondary when the primary is too dark (and the secondary isn't white or black).
export function readableAccent(primary, secondary) {
  if (luminance(primary) >= 0.06) return primary;
  const l2 = luminance(secondary);
  if (l2 >= 0.06 && l2 <= 0.8) return secondary;
  return '#8aa4c8';
}
