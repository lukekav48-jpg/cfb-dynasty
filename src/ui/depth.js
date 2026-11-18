import { h } from './dom.js';
import { POSITIONS, STARTERS } from '../engine/players.js';
import { autoDepth } from '../engine/league.js';

export function renderDepth(ctx) {
  const s = ctx.state;
  const us = s.coach.teamId;
  let position = 'QB';
  const list = h('ul', { class: 'depth-list' });
  const tabs = h('div', { class: 'row', style: { marginBottom: '10px' } });

  function move(index, delta) {
    const ids = s.teams[us].depth[position];
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    ctx.save();
    draw();
  }

  function draw() {
    tabs.replaceChildren(...POSITIONS.map((p) => h('button', { class: `small ${p === position ? 'primary' : ''}`, onclick: () => { position = p; draw(); } }, p)));
    const ids = s.teams[us].depth[position];
    const starters = STARTERS[position];
    let healthySeen = 0;
    list.replaceChildren(
      ...ids.map((id, i) => {
        const p = s.players[id];
        const injured = p.injury > 0;
        const starter = !injured && healthySeen < starters;
        if (!injured) healthySeen++;
        return h(
          'li',
          { class: `${starter ? 'starter' : ''} ${injured ? 'injured' : ''}` },
          h('span', { class: 'ovr' }, p.overall),
          h('span', { class: 'name' }, `${p.firstName} ${p.lastName}`, h('span', { class: 'muted' }, ` ${p.classYear}`), injured ? h('span', { class: 'pill bad', style: { marginLeft: '6px' } }, `Injured ${p.injury} wk`) : null, starter ? h('span', { class: 'pill good', style: { marginLeft: '6px' } }, 'Starter') : null),
          h('button', { class: 'small', disabled: i === 0, onclick: () => move(i, -1), 'aria-label': 'Move up' }, '▲'),
          h('button', { class: 'small', disabled: i === ids.length - 1, onclick: () => move(i, 1), 'aria-label': 'Move down' }, '▼'),
        );
      }),
    );
  }

  draw();
  return h(
    'div',
    {},
    h('div', { class: 'row' }, h('h1', {}, 'Depth Chart'), h('span', { class: 'spacer' }), h('button', { onclick: () => { autoDepth(s, us); ctx.save(); draw(); } }, 'Auto-fill best')),
    h('p', { class: 'muted' }, 'Players at the top start. Injured players are skipped automatically.'),
    tabs,
    h('div', { class: 'card' }, list),
  );
}
