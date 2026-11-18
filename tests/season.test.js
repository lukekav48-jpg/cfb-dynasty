import { test, eq, assert } from './harness.js';
import { Rng } from '../src/engine/rng.js';
import { createLeague } from '../src/engine/league.js';
import { advanceWeek, conferenceStandings, winnerOf, userGameThisWeek, rankOf, CHAMPIONSHIP_CONFERENCES } from '../src/engine/season.js';

function playSeason(seed) {
  const s = createLeague({ seed, coachName: 'C', teamId: 'michigan' });
  const rng = new Rng(s.rngState);
  let guard = 0;
  while (s.phase !== 'complete' && guard++ < 40) advanceWeek(s, rng);
  s.rngState = rng.state;
  return s;
}

const season = playSeason('season-test');

test('season: every regular-season game is played and records add up', () => {
  const reg = season.games.filter((g) => g.kind === 'regular');
  assert(reg.every((g) => g.result));
  let wins = 0;
  let losses = 0;
  for (const t of Object.values(season.teams)) {
    wins += t.record.w;
    losses += t.record.l;
  }
  eq(wins, losses);
  eq(wins, season.games.filter((g) => g.result).length);
});

test('season: conference title games use the top two in the standings', () => {
  const s = createLeague({ seed: 'season-test', coachName: 'C', teamId: 'michigan' });
  const rng = new Rng(s.rngState);
  while (s.phase === 'regular') advanceWeek(s, rng);
  for (const conf of CHAMPIONSHIP_CONFERENCES) {
    const g = s.games.find((x) => x.kind === 'confChamp' && x.label.startsWith(conf));
    assert(g, conf);
    eq([g.home, g.away], conferenceStandings(s, conf).slice(0, 2), conf);
  }
});

test('season: playoff has 12 seeds, champions are seeds 1-4, and one champion is crowned', () => {
  const po = season.playoff;
  eq(po.seeds.length, 12);
  eq(new Set(po.seeds).size, 12);
  const champs = season.games.filter((g) => g.kind === 'confChamp').map(winnerOf);
  eq(po.seeds.slice(0, 4).sort(), champs.sort());
  eq([po.rounds.r1.length, po.rounds.qf.length, po.rounds.sf.length, po.rounds.final.length], [4, 4, 2, 1]);
  const final = season.games.find((g) => g.id === po.rounds.final[0]);
  eq(po.champion, winnerOf(final));
  eq(season.phase, 'complete');
});

test('season: quarterfinals pair the top seeds with the right first-round winners', () => {
  const po = season.playoff;
  const r1 = po.rounds.r1.map((id) => winnerOf(season.games.find((g) => g.id === id)));
  const qf = po.rounds.qf.map((id) => season.games.find((g) => g.id === id));
  const expect = [[po.seeds[0], r1[3]], [po.seeds[1], r1[2]], [po.seeds[2], r1[1]], [po.seeds[3], r1[0]]];
  qf.forEach((g, i) => eq([g.home, g.away].sort(), expect[i].sort()));
});

test('season: bowls only include 6-win teams outside the playoff', () => {
  const bowls = season.games.filter((g) => g.kind === 'bowl');
  assert(bowls.length > 0);
  for (const g of bowls) {
    for (const id of [g.home, g.away]) {
      assert(!season.playoff.seeds.includes(id), id);
      const regWins = season.games.filter((x) => x.kind !== 'bowl' && x.kind !== 'playoff' && winnerOf(x) === id).length;
      assert(regWins >= 6, `${id} has ${regWins}`);
    }
  }
});

test('season: injuries heal and nobody stays injured forever', () => {
  assert(Object.values(season.players).every((p) => p.injury <= 7));
});

test('season: rankings and user game helpers', () => {
  const s = createLeague({ seed: 'helpers', coachName: 'C', teamId: 'michigan' });
  const g = userGameThisWeek(s);
  if (g) assert(g.home === 'michigan' || g.away === 'michigan');
  eq(s.rankings.length, 68);
  const r = rankOf(s, s.rankings[0]);
  eq(r, 1);
  eq(rankOf(s, s.rankings[30]), null);
});
