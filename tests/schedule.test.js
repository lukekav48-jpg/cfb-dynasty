import { test, eq, assert } from './harness.js';
import { Rng } from '../src/engine/rng.js';
import { TEAMS, CONF_GAMES } from '../src/data/teams.js';
import { generateSchedule } from '../src/engine/schedule.js';

// The schedule only needs teams, so these tests don't build rosters.
function scheduleFor(seed) {
  const state = { year: 2026, teams: Object.fromEntries(TEAMS.map((t) => [t.id, { ...t }])), games: [], regularWeeks: 0 };
  generateSchedule(state, new Rng(seed));
  return state;
}

for (const seed of [101, 202, 303]) {
  const s = scheduleFor(seed);

  test(`schedule (${seed}): 12 games per team, no repeats, one game per week`, () => {
    for (const id of Object.keys(s.teams)) {
      const games = s.games.filter((g) => g.home === id || g.away === id);
      eq(games.length, 12, id);
      const opps = games.map((g) => (g.home === id ? g.away : g.home));
      eq(new Set(opps).size, 12, `${id} repeat opponent`);
      eq(new Set(games.map((g) => g.week)).size, 12, `${id} two games in a week`);
    }
    assert(s.regularWeeks >= 12 && s.regularWeeks <= 16, `weeks ${s.regularWeeks}`);
  });

  test(`schedule (${seed}): conference game counts and home/away balance`, () => {
    for (const t of Object.values(s.teams)) {
      const games = s.games.filter((g) => g.home === t.id || g.away === t.id);
      const conf = games.filter((g) => s.teams[g.home].conference === s.teams[g.away].conference).length;
      eq(conf, CONF_GAMES[t.conference], t.id);
      const home = games.filter((g) => g.home === t.id).length;
      assert(home >= 5 && home <= 7, `${t.id} home ${home}`);
    }
  });

  test(`schedule (${seed}): game ids are unique and games are sorted by week`, () => {
    eq(new Set(s.games.map((g) => g.id)).size, s.games.length);
    for (let i = 1; i < s.games.length; i++) assert(s.games[i - 1].week <= s.games[i].week);
  });
}
