import { test, eq, assert } from './harness.js';
import { TEAMS, CONF_GAMES } from '../src/data/teams.js';

test('teams: 68 teams with unique ids and short names', () => {
  eq(TEAMS.length, 68);
  eq(new Set(TEAMS.map((t) => t.id)).size, 68);
  eq(new Set(TEAMS.map((t) => t.short)).size, 68);
});

test('teams: conference sizes match the spec', () => {
  const count = (c) => TEAMS.filter((t) => t.conference === c).length;
  eq([count('SEC'), count('Big Ten'), count('Big 12'), count('ACC'), count('Independent')], [16, 18, 16, 17, 1]);
});

test('teams: prestige 1-5, hex colors, and every conference has a game count', () => {
  for (const t of TEAMS) {
    assert(t.prestige >= 1 && t.prestige <= 5, t.id);
    assert(/^#[0-9A-F]{6}$/i.test(t.colors.primary), t.id);
    assert(CONF_GAMES[t.conference] !== undefined, t.id);
  }
});
