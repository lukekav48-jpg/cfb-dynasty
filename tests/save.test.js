import { test, eq, assert } from './harness.js';
import { createLeague } from '../src/engine/league.js';
import { serialize, deserialize, loadFromStorage, saveToStorage, clearStorage, SAVE_KEY, BACKUP_KEY } from '../src/save.js';

function fakeStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const state = createLeague({ seed: 'save-test', coachName: 'C', teamId: 'lsu' });

test('save: a league round-trips through JSON', () => {
  const r = deserialize(serialize(state));
  assert(r.ok);
  eq(serialize(r.state), serialize(state));
});

test('save: broken saves are detected', () => {
  assert(!deserialize('{not json').ok);
  assert(!deserialize('{"version":1}').ok);
  const wrong = JSON.parse(serialize(state));
  wrong.version = 99;
  assert(!deserialize(JSON.stringify(wrong)).ok);
});

test('save: storage save and load', () => {
  const s = fakeStorage();
  eq(loadFromStorage(s).status, 'none');
  assert(saveToStorage(s, state));
  const r = loadFromStorage(s);
  eq(r.status, 'ok');
  eq(r.state.coach.teamId, 'lsu');
  clearStorage(s);
  eq(loadFromStorage(s).status, 'none');
});

test('save: a corrupt save is kept as a backup, not deleted', () => {
  const s = fakeStorage();
  s.setItem(SAVE_KEY, '{broken');
  const r = loadFromStorage(s);
  eq(r.status, 'corrupt');
  eq(s.getItem(BACKUP_KEY), '{broken');
  eq(s.getItem(SAVE_KEY), '{broken');
});

test('save: unavailable storage is reported, not thrown', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  eq(loadFromStorage(broken).status, 'unavailable');
  eq(saveToStorage(broken, state), false);
});
