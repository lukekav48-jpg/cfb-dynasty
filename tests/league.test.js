import { test, eq, assert, between } from './harness.js';
import { POSITION_MINIMUMS, ROSTER_MAX, POSITIONS } from '../src/engine/players.js';
import { createLeague, teamOverall, getStarters, autoDepth } from '../src/engine/league.js';

const league = createLeague({ seed: 'test-league', coachName: 'Coach Test', teamId: 'texas' });

test('league: 68 teams, rosters meet minimums and the 85 cap', () => {
  eq(Object.keys(league.teams).length, 68);
  for (const team of Object.values(league.teams)) {
    assert(team.roster.length >= 70 && team.roster.length <= ROSTER_MAX, team.id);
    for (const pos of POSITIONS) {
      const n = team.roster.filter((id) => league.players[id].position === pos).length;
      assert(n >= POSITION_MINIMUMS[pos], `${team.id} ${pos}`);
    }
  }
});

test('league: prestige scales roster strength', () => {
  const avg = (prestige) => {
    const ids = Object.values(league.teams).filter((t) => t.prestige === prestige).map((t) => t.id);
    return ids.reduce((s, id) => s + teamOverall(league, id), 0) / ids.length;
  };
  between(avg(5), 75, 81, 'prestige 5');
  between(avg(2), 63, 69, 'prestige 2');
  assert(avg(5) > avg(4) && avg(4) > avg(3) && avg(3) > avg(2));
});

test('league: new franchise has a coach, a schedule and rankings', () => {
  eq(league.coach.teamId, 'texas');
  eq(league.coach.jobSecurity, 60);
  eq(league.week, 1);
  eq(league.phase, 'regular');
  eq(league.rankings.length, 68);
  assert(league.games.length > 0);
});

test('league: same seed builds the same league', () => {
  const again = createLeague({ seed: 'test-league', coachName: 'Coach Test', teamId: 'texas' });
  eq(JSON.stringify(again), JSON.stringify(league));
});

test('league: autoDepth puts injured players last', () => {
  const s = createLeague({ seed: 7, coachName: 'C', teamId: 'iowa' });
  const qb1 = s.teams.iowa.depth.QB[0];
  s.players[qb1].injury = 3;
  autoDepth(s, 'iowa');
  eq(s.teams.iowa.depth.QB[s.teams.iowa.depth.QB.length - 1], qb1);
  assert(getStarters(s, 'iowa', 'QB')[0].id !== qb1);
});

test('league: rejects an unknown team', () => {
  let threw = false;
  try {
    createLeague({ seed: 1, coachName: 'C', teamId: 'nope' });
  } catch {
    threw = true;
  }
  assert(threw);
});
