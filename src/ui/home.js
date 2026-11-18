import { h, teamLabel, recordText } from './dom.js';
import { userGameThisWeek, advanceWeek, PHASE_LABELS, rankOf, conferenceStandings } from '../engine/season.js';
import { teamOverall, getStarters } from '../engine/league.js';
import { POSITIONS } from '../engine/players.js';
import { playerName } from '../engine/players.js';

export function renderHome(ctx) {
  const s = ctx.state;
  const us = s.coach.teamId;
  const team = s.teams[us];
  const game = userGameThisWeek(s);
  const rank = rankOf(s, us);

  const weekTitle = s.phase === 'regular' ? `Week ${s.week} of ${s.regularWeeks}` : PHASE_LABELS[s.phase];

  function advance() {
    ctx.withRng((rng) => advanceWeek(s, rng));
    ctx.save();
    ctx.go('home');
  }

  function play(mode) {
    s.liveGame = { gameId: game.id, mode, g: null };
    ctx.save();
    ctx.go('game');
  }

  let matchupCard;
  if (s.phase === 'complete') {
    const champ = s.playoff && s.playoff.champion;
    matchupCard = h(
      'div',
      { class: 'card' },
      h('h3', {}, 'Season complete'),
      h('p', { class: 'big' }, champ ? `${s.teams[champ].name} are national champions` : 'Season over'),
      h('p', { class: 'muted' }, `You finished ${recordText(team.record)}. The offseason (recruiting, transfer portal, player progression) comes in a later update.`),
    );
  } else if (game && !game.result) {
    const opp = game.home === us ? game.away : game.home;
    const where = game.neutral ? 'Neutral site' : game.home === us ? 'Home' : 'Away';
    matchupCard = h(
      'div',
      { class: 'card' },
      h('h3', {}, `${weekTitle}${game.label ? ` · ${game.label}` : ''}`),
      h('p', { class: 'big' }, `${game.home === us ? 'vs' : '@'} ${teamLabel(s, opp)}`),
      h('p', { class: 'muted' }, `${where} · ${recordText(s.teams[opp].record)}`),
      scoutingCard(s, opp),
      h(
        'div',
        { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'primary', onclick: () => play('coach') }, 'Coach key moments'),
        h('button', { onclick: () => play('sim') }, 'Sim to end'),
      ),
    );
  } else {
    const playedNote = game && game.result ? 'Your game is final. Advance when you are ready.' : 'Your team has a bye this week.';
    const eliminated = s.phase !== 'regular' && !game;
    matchupCard = h(
      'div',
      { class: 'card' },
      h('h3', {}, weekTitle),
      h('p', {}, eliminated ? 'Your season is over. Advance to watch the rest of the postseason.' : playedNote),
      h('button', { class: 'primary', onclick: advance }, s.phase === 'regular' ? 'Advance to next week' : 'Sim this round'),
    );
  }

  const security = s.coach.jobSecurity;
  return h(
    'div',
    {},
    h('h1', {}, `${rank ? `#${rank} ` : ''}${team.name}`),
    h(
      'div',
      { class: 'grid' },
      matchupCard,
      h(
        'div',
        { class: 'card' },
        h('h3', {}, 'Program'),
        h('p', {}, `Record: ${recordText(team.record)} (${team.record.cw}-${team.record.cl} ${team.conference === 'Independent' ? 'independent' : 'conference'})`),
        h('p', {}, `Team overall: ${teamOverall(s, us)} · Prestige: ${team.prestige}/5`),
        h('p', {}, `Coach ${s.coach.name}, career ${recordText(s.coach.record)}`),
        h('p', { class: 'muted' }, `Job security: ${security}/100`),
        h('div', { class: 'meter' }, h('span', { style: { width: `${security}%` } })),
        team.conference !== 'Independent' ? conferenceMini(s, team.conference, us) : null,
      ),
      h('div', { class: 'card' }, h('h3', {}, 'News'), h('ul', { class: 'news' }, s.news.length ? s.news.slice(0, 40).map((n) => h('li', {}, n.text)) : h('li', { class: 'muted' }, 'Welcome to your new job, coach.'))),
    ),
  );
}

function scoutingCard(s, opp) {
  const t = s.teams[opp];
  const best = POSITIONS.flatMap((pos) => getStarters(s, opp, pos))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 3);
  return h(
    'div',
    { style: { marginTop: '10px' } },
    h('h3', {}, 'Scouting report'),
    h('p', {}, `Team overall ${teamOverall(s, opp)} · Offense: ${t.plan.offense} · Defense: ${t.plan.defense}`),
    h('p', { class: 'muted' }, 'Top players: ', best.map((p) => `${playerName(p)} (${p.position}, ${p.overall})`).join(', ')),
  );
}

function conferenceMini(s, conf, us) {
  const ids = conferenceStandings(s, conf).slice(0, 6);
  return h(
    'div',
    { style: { marginTop: '12px' } },
    h('h3', {}, `${conf} standings`),
    h('table', {}, h('tbody', {}, ids.map((id, i) => h('tr', { class: id === us ? 'me' : '' }, h('td', {}, `${i + 1}. ${s.teams[id].name}`), h('td', { class: 'num' }, `${s.teams[id].record.cw}-${s.teams[id].record.cl}`))))),
  );
}
