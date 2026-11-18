import { h } from './dom.js';

const PASS = ['passComp', 'passAtt', 'passYds', 'passTD', 'intThrown'];

function leaders(result, ids, key, n = 3) {
  return ids
    .filter((id) => result.playerStats[id] && result.playerStats[id][key])
    .sort((a, b) => result.playerStats[b][key] - result.playerStats[a][key])
    .slice(0, n);
}

// Full box score for a game that kept its detailed result.
export function boxScore(state, game) {
  const r = game.result;
  const { home, away } = game;
  const name = (id) => (r.names && r.names[id]) || 'Player';
  const side = (id) => (state.players[id] ? state.players[id].teamId : null);
  if (!r.teamStats) {
    return h('p', {}, `${state.teams[away].name} ${r.awayScore} @ ${state.teams[home].name} ${r.homeScore}${r.overtime ? ' (OT)' : ''}`);
  }
  const teamRow = (label, f) => h('tr', {}, h('td', {}, label), h('td', { class: 'num' }, f(r.teamStats[away])), h('td', { class: 'num' }, f(r.teamStats[home])));
  const fmtTop = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  const allIds = Object.keys(r.playerStats);
  const block = (teamId) => {
    const ids = allIds.filter((id) => side(id) === teamId);
    const ps = (id) => r.playerStats[id];
    const passers = leaders(r, ids, 'passAtt', 1);
    const rushers = leaders(r, ids, 'rushYds', 2);
    const receivers = leaders(r, ids, 'recYds', 3);
    return h(
      'div',
      { class: 'card' },
      h('h3', {}, state.teams[teamId].name),
      passers.map((id) => h('p', {}, `${name(id)}: ${ps(id).passComp || 0}/${ps(id).passAtt || 0}, ${ps(id).passYds || 0} yds, ${ps(id).passTD || 0} TD, ${ps(id).intThrown || 0} INT`)),
      rushers.map((id) => h('p', {}, `${name(id)}: ${ps(id).rushAtt || 0} rush, ${ps(id).rushYds || 0} yds${ps(id).rushTD ? `, ${ps(id).rushTD} TD` : ''}`)),
      receivers.map((id) => h('p', {}, `${name(id)}: ${ps(id).rec || 0} rec, ${ps(id).recYds || 0} yds${ps(id).recTD ? `, ${ps(id).recTD} TD` : ''}`)),
    );
  };

  const quarters = (id) => [...r.quarters[id], r.overtime ? (id === home ? r.homeScore : r.awayScore) - r.quarters[id].reduce((a, b) => a + b, 0) : null].filter((x) => x !== null);
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'card' },
      h('h3', {}, game.label || 'Final'),
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, ''), ['1', '2', '3', '4', ...(r.overtime ? ['OT'] : [])].map((q) => h('th', { class: 'num' }, q)), h('th', { class: 'num' }, 'T'))),
        h('tbody', {}, [away, home].map((id) => h('tr', {}, h('td', {}, state.teams[id].name), quarters(id).map((x) => h('td', { class: 'num' }, x)), h('td', { class: 'num' }, h('strong', {}, id === home ? r.homeScore : r.awayScore))))),
      ),
    ),
    h(
      'div',
      { class: 'grid', style: { marginTop: '14px' } },
      h(
        'div',
        { class: 'card' },
        h('h3', {}, 'Team stats'),
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { class: 'num' }, state.teams[away].short), h('th', { class: 'num' }, state.teams[home].short))),
          h(
            'tbody',
            {},
            teamRow('Total yards', (t) => t.yards),
            teamRow('Passing', (t) => t.passYards),
            teamRow('Rushing', (t) => t.rushYards),
            teamRow('First downs', (t) => t.firstDowns),
            teamRow('3rd down', (t) => `${t.thirdConv}/${t.thirdAtt}`),
            teamRow('Turnovers', (t) => t.turnovers),
            teamRow('Possession', (t) => fmtTop(t.top)),
          ),
        ),
      ),
      h('div', { class: 'card' }, h('h3', {}, 'Highlights'), h('ul', { class: 'feed' }, r.highlights.map((e) => h('li', { class: e.scoring ? 'score' : e.turnover ? 'turnover' : '' }, h('span', { class: 'tag' }, `Q${e.q} ${e.clock}`), `${e.short}: ${e.text}`)))),
      block(away),
      block(home),
    ),
  );
}
