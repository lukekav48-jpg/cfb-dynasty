import { h, modal } from './dom.js';
import { serialize, deserialize, clearStorage } from '../save.js';

export function renderSettings(ctx) {
  const s = ctx.state;
  const msg = h('p', { class: 'muted' });

  function exportSave() {
    const blob = new Blob([serialize(s)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `cfb-dynasty-${s.teams[s.coach.teamId].short}-${s.year}-wk${s.week}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    msg.textContent = 'Save exported.';
  }

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, onchange: importSave });
  async function importSave() {
    const file = fileInput.files[0];
    if (!file) return;
    const r = deserialize(await file.text());
    if (!r.ok) {
      msg.textContent = `Import failed: ${r.error}`;
      return;
    }
    ctx.setState(r.state);
    ctx.go('home');
  }

  function confirmNew() {
    const close = modal(
      h(
        'div',
        {},
        h('h2', {}, 'Start a new franchise?'),
        h('p', {}, 'This deletes your current franchise from this browser. Export a backup first if you want to keep it. This cannot be undone.'),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { close(); if (ctx.storage) clearStorage(ctx.storage); ctx.state = null; ctx.go('home'); } }, 'Delete and start over'), h('button', { onclick: () => close() }, 'Cancel')),
      ),
    );
  }

  return h(
    'div',
    {},
    h('h1', {}, 'Settings'),
    h(
      'div',
      { class: 'grid' },
      h('div', { class: 'card' }, h('h2', {}, 'Backups'), h('p', { class: 'muted' }, 'Your franchise saves automatically in this browser. Export a file to back it up or move it to another device.'), h('div', { class: 'row' }, h('button', { onclick: exportSave }, 'Export save'), h('button', { onclick: () => fileInput.click() }, 'Import save'), fileInput), msg),
      h('div', { class: 'card' }, h('h2', {}, 'New franchise'), h('p', { class: 'muted' }, `Coach ${s.coach.name}, ${s.teams[s.coach.teamId].name}, seed ${s.seed}.`), h('button', { onclick: confirmNew }, 'Start a new franchise')),
    ),
  );
}
