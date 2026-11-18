import { test, eq, assert, between } from './harness.js';
import { Rng, hashSeed, clamp } from '../src/engine/rng.js';

test('rng: same seed gives the same sequence', () => {
  const a = new Rng(123);
  const b = new Rng(123);
  const seqA = [a.next(), a.next(), a.next()];
  const seqB = [b.next(), b.next(), b.next()];
  eq(seqA, seqB);
});

test('rng: resuming from a saved state continues the sequence', () => {
  const a = new Rng(99);
  a.next();
  const saved = a.state;
  const expected = a.next();
  eq(new Rng(saved).next(), expected);
});

test('rng: int stays in range and hits both ends', () => {
  const r = new Rng(5);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const x = r.int(1, 6);
    between(x, 1, 6);
    seen.add(x);
  }
  eq(seen.size, 6);
});

test('rng: normal has roughly the right mean', () => {
  const r = new Rng(7);
  let sum = 0;
  for (let i = 0; i < 5000; i++) sum += r.normal(10, 2);
  between(sum / 5000, 9.8, 10.2);
});

test('rng: weighted respects zero weights', () => {
  const r = new Rng(8);
  for (let i = 0; i < 500; i++) assert(r.weighted({ a: 1, b: 0, c: 2 }) !== 'b');
});

test('rng: hashSeed is stable and clamp works', () => {
  eq(hashSeed('dynasty'), hashSeed('dynasty'));
  assert(hashSeed('a') !== hashSeed('b'));
  eq(clamp(120, 40, 99), 99);
});
