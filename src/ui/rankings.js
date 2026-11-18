import { h } from './dom.js';
import { conferenceStandings, CHAMPIONSHIP_CONFERENCES } from '../engine/season.js';
import { teamOverall } from '../engine/league.js';

export function renderRankings(ctx) {
  const s = ctx.state;
  const us = s.coach.teamId;
  const top = s.rankings.slice(0, 25);
  return h(
    'div',
    {},
    h('h1', {}, 'Rankings'),
    h(
      'div',
      { class: 'grid' },
      h(
        'div',
        { class: 'card' },
        h('h3', {}, 'Top 25'),
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Team'), h('th', {}, 'Record'), h('th', { class: 'num' }, 'OVR'))),
          h('tbody', {}, top.map((id, i) => h('tr', { class: id === us ? 'me' : '' }, h('td', {}, i + 1), h('td', {}, s.teams[id].name), h('td', {}, `${s.teams[id].record.w}-${s.teams[id].record.l}`), h('td', { class: 'num' }, teamOverall(s, id))))),
        ),
        s.playoff ? h('p', { class: 'muted' }, `Playoff seeds: ${s.playoff.seeds.map((id, i) => `${i + 1}. ${s.teams[id].short}`).join(', ')}`) : null,
      ),
      CHAMPIONSHIP_CONFERENCES.map((conf) =>
        h(
          'div',
          { class: 'card' },
          h('h3', {}, conf),
          h(
            'table',
            {},
            h('thead', {}, h('tr', {}, h('th', {}, 'Team'), h('th', {}, 'Conf'), h('th', {}, 'All'))),
            h('tbody', {}, conferenceStandings(s, conf).map((id) => h('tr', { class: id === us ? 'me' : '' }, h('td', {}, s.teams[id].name), h('td', {}, `${s.teams[id].record.cw}-${s.teams[id].record.cl}`), h('td', {}, `${s.teams[id].record.w}-${s.teams[id].record.l}`)))),
          ),
        ),
      ),
    ),
  );
}
