import { h, modal, teamLabel } from './dom.js';
import { teamGames } from '../engine/season.js';
import { boxScore } from './boxscore.js';

export function renderSchedule(ctx) {
  const s = ctx.state;
  const us = s.coach.teamId;
  const games = teamGames(s, us).sort((a, b) => a.week - b.week);
  const weekSelect = h('select', { 'aria-label': 'League week', onchange: drawWeek });
  const maxWeek = Math.max(...s.games.map((g) => g.week));
  for (let w = 1; w <= maxWeek; w++) weekSelect.append(h('option', { value: w, selected: w === Math.min(s.week, maxWeek) }, `Week ${w}`));
  const weekList = h('div', { class: 'table-wrap' });

  function drawWeek() {
    const w = Number(weekSelect.value);
    weekList.replaceChildren(
      h(
        'table',
        {},
        h(
          'tbody',
          {},
          s.games
            .filter((g) => g.week === w)
            .map((g) => h('tr', { class: g.home === us || g.away === us ? 'me' : '' }, h('td', {}, s.teams[g.away].name), h('td', { class: 'num' }, g.result ? g.result.awayScore : ''), h('td', {}, g.neutral ? 'vs' : '@'), h('td', {}, s.teams[g.home].name), h('td', { class: 'num' }, g.result ? g.result.homeScore : ''), h('td', { class: 'muted' }, g.label || ''))),
        ),
      ),
    );
  }
  drawWeek();

  return h(
    'div',
    {},
    h('h1', {}, `${s.year} Schedule`),
    h(
      'div',
      { class: 'grid' },
      h(
        'div',
        { class: 'card' },
        h('h3', {}, s.teams[us].name),
        h(
          'div',
          { class: 'table-wrap' },
          h(
          'table',
          {},
          h(
            'tbody',
            {},
            games.map((g) => {
              const home = g.home === us;
              const opp = home ? g.away : g.home;
              let res = '';
              if (g.result) {
                const ours = home ? g.result.homeScore : g.result.awayScore;
                const theirs = home ? g.result.awayScore : g.result.homeScore;
                res = h('span', { class: `pill ${ours > theirs ? 'good' : 'bad'}` }, `${ours > theirs ? 'W' : 'L'} ${ours}-${theirs}${g.result.overtime ? ' OT' : ''}`);
              }
              return h('tr', { class: g.result ? 'clickable' : '', onclick: () => g.result && modal(boxScore(s, g)) }, h('td', {}, `Wk ${g.week}`), h('td', {}, `${g.neutral ? 'vs' : home ? 'vs' : '@'} ${teamLabel(s, opp)}`), h('td', { class: 'muted' }, g.label || ''), h('td', {}, res));
            }),
          ),
          ),
        ),
        h('p', { class: 'muted' }, 'Weeks not listed are byes. Click a result for the box score.'),
      ),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', {}, 'Around the league'), h('span', { class: 'spacer' }), weekSelect), weekList),
    ),
  );
}
