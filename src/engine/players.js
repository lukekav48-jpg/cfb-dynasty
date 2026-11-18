import { clamp } from './rng.js';
import { FIRST_NAMES, LAST_NAMES, STATES } from '../data/names.js';

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

// Attributes each position is rated on. Weights add up to 1 and give the overall.
export const ATTR_WEIGHTS = {
  QB: { accuracy: 0.45, arm: 0.25, decisions: 0.3 },
  RB: { speed: 0.4, power: 0.3, vision: 0.3 },
  WR: { speed: 0.35, hands: 0.35, routes: 0.3 },
  TE: { speed: 0.2, hands: 0.3, routes: 0.2, blocking: 0.3 },
  OL: { passBlock: 0.5, runBlock: 0.5 },
  DL: { passRush: 0.5, runStop: 0.5 },
  LB: { runStop: 0.4, coverage: 0.3, passRush: 0.3 },
  CB: { coverage: 0.5, speed: 0.35, tackling: 0.15 },
  S: { coverage: 0.4, speed: 0.25, tackling: 0.35 },
  K: { power: 0.5, accuracy: 0.5 },
  P: { power: 0.6, accuracy: 0.4 },
};

// How many players start at each position.
export const STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1 };

// Minimum players per position (spec) and the generated roster size (75 total).
export const POSITION_MINIMUMS = { QB: 3, RB: 4, WR: 6, TE: 3, OL: 9, DL: 8, LB: 6, CB: 5, S: 4, K: 1, P: 1 };
export const ROSTER_TEMPLATE = { QB: 4, RB: 5, WR: 9, TE: 4, OL: 14, DL: 12, LB: 9, CB: 8, S: 6, K: 2, P: 2 };
export const ROSTER_MAX = 85;

export const CLASS_YEARS = ['FR', 'SO', 'JR', 'SR'];

export function computeOverall(position, attrs) {
  let total = 0;
  for (const [attr, w] of Object.entries(ATTR_WEIGHTS[position])) total += attrs[attr] * w;
  return clamp(Math.round(total), 40, 99);
}

// Average starter overall for a program: 62 for prestige 1 up to 78 for prestige 5.
export function prestigeBase(prestige) {
  return 62 + (prestige - 1) * 4;
}

// Room left to grow, by class year.
const GROWTH_ROOM = { FR: [4, 18], SO: [3, 13], JR: [1, 8], SR: [0, 4] };

export function generatePlayer(rng, { id, position, target, classYear, homeState }) {
  const attrs = {};
  for (const attr of Object.keys(ATTR_WEIGHTS[position])) {
    attrs[attr] = clamp(Math.round(rng.normal(target, 4)), 40, 99);
  }
  const overall = computeOverall(position, attrs);
  const [lo, hi] = GROWTH_ROOM[classYear];
  return {
    id,
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    position,
    classYear,
    redshirted: false,
    homeState: homeState || rng.pick(STATES),
    attrs,
    overall,
    potential: clamp(overall + rng.int(lo, hi), overall, 99),
    injury: 0,
    morale: 70,
    nil: 0,
    stats: {},
  };
}

export function playerName(p) {
  return `${p.firstName[0]}. ${p.lastName}`;
}
