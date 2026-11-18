import { test, eq, assert, between } from './harness.js';
import { Rng } from '../src/engine/rng.js';
import { createLeague } from '../src/engine/league.js';
import { createGame, runPlay, simulateGame, simulateRest, isKeyMoment, offenseOptions, callModifier, CALL_MATCHUP } from '../src/engine/sim.js';

const league = createLeague({ seed: 'sim-tests', coachName: 'C', teamId: 'alabama' });

// Makes every starter on a team a given rating, so tests control team strength.
function setTeamRating(state, teamId, rating) {
  for (const id of state.teams[teamId].roster) {
    const p = state.players[id];
    for (const k of Object.keys(p.attrs)) p.attrs[k] = rating;
    p.overall = rating;
  }
}

function matchup(homeRating, awayRating, n, seed, neutral = false) {
  const s = JSON.parse(JSON.stringify(league));
  setTeamRating(s, 'iowa', homeRating);
  setTeamRating(s, 'utah', awayRating);
  const rng = new Rng(seed);
  const results = [];
  for (let i = 0; i < n; i++) results.push(simulateGame(s, { id: `t${i}`, home: 'iowa', away: 'utah', neutral }, rng));
  return results;
}

test('sim: call matchup table stays within -0.15..+0.15', () => {
  for (const row of Object.values(CALL_MATCHUP)) for (const v of Object.values(row)) between(v, -0.15, 0.15);
  assert(callModifier('Screen', 'Blitz') > 0);
  assert(callModifier('Deep Pass', 'Prevent') < 0);
  assert(callModifier('Inside Run', 'Run Stop') < 0);
  assert(callModifier('Play Action', 'Run Stop') > 0);
  eq(callModifier('Quick Pass', 'Base'), 0);
});

test('sim: same seed gives the same game', () => {
  const game = { id: 'x', home: 'alabama', away: 'georgia' };
  const a = simulateGame(league, game, new Rng(42));
  const b = simulateGame(league, game, new Rng(42));
  eq(JSON.stringify(a), JSON.stringify(b));
});

test('sim: every game ends with a winner', () => {
  for (const r of matchup(70, 70, 200, 11)) assert(r.homeScore !== r.awayScore);
});

test('sim: realism targets for evenly matched teams (1,000 games)', () => {
  const rs = matchup(70, 70, 1000, 12);
  let pts = 0, yds = 0, to = 0, homeWins = 0;
  for (const r of rs) {
    pts += r.homeScore + r.awayScore;
    yds += r.teamStats.iowa.yards + r.teamStats.utah.yards;
    to += r.teamStats.iowa.turnovers + r.teamStats.utah.turnovers;
    if (r.homeScore > r.awayScore) homeWins++;
  }
  between(pts / 2000, 20, 35, 'points per team');
  between(yds / 2000, 320, 480, 'yards per team');
  between(to / 1000, 1.5, 4, 'turnovers per game');
  between(homeWins / 1000, 0.52, 0.6, 'home win rate');
});

test('sim: a team 15 overall points better wins 80-95% (neutral site)', () => {
  const rs = matchup(80, 65, 600, 13, true);
  const wins = rs.filter((r) => r.homeScore > r.awayScore).length / rs.length;
  between(wins, 0.8, 0.95, 'better team win rate');
});

test('sim: the right call beats the wrong call', () => {
  // Same snap repeated: Play Action vs Run Stop should gain more than Play Action vs Cover 2.
  const avgGain = (defense, seed) => {
    const rng = new Rng(seed);
    let total = 0;
    for (let i = 0; i < 3000; i++) {
      const g = createGame(league, { id: 'c', home: 'iowa', away: 'utah' });
      g.possession = 'iowa';
      g.ball = 30;
      const e = runPlay(g, rng, { offense: 'Play Action', defense });
      total += e.yards || 0;
    }
    return total / 3000;
  };
  assert(avgGain('Run Stop', 21) > avgGain('Cover 2', 21) + 0.5);
});

test('sim: key moments include 4th down, red zone and PAT, but not a routine 1st down', () => {
  const g = createGame(league, { id: 'k', home: 'alabama', away: 'georgia' });
  g.possession = 'alabama';
  g.quarter = 1;
  g.ball = 40;
  g.down = 1;
  eq(isKeyMoment(g, 'alabama'), false);
  g.down = 4;
  eq(isKeyMoment(g, 'alabama'), true);
  assert(offenseOptions(g).includes('Punt'));
  g.down = 1;
  g.ball = 85;
  eq(isKeyMoment(g, 'alabama'), true, 'red zone');
  eq(isKeyMoment(g, 'georgia'), true, 'defense in its own red zone');
  eq(isKeyMoment(g, 'texas'), false, 'not playing');
  g.ball = 40;
  g.pat = true;
  eq(isKeyMoment(g, 'alabama'), true);
  assert(offenseOptions(g).includes('Extra Point'));
});

test('sim: overtime games finish and record the period', () => {
  const rs = matchup(70, 70, 400, 14);
  const ot = rs.filter((r) => r.overtime > 0);
  assert(ot.length > 0, 'expected some overtime games');
  for (const r of ot) assert(r.homeScore !== r.awayScore);
});

test('sim: box score has stats and 1-8 highlights', () => {
  const r = simulateGame(league, { id: 'b', home: 'alabama', away: 'georgia' }, new Rng(5));
  assert(r.teamStats.alabama.yards > 0);
  assert(Object.keys(r.playerStats).length > 5);
  between(r.highlights.length, 1, 8);
});

test('sim: simulateRest finishes an interactive game started by hand', () => {
  const rng = new Rng(9);
  const g = createGame(league, { id: 'i', home: 'alabama', away: 'georgia' });
  for (let i = 0; i < 20; i++) runPlay(g, rng, { offense: 'Inside Run', defense: 'Base' });
  simulateRest(g, rng);
  assert(g.over);
});
