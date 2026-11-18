import { h, stars } from './dom.js';
import { TEAMS, CONFERENCES } from '../data/teams.js';
import { createLeague } from '../engine/league.js';
import { deserialize } from '../save.js';

export function renderNewFranchise(ctx) {
  let teamId = null;
  const nameInput = h('input', { type: 'text', placeholder: 'Coach name', value: 'Coach', maxlength: '40', 'aria-label': 'Coach name' });
  const seedInput = h('input', { type: 'text', placeholder: 'Random', 'aria-label': 'League seed (optional)' });
  const start = h('button', { class: 'primary', disabled: true, onclick: begin }, 'Start franchise');
  const error = h('p', { class: 'muted' });

  const buttons = [];
  const groups = CONFERENCES.map((conf) =>
    h(
      'div',
      {},
      h('h3', { style: { margin: '14px 0 6px' } }, conf),
      h(
        'div',
        { class: 'team-pick' },
        TEAMS.filter((t) => t.conference === conf)
          .sort((a, b) => b.prestige - a.prestige || a.name.localeCompare(b.name))
          .map((t) => {
            const b = h('button', { onclick: () => select(t.id, b) }, h('span', {}, t.name), stars(t.prestige));
            buttons.push(b);
            return b;
          }),
      ),
    ),
  );

  function select(id, button) {
    teamId = id;
    buttons.forEach((b) => b.classList.remove('selected'));
    button.classList.add('selected');
    start.disabled = false;
  }

  function begin() {
    const seed = seedInput.value.trim() || String(Date.now());
    const coachName = nameInput.value.trim() || 'Coach';
    ctx.banner = null;
    ctx.setState(createLeague({ seed, coachName, teamId }));
    ctx.go('home');
  }

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, onchange: importFile });
  async function importFile() {
    const file = fileInput.files[0];
    if (!file) return;
    const r = deserialize(await file.text());
    if (!r.ok) {
      error.textContent = `That file couldn't be imported: ${r.error}`;
      return;
    }
    ctx.banner = null;
    ctx.setState(r.state);
    ctx.go('home');
  }

  return h(
    'main',
    { class: 'newfranchise' },
    ctx.banner ? h('div', { class: `banner ${ctx.banner.kind || ''}` }, ctx.banner.text) : null,
    h('h1', {}, 'CFB Dynasty'),
    h('p', { class: 'muted' }, 'Take over a college football program. Set your depth chart and game plan, coach the big moments, and chase a national title.'),
    h(
      'div',
      { class: 'card' },
      h('h2', {}, '1. Your coach'),
      nameInput,
      h('h2', { style: { marginTop: '16px' } }, '2. Pick a school'),
      h('p', { class: 'muted' }, 'Stars show program prestige. Higher prestige means a stronger roster and higher expectations.'),
      groups,
      h('h2', { style: { marginTop: '16px' } }, '3. League seed (optional)'),
      h('p', { class: 'muted' }, 'The same seed and school always build the same league.'),
      seedInput,
      h('div', { class: 'row', style: { marginTop: '16px' } }, start, h('span', { class: 'spacer' }), h('button', { onclick: () => fileInput.click() }, 'Import a save'), fileInput),
      error,
    ),
  );
}
