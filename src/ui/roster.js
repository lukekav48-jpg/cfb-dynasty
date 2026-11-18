import { h, modal } from './dom.js';
import { POSITIONS } from '../engine/players.js';

const COLUMNS = [
  ['position', 'Pos'],
  ['name', 'Name'],
  ['classYear', 'Class'],
  ['overall', 'OVR'],
  ['potential', 'POT'],
  ['injury', 'Injury'],
  ['morale', 'Morale'],
];

export function renderRoster(ctx) {
  const s = ctx.state;
  const team = s.teams[s.coach.teamId];
  let sortKey = 'position';
  let desc = false;
  let filter = 'ALL';
  const wrap = h('div', { class: 'table-wrap' });

  const posOrder = (p) => POSITIONS.indexOf(p.position) * 1000 + (99 - p.overall);
  function value(p, key) {
    if (key === 'name') return `${p.lastName} ${p.firstName}`;
    if (key === 'position') return posOrder(p);
    if (key === 'classYear') return ['FR', 'SO', 'JR', 'SR'].indexOf(p.classYear);
    return p[key];
  }

  function draw() {
    const players = team.roster
      .map((id) => s.players[id])
      .filter((p) => filter === 'ALL' || p.position === filter)
      .sort((a, b) => {
        const va = value(a, sortKey);
        const vb = value(b, sortKey);
        const c = va < vb ? -1 : va > vb ? 1 : 0;
        return desc ? -c : c;
      });
    wrap.replaceChildren(
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, COLUMNS.map(([key, label]) => h('th', { class: `sortable ${['overall', 'potential', 'morale'].includes(key) ? 'num' : ''}`, onclick: () => sortBy(key) }, label + (sortKey === key ? (desc ? ' ▼' : ' ▲') : ''))))),
        h(
          'tbody',
          {},
          players.map((p) =>
            h(
              'tr',
              { class: 'clickable', onclick: () => showPlayer(p) },
              h('td', {}, p.position),
              h('td', {}, `${p.firstName} ${p.lastName}`),
              h('td', {}, p.classYear + (p.redshirted ? ' (RS)' : '')),
              h('td', { class: 'num' }, p.overall),
              h('td', { class: 'num' }, p.potential),
              h('td', {}, p.injury > 0 ? h('span', { class: 'pill bad' }, `Out ${p.injury} wk`) : h('span', { class: 'pill good' }, 'Healthy')),
              h('td', { class: 'num' }, p.morale),
            ),
          ),
        ),
      ),
    );
  }

  function sortBy(key) {
    if (sortKey === key) desc = !desc;
    else {
      sortKey = key;
      desc = ['overall', 'potential', 'morale', 'injury'].includes(key);
    }
    draw();
  }

  const select = h('select', { 'aria-label': 'Filter by position', onchange: (e) => { filter = e.target.value; draw(); } }, h('option', { value: 'ALL' }, 'All positions'), POSITIONS.map((p) => h('option', { value: p }, p)));
  draw();
  return h('div', {}, h('h1', {}, `Roster (${team.roster.length}/85)`), h('div', { class: 'row', style: { marginBottom: '10px' } }, select, h('span', { class: 'muted' }, 'Click a column to sort, or a player for details.')), h('div', { class: 'card' }, wrap));
}

export function showPlayer(p) {
  const statLines = Object.entries(p.stats || {}).filter(([, v]) => v);
  modal(
    h(
      'div',
      {},
      h('h2', {}, `${p.firstName} ${p.lastName}`),
      h('p', { class: 'muted' }, `${p.position} · ${p.classYear}${p.redshirted ? ' (redshirt)' : ''} · from ${p.homeState}`),
      h('p', {}, `Overall ${p.overall} · Potential ${p.potential} · Morale ${p.morale}`),
      h('h3', {}, 'Ratings'),
      h('table', {}, h('tbody', {}, Object.entries(p.attrs).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, v))))),
      h('h3', { style: { marginTop: '10px' } }, 'Season stats'),
      statLines.length ? h('table', {}, h('tbody', {}, statLines.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, v))))) : h('p', { class: 'muted' }, 'No stats yet.'),
    ),
  );
}
