import { h } from './dom.js';
import { OFFENSE_STYLES, DEFENSE_STYLES, TEMPOS } from '../engine/sim.js';

const HELP = {
  Balanced: 'An even mix of plays.',
  'Run Heavy': 'Runs more often, with a small bonus on runs.',
  'Pass Heavy': 'Throws more often, with a small bonus on passes.',
  'Air Raid': 'Throws a lot, including deep, with a bonus on quick and deep passes.',
  'Stop the Run': 'More run blitzes, with a bonus against runs.',
  'Aggressive Blitz': 'Blitzes far more often: more sacks, but open to screens.',
  "Bend Don't Break": 'Plays coverage and gives up short gains, with a bonus against deep passes.',
  Normal: 'Standard pace.',
  'Hurry-Up': 'About 15–20% more plays, which helps the stronger team. Slightly more fumbles.',
};

export function renderPlan(ctx) {
  const s = ctx.state;
  const plan = s.teams[s.coach.teamId].plan;

  function group(title, key, options) {
    const grid = h('div', { class: 'choice-grid' });
    function draw() {
      grid.replaceChildren(...options.map((o) => h('button', { class: plan[key] === o ? 'selected' : '', onclick: () => { plan[key] = o; ctx.save(); draw(); } }, h('strong', {}, o), h('div', { class: 'muted', style: { fontSize: '13px' } }, HELP[o] || ''))));
    }
    draw();
    return h('div', { class: 'card' }, h('h2', {}, title), grid);
  }

  return h(
    'div',
    {},
    h('h1', {}, 'Game Plan'),
    h('p', { class: 'muted' }, 'Your plan shapes the plays called for you and gives a small boost to the plays it favors. Matchups between players still matter most.'),
    h('div', { class: 'grid' }, group('Offense', 'offense', OFFENSE_STYLES), group('Defense', 'defense', DEFENSE_STYLES), group('Tempo', 'tempo', TEMPOS)),
  );
}
