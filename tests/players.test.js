import { test, eq, assert, between } from './harness.js';
import { Rng } from '../src/engine/rng.js';
import { computeOverall, generatePlayer, prestigeBase, playerName, ATTR_WEIGHTS } from '../src/engine/players.js';

test('players: attribute weights add up to 1 for every position', () => {
  for (const [pos, w] of Object.entries(ATTR_WEIGHTS)) {
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    assert(Math.abs(total - 1) < 1e-9, pos);
  }
});

test('players: overall is the weighted average of attributes', () => {
  eq(computeOverall('OL', { passBlock: 70, runBlock: 80 }), 75);
  eq(computeOverall('QB', { accuracy: 99, arm: 99, decisions: 99 }), 99);
  eq(computeOverall('K', { power: 10, accuracy: 10 }), 40);
});

test('players: generated player is in range and potential >= overall', () => {
  const rng = new Rng(1);
  for (let i = 0; i < 200; i++) {
    const p = generatePlayer(rng, { id: `x${i}`, position: 'WR', target: 70, classYear: 'FR' });
    between(p.overall, 40, 99);
    assert(p.potential >= p.overall && p.potential <= 99);
    eq(p.injury, 0);
  }
});

test('players: prestige base and short names', () => {
  eq([1, 2, 3, 4, 5].map(prestigeBase), [62, 66, 70, 74, 78]);
  eq(playerName({ firstName: 'Jalen', lastName: 'Ramsey' }), 'J. Ramsey');
});
