import { Rng, hashSeed } from './rng.js';
import { TEAMS } from '../data/teams.js';
import { POSITIONS, STARTERS, ROSTER_TEMPLATE, generatePlayer, prestigeBase } from './players.js';
import { generateSchedule } from './schedule.js';

export const SAVE_VERSION = 1;
export const START_YEAR = 2026;

export const DEFAULT_PLAN = { offense: 'Balanced', defense: 'Balanced', tempo: 'Normal' };

function emptyRecord() {
  return { w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0 };
}

// Builds a brand-new franchise. seed may be a number or any string.
export function createLeague({ seed, coachName, teamId }) {
  if (!TEAMS.some((t) => t.id === teamId)) throw new Error(`Unknown team: ${teamId}`);
  const seedNum = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  const rng = new Rng(seedNum);
  const state = {
    version: SAVE_VERSION,
    seed: seedNum,
    rngState: 0,
    year: START_YEAR,
    week: 1,
    phase: 'regular',
    coach: { name: coachName, teamId, jobSecurity: 60, record: { w: 0, l: 0 }, history: [] },
    teams: {},
    players: {},
    nextPlayerId: 1,
    games: [],
    regularWeeks: 0,
    rankings: [],
    playoff: null,
    news: [],
    liveGame: null,
  };

  for (const t of TEAMS) {
    state.teams[t.id] = {
      ...t,
      colors: { ...t.colors },
      roster: [],
      depth: {},
      plan: { ...DEFAULT_PLAN },
      record: emptyRecord(),
    };
    buildRoster(state, rng, t.id);
    autoDepth(state, t.id);
  }

  generateSchedule(state, rng);
  state.rankings = preseasonRankings(state);
  state.rngState = rng.state;
  return state;
}

function buildRoster(state, rng, teamId) {
  const team = state.teams[teamId];
  const base = prestigeBase(team.prestige);
  for (const position of POSITIONS) {
    const count = ROSTER_TEMPLATE[position];
    const starters = STARTERS[position];
    for (let rank = 0; rank < count; rank++) {
      const isStarter = rank < starters;
      const target = isStarter ? base + rng.int(-3, 3) : base - 6 - (rank - starters) * 1.5;
      const classYear = isStarter ? rng.pick(['SO', 'JR', 'JR', 'SR', 'SR']) : rng.pick(['FR', 'FR', 'SO', 'SO', 'JR', 'SR']);
      const homeState = rng.chance(0.5) ? team.state : undefined;
      const id = `p${state.nextPlayerId++}`;
      state.players[id] = generatePlayer(rng, { id, position, target, classYear, homeState });
      state.players[id].teamId = teamId;
      team.roster.push(id);
    }
  }
}

// Sorts every position: healthy players by overall (best first), injured players last.
export function autoDepth(state, teamId) {
  const team = state.teams[teamId];
  const depth = {};
  for (const position of POSITIONS) {
    depth[position] = team.roster
      .map((id) => state.players[id])
      .filter((p) => p.position === position)
      .sort((a, b) => (a.injury > 0) - (b.injury > 0) || b.overall - a.overall)
      .map((p) => p.id);
  }
  team.depth = depth;
}

// The healthy starters at a position, following the depth chart order.
export function getStarters(state, teamId, position, count = STARTERS[position]) {
  const ids = state.teams[teamId].depth[position] || [];
  return ids.map((id) => state.players[id]).filter((p) => p && p.injury === 0).slice(0, count);
}

// Average overall of all healthy starters.
export function teamOverall(state, teamId) {
  let sum = 0;
  let n = 0;
  for (const position of POSITIONS) {
    for (const p of getStarters(state, teamId, position)) {
      sum += p.overall;
      n++;
    }
  }
  return n ? Math.round(sum / n) : 0;
}

export function preseasonRankings(state) {
  return Object.keys(state.teams).sort(
    (a, b) => teamOverall(state, b) - teamOverall(state, a) || state.teams[b].prestige - state.teams[a].prestige,
  );
}

export function addNews(state, text) {
  state.news.unshift({ year: state.year, week: state.week, text });
  if (state.news.length > 200) state.news.length = 200;
}
