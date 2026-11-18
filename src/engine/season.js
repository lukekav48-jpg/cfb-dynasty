import { autoDepth, teamOverall, addNews } from './league.js';
import { simulateGame } from './sim.js';
import { BOWL_NAMES } from '../data/names.js';

// Phases in order. Each phase after 'regular' is one week of games.
export const PHASES = ['regular', 'confChamp', 'playoffR1', 'playoffQF', 'playoffSF', 'final', 'complete'];

export const PHASE_LABELS = {
  regular: 'Regular season',
  confChamp: 'Conference championships',
  playoffR1: 'Playoff first round and bowls',
  playoffQF: 'Playoff quarterfinals',
  playoffSF: 'Playoff semifinals',
  final: 'National championship',
  complete: 'Season complete',
};

export const CHAMPIONSHIP_CONFERENCES = ['SEC', 'Big Ten', 'Big 12', 'ACC'];

export function gamesThisWeek(state) {
  return state.games.filter((g) => g.week === state.week);
}

export function userGameThisWeek(state) {
  const id = state.coach.teamId;
  return gamesThisWeek(state).find((g) => g.home === id || g.away === id) || null;
}

export function teamGames(state, teamId) {
  return state.games.filter((g) => g.home === teamId || g.away === teamId);
}

// Records a finished game: scores, records, season stats, injuries and news.
// Only the user's games keep the full box score, which keeps saves small.
export function applyResult(state, game, result) {
  const { home, away } = game;
  const userGame = home === state.coach.teamId || away === state.coach.teamId;
  game.result = userGame ? result : { homeScore: result.homeScore, awayScore: result.awayScore, overtime: result.overtime };
  const homeWon = result.homeScore > result.awayScore;
  const winner = homeWon ? home : away;
  const loser = homeWon ? away : home;
  const conf = game.kind === 'regular' && game.conference;
  const th = state.teams[home].record;
  const ta = state.teams[away].record;
  th.pf += result.homeScore;
  th.pa += result.awayScore;
  ta.pf += result.awayScore;
  ta.pa += result.homeScore;
  state.teams[winner].record.w++;
  state.teams[loser].record.l++;
  if (conf) {
    state.teams[winner].record.cw++;
    state.teams[loser].record.cl++;
  }
  if (winner === state.coach.teamId) state.coach.record.w++;
  if (loser === state.coach.teamId) state.coach.record.l++;

  for (const [id, line] of Object.entries(result.playerStats)) {
    const p = state.players[id];
    if (!p) continue;
    p.stats.games = (p.stats.games || 0) + 1;
    for (const [k, v] of Object.entries(line)) p.stats[k] = (p.stats[k] || 0) + v;
  }
  for (const inj of result.injuries) {
    const p = state.players[inj.id];
    if (!p) continue;
    p.injury = Math.max(p.injury, inj.weeks + 1); // +1 because everyone heals one week after this round
    if (p.teamId === state.coach.teamId) addNews(state, `${p.firstName} ${p.lastName} (${p.position}) is injured and out ${inj.weeks} week${inj.weeks === 1 ? '' : 's'}.`);
  }
  if (home === state.coach.teamId || away === state.coach.teamId) {
    const us = state.coach.teamId;
    const them = us === home ? away : home;
    const won = winner === us;
    const ourScore = us === home ? result.homeScore : result.awayScore;
    const theirScore = us === home ? result.awayScore : result.homeScore;
    addNews(state, `${won ? 'Win' : 'Loss'}: ${state.teams[us].name} ${ourScore}, ${state.teams[them].name} ${theirScore}${game.label ? ` (${game.label})` : ''}.`);
  }
}

export function playGame(state, game, rng) {
  const result = simulateGame(state, game, rng);
  applyResult(state, game, result);
  return result;
}

// Simulates every unplayed game this week (including the user's, if not played yet),
// heals injuries, updates rankings and depth charts, and moves to the next week or phase.
export function advanceWeek(state, rng) {
  if (state.phase === 'complete') return;
  for (const game of gamesThisWeek(state)) if (!game.result) playGame(state, game, rng);
  for (const p of Object.values(state.players)) if (p.injury > 0) p.injury--;
  for (const id of Object.keys(state.teams)) if (id !== state.coach.teamId) autoDepth(state, id);
  state.liveGame = null;
  state.rankings = computeRankings(state);
  state.week++;

  if (state.phase === 'regular') {
    if (state.week > state.regularWeeks) startConferenceChampionships(state);
  } else if (state.phase === 'confChamp') {
    startPlayoff(state);
  } else if (state.phase === 'playoffR1') {
    nextPlayoffRound(state, 'r1', 'qf', 'playoffQF');
  } else if (state.phase === 'playoffQF') {
    nextPlayoffRound(state, 'qf', 'sf', 'playoffSF');
  } else if (state.phase === 'playoffSF') {
    nextPlayoffRound(state, 'sf', 'final', 'final');
  } else if (state.phase === 'final') {
    const final = state.games.find((g) => g.id === state.playoff.rounds.final[0]);
    state.playoff.champion = winnerOf(final);
    state.phase = 'complete';
    addNews(state, `${state.teams[state.playoff.champion].name} wins the ${state.year} national championship!`);
  }
}

export function winnerOf(game) {
  if (!game || !game.result) return null;
  return game.result.homeScore > game.result.awayScore ? game.home : game.away;
}

// ---------- Rankings ----------

function winPct(r) {
  const n = r.w + r.l;
  return n ? r.w / n : 0;
}

// Power score: win %, strength of schedule and capped scoring margin.
// Before any games, it falls back to roster strength.
export function powerScores(state) {
  const scores = {};
  for (const t of Object.values(state.teams)) {
    const played = teamGames(state, t.id).filter((g) => g.result);
    if (played.length === 0) {
      scores[t.id] = teamOverall(state, t.id) / 100;
      continue;
    }
    const opp = played.map((g) => state.teams[g.home === t.id ? g.away : g.home]);
    const sos = opp.reduce((s, o) => s + winPct(o.record), 0) / opp.length;
    const margin =
      played.reduce((s, g) => {
        const us = g.home === t.id ? g.result.homeScore : g.result.awayScore;
        const them = g.home === t.id ? g.result.awayScore : g.result.homeScore;
        return s + Math.max(-28, Math.min(28, us - them));
      }, 0) / played.length;
    scores[t.id] = winPct(t.record) * 60 + sos * 25 + margin * 0.5 + teamOverall(state, t.id) * 0.05;
  }
  return scores;
}

// All 68 team ids, best first. The Top 25 is the first 25.
export function computeRankings(state) {
  const scores = powerScores(state);
  return Object.keys(state.teams).sort((a, b) => scores[b] - scores[a]);
}

export function rankOf(state, teamId) {
  const i = state.rankings.indexOf(teamId);
  return i >= 0 && i < 25 ? i + 1 : null;
}

// ---------- Standings and championships ----------

function headToHead(state, a, b) {
  const g = state.games.find((x) => x.kind === 'regular' && x.result && ((x.home === a && x.away === b) || (x.home === b && x.away === a)));
  if (!g) return 0;
  return winnerOf(g) === a ? -1 : 1;
}

// Conference standings: conference win %, then head-to-head, then ranking.
export function conferenceStandings(state, conference) {
  const rank = (id) => state.rankings.indexOf(id);
  const teams = Object.values(state.teams).filter((t) => t.conference === conference);
  const pct = (t) => (t.record.cw + t.record.cl ? t.record.cw / (t.record.cw + t.record.cl) : 0);
  return teams
    .sort((a, b) => pct(b) - pct(a) || headToHead(state, a.id, b.id) || rank(a.id) - rank(b.id))
    .map((t) => t.id);
}

function postseasonGame(state, { home, away, neutral, kind, label }) {
  const game = { id: `g${state.year}-${state.games.length + 1}`, week: state.week, home, away, neutral, kind, conference: false, label, result: null };
  state.games.push(game);
  return game;
}

function startConferenceChampionships(state) {
  state.phase = 'confChamp';
  for (const conf of CHAMPIONSHIP_CONFERENCES) {
    const [a, b] = conferenceStandings(state, conf);
    postseasonGame(state, { home: a, away: b, neutral: true, kind: 'confChamp', label: `${conf} Championship` });
  }
  addNews(state, 'Conference championship week is here.');
}

function startPlayoff(state) {
  state.phase = 'playoffR1';
  const champs = state.games
    .filter((g) => g.kind === 'confChamp' && g.result && g.id.startsWith(`g${state.year}-`))
    .map(winnerOf);
  const byRank = (ids) => ids.slice().sort((a, b) => state.rankings.indexOf(a) - state.rankings.indexOf(b));
  const top4 = byRank(champs);
  const atLarge = state.rankings.filter((id) => !champs.includes(id)).slice(0, 8);
  const seeds = [...top4, ...byRank(atLarge)];
  state.playoff = { year: state.year, seeds, rounds: { r1: [], qf: [], sf: [], final: [] }, champion: null };
  const r1 = [[4, 11], [5, 10], [6, 9], [7, 8]]; // seed indexes: 5v12, 6v11, 7v10, 8v9
  for (const [hi, lo] of r1) {
    const g = postseasonGame(state, { home: seeds[hi], away: seeds[lo], neutral: false, kind: 'playoff', label: `Playoff First Round: #${hi + 1} vs #${lo + 1}` });
    state.playoff.rounds.r1.push(g.id);
  }
  scheduleBowls(state, seeds);
  const us = state.coach.teamId;
  const seed = seeds.indexOf(us);
  addNews(state, seed >= 0 ? `${state.teams[us].name} made the playoff as the #${seed + 1} seed!` : 'The 12-team playoff field is set.');
}

function scheduleBowls(state, playoffTeams) {
  const eligible = state.rankings.filter((id) => !playoffTeams.includes(id) && state.teams[id].record.w >= 6);
  for (let i = 0; i + 1 < eligible.length && i / 2 < BOWL_NAMES.length; i += 2) {
    postseasonGame(state, { home: eligible[i], away: eligible[i + 1], neutral: true, kind: 'bowl', label: BOWL_NAMES[i / 2] });
  }
}

// Bracket: QF pairs seed 1 with the 8/9 winner, 2 with 7/10, 3 with 6/11, 4 with 5/12.
// SF pairs the 1 and 4 sides, and the 2 and 3 sides.
function nextPlayoffRound(state, from, to, phase) {
  const po = state.playoff;
  const winners = po.rounds[from].map((id) => winnerOf(state.games.find((g) => g.id === id)));
  let pairs;
  if (from === 'r1') {
    // r1 order: [5v12, 6v11, 7v10, 8v9]
    pairs = [[po.seeds[0], winners[3]], [po.seeds[1], winners[2]], [po.seeds[2], winners[1]], [po.seeds[3], winners[0]]];
  } else if (from === 'qf') {
    pairs = [[winners[0], winners[3]], [winners[1], winners[2]]];
  } else {
    pairs = [[winners[0], winners[1]]];
  }
  const label = { qf: 'Playoff Quarterfinal', sf: 'Playoff Semifinal', final: 'National Championship' }[to];
  for (const [a, b] of pairs) {
    const [home, away] = po.seeds.indexOf(a) <= po.seeds.indexOf(b) ? [a, b] : [b, a];
    const g = postseasonGame(state, { home, away, neutral: true, kind: 'playoff', label });
    po.rounds[to].push(g.id);
  }
  state.phase = phase;
}
