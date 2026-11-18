# CFB Dynasty, Plan 1: Playable First Season — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser game where you coach one of 68 real college programs through a full season: depth chart, game plan, games in "Sim to end" or "Coach key moments" mode, rankings, conference championships, a 12-team playoff and bowls, with automatic saving.

**Architecture:** Plain ES modules with no build step. `src/engine/` holds all game logic as pure functions over one JSON-serializable `state` object, with no access to the page or storage. `src/ui/` holds one module per screen, built with a tiny `h()` DOM helper, and `src/main.js` routes between screens by URL hash. Randomness comes from a seeded generator whose state is saved in `state.rngState`, so results can be reproduced.

**Tech Stack:** HTML, CSS, JavaScript ES2022 modules. Tests run in macOS's built-in JavaScriptCore (`jsc`) from the terminal, and in the browser at `tests/tests.html`. Python's `http.server` serves the game locally for manual checks. There are no npm packages, and Node.js is not used.

**Spec:** `docs/superpowers/specs/2026-11-16-cfb-dynasty-design.md`

**Scope:** This is Plan 1 of 3. The spec covers three subsystems, each with its own plan:

1. **Plan 1 (this plan):** the league, rosters, schedule, game engine, weekly coaching, season and postseason, saving, and all main screens. It ends with the season-complete screen.
2. **Plan 2:** recruiting (spec section 4, "Recruiting").
3. **Plan 3:** the offseason: progression, the NFL draft, the transfer portal and NIL, prestige changes, job security and firing, and starting the next season. It also needs to prune old games and departed players so multi-season saves stay under about 5 MB.

Plans 2 and 3 are written after Plan 1 is built, so they can follow the real code.

## Global Constraints

- No dependencies, frameworks or build step. Everything loads as native ES modules from the repository root.
- Engine code (`src/engine/`, `src/data/`) must never touch `document`, `window`, `localStorage` or `console`. JavaScriptCore has no `console`, and these tests run there.
- The whole game state is one JSON-serializable object. Store plain objects and arrays only, never `Map`, `Set` or class instances.
- Use real school names and conferences only. No logos or mascots. Every player is fictional and generated from the name lists.
- All randomness goes through `Rng` from `src/engine/rng.js`. Never call `Math.random()`.
- Rosters never exceed 85 players (`ROSTER_MAX`).
- Saves carry `version: 1` (`SAVE_VERSION`). Only the user's games keep full box scores, so saves stay small.
- The test command is `./test.sh [filter]`. It passes when the last line ends in `0 failed`.
- To check the screens locally, run `python3 -I -m http.server 8765 --bind 127.0.0.1` from the repository root and open http://127.0.0.1:8765/. Python's server lets the browser cache files, so after changing code do a full reload (not just a `#` route change), or the old modules keep running.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Publishing to GitHub (Task 13) happens only after the user explicitly says yes.

## File structure

| File | Responsibility |
|---|---|
| `test.sh`, `tests/harness.js`, `tests/run.js`, `tests/all.js`, `tests/tests.html` | The test runner (terminal and browser) |
| `src/engine/rng.js` | Seeded random numbers (`Rng`), `hashSeed`, `clamp` |
| `src/data/teams.js` | The 68 teams, the conferences, and conference game counts |
| `src/data/names.js` | First and last name lists, states, bowl names |
| `src/engine/players.js` | Positions, attributes, the overall formula, player generation |
| `src/engine/schedule.js` | 12-game season schedules with bye weeks and home/away balance |
| `src/engine/league.js` | `createLeague`, depth charts, starters, team overall, news |
| `src/engine/sim.js` | The play-by-play engine, play calls, AI play-calling, key moments, box scores |
| `src/engine/season.js` | Weekly advance, results, rankings, standings, conference championships, playoff, bowls |
| `src/save.js` | Saving, loading, validation, backups |
| `index.html`, `styles.css`, `src/main.js` | Page shell, styles, router, autosave |
| `src/ui/*.js` | One module per screen, plus `dom.js` helpers and `boxscore.js` |

---

### Task 1: Project setup, test runner and seeded random numbers

**Files:**
- Create: `test.sh`, `tests/harness.js`, `tests/run.js`, `tests/all.js`, `tests/tests.html`
- Create: `src/engine/rng.js`
- Test: `tests/rng.test.js`

**Interfaces:**
- Produces:
  - `test(name, fn)`, `assert(cond, msg)`, `eq(actual, expected, msg)`, `between(x, lo, hi, msg)` and `run(log, filter) → Promise<failCount>`, from `tests/harness.js`
  - `class Rng(state)`, with `.state` (a 32-bit number) and these methods: `.next()` returns a number in [0, 1); `.int(lo, hi)` is inclusive; `.chance(p)`; `.pick(arr)`; `.normal(mean, sd)`; `.weighted({key: weight}) → key`; `.shuffle(arr) → new array`
  - `hashSeed(stringOrNumber) → uint32` and `clamp(x, lo, hi)`

The project folder `~/cfb-dynasty` and its git repository already exist; the spec is committed there. Work from `~/cfb-dynasty`.

- [ ] **Step 1: Create the test runner**

```sh
#!/bin/sh
# Runs the engine tests in macOS's built-in JavaScriptCore. Usage: ./test.sh [filter]
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
cd "$(dirname "$0")" || exit 1
out=$("$JSC" -m tests/run.js -- "$@" 2>&1)
echo "$out"
echo "$out" | tail -1 | grep -q ' 0 failed'
```

```js
// file: tests/harness.js
// A tiny test runner that works in JavaScriptCore (terminal) and in the browser.
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}

export function between(x, lo, hi, msg = '') {
  if (!(x >= lo && x <= hi)) throw new Error(`${msg} expected ${lo}..${hi}, got ${x}`);
}

// Runs every registered test whose name contains `filter`. Returns the failure count.
export async function run(log, filter = '') {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    if (filter && !t.name.includes(filter)) continue;
    try {
      await t.fn();
      passed++;
      log(`PASS ${t.name}`);
    } catch (e) {
      failed++;
      log(`FAIL ${t.name}: ${e.message}`);
    }
  }
  log(`${passed} passed, ${failed} failed`);
  return failed;
}
```

```js
// file: tests/run.js
// Terminal entry point: ./test.sh [filter]
import { run } from './all.js';

const args = typeof arguments !== 'undefined' ? arguments : [];
await run((line) => print(line), args[0] || '');
```

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>CFB Dynasty tests</title>
  <style>body { font: 14px ui-monospace, monospace; background: #111; color: #ddd; padding: 16px; } .fail { color: #f77; } .pass { color: #7d7; }</style>
</head>
<body>
  <h1>Engine tests</h1>
  <pre id="out"></pre>
  <script type="module">
    import { run } from './all.js';
    const out = document.getElementById('out');
    await run((line) => {
      const span = document.createElement('span');
      span.className = line.startsWith('FAIL') ? 'fail' : line.startsWith('PASS') ? 'pass' : '';
      span.textContent = line + '\n';
      out.append(span);
    }, new URLSearchParams(location.search).get('filter') || '');
  </script>
</body>
</html>
```

Then make the script executable: `chmod +x test.sh`

- [ ] **Step 2: Write the failing test**

```js
// file: tests/rng.test.js
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
```

```js
// file: tests/all.js
import './rng.test.js';
export { run } from './harness.js';
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `./test.sh rng`
Expected: FAIL. JavaScriptCore reports that `../src/engine/rng.js` cannot be found.

- [ ] **Step 4: Write the implementation**

```js
// file: src/engine/rng.js
// Seeded random numbers (mulberry32). The whole state is one 32-bit number,
// so it can be saved in the game state and resumed later.
export class Rng {
  constructor(state) {
    this.state = state >>> 0;
  }

  next() {
    const a = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Integer from lo to hi, inclusive.
  int(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // Normally distributed number (Box-Muller).
  normal(mean, sd) {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // weights: { key: weight }. Returns one key.
  weighted(weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [key, w] of entries) {
      r -= w;
      if (r < 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// Turns any string (or number) into a 32-bit seed.
export function hashSeed(input) {
  const str = String(input);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./test.sh`
Expected: 6 lines starting with `PASS`, then `6 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add test.sh tests src/engine/rng.js
git commit -m "Add test runner and seeded random number generator"
```

### Task 2: Team and name data

**Files:**
- Create: `src/data/teams.js`
- Create: `src/data/names.js`
- Test: `tests/teams.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Produces:
  - `TEAMS`: an array of `{ id, name, short, conference, state, prestige, colors: { primary, secondary } }`
  - `CONFERENCES`: `['SEC', 'Big Ten', 'Big 12', 'ACC', 'Independent']`
  - `CONF_GAMES`: `{ SEC: 9, 'Big Ten': 9, 'Big 12': 9, ACC: 8, Independent: 0 }`
  - `FIRST_NAMES`, `LAST_NAMES`, `STATES` and `BOWL_NAMES` (20 names), from `names.js`

The ACC has 17 teams, so it plays 8 conference games; 9 each is impossible with an odd number of teams. The spec documents this.

- [ ] **Step 1: Write the failing test**

```js
// file: tests/teams.test.js
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
```

Register it in `tests/all.js`:

```js
// file: tests/all.js
import './rng.test.js';
import './teams.test.js';
export { run } from './harness.js';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test.sh teams`
Expected: FAIL. JavaScriptCore reports that `../src/data/teams.js` cannot be found, and the last line does not say `0 failed`.

- [ ] **Step 3: Write the implementation**

`src/data/teams.js`:

```js
// file: src/data/teams.js
// The 68 schools in the league. Colors are used only as interface accents.
// prestige: 1-5, seeded from program reputation.
export const CONFERENCES = ['SEC', 'Big Ten', 'Big 12', 'ACC', 'Independent'];

// [id, name, short, conference, state, prestige, primary, secondary]
const ROWS = [
  ['alabama', 'Alabama', 'BAMA', 'SEC', 'AL', 5, '#9E1B32', '#FFFFFF'],
  ['arkansas', 'Arkansas', 'ARK', 'SEC', 'AR', 2, '#9D2235', '#FFFFFF'],
  ['auburn', 'Auburn', 'AUB', 'SEC', 'AL', 3, '#0C2340', '#E87722'],
  ['florida', 'Florida', 'UF', 'SEC', 'FL', 4, '#0021A5', '#FA4616'],
  ['georgia', 'Georgia', 'UGA', 'SEC', 'GA', 5, '#BA0C2F', '#000000'],
  ['kentucky', 'Kentucky', 'UK', 'SEC', 'KY', 2, '#0033A0', '#FFFFFF'],
  ['lsu', 'LSU', 'LSU', 'SEC', 'LA', 4, '#461D7C', '#FDD023'],
  ['olemiss', 'Ole Miss', 'MISS', 'SEC', 'MS', 4, '#CE1126', '#14213D'],
  ['missst', 'Mississippi State', 'MSST', 'SEC', 'MS', 2, '#660000', '#FFFFFF'],
  ['missouri', 'Missouri', 'MIZ', 'SEC', 'MO', 3, '#F1B82D', '#000000'],
  ['oklahoma', 'Oklahoma', 'OU', 'SEC', 'OK', 4, '#841617', '#FDF9D8'],
  ['southcarolina', 'South Carolina', 'SC', 'SEC', 'SC', 3, '#73000A', '#000000'],
  ['tennessee', 'Tennessee', 'TENN', 'SEC', 'TN', 4, '#FF8200', '#FFFFFF'],
  ['texas', 'Texas', 'TEX', 'SEC', 'TX', 5, '#BF5700', '#FFFFFF'],
  ['texasam', 'Texas A&M', 'TAMU', 'SEC', 'TX', 4, '#500000', '#FFFFFF'],
  ['vanderbilt', 'Vanderbilt', 'VAN', 'SEC', 'TN', 2, '#866D4B', '#000000'],

  ['illinois', 'Illinois', 'ILL', 'Big Ten', 'IL', 3, '#E84A27', '#13294B'],
  ['indiana', 'Indiana', 'IU', 'Big Ten', 'IN', 3, '#990000', '#EEEDEB'],
  ['iowa', 'Iowa', 'IOWA', 'Big Ten', 'IA', 3, '#FFCD00', '#000000'],
  ['maryland', 'Maryland', 'MD', 'Big Ten', 'MD', 2, '#E03A3E', '#FFD520'],
  ['michigan', 'Michigan', 'MICH', 'Big Ten', 'MI', 5, '#00274C', '#FFCB05'],
  ['michiganst', 'Michigan State', 'MSU', 'Big Ten', 'MI', 3, '#18453B', '#FFFFFF'],
  ['minnesota', 'Minnesota', 'MINN', 'Big Ten', 'MN', 2, '#7A0019', '#FFCC33'],
  ['nebraska', 'Nebraska', 'NEB', 'Big Ten', 'NE', 3, '#E41C38', '#FDF2D9'],
  ['northwestern', 'Northwestern', 'NU', 'Big Ten', 'IL', 2, '#4E2A84', '#FFFFFF'],
  ['ohiostate', 'Ohio State', 'OSU', 'Big Ten', 'OH', 5, '#BB0000', '#666666'],
  ['oregon', 'Oregon', 'ORE', 'Big Ten', 'OR', 5, '#154733', '#FEE123'],
  ['pennstate', 'Penn State', 'PSU', 'Big Ten', 'PA', 4, '#041E42', '#FFFFFF'],
  ['purdue', 'Purdue', 'PUR', 'Big Ten', 'IN', 2, '#CEB888', '#000000'],
  ['rutgers', 'Rutgers', 'RUTG', 'Big Ten', 'NJ', 2, '#CC0033', '#5F6A72'],
  ['ucla', 'UCLA', 'UCLA', 'Big Ten', 'CA', 3, '#2D68C4', '#F2A900'],
  ['usc', 'USC', 'USC', 'Big Ten', 'CA', 4, '#990000', '#FFC72C'],
  ['washington', 'Washington', 'UW', 'Big Ten', 'WA', 4, '#4B2E83', '#B7A57A'],
  ['wisconsin', 'Wisconsin', 'WIS', 'Big Ten', 'WI', 3, '#C5050C', '#FFFFFF'],

  ['arizona', 'Arizona', 'ARIZ', 'Big 12', 'AZ', 2, '#CC0033', '#003366'],
  ['arizonast', 'Arizona State', 'ASU', 'Big 12', 'AZ', 3, '#8C1D40', '#FFC627'],
  ['baylor', 'Baylor', 'BAY', 'Big 12', 'TX', 3, '#154734', '#FFB81C'],
  ['byu', 'BYU', 'BYU', 'Big 12', 'UT', 3, '#002E5D', '#FFFFFF'],
  ['cincinnati', 'Cincinnati', 'CIN', 'Big 12', 'OH', 2, '#E00122', '#000000'],
  ['colorado', 'Colorado', 'COLO', 'Big 12', 'CO', 3, '#CFB87C', '#000000'],
  ['houston', 'Houston', 'HOU', 'Big 12', 'TX', 2, '#C8102E', '#FFFFFF'],
  ['iowast', 'Iowa State', 'ISU', 'Big 12', 'IA', 3, '#C8102E', '#F1BE48'],
  ['kansas', 'Kansas', 'KU', 'Big 12', 'KS', 2, '#0051BA', '#E8000D'],
  ['kansasst', 'Kansas State', 'KSU', 'Big 12', 'KS', 3, '#512888', '#FFFFFF'],
  ['oklahomast', 'Oklahoma State', 'OKST', 'Big 12', 'OK', 3, '#FF7300', '#000000'],
  ['tcu', 'TCU', 'TCU', 'Big 12', 'TX', 3, '#4D1979', '#FFFFFF'],
  ['texastech', 'Texas Tech', 'TTU', 'Big 12', 'TX', 3, '#CC0000', '#000000'],
  ['ucf', 'UCF', 'UCF', 'Big 12', 'FL', 2, '#BA9B37', '#000000'],
  ['utah', 'Utah', 'UTAH', 'Big 12', 'UT', 3, '#CC0000', '#FFFFFF'],
  ['westvirginia', 'West Virginia', 'WVU', 'Big 12', 'WV', 2, '#002855', '#EAAA00'],

  ['bostoncollege', 'Boston College', 'BC', 'ACC', 'MA', 2, '#8A100B', '#BC9B6A'],
  ['california', 'California', 'CAL', 'ACC', 'CA', 2, '#003262', '#FDB515'],
  ['clemson', 'Clemson', 'CLEM', 'ACC', 'SC', 4, '#F56600', '#522D80'],
  ['duke', 'Duke', 'DUKE', 'ACC', 'NC', 2, '#003087', '#FFFFFF'],
  ['floridast', 'Florida State', 'FSU', 'ACC', 'FL', 4, '#782F40', '#CEB888'],
  ['georgiatech', 'Georgia Tech', 'GT', 'ACC', 'GA', 2, '#B3A369', '#003057'],
  ['louisville', 'Louisville', 'LOU', 'ACC', 'KY', 3, '#AD0000', '#000000'],
  ['miami', 'Miami', 'MIA', 'ACC', 'FL', 4, '#F47321', '#005030'],
  ['ncstate', 'NC State', 'NCST', 'ACC', 'NC', 2, '#CC0000', '#FFFFFF'],
  ['northcarolina', 'North Carolina', 'UNC', 'ACC', 'NC', 3, '#7BAFD4', '#13294B'],
  ['pittsburgh', 'Pittsburgh', 'PITT', 'ACC', 'PA', 2, '#003594', '#FFB81C'],
  ['smu', 'SMU', 'SMU', 'ACC', 'TX', 3, '#C8102E', '#354CA1'],
  ['stanford', 'Stanford', 'STAN', 'ACC', 'CA', 2, '#8C1515', '#FFFFFF'],
  ['syracuse', 'Syracuse', 'SYR', 'ACC', 'NY', 2, '#F76900', '#000E54'],
  ['virginia', 'Virginia', 'UVA', 'ACC', 'VA', 2, '#232D4B', '#F84C1E'],
  ['virginiatech', 'Virginia Tech', 'VT', 'ACC', 'VA', 3, '#630031', '#CF4420'],
  ['wakeforest', 'Wake Forest', 'WAKE', 'ACC', 'NC', 2, '#9E7E38', '#000000'],

  ['notredame', 'Notre Dame', 'ND', 'Independent', 'IN', 5, '#0C2340', '#C99700'],
];

export const TEAMS = ROWS.map(([id, name, short, conference, state, prestige, primary, secondary]) => ({
  id, name, short, conference, state, prestige, colors: { primary, secondary },
}));

// Conference games per team. The ACC has 17 teams, so it plays 8 (as the real ACC does).
export const CONF_GAMES = { SEC: 9, 'Big Ten': 9, 'Big 12': 9, ACC: 8, Independent: 0 };
```

`src/data/names.js`:

```js
// file: src/data/names.js
// Fictional name parts. Combinations are random, not real players.
export const FIRST_NAMES = [
  'Aaron', 'Adrian', 'Andre', 'Austin', 'Bennett', 'Blake', 'Brandon', 'Brody', 'Caleb', 'Cam',
  'Carson', 'Chase', 'Cole', 'Colton', 'Darius', 'Davis', 'Dawson', 'Deshawn', 'Devin', 'Drew',
  'Elijah', 'Emmett', 'Ethan', 'Gavin', 'Grant', 'Hayden', 'Isaiah', 'Jace', 'Jalen', 'Jamal',
  'Jaylen', 'Jordan', 'Josiah', 'Julian', 'Kade', 'Keegan', 'Kendrick', 'Kobe', 'Landon', 'Logan',
  'Malik', 'Marcus', 'Mason', 'Micah', 'Nate', 'Nico', 'Omar', 'Owen', 'Parker', 'Quinn',
  'Reggie', 'Ryder', 'Sam', 'Silas', 'Terrell', 'Trey', 'Tyler', 'Wade', 'Xavier', 'Zion',
];

export const LAST_NAMES = [
  'Abbott', 'Alston', 'Bates', 'Beckett', 'Boone', 'Bradley', 'Briggs', 'Calloway', 'Carver', 'Chandler',
  'Coleman', 'Crawford', 'Dalton', 'Dixon', 'Drummond', 'Ellison', 'Farris', 'Fletcher', 'Gaines', 'Garrett',
  'Grayson', 'Hale', 'Harmon', 'Hawkins', 'Holloway', 'Hughes', 'Ingram', 'Jennings', 'Keller', 'Kirby',
  'Lambert', 'Langston', 'Lowery', 'Maddox', 'Marsh', 'McCall', 'Mercer', 'Monroe', 'Nash', 'Norwood',
  'Oakley', 'Owens', 'Pace', 'Pruitt', 'Quarles', 'Ramsey', 'Reeves', 'Rhodes', 'Sawyer', 'Sexton',
  'Shepherd', 'Simms', 'Stokes', 'Sutton', 'Tatum', 'Thornton', 'Tolliver', 'Underwood', 'Vance', 'Walton',
  'Whitfield', 'Wilder', 'Winslow', 'Yates', 'Ziegler', 'Booker', 'Cross', 'Fields', 'Greer', 'Hollis',
];

export const STATES = [
  'AL', 'AR', 'AZ', 'CA', 'CO', 'FL', 'GA', 'IA', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'MI', 'MN',
  'MO', 'MS', 'NC', 'NE', 'NJ', 'NY', 'OH', 'OK', 'OR', 'PA', 'SC', 'TN', 'TX', 'UT', 'VA', 'WA', 'WI', 'WV',
];

export const BOWL_NAMES = [
  'Sunshine Bowl', 'Lone Star Bowl', 'Bayou Bowl', 'Desert Bowl', 'Gulf Coast Bowl', 'Mountain Bowl',
  'Golden Gate Bowl', 'Heartland Bowl', 'Bluegrass Bowl', 'Peach State Bowl', 'Evergreen Bowl', 'Lakeshore Bowl',
  'Prairie Bowl', 'Harbor Bowl', 'Canyon Bowl', 'Pinecrest Bowl', 'Riverfront Bowl', 'Magnolia Bowl',
  'Frontier Bowl', 'Coastal Bowl',
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./test.sh teams` then `./test.sh`
Expected: every line starts with `PASS`, and the last line ends in `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/data/teams.js src/data/names.js tests/teams.test.js tests/all.js
git commit -m "Add the 68 teams and the name lists"
```

### Task 3: Player generation and the overall formula

**Files:**
- Create: `src/engine/players.js`
- Test: `tests/players.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `Rng`, `clamp` (Task 1); `FIRST_NAMES`, `LAST_NAMES`, `STATES` (Task 2)
- Produces:
  - `POSITIONS`: `['QB','RB','WR','TE','OL','DL','LB','CB','S','K','P']`
  - `ATTR_WEIGHTS[pos]`: `{ attr: weight }`
  - `STARTERS[pos]` (number of starters), `POSITION_MINIMUMS`, `ROSTER_TEMPLATE` (75 players in total), `ROSTER_MAX = 85`, `CLASS_YEARS`
  - `computeOverall(position, attrs) → 40..99`
  - `prestigeBase(prestige) → 62 + (prestige − 1) × 4`
  - `generatePlayer(rng, { id, position, target, classYear, homeState? })`, which returns `{ id, firstName, lastName, position, classYear, redshirted, homeState, attrs, overall, potential, injury, morale, nil, stats }`
  - `playerName(p)`, which returns `"J. Ramsey"`

- [ ] **Step 1: Write the failing test**

```js
// file: tests/players.test.js
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
```

Register it in `tests/all.js`:

```js
// file: tests/all.js
import './rng.test.js';
import './teams.test.js';
import './players.test.js';
export { run } from './harness.js';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test.sh players`
Expected: FAIL. JavaScriptCore reports that `../src/engine/players.js` cannot be found, and the last line does not say `0 failed`.

- [ ] **Step 3: Write the implementation**

`src/engine/players.js`:

```js
// file: src/engine/players.js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./test.sh players` then `./test.sh`
Expected: every line starts with `PASS`, and the last line ends in `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/players.js tests/players.test.js tests/all.js
git commit -m "Add player generation"
```

### Task 4: Season schedule

**Files:**
- Create: `src/engine/schedule.js`
- Test: `tests/schedule.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `Rng` (Task 1); `CONF_GAMES` and `TEAMS` (Task 2)
- Produces: `generateSchedule(state, rng)`. It needs `state.teams` (keyed by id, each with a `conference`) and `state.year`. It sets:
  - `state.games`: an array of `{ id: 'g2026-N', week, home, away, neutral: false, kind: 'regular', conference: bool, label: '', result: null }`, sorted by week
  - `state.regularWeeks`: 13–16 in principle, 14–15 in practice

How the schedule is built:
1. **Conference games** come from a circulant graph. Teams are shuffled into a circle, and each plays the teams 1–4 places away in both directions. If an odd number of games is needed (9), each also plays the team directly across the circle. This guarantees exactly `CONF_GAMES` opponents each.
2. **Non-conference games** come from a randomized greedy matching between teams in different conferences, with retries.
3. **Weeks** are assigned greedily, non-conference games first, using the earliest week both teams have free. It tries 13 weeks, then 14, 15 and 16.
4. **Home and away** are evened out by a final pass. It flips a game whenever the home team has at least 2 more home games than the away team, which always moves both teams toward balance.

The prototype was checked across 200 seeds. Every team had 5–7 home games, and seasons were 14 weeks (140 seeds) or 15 weeks (60 seeds).

- [ ] **Step 1: Write the failing test**

```js
// file: tests/schedule.test.js
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
```

Register it in `tests/all.js`:

```js
// file: tests/all.js
import './rng.test.js';
import './teams.test.js';
import './players.test.js';
import './schedule.test.js';
export { run } from './harness.js';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test.sh schedule`
Expected: FAIL. JavaScriptCore reports that `../src/engine/schedule.js` cannot be found, and the last line does not say `0 failed`.

- [ ] **Step 3: Write the implementation**

`src/engine/schedule.js`:

```js
// file: src/engine/schedule.js
import { CONF_GAMES } from '../data/teams.js';

// Fills state.games with a 12-game regular season for every team and sets state.regularWeeks.
export function generateSchedule(state, rng) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const pairs = [...conferencePairs(state, rng), ...(nonConferencePairs(state, rng) || [])];
    if (pairs.length * 2 !== Object.keys(state.teams).length * 12) continue;
    const weeks = assignWeeks(state, pairs, rng);
    if (!weeks) continue;
    state.games = weeks.games;
    state.regularWeeks = weeks.count;
    return;
  }
  throw new Error('Could not build a schedule');
}

// Conference games: a circulant graph gives every team exactly CONF_GAMES opponents.
function conferencePairs(state, rng) {
  const byConf = {};
  for (const t of Object.values(state.teams)) (byConf[t.conference] ||= []).push(t.id);
  const pairs = [];
  for (const [conf, ids] of Object.entries(byConf)) {
    const k = CONF_GAMES[conf];
    if (!k) continue;
    const order = rng.shuffle(ids);
    const n = order.length;
    const seen = new Set();
    const offsets = [];
    for (let d = 1; d <= Math.floor(k / 2); d++) offsets.push(d);
    if (k % 2 === 1) offsets.push(n / 2);
    for (let i = 0; i < n; i++) {
      for (const d of offsets) {
        const j = (i + d) % n;
        const key = [order[i], order[j]].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([order[i], order[j], true]);
      }
    }
  }
  return pairs;
}

// Non-conference games: random matching between teams in different conferences.
function nonConferencePairs(state, rng) {
  const teams = Object.values(state.teams);
  for (let attempt = 0; attempt < 200; attempt++) {
    const need = {};
    for (const t of teams) need[t.id] = 12 - CONF_GAMES[t.conference];
    const played = new Set();
    const pairs = [];
    let ok = true;
    while (ok) {
      const open = teams.filter((t) => need[t.id] > 0);
      if (open.length === 0) break;
      const maxNeed = Math.max(...open.map((t) => need[t.id]));
      const a = rng.pick(open.filter((t) => need[t.id] === maxNeed));
      const partners = open.filter(
        (b) => b.id !== a.id && b.conference !== a.conference && !played.has([a.id, b.id].sort().join('|')),
      );
      if (partners.length === 0) {
        ok = false;
        break;
      }
      const b = rng.pick(partners);
      played.add([a.id, b.id].sort().join('|'));
      need[a.id]--;
      need[b.id]--;
      pairs.push([a.id, b.id, false]);
    }
    if (ok) return pairs;
  }
  return null;
}

// Puts each game in a week where neither team already plays. Non-conference games go first,
// so they land early in the season. Tries 13 weeks, then 14, 15, 16.
function assignWeeks(state, pairs, rng) {
  for (const count of [13, 14, 15, 16]) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const order = [...rng.shuffle(pairs.filter((p) => !p[2])), ...rng.shuffle(pairs.filter((p) => p[2]))];
      const busy = {};
      const homeCount = {};
      const games = [];
      let ok = true;
      for (const [a, b, conf] of order) {
        busy[a] ||= new Set();
        busy[b] ||= new Set();
        let week = 0;
        for (let w = 1; w <= count; w++) {
          if (!busy[a].has(w) && !busy[b].has(w)) {
            week = w;
            break;
          }
        }
        if (!week) {
          ok = false;
          break;
        }
        busy[a].add(week);
        busy[b].add(week);
        const ha = homeCount[a] || 0;
        const hb = homeCount[b] || 0;
        const aHome = ha < hb || (ha === hb && rng.chance(0.5));
        const home = aHome ? a : b;
        const away = aHome ? b : a;
        homeCount[home] = (homeCount[home] || 0) + 1;
        games.push({ id: '', week, home, away, neutral: false, kind: 'regular', conference: conf, label: '', result: null });
      }
      if (ok) {
        balanceHomeAway(games);
        games.sort((x, y) => x.week - y.week);
        games.forEach((g, i) => (g.id = `g${state.year}-${i + 1}`));
        return { games, count };
      }
    }
  }
  return null;
}

// Flips home and away to even out home games (6 for most teams).
// A flip only happens when the home team has at least 2 more home games than its opponent,
// so every flip moves both teams toward balance and the loop always settles.
function balanceHomeAway(games) {
  const home = {};
  for (const g of games) {
    home[g.home] = (home[g.home] || 0) + 1;
    home[g.away] ||= 0;
  }
  for (let pass = 0; pass < 100; pass++) {
    let changed = false;
    for (const g of games) {
      if (home[g.home] >= home[g.away] + 2) {
        home[g.home]--;
        home[g.away]++;
        [g.home, g.away] = [g.away, g.home];
        changed = true;
      }
    }
    if (!changed) break;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./test.sh schedule` then `./test.sh`
Expected: every line starts with `PASS`, and the last line ends in `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/schedule.js tests/schedule.test.js tests/all.js
git commit -m "Add season schedule generation"
```

### Task 5: New league, depth charts and starters

**Files:**
- Create: `src/engine/league.js`
- Test: `tests/league.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `Rng`, `hashSeed` (Task 1); `TEAMS` (Task 2); everything in `players.js` (Task 3); `generateSchedule` (Task 4)
- Produces:
  - `SAVE_VERSION = 1`, `START_YEAR = 2026`, and `DEFAULT_PLAN = { offense: 'Balanced', defense: 'Balanced', tempo: 'Normal' }`
  - `createLeague({ seed, coachName, teamId }) → state`. It throws if `teamId` is unknown. The state shape is:
    ```
    { version, seed, rngState, year, week: 1, phase: 'regular',
      coach: { name, teamId, jobSecurity: 60, record: {w,l}, history: [] },
      teams: { [id]: { ...team, roster: [playerId], depth: { [pos]: [playerId] }, plan, record: { w, l, cw, cl, pf, pa } } },
      players: { [id]: player & { teamId } }, nextPlayerId, games, regularWeeks, rankings: [teamId x68],
      playoff: null, news: [{ year, week, text }], liveGame: null }
    ```
  - `autoDepth(state, teamId)`
  - `getStarters(state, teamId, position, count = STARTERS[position]) → [player]`, which returns healthy players only, in depth order
  - `teamOverall(state, teamId) → number`
  - `preseasonRankings(state) → [teamId]`
  - `addNews(state, text)`, which keeps at most 200 items, newest first

- [ ] **Step 1: Write the failing test**

```js
// file: tests/league.test.js
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
```

Register it in `tests/all.js`:

```js
// file: tests/all.js
import './rng.test.js';
import './teams.test.js';
import './players.test.js';
import './schedule.test.js';
import './league.test.js';
export { run } from './harness.js';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test.sh league`
Expected: FAIL. JavaScriptCore reports that `../src/engine/league.js` cannot be found, and the last line does not say `0 failed`.

- [ ] **Step 3: Write the implementation**

`src/engine/league.js`:

```js
// file: src/engine/league.js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./test.sh league` then `./test.sh`
Expected: every line starts with `PASS`, and the last line ends in `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/league.js tests/league.test.js tests/all.js
git commit -m "Add league creation and depth charts"
```

### Task 6: Play-by-play game engine

**Files:**
- Create: `src/engine/sim.js`
- Test: `tests/sim.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `clamp` (Task 1); `getStarters` (Task 5); `playerName` (Task 3)
- Produces:
  - **Call lists:** `OFFENSE_CALLS`, `KICK_CALLS`, `PAT_CALLS`, `DEFENSE_CALLS`, `OFFENSE_STYLES`, `DEFENSE_STYLES`, `TEMPOS`, `CALL_MATCHUP`, `HOME_EDGE = 2.5`, `RATING_SCALE = 0.3`
  - `callModifier(offenseCall, defenseCall) → −0.15..0.15` and `isRun(call)`
  - `teamRatings(state, teamId) → { qbAcc, qbArm, qbDec, passBlock, runBlock, rb, receivers, passRush, runStop, coverage, kPow, kAcc, pPow }`
  - `createGame(state, { id, home, away, neutral? }) → g`, a JSON-serializable live game. Its fields include `home, away, score, quarter, clock, possession, ball` (yards from the offense's own goal line, 1–99), `down, toGo, pat, ot, over, log, stats, playerStats, injuries, out` and `names`.
  - `situation(g)`, `isKeyMoment(g, userTeamId) → bool` and `offenseOptions(g) → [call]`
  - `aiOffenseCall(g, rng)` and `aiDefenseCall(g, rng)`
  - `runPlay(g, rng, { offense?, defense? }) → logEntry`. Missing calls are chosen by the AI. A log entry looks like `{ q, clock, team, short, text, score, offenseCall?, defenseCall?, yards?, td?, scoring?, turnover?, turnoverOnDowns?, fourthAttempt?, marker?, injury?, pat?, twoPoint?, fieldGoal?, missedFg? }`.
  - `simulateRest(g, rng)`, `simulateGame(state, game, rng) → result` and `finalizeGame(g) → result`
  - `pickHighlights(log) → up to 8 entries`
  - A result is `{ homeScore, awayScore, quarters: { [id]: [q1..q4] }, overtime, teamStats, playerStats, highlights, injuries: [{ id, weeks }], names }`

**Balance:** player ratings are compressed toward 70 (`RATING_SCALE = 0.3`) before plays are resolved. Without this, a 5-point edge wins 92% of games. Prototype measurements:

| Matchup | Result |
|---|---|
| 70 vs 70 | 22.6 points per team, 396 yards per team, 2.7 turnovers per game, home team wins 56.7% |
| 80 vs 65 (neutral site) | Better team wins 87.5% |
| 75 vs 70 (neutral site) | Better team wins 66.5% |

All of these are inside the spec's targets. If you change any constants, rerun `./test.sh sim`.

**Clock:** a normal-tempo snap takes 32 seconds and a Hurry-Up snap 24, giving about 71 plays per team. A trailing team in the 4th quarter takes at most 16 seconds per snap.

- [ ] **Step 1: Write the failing test**

```js
// file: tests/sim.test.js
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
```

Register it in `tests/all.js`:

```js
// file: tests/all.js
import './rng.test.js';
import './teams.test.js';
import './players.test.js';
import './schedule.test.js';
import './league.test.js';
import './sim.test.js';
export { run } from './harness.js';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test.sh sim`
Expected: FAIL. JavaScriptCore reports that `../src/engine/sim.js` cannot be found, and the last line does not say `0 failed`.

- [ ] **Step 3: Write the implementation**

`src/engine/sim.js`:

```js
// file: src/engine/sim.js
import { clamp } from './rng.js';
import { getStarters } from './league.js';
import { playerName } from './players.js';

// ---------- Play calls ----------

export const OFFENSE_CALLS = ['Inside Run', 'Outside Run', 'Quick Pass', 'Deep Pass', 'Play Action', 'Screen', 'QB Sneak'];
export const KICK_CALLS = ['Punt', 'Field Goal'];
export const PAT_CALLS = ['Extra Point'];
export const DEFENSE_CALLS = ['Base', 'Run Stop', 'Blitz', 'Cover 2', 'Man Press', 'Prevent'];

const RUNS = new Set(['Inside Run', 'Outside Run', 'QB Sneak']);
export const isRun = (call) => RUNS.has(call);

// Offense call vs defense call: change in success odds, from -0.15 to +0.15.
// Positive favors the offense. Missing pairs are 0.
export const CALL_MATCHUP = {
  'Inside Run': { 'Run Stop': -0.12, Blitz: 0.03, 'Cover 2': 0.06, 'Man Press': 0.04, Prevent: 0.12 },
  'Outside Run': { 'Run Stop': -0.08, Blitz: -0.06, 'Cover 2': 0.04, 'Man Press': 0.07, Prevent: 0.1 },
  'QB Sneak': { 'Run Stop': -0.1, Blitz: 0.02, Prevent: 0.1 },
  'Quick Pass': { 'Run Stop': 0.06, Blitz: 0.08, 'Cover 2': -0.04, 'Man Press': -0.1, Prevent: 0.06 },
  'Deep Pass': { 'Run Stop': 0.1, Blitz: 0.06, 'Cover 2': -0.12, 'Man Press': 0.04, Prevent: -0.15 },
  'Play Action': { 'Run Stop': 0.13, Blitz: -0.08, 'Cover 2': -0.04, Prevent: -0.06 },
  Screen: { 'Run Stop': -0.04, Blitz: 0.14, 'Cover 2': 0.03, 'Man Press': 0.05, Prevent: 0.04 },
};

export function callModifier(offenseCall, defenseCall) {
  return (CALL_MATCHUP[offenseCall] && CALL_MATCHUP[offenseCall][defenseCall]) || 0;
}

// ---------- Game plans ----------

export const OFFENSE_STYLES = ['Balanced', 'Run Heavy', 'Pass Heavy', 'Air Raid'];
export const DEFENSE_STYLES = ['Balanced', 'Stop the Run', 'Aggressive Blitz', "Bend Don't Break"];
export const TEMPOS = ['Normal', 'Hurry-Up'];

const RUN_SHARE = { Balanced: 0.5, 'Run Heavy': 0.62, 'Pass Heavy': 0.38, 'Air Raid': 0.26 };

// Small bonus (about +3%) for the plays a style favors.
function styleBonus(plan, offenseCall) {
  const run = isRun(offenseCall);
  if (plan.offense === 'Run Heavy' && run) return 0.03;
  if (plan.offense === 'Pass Heavy' && !run) return 0.03;
  if (plan.offense === 'Air Raid' && (offenseCall === 'Deep Pass' || offenseCall === 'Quick Pass')) return 0.03;
  return 0;
}

function defStyleBonus(plan, offenseCall) {
  const run = isRun(offenseCall);
  if (plan.defense === 'Stop the Run' && run) return 0.03;
  if (plan.defense === "Bend Don't Break" && offenseCall === 'Deep Pass') return 0.03;
  return 0;
}

// ---------- Team ratings ----------

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 50);

export function teamRatings(state, teamId) {
  const s = (pos, n) => getStarters(state, teamId, pos, n);
  const qb = s('QB')[0];
  const ol = s('OL');
  const te = s('TE')[0];
  const wr = s('WR');
  const dl = s('DL');
  const lb = s('LB');
  const db = [...s('CB'), ...s('S')];
  const k = s('K')[0];
  const p = s('P')[0];
  const a = (pl, key) => (pl ? pl.attrs[key] : 50);
  return {
    qbAcc: a(qb, 'accuracy'),
    qbArm: a(qb, 'arm'),
    qbDec: a(qb, 'decisions'),
    passBlock: avg(ol.map((x) => x.attrs.passBlock)),
    runBlock: avg(ol.map((x) => x.attrs.runBlock)) * 0.85 + a(te, 'blocking') * 0.15,
    rb: (s('RB')[0] || { overall: 50 }).overall,
    receivers: avg(wr.map((x) => x.overall)) * 0.8 + (te ? te.overall : 50) * 0.2,
    passRush: avg(dl.map((x) => x.attrs.passRush)) * 0.75 + avg(lb.map((x) => x.attrs.passRush)) * 0.25,
    runStop: avg([...dl, ...lb].map((x) => x.attrs.runStop)),
    coverage: avg(db.map((x) => x.attrs.coverage)) * 0.85 + avg(lb.map((x) => x.attrs.coverage)) * 0.15,
    kPow: a(k, 'power'),
    kAcc: a(k, 'accuracy'),
    pPow: a(p, 'power'),
  };
}

// ---------- Game setup ----------

const QUARTER_SECONDS = 900;
export const HOME_EDGE = 2.5;
// Rating gaps are compressed toward 70 so talent matters without deciding every game.
export const RATING_SCALE = 0.3;

// Players who touch the ball, chosen fresh each play (skipping anyone hurt this game).
function personnel(state, teamId) {
  const s = (pos, n) => getStarters(state, teamId, pos, n).map((p) => p.id);
  return {
    QB: s('QB', 2), RB: s('RB', 2), WR: s('WR', 4), TE: s('TE', 2),
    DL: s('DL', 5), LB: s('LB', 3), DB: [...s('CB', 3), ...s('S', 2)], K: s('K', 1), P: s('P', 1),
  };
}

export function createGame(state, game) {
  const home = game.home;
  const away = game.away;
  const g = {
    gameId: game.id,
    home,
    away,
    neutral: !!game.neutral,
    ratings: { [home]: teamRatings(state, home), [away]: teamRatings(state, away) },
    plans: { [home]: { ...state.teams[home].plan }, [away]: { ...state.teams[away].plan } },
    people: { [home]: personnel(state, home), [away]: personnel(state, away) },
    names: {},
    short: { [home]: state.teams[home].short, [away]: state.teams[away].short },
    score: { [home]: 0, [away]: 0 },
    quarters: { [home]: [0, 0, 0, 0], [away]: [0, 0, 0, 0] },
    quarter: 1,
    clock: QUARTER_SECONDS,
    possession: away,
    openingReceiver: away,
    ball: 25,
    down: 1,
    toGo: 10,
    pat: false,
    ot: null,
    over: false,
    log: [],
    stats: { [home]: emptyTeamStats(), [away]: emptyTeamStats() },
    playerStats: {},
    injuries: [],
    out: [],
  };
  for (const side of [home, away]) {
    for (const ids of Object.values(g.people[side])) for (const id of ids) g.names[id] = playerName(state.players[id]);
  }
  return g;
}

function emptyTeamStats() {
  return { plays: 0, yards: 0, passYards: 0, rushYards: 0, firstDowns: 0, turnovers: 0, thirdAtt: 0, thirdConv: 0, top: 0, sacks: 0 };
}

const other = (g, team) => (team === g.home ? g.away : g.home);

function edge(g, team) {
  return !g.neutral && team === g.home ? HOME_EDGE : 0;
}

// ---------- Situation helpers ----------

export function situation(g) {
  const off = g.possession;
  const def = other(g, off);
  return {
    offense: off,
    defense: def,
    quarter: g.quarter,
    clock: g.clock,
    down: g.down,
    toGo: g.toGo,
    ball: g.ball,
    pat: g.pat,
    ot: !!g.ot,
    twoPointOnly: !!(g.ot && g.ot.period >= 3),
    margin: g.score[off] - g.score[def],
  };
}

// True when the user's team should pick the call for the next snap.
export function isKeyMoment(g, userTeam) {
  if (g.over) return false;
  if (g.possession !== userTeam && other(g, g.possession) !== userTeam) return false;
  const s = situation(g);
  if (s.pat) return true;
  if (s.down === 4) return true;
  if (s.ball >= 80) return true;
  if (s.down === 3 && s.toGo >= 7) return true;
  const late = s.ot || ((s.quarter === 2 || s.quarter === 4) && s.clock <= 120);
  if (late && Math.abs(s.margin) <= 8) return true;
  return false;
}

// The calls allowed for the offense on the next snap.
export function offenseOptions(g) {
  if (g.pat) return g.ot && g.ot.period >= 3 ? OFFENSE_CALLS.filter((c) => c !== 'QB Sneak') : [...PAT_CALLS, ...OFFENSE_CALLS.filter((c) => c !== 'QB Sneak')];
  if (g.down === 4) return g.ot ? [...OFFENSE_CALLS, 'Field Goal'] : [...OFFENSE_CALLS, ...KICK_CALLS];
  return OFFENSE_CALLS;
}

// ---------- AI play-calling ----------

export function aiOffenseCall(g, rng) {
  const s = situation(g);
  const plan = g.plans[s.offense];
  const r = g.ratings[s.offense];
  const fgDistance = 100 - s.ball + 17;
  const fgRange = fgDistance <= 45 + (r.kPow - 70) * 0.3;

  if (s.pat) {
    const after = s.margin; // margin already includes the touchdown
    const goForTwo = s.twoPointOnly || (s.quarter >= 4 && [-2, -5, -10, 1].includes(after));
    if (!goForTwo) return 'Extra Point';
    return rng.pick(['Inside Run', 'Quick Pass', 'Play Action', 'Outside Run']);
  }

  if (s.down === 4) {
    const desperate = s.quarter === 4 && s.margin < 0 && s.clock < 300;
    if (s.ot) {
      if (fgRange && (s.toGo > 3 || s.margin >= 0)) return 'Field Goal';
    } else if (!desperate) {
      if (fgRange && s.toGo > 2) return 'Field Goal';
      const goShort = s.toGo <= 2 && s.ball >= 45;
      const goMid = s.toGo <= 1 && s.ball >= 30;
      if (!goShort && !goMid) return fgRange ? 'Field Goal' : 'Punt';
    }
  }

  let runShare = RUN_SHARE[plan.offense] ?? 0.5;
  if (s.toGo <= 2) runShare += 0.25;
  if (s.down === 3 && s.toGo >= 7) runShare -= 0.35;
  if (s.quarter === 4 && s.margin < 0 && s.clock < 420) runShare -= 0.3;
  if (s.quarter === 4 && s.margin > 0 && s.clock < 420) runShare += 0.3;
  runShare = clamp(runShare, 0.05, 0.9);

  if (rng.chance(runShare)) {
    if (s.toGo <= 1 && rng.chance(0.35)) return 'QB Sneak';
    return rng.chance(0.55) ? 'Inside Run' : 'Outside Run';
  }
  const deep = plan.offense === 'Air Raid' ? 0.28 : 0.17;
  return rng.weighted({
    'Quick Pass': s.toGo <= 5 ? 0.45 : 0.32,
    'Deep Pass': s.toGo >= 10 ? deep + 0.08 : deep,
    'Play Action': s.down === 1 ? 0.25 : 0.15,
    Screen: 0.14,
  });
}

export function aiDefenseCall(g, rng) {
  const s = situation(g);
  const plan = g.plans[s.defense];
  const w = { Base: 0.3, 'Run Stop': 0.17, Blitz: 0.15, 'Cover 2': 0.18, 'Man Press': 0.14, Prevent: 0.03 };
  if (plan.defense === 'Stop the Run') w['Run Stop'] += 0.15;
  if (plan.defense === 'Aggressive Blitz') w.Blitz += 0.18;
  if (plan.defense === "Bend Don't Break") {
    w['Cover 2'] += 0.12;
    w.Prevent += 0.05;
  }
  if (s.toGo <= 2) w['Run Stop'] += 0.3;
  if (s.toGo >= 8) {
    w['Cover 2'] += 0.15;
    w.Blitz += 0.08;
  }
  if (s.quarter === 4 && s.margin < 0 && s.clock < 180) w.Prevent += 0.4; // defense leads late
  return rng.weighted(w);
}

// ---------- Running one snap ----------

function pickId(rng, ids, g) {
  const healthy = ids.filter((id) => !g.out.includes(id));
  return healthy.length ? healthy[0] : ids[0];
}

function pickRusher(g, rng, team, call) {
  const p = g.people[team];
  if (call === 'QB Sneak') return pickId(rng, p.QB, g);
  const rbs = p.RB.filter((id) => !g.out.includes(id));
  if (rbs.length > 1 && rng.chance(0.3)) return rbs[1];
  return rbs[0] || p.RB[0];
}

function pickTarget(g, rng, team, call) {
  const p = g.people[team];
  const ok = (ids) => ids.filter((id) => !g.out.includes(id));
  const wr = ok(p.WR);
  const te = ok(p.TE);
  const rb = ok(p.RB);
  if (call === 'Screen' && rb.length && rng.chance(0.6)) return rb[0];
  const pool = [];
  wr.slice(0, 3).forEach((id, i) => pool.push([id, [0.3, 0.24, 0.16][i]]));
  if (wr[3]) pool.push([wr[3], 0.05]);
  if (te[0]) pool.push([te[0], call === 'Deep Pass' ? 0.08 : 0.15]);
  if (rb[0]) pool.push([rb[0], call === 'Deep Pass' ? 0.02 : 0.1]);
  const weights = {};
  for (const [id, w] of pool) weights[id] = w;
  return rng.weighted(weights);
}

function stat(g, id, key, n = 1) {
  if (!id) return;
  g.playerStats[id] ||= {};
  g.playerStats[id][key] = (g.playerStats[id][key] || 0) + n;
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function addLog(g, team, text, tags = {}) {
  const entry = { q: g.ot ? 'OT' : g.quarter, clock: g.ot ? '' : fmtClock(g.clock), team, short: g.short[team], text, score: { ...g.score }, ...tags };
  g.log.push(entry);
  return entry;
}

function maybeInjure(g, rng, ids, rate) {
  for (const id of ids) {
    if (id && !g.out.includes(id) && rng.chance(rate)) {
      const weeks = rng.pick([1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6]);
      g.out.push(id);
      g.injuries.push({ id, weeks });
      return { id, weeks };
    }
  }
  return null;
}

// Runs one snap. calls = { offense?, defense? }; missing calls are chosen by the AI.
// Returns the log entry for the play.
export function runPlay(g, rng, calls = {}) {
  if (g.over) return null;
  const off = g.possession;
  const def = other(g, off);
  const offenseCall = calls.offense || aiOffenseCall(g, rng);
  const defenseCall = calls.defense || aiDefenseCall(g, rng);
  if (g.pat) return runPat(g, rng, offenseCall, defenseCall);
  if (offenseCall === 'Punt') return runPunt(g, rng);
  if (offenseCall === 'Field Goal') return runFieldGoal(g, rng);
  return runScrimmage(g, rng, offenseCall, defenseCall);
}

function ratingsFor(g, off, def) {
  const o = { ...g.ratings[off] };
  const d = { ...g.ratings[def] };
  const eo = edge(g, off);
  const ed = edge(g, def);
  for (const k of Object.keys(o)) o[k] = 70 + (o[k] + eo - 70) * RATING_SCALE;
  for (const k of Object.keys(d)) d[k] = 70 + (d[k] + ed - 70) * RATING_SCALE;
  return { o, d };
}

// Returns { yards, kind, text, ids } for a run or pass, without moving the ball.
function resolveScrimmage(g, rng, offenseCall, defenseCall, goalLine) {
  const off = g.possession;
  const def = other(g, off);
  const { o, d } = ratingsFor(g, off, def);
  const mod = callModifier(offenseCall, defenseCall) + styleBonus(g.plans[off], offenseCall) - defStyleBonus(g.plans[def], offenseCall);
  const hurry = g.plans[off].tempo === 'Hurry-Up';
  const qb = pickId(rng, g.people[off].QB, g);

  if (isRun(offenseCall)) {
    const carrier = pickRusher(g, rng, off, offenseCall);
    const runEdge = (o.runBlock * 0.5 + o.rb * 0.5) - d.runStop;
    let yards;
    if (offenseCall === 'QB Sneak') {
      yards = Math.round(rng.normal(1.6 + runEdge * 0.03 + mod * 8, 1.4));
    } else {
      const outside = offenseCall === 'Outside Run';
      const mean = (outside ? 4.4 : 4.3) + runEdge * 0.12 + mod * 20;
      yards = Math.round(rng.normal(mean, outside ? 5.5 : 4));
      if (rng.chance(clamp(0.035 + runEdge * 0.002 + mod * 0.15, 0.005, 0.12))) yards += rng.int(10, 55);
    }
    yards = Math.max(yards, -5);
    const fumble = rng.chance(hurry ? 0.016 : 0.012);
    return { kind: fumble ? 'fumble' : 'run', yards, carrier, qb, mod };
  }

  // Pass plays
  const base = {
    'Quick Pass': { sack: 0.035, comp: 0.69, int: 0.016, mean: 6.5, sd: 3.5 },
    'Deep Pass': { sack: 0.085, comp: 0.38, int: 0.045, mean: 28, sd: 9 },
    'Play Action': { sack: 0.075, comp: 0.56, int: 0.028, mean: 14, sd: 6 },
    Screen: { sack: 0.012, comp: 0.8, int: 0.01, mean: 4.5, sd: 4.5 },
  }[offenseCall];
  const target = pickTarget(g, rng, off, offenseCall);
  let sackP = base.sack + (d.passRush - o.passBlock) * 0.003;
  if (defenseCall === 'Blitz') sackP *= offenseCall === 'Screen' ? 0.5 : 1.8;
  if (defenseCall === 'Prevent') sackP *= 0.5;
  if (rng.chance(clamp(sackP, 0.005, 0.25))) {
    const rusher = rng.pick(g.people[def].DL.concat(g.people[def].LB));
    return { kind: 'sack', yards: -rng.int(3, 10), qb, rusher, mod };
  }
  let intP = base.int + (d.coverage - o.qbDec) * 0.0009 - mod * 0.05;
  if (rng.chance(clamp(intP, 0.003, 0.09))) {
    const defender = rng.pick(g.people[def].DB);
    return { kind: 'int', yards: Math.max(0, Math.round(rng.normal(base.mean * 0.6, 4))), qb, target, defender, mod };
  }
  const passEdge = (o.receivers - d.coverage) * 0.006 + (o.qbAcc - 72) * 0.004;
  const compP = clamp(base.comp + passEdge + mod, 0.15, 0.92);
  if (!rng.chance(compP)) return { kind: 'incomplete', yards: 0, qb, target, mod };
  let yards = Math.round(rng.normal(base.mean + (o.receivers - d.coverage) * 0.1 + mod * 10, base.sd));
  if (offenseCall !== 'Deep Pass' && rng.chance(0.06 + mod * 0.2)) yards += rng.int(8, 45);
  if (offenseCall === 'Deep Pass') yards = Math.max(yards, 12);
  yards = Math.max(yards, -2);
  const fumble = rng.chance(0.006);
  return { kind: fumble ? 'fumble' : 'complete', yards, qb, target, mod };
}

function describe(g, r, offenseCall, gained) {
  const n = (id) => g.names[id] || 'Player';
  const y = (x) => `${x} yard${Math.abs(x) === 1 ? '' : 's'}`;
  switch (r.kind) {
    case 'run':
      return `${n(r.carrier)} ${offenseCall === 'QB Sneak' ? 'sneaks' : offenseCall === 'Outside Run' ? 'runs outside' : 'runs inside'} for ${y(gained)}`;
    case 'complete':
      return `${n(r.qb)} ${offenseCall === 'Deep Pass' ? 'deep' : offenseCall === 'Screen' ? 'screen' : offenseCall === 'Play Action' ? 'play-action' : 'quick'} pass to ${n(r.target)} for ${y(gained)}`;
    case 'incomplete':
      return `${n(r.qb)} pass intended for ${n(r.target)} is incomplete`;
    case 'sack':
      return `${n(r.qb)} sacked by ${n(r.rusher)} for a loss of ${Math.abs(gained)}`;
    case 'int':
      return `${n(r.qb)} pass INTERCEPTED by ${n(r.defender)}`;
    case 'fumble':
      return `${n(r.carrier || r.target)} FUMBLES, recovered by the defense`;
    default:
      return 'Play';
  }
}

function runScrimmage(g, rng, offenseCall, defenseCall) {
  const off = g.possession;
  const def = other(g, off);
  const st = g.stats[off];
  const r = resolveScrimmage(g, rng, offenseCall, defenseCall);
  const startDown = g.down;
  const fourthAttempt = startDown === 4;
  const thirdDown = startDown === 3;
  const toEndZone = 100 - g.ball;
  let gained = Math.min(r.yards, toEndZone);
  if (g.ball + gained <= 0) gained = -g.ball;

  st.plays++;
  if (thirdDown) st.thirdAtt++;

  // Clock
  const hurry = g.plans[off].tempo === 'Hurry-Up';
  let seconds;
  if (r.kind === 'incomplete') seconds = 6;
  else if (r.kind === 'int' || r.kind === 'fumble') seconds = 8;
  else seconds = hurry ? 24 : 32;
  if (g.quarter === 4 && g.score[off] < g.score[def] && r.kind !== 'incomplete') seconds = Math.min(seconds, 16);
  const tags = { offenseCall, defenseCall, fourthAttempt };

  // Stats for the play
  if (r.kind === 'run' || (r.kind === 'fumble' && r.carrier)) {
    stat(g, r.carrier, 'rushAtt');
    stat(g, r.carrier, 'rushYds', gained);
    st.rushYards += gained;
    st.yards += gained;
  } else if (r.kind === 'complete' || (r.kind === 'fumble' && r.target)) {
    stat(g, r.qb, 'passAtt');
    stat(g, r.qb, 'passComp');
    stat(g, r.qb, 'passYds', gained);
    stat(g, r.target, 'rec');
    stat(g, r.target, 'recYds', gained);
    st.passYards += gained;
    st.yards += gained;
  } else if (r.kind === 'incomplete') {
    stat(g, r.qb, 'passAtt');
  } else if (r.kind === 'sack') {
    stat(g, r.rusher, 'sacks');
    st.passYards += gained;
    st.yards += gained;
    g.stats[def].sacks++;
  } else if (r.kind === 'int') {
    stat(g, r.qb, 'passAtt');
    stat(g, r.qb, 'intThrown');
    stat(g, r.defender, 'defInt');
  }

  const injured = maybeInjure(g, rng, [r.carrier, r.target, r.qb].filter(Boolean), 0.003);
  tickClock(g, seconds, off);

  // Turnovers
  if (r.kind === 'int' || r.kind === 'fumble') {
    st.turnovers++;
    const spot = r.kind === 'int' ? clamp(g.ball + Math.max(8, Math.round(rng.normal(14, 6))), 1, 99) : clamp(g.ball + gained, 1, 99);
    const entry = addLog(g, off, describe(g, r, offenseCall, gained), { ...tags, turnover: true, yards: gained });
    changePossession(g, 100 - spot);
    if (injured) injuryLog(g, off, injured);
    endOfQuarterCheck(g);
    return entry;
  }

  // Safety
  if (g.ball + gained <= 0) {
    g.score[def] += 2;
    addQuarterPoints(g, def, 2);
    const entry = addLog(g, off, `${describe(g, r, offenseCall, gained)} — SAFETY`, { ...tags, scoring: true, yards: gained });
    kickoff(g, off, 20);
    endOfQuarterCheck(g);
    return entry;
  }

  // Touchdown
  if (g.ball + gained >= 100) {
    if (r.kind === 'run') stat(g, r.carrier, 'rushTD');
    else {
      stat(g, r.qb, 'passTD');
      stat(g, r.target, 'recTD');
    }
    g.score[off] += 6;
    addQuarterPoints(g, off, 6);
    st.firstDowns++;
    if (thirdDown) st.thirdConv++;
    const entry = addLog(g, off, `${describe(g, r, offenseCall, gained)}, TOUCHDOWN`, { ...tags, scoring: true, td: true, yards: gained });
    g.pat = true;
    g.ball = 97;
    if (injured) injuryLog(g, off, injured);
    return entry;
  }

  g.ball += gained;
  let text = describe(g, r, offenseCall, gained);
  if (gained >= g.toGo) {
    st.firstDowns++;
    if (thirdDown) st.thirdConv++;
    g.down = 1;
    g.toGo = Math.min(10, 100 - g.ball);
    text += ', first down';
  } else if (g.down === 4) {
    text += ' — turnover on downs';
    const entry = addLog(g, off, text, { ...tags, turnoverOnDowns: true, yards: gained });
    if (g.ot) endOtPossession(g);
    else changePossession(g, 100 - g.ball);
    if (injured) injuryLog(g, off, injured);
    endOfQuarterCheck(g);
    return entry;
  } else {
    g.down++;
    g.toGo -= gained;
  }
  const entry = addLog(g, off, text, { ...tags, yards: gained });
  if (injured) injuryLog(g, off, injured);
  endOfQuarterCheck(g);
  return entry;
}

function injuryLog(g, team, inj) {
  addLog(g, team, `${g.names[inj.id]} is injured (out ${inj.weeks} week${inj.weeks === 1 ? '' : 's'})`, { injury: true });
}

function runPunt(g, rng) {
  const off = g.possession;
  const r = g.ratings[off];
  const net = Math.round(rng.normal(39 + (r.pPow - 70) * 0.25, 6));
  let spot = g.ball + net;
  let text;
  if (spot >= 100) {
    spot = 80;
    text = `Punt into the end zone, touchback`;
  } else {
    text = `Punt of ${net} yards`;
  }
  tickClock(g, 10, off);
  const entry = addLog(g, off, text, { offenseCall: 'Punt', yards: 0 });
  changePossession(g, 100 - spot);
  endOfQuarterCheck(g);
  return entry;
}

function runFieldGoal(g, rng) {
  const off = g.possession;
  const r = g.ratings[off];
  const dist = 100 - g.ball + 17;
  const maxDist = 52 + (r.kPow - 70) * 0.3;
  const p = dist > maxDist ? 0.02 : clamp(0.99 - Math.max(0, dist - 22) * 0.017 + (r.kAcc - 70) * 0.004, 0.05, 0.99);
  const kicker = g.people[off].K[0];
  tickClock(g, 5, off);
  if (rng.chance(p)) {
    g.score[off] += 3;
    addQuarterPoints(g, off, 3);
    stat(g, kicker, 'fgMade');
    const entry = addLog(g, off, `${g.names[kicker] || 'Kicker'} ${dist}-yard field goal is GOOD`, { offenseCall: 'Field Goal', scoring: true, fieldGoal: dist });
    if (g.ot) endOtPossession(g);
    else kickoff(g, off, 25);
    endOfQuarterCheck(g);
    return entry;
  }
  stat(g, kicker, 'fgMissed');
  const entry = addLog(g, off, `${g.names[kicker] || 'Kicker'} ${dist}-yard field goal is NO GOOD`, { offenseCall: 'Field Goal', missedFg: dist });
  if (g.ot) endOtPossession(g);
  else changePossession(g, Math.max(20, 100 - g.ball - 7));
  endOfQuarterCheck(g);
  return entry;
}

function runPat(g, rng, offenseCall, defenseCall) {
  const off = g.possession;
  let entry;
  if (offenseCall === 'Extra Point') {
    const r = g.ratings[off];
    const good = rng.chance(clamp(0.95 + (r.kAcc - 70) * 0.002, 0.85, 0.995));
    if (good) {
      g.score[off] += 1;
      addQuarterPoints(g, off, 1);
    }
    entry = addLog(g, off, `Extra point is ${good ? 'GOOD' : 'NO GOOD'}`, { offenseCall, pat: true, scoring: good });
  } else {
    g.ball = 97;
    g.toGo = 3;
    const r = resolveScrimmage(g, rng, offenseCall, defenseCall);
    const good = (r.kind === 'run' || r.kind === 'complete') && r.yards >= 3;
    if (good) {
      g.score[off] += 2;
      addQuarterPoints(g, off, 2);
    }
    entry = addLog(g, off, `Two-point try (${offenseCall}) ${good ? 'is GOOD' : 'fails'}`, { offenseCall, defenseCall, pat: true, twoPoint: true, scoring: good });
  }
  g.pat = false;
  if (g.ot) endOtPossession(g);
  else {
    kickoff(g, off, 25);
    endOfQuarterCheck(g);
  }
  return entry;
}

// ---------- Possession, clock and overtime ----------

function changePossession(g, ball) {
  g.possession = other(g, g.possession);
  g.ball = clamp(ball, 1, 99);
  g.down = 1;
  g.toGo = Math.min(10, 100 - g.ball);
}

// After a score: the other team gets the ball (touchback at the 25).
function kickoff(g, kickingTeam, ball) {
  g.possession = kickingTeam;
  changePossession(g, ball);
}

function addQuarterPoints(g, team, pts) {
  if (g.ot) return;
  g.quarters[team][g.quarter - 1] += pts;
}

function tickClock(g, seconds, team) {
  if (g.ot) return;
  const used = Math.min(seconds, g.clock);
  g.clock -= used;
  g.stats[team].top += used;
}

function endOfQuarterCheck(g) {
  if (g.ot || g.over || g.pat) return;
  if (g.clock > 0) return;
  if (g.quarter === 2) {
    g.quarter = 3;
    g.clock = QUARTER_SECONDS;
    g.possession = other(g, g.openingReceiver);
    g.ball = 25;
    g.down = 1;
    g.toGo = 10;
    addLog(g, g.possession, 'Halftime', { marker: true });
  } else if (g.quarter === 4) {
    if (g.score[g.home] === g.score[g.away]) startOvertime(g);
    else finish(g);
  } else {
    g.quarter++;
    g.clock = QUARTER_SECONDS;
  }
}

function startOvertime(g) {
  g.ot = { period: 1, first: g.away, half: 0, startScore: { ...g.score } };
  addLog(g, g.away, 'End of regulation — OVERTIME', { marker: true });
  startOtPossession(g, g.away);
}

function startOtPossession(g, team) {
  g.possession = team;
  if (g.ot.period >= 3) {
    g.pat = true;
    g.ball = 97;
    g.down = 1;
    g.toGo = 3;
  } else {
    g.pat = false;
    g.ball = 75;
    g.down = 1;
    g.toGo = 10;
  }
}

function endOtPossession(g) {
  if (g.over) return;
  g.pat = false;
  if (g.ot.half === 0) {
    g.ot.half = 1;
    startOtPossession(g, other(g, g.ot.first));
    return;
  }
  if (g.score[g.home] !== g.score[g.away]) {
    finish(g);
    return;
  }
  g.ot.period++;
  g.ot.half = 0;
  g.ot.first = other(g, g.ot.first);
  startOtPossession(g, g.ot.first);
}

function finish(g) {
  g.over = true;
  g.clock = 0;
  addLog(g, g.home, 'FINAL', { marker: true });
}

// ---------- Whole games ----------

export function simulateRest(g, rng) {
  let guard = 0;
  while (!g.over && guard++ < 1000) runPlay(g, rng);
  if (!g.over) finish(g);
  return g;
}

export function simulateGame(state, game, rng) {
  const g = createGame(state, game);
  simulateRest(g, rng);
  return finalizeGame(g);
}

export function pickHighlights(log) {
  const scored = log
    .map((e, i) => ({ e, i, score: (e.td ? 5 : 0) + (e.turnover ? 4 : 0) + ((e.yards || 0) >= 25 ? 3 : 0) + (e.fourthAttempt ? 2 : 0) + (e.fieldGoal >= 45 ? 2 : 0) + (e.twoPoint ? 2 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 8)
    .sort((a, b) => a.i - b.i);
  return scored.map((x) => x.e);
}

// The compact result stored on the game record.
export function finalizeGame(g) {
  return {
    homeScore: g.score[g.home],
    awayScore: g.score[g.away],
    quarters: g.quarters,
    overtime: g.ot ? g.ot.period : 0,
    teamStats: g.stats,
    playerStats: g.playerStats,
    highlights: pickHighlights(g.log),
    injuries: g.injuries,
    names: g.names,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./test.sh sim` then `./test.sh`
Expected: every line starts with `PASS`, and the last line ends in `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/sim.js tests/sim.test.js tests/all.js
git commit -m "Add the play-by-play game engine"
```

### Task 7: Season, rankings and postseason

**Files:**
- Create: `src/engine/season.js`
- Test: `tests/season.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `autoDepth`, `teamOverall`, `addNews` (Task 5); `simulateGame` (Task 6); `BOWL_NAMES` (Task 2)
- Produces:
  - `PHASES`: `['regular','confChamp','playoffR1','playoffQF','playoffSF','final','complete']`
  - `PHASE_LABELS` and `CHAMPIONSHIP_CONFERENCES`
  - `gamesThisWeek(state)`, `userGameThisWeek(state) → game | null` and `teamGames(state, teamId)`
  - `applyResult(state, game, result)`. Only the user's games keep the full result; every other game stores `{ homeScore, awayScore, overtime }`.
  - `playGame(state, game, rng)`
  - `advanceWeek(state, rng)`. It sims any unplayed games this week, heals injuries by 1 week, auto-fills AI depth charts, recomputes rankings, increments `state.week`, and moves to the next phase when needed.
  - `winnerOf(game)`, `powerScores(state)`, `computeRankings(state) → [teamId x68]` and `rankOf(state, teamId) → 1..25 | null`
  - `conferenceStandings(state, conference) → [teamId]`
  - `state.playoff = { year, seeds: [12 ids], rounds: { r1, qf, sf, final }, champion }`, where each round is a list of game ids

**Postseason flow:** each phase is one week. When the last regular-season week is advanced, the four conference title games are created; the top two in each conference play at a neutral site.

Advancing the title-game week builds the playoff:
- **Seeds:** the four champions are seeds 1–4, ordered by ranking. The next 8 ranked teams are seeds 5–12.
- **First round:** 5v12, 6v11, 7v10 and 8v9, at the higher seed's home field. Bowls for the remaining 6-win teams are played the same week.
- **Quarterfinals:** 1 against the 8/9 winner, 2 against 7/10, 3 against 6/11, and 4 against 5/12.
- **Semifinals and final:** the semifinals pair the 1 and 4 sides and the 2 and 3 sides, followed by the final.

The phase is `complete` once the final is advanced.

- [ ] **Step 1: Write the failing test**

```js
// file: tests/season.test.js
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
```

Register it in `tests/all.js`:

```js
// file: tests/all.js
import './rng.test.js';
import './teams.test.js';
import './players.test.js';
import './schedule.test.js';
import './league.test.js';
import './sim.test.js';
import './season.test.js';
export { run } from './harness.js';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test.sh season`
Expected: FAIL. JavaScriptCore reports that `../src/engine/season.js` cannot be found, and the last line does not say `0 failed`.

- [ ] **Step 3: Write the implementation**

`src/engine/season.js`:

```js
// file: src/engine/season.js
import { autoDepth, teamOverall, addNews } from './league.js';
import { simulateGame } from './sim.js';
import { BOWL_NAMES } from '../data/names.js';

// Phases in order. Each phase after 'regular' is one week of games.
export const PHASES = ['regular', 'confChamp', 'playoffR1', 'playoffQF', 'playoffSF', 'final', 'complete'];

export const PHASE_LABELS = {
  regular: 'Regular season',
  confChamp: 'Conference championships',
  playoffR1: 'Playoff first round and bowls',
  playoffQF: 'Playoff quarterfinals',
  playoffSF: 'Playoff semifinals',
  final: 'National championship',
  complete: 'Season complete',
};

export const CHAMPIONSHIP_CONFERENCES = ['SEC', 'Big Ten', 'Big 12', 'ACC'];

export function gamesThisWeek(state) {
  return state.games.filter((g) => g.week === state.week);
}

export function userGameThisWeek(state) {
  const id = state.coach.teamId;
  return gamesThisWeek(state).find((g) => g.home === id || g.away === id) || null;
}

export function teamGames(state, teamId) {
  return state.games.filter((g) => g.home === teamId || g.away === teamId);
}

// Records a finished game: scores, records, season stats, injuries and news.
// Only the user's games keep the full box score, which keeps saves small.
export function applyResult(state, game, result) {
  const { home, away } = game;
  const userGame = home === state.coach.teamId || away === state.coach.teamId;
  game.result = userGame ? result : { homeScore: result.homeScore, awayScore: result.awayScore, overtime: result.overtime };
  const homeWon = result.homeScore > result.awayScore;
  const winner = homeWon ? home : away;
  const loser = homeWon ? away : home;
  const conf = game.kind === 'regular' && game.conference;
  const th = state.teams[home].record;
  const ta = state.teams[away].record;
  th.pf += result.homeScore;
  th.pa += result.awayScore;
  ta.pf += result.awayScore;
  ta.pa += result.homeScore;
  state.teams[winner].record.w++;
  state.teams[loser].record.l++;
  if (conf) {
    state.teams[winner].record.cw++;
    state.teams[loser].record.cl++;
  }
  if (winner === state.coach.teamId) state.coach.record.w++;
  if (loser === state.coach.teamId) state.coach.record.l++;

  for (const [id, line] of Object.entries(result.playerStats)) {
    const p = state.players[id];
    if (!p) continue;
    p.stats.games = (p.stats.games || 0) + 1;
    for (const [k, v] of Object.entries(line)) p.stats[k] = (p.stats[k] || 0) + v;
  }
  for (const inj of result.injuries) {
    const p = state.players[inj.id];
    if (!p) continue;
    p.injury = Math.max(p.injury, inj.weeks + 1); // +1 because everyone heals one week after this round
    if (p.teamId === state.coach.teamId) addNews(state, `${p.firstName} ${p.lastName} (${p.position}) is injured and out ${inj.weeks} week${inj.weeks === 1 ? '' : 's'}.`);
  }
  if (home === state.coach.teamId || away === state.coach.teamId) {
    const us = state.coach.teamId;
    const them = us === home ? away : home;
    const won = winner === us;
    const ourScore = us === home ? result.homeScore : result.awayScore;
    const theirScore = us === home ? result.awayScore : result.homeScore;
    addNews(state, `${won ? 'Win' : 'Loss'}: ${state.teams[us].name} ${ourScore}, ${state.teams[them].name} ${theirScore}${game.label ? ` (${game.label})` : ''}.`);
  }
}

export function playGame(state, game, rng) {
  const result = simulateGame(state, game, rng);
  applyResult(state, game, result);
  return result;
}

// Simulates every unplayed game this week (including the user's, if not played yet),
// heals injuries, updates rankings and depth charts, and moves to the next week or phase.
export function advanceWeek(state, rng) {
  if (state.phase === 'complete') return;
  for (const game of gamesThisWeek(state)) if (!game.result) playGame(state, game, rng);
  for (const p of Object.values(state.players)) if (p.injury > 0) p.injury--;
  for (const id of Object.keys(state.teams)) if (id !== state.coach.teamId) autoDepth(state, id);
  state.liveGame = null;
  state.rankings = computeRankings(state);
  state.week++;

  if (state.phase === 'regular') {
    if (state.week > state.regularWeeks) startConferenceChampionships(state);
  } else if (state.phase === 'confChamp') {
    startPlayoff(state);
  } else if (state.phase === 'playoffR1') {
    nextPlayoffRound(state, 'r1', 'qf', 'playoffQF');
  } else if (state.phase === 'playoffQF') {
    nextPlayoffRound(state, 'qf', 'sf', 'playoffSF');
  } else if (state.phase === 'playoffSF') {
    nextPlayoffRound(state, 'sf', 'final', 'final');
  } else if (state.phase === 'final') {
    const final = state.games.find((g) => g.id === state.playoff.rounds.final[0]);
    state.playoff.champion = winnerOf(final);
    state.phase = 'complete';
    addNews(state, `${state.teams[state.playoff.champion].name} wins the ${state.year} national championship!`);
  }
}

export function winnerOf(game) {
  if (!game || !game.result) return null;
  return game.result.homeScore > game.result.awayScore ? game.home : game.away;
}

// ---------- Rankings ----------

function winPct(r) {
  const n = r.w + r.l;
  return n ? r.w / n : 0;
}

// Power score: win %, strength of schedule and capped scoring margin.
// Before any games, it falls back to roster strength.
export function powerScores(state) {
  const scores = {};
  for (const t of Object.values(state.teams)) {
    const played = teamGames(state, t.id).filter((g) => g.result);
    if (played.length === 0) {
      scores[t.id] = teamOverall(state, t.id) / 100;
      continue;
    }
    const opp = played.map((g) => state.teams[g.home === t.id ? g.away : g.home]);
    const sos = opp.reduce((s, o) => s + winPct(o.record), 0) / opp.length;
    const margin =
      played.reduce((s, g) => {
        const us = g.home === t.id ? g.result.homeScore : g.result.awayScore;
        const them = g.home === t.id ? g.result.awayScore : g.result.homeScore;
        return s + Math.max(-28, Math.min(28, us - them));
      }, 0) / played.length;
    scores[t.id] = winPct(t.record) * 60 + sos * 25 + margin * 0.5 + teamOverall(state, t.id) * 0.05;
  }
  return scores;
}

// All 68 team ids, best first. The Top 25 is the first 25.
export function computeRankings(state) {
  const scores = powerScores(state);
  return Object.keys(state.teams).sort((a, b) => scores[b] - scores[a]);
}

export function rankOf(state, teamId) {
  const i = state.rankings.indexOf(teamId);
  return i >= 0 && i < 25 ? i + 1 : null;
}

// ---------- Standings and championships ----------

function headToHead(state, a, b) {
  const g = state.games.find((x) => x.kind === 'regular' && x.result && ((x.home === a && x.away === b) || (x.home === b && x.away === a)));
  if (!g) return 0;
  return winnerOf(g) === a ? -1 : 1;
}

// Conference standings: conference win %, then head-to-head, then ranking.
export function conferenceStandings(state, conference) {
  const rank = (id) => state.rankings.indexOf(id);
  const teams = Object.values(state.teams).filter((t) => t.conference === conference);
  const pct = (t) => (t.record.cw + t.record.cl ? t.record.cw / (t.record.cw + t.record.cl) : 0);
  return teams
    .sort((a, b) => pct(b) - pct(a) || headToHead(state, a.id, b.id) || rank(a.id) - rank(b.id))
    .map((t) => t.id);
}

function postseasonGame(state, { home, away, neutral, kind, label }) {
  const game = { id: `g${state.year}-${state.games.length + 1}`, week: state.week, home, away, neutral, kind, conference: false, label, result: null };
  state.games.push(game);
  return game;
}

function startConferenceChampionships(state) {
  state.phase = 'confChamp';
  for (const conf of CHAMPIONSHIP_CONFERENCES) {
    const [a, b] = conferenceStandings(state, conf);
    postseasonGame(state, { home: a, away: b, neutral: true, kind: 'confChamp', label: `${conf} Championship` });
  }
  addNews(state, 'Conference championship week is here.');
}

function startPlayoff(state) {
  state.phase = 'playoffR1';
  const champs = state.games
    .filter((g) => g.kind === 'confChamp' && g.result && g.id.startsWith(`g${state.year}-`))
    .map(winnerOf);
  const byRank = (ids) => ids.slice().sort((a, b) => state.rankings.indexOf(a) - state.rankings.indexOf(b));
  const top4 = byRank(champs);
  const atLarge = state.rankings.filter((id) => !champs.includes(id)).slice(0, 8);
  const seeds = [...top4, ...byRank(atLarge)];
  state.playoff = { year: state.year, seeds, rounds: { r1: [], qf: [], sf: [], final: [] }, champion: null };
  const r1 = [[4, 11], [5, 10], [6, 9], [7, 8]]; // seed indexes: 5v12, 6v11, 7v10, 8v9
  for (const [hi, lo] of r1) {
    const g = postseasonGame(state, { home: seeds[hi], away: seeds[lo], neutral: false, kind: 'playoff', label: `Playoff First Round: #${hi + 1} vs #${lo + 1}` });
    state.playoff.rounds.r1.push(g.id);
  }
  scheduleBowls(state, seeds);
  const us = state.coach.teamId;
  const seed = seeds.indexOf(us);
  addNews(state, seed >= 0 ? `${state.teams[us].name} made the playoff as the #${seed + 1} seed!` : 'The 12-team playoff field is set.');
}

function scheduleBowls(state, playoffTeams) {
  const eligible = state.rankings.filter((id) => !playoffTeams.includes(id) && state.teams[id].record.w >= 6);
  for (let i = 0; i + 1 < eligible.length && i / 2 < BOWL_NAMES.length; i += 2) {
    postseasonGame(state, { home: eligible[i], away: eligible[i + 1], neutral: true, kind: 'bowl', label: BOWL_NAMES[i / 2] });
  }
}

// Bracket: QF pairs seed 1 with the 8/9 winner, 2 with 7/10, 3 with 6/11, 4 with 5/12.
// SF pairs the 1 and 4 sides, and the 2 and 3 sides.
function nextPlayoffRound(state, from, to, phase) {
  const po = state.playoff;
  const winners = po.rounds[from].map((id) => winnerOf(state.games.find((g) => g.id === id)));
  let pairs;
  if (from === 'r1') {
    // r1 order: [5v12, 6v11, 7v10, 8v9]
    pairs = [[po.seeds[0], winners[3]], [po.seeds[1], winners[2]], [po.seeds[2], winners[1]], [po.seeds[3], winners[0]]];
  } else if (from === 'qf') {
    pairs = [[winners[0], winners[3]], [winners[1], winners[2]]];
  } else {
    pairs = [[winners[0], winners[1]]];
  }
  const label = { qf: 'Playoff Quarterfinal', sf: 'Playoff Semifinal', final: 'National Championship' }[to];
  for (const [a, b] of pairs) {
    const [home, away] = po.seeds.indexOf(a) <= po.seeds.indexOf(b) ? [a, b] : [b, a];
    const g = postseasonGame(state, { home, away, neutral: true, kind: 'playoff', label });
    po.rounds[to].push(g.id);
  }
  state.phase = phase;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./test.sh season` then `./test.sh`
Expected: every line starts with `PASS`, and the last line ends in `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/season.js tests/season.test.js tests/all.js
git commit -m "Add season flow, rankings and postseason"
```

### Task 8: Saving and loading

**Files:**
- Create: `src/save.js`
- Test: `tests/save.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `SAVE_VERSION` (Task 5)
- Produces:
  - `SAVE_KEY = 'cfb-dynasty-save'` and `BACKUP_KEY = 'cfb-dynasty-save-broken'`
  - `serialize(state) → string` and `deserialize(text) → { ok: true, state } | { ok: false, error }`
  - `loadFromStorage(storage) → { status: 'none'|'ok'|'corrupt'|'unavailable', state?, error? }`. A corrupt save is copied to `BACKUP_KEY` and never deleted.
  - `saveToStorage(storage, state) → bool` and `clearStorage(storage)`
  - `storage` is anything with `getItem`, `setItem` and `removeItem`: `window.localStorage` in the browser, or a fake in the tests.

`src/save.js` sits outside `src/engine/` because it deals with browser storage. The tests pass in a fake storage, so it still runs under JavaScriptCore.

- [ ] **Step 1: Write the failing test**

```js
// file: tests/save.test.js
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
```

Register it in `tests/all.js`:

```js
// file: tests/all.js
import './rng.test.js';
import './teams.test.js';
import './players.test.js';
import './schedule.test.js';
import './league.test.js';
import './sim.test.js';
import './season.test.js';
import './save.test.js';
export { run } from './harness.js';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test.sh save`
Expected: FAIL. JavaScriptCore reports that `../src/save.js` cannot be found, and the last line does not say `0 failed`.

- [ ] **Step 3: Write the implementation**

`src/save.js`:

```js
// file: src/save.js
import { SAVE_VERSION } from './engine/league.js';

export const SAVE_KEY = 'cfb-dynasty-save';
export const BACKUP_KEY = 'cfb-dynasty-save-broken';

const REQUIRED = ['version', 'seed', 'rngState', 'year', 'week', 'phase', 'coach', 'teams', 'players', 'games'];

export function serialize(state) {
  return JSON.stringify(state);
}

// Returns { ok: true, state } or { ok: false, error }.
export function deserialize(text) {
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The save file is not valid JSON.' };
  }
  if (!state || typeof state !== 'object') return { ok: false, error: 'The save file is empty.' };
  const missing = REQUIRED.filter((k) => !(k in state));
  if (missing.length) return { ok: false, error: `The save is missing: ${missing.join(', ')}.` };
  if (state.version !== SAVE_VERSION) return { ok: false, error: `Unsupported save version ${state.version}.` };
  if (!state.teams[state.coach.teamId]) return { ok: false, error: "The save's coach team doesn't exist." };
  return { ok: true, state };
}

// storage is window.localStorage (or a test double with getItem/setItem/removeItem).
// Returns { status: 'none' | 'ok' | 'corrupt' | 'unavailable', state?, error? }.
export function loadFromStorage(storage) {
  let raw;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null || raw === undefined) return { status: 'none' };
  const result = deserialize(raw);
  if (result.ok) return { status: 'ok', state: result.state };
  try {
    storage.setItem(BACKUP_KEY, raw);
  } catch {
    // Keeping the backup is best effort.
  }
  return { status: 'corrupt', error: result.error };
}

// Returns true if saved.
export function saveToStorage(storage, state) {
  try {
    storage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function clearStorage(storage) {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./test.sh save` then `./test.sh`
Expected: every line starts with `PASS`, and the last line ends in `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/save.js tests/save.test.js tests/all.js
git commit -m "Add save and load with corrupt-save backup"
```

### Task 9: Page shell, new-franchise screen, home and settings

**Files:**
- Create: `index.html`, `styles.css`, `src/main.js`
- Create: `src/ui/dom.js`, `src/ui/newFranchise.js`, `src/ui/home.js`, `src/ui/settings.js`

**Interfaces:**
- Consumes: `createLeague`, `teamOverall`, `getStarters` (Task 5); `playerName`, `POSITIONS` (Task 3); `userGameThisWeek`, `advanceWeek`, `PHASE_LABELS`, `rankOf`, `conferenceStandings` (Task 7); everything in `save.js` (Task 8); `TEAMS`, `CONFERENCES` (Task 2)
- Produces:
  - **The `ctx` object** that every screen receives: `{ state, banner, storage, storageOk, withRng(fn), save(), setState(state), go(route), refresh() }`. `withRng(fn)` runs `fn(rng)` with `state.rngState` and writes the new state back.
  - **Screens** are functions `renderX(ctx) → HTMLElement`. Routes are `#/home`, `#/settings` and (from later tasks) `#/roster`, `#/depth`, `#/plan`, `#/game`, `#/schedule` and `#/rankings`. Unknown routes fall back to home.
  - **From `dom.js`:** `h(tag, attrs, ...children)`, `stars(n)`, `teamLabel(state, teamId)`, `recordText(record)`, `modal(content) → close()`, `luminance(hex)` and `readableAccent(primary, secondary)`
  - **Home** starts a game by setting `state.liveGame = { gameId, mode: 'coach'|'sim', g: null }` and going to `#/game`. That route arrives in Task 11; until then it falls back to home.

The screens have no automated tests, since the engine underneath is already tested. They are checked by hand in Chrome.

- [ ] **Step 1: Write the page shell and styles**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CFB Dynasty</title>
  <meta name="description" content="A college football franchise game: coach a program, recruit, and simulate seasons.">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app"><p class="loading">Loading…</p></div>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

```css
:root {
  --bg: #0f1217;
  --panel: #171b22;
  --panel-2: #1f242d;
  --line: #2b313c;
  --text: #e8ebf0;
  --muted: #9aa3b2;
  --accent: #d9363e;
  --accent-2: #ffffff;
  --good: #3fb26b;
  --bad: #e5534b;
  --warn: #d9a43b;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); }
body { line-height: 1.45; font-size: 15px; }
a { color: inherit; }
button, select, input {
  font: inherit; color: var(--text); background: var(--panel-2);
  border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px;
}
button { cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--muted); }
button:disabled { opacity: .45; cursor: default; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-2); font-weight: 600; }
button.small { padding: 4px 8px; font-size: 13px; }
.loading { padding: 24px; color: var(--muted); }

.topbar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 10px 16px; background: var(--panel); border-bottom: 3px solid var(--accent);
  position: sticky; top: 0; z-index: 5;
}
.brand { font-weight: 800; letter-spacing: .04em; }
.teamtag { font-weight: 700; }
.teamtag small { color: var(--muted); font-weight: 400; margin-left: 6px; }
nav.tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; }
nav.tabs a {
  text-decoration: none; padding: 6px 10px; border-radius: 6px; color: var(--muted); font-size: 14px;
}
nav.tabs a.active, nav.tabs a:hover { background: var(--panel-2); color: var(--text); }

main { max-width: 1100px; margin: 0 auto; padding: 16px; }
h1 { font-size: 26px; margin: 4px 0 12px; }
h2 { font-size: 18px; margin: 0 0 10px; }
h3 { font-size: 15px; margin: 0 0 8px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.muted { color: var(--muted); }
.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); }
.grid > * { min-width: 0; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.spacer { flex: 1; }
.big { font-size: 30px; font-weight: 800; }
.pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--panel-2); font-size: 12px; color: var(--muted); }
.pill.good { color: var(--good); } .pill.bad { color: var(--bad); } .pill.warn { color: var(--warn); }
.banner { background: #3a2a12; border: 1px solid var(--warn); color: #f5d58a; padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
.banner.error { background: #3a1414; border-color: var(--bad); color: #f4b4b0; }

table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
th.sortable { cursor: pointer; }
td.num, th.num { text-align: right; }
tr.me td { background: rgba(217, 54, 62, .12); }
tr.clickable { cursor: pointer; }
tr.clickable:hover td { background: var(--panel-2); }
.table-wrap { overflow-x: auto; }

.meter { height: 8px; background: var(--panel-2); border-radius: 999px; overflow: hidden; }
.meter > span { display: block; height: 100%; background: var(--accent); }

.news { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow: auto; }
.news li { padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 14px; }

.depth-list { list-style: none; margin: 0; padding: 0; }
.depth-list li { display: flex; align-items: center; gap: 8px; padding: 6px; border-bottom: 1px solid var(--line); }
.depth-list li.starter { background: rgba(63, 178, 107, .08); }
.depth-list li.injured { opacity: .55; }
.depth-list .ovr { width: 34px; text-align: right; font-weight: 700; }
.depth-list .name { flex: 1; }

.choice-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.choice-grid button.selected { border-color: var(--accent); background: rgba(217, 54, 62, .18); }

.scoreboard { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; text-align: center; }
.scoreboard .team { font-weight: 700; font-size: 18px; }
.scoreboard .score { font-size: 40px; font-weight: 800; }
.scoreboard .clock { color: var(--muted); }
.field { position: relative; height: 28px; background: #1d5b33; border-radius: 6px; margin: 12px 0 4px; overflow: hidden; }
.field .endzone { position: absolute; top: 0; bottom: 0; width: 8%; background: rgba(0, 0, 0, .25); }
.field .ball { position: absolute; top: 5px; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: #8b4a22; border: 2px solid #fff; transition: left .3s; }
.field .marker { position: absolute; top: 0; bottom: 0; width: 2px; background: #f5d042; }
.feed { list-style: none; margin: 0; padding: 0; max-height: 360px; overflow: auto; font-size: 14px; }
.feed li { padding: 5px 0; border-bottom: 1px solid var(--line); }
.feed li .tag { color: var(--muted); margin-right: 6px; font-variant-numeric: tabular-nums; }
.feed li.score { color: #ffd76a; font-weight: 600; }
.feed li.turnover { color: var(--bad); font-weight: 600; }
.feed li.marker { color: var(--muted); text-align: center; font-weight: 700; }
.callpanel { border: 2px solid var(--accent); }

.newfranchise { max-width: 760px; margin: 30px auto; }
.team-pick { display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); max-height: 380px; overflow: auto; }
.team-pick button { text-align: left; display: flex; justify-content: space-between; gap: 6px; }
.team-pick button.selected { border-color: var(--accent); background: rgba(217, 54, 62, .18); }
.stars { color: #f5c04a; letter-spacing: 1px; }
.modal-back { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 20; }
.modal { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; max-width: 520px; width: 100%; max-height: 90vh; overflow: auto; }

@media (max-width: 640px) {
  main { padding: 12px; }
  .scoreboard .score { font-size: 30px; }
  nav.tabs { margin-left: 0; }
}
```

- [ ] **Step 2: Write the DOM helpers**

```js
// file: src/ui/dom.js
// h('div', { class: 'card', onclick: fn }, child, 'text', [more]) builds DOM elements.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  appendAll(el, children);
  return el;
}

function appendAll(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function stars(n) {
  return h('span', { class: 'stars', title: `${n} star${n === 1 ? '' : 's'}` }, '★'.repeat(n) + '☆'.repeat(5 - n));
}

export function teamLabel(state, teamId, { rank = true } = {}) {
  const t = state.teams[teamId];
  const i = state.rankings.indexOf(teamId);
  const r = rank && i >= 0 && i < 25 ? `#${i + 1} ` : '';
  return `${r}${t.name}`;
}

export function recordText(r) {
  return `${r.w}-${r.l}`;
}

// Shows a modal dialog built from `content`. Returns a close() function.
export function modal(content) {
  const back = h('div', { class: 'modal-back', onclick: (e) => e.target === back && close() }, h('div', { class: 'modal' }, content));
  function close() {
    back.remove();
  }
  document.body.append(back);
  return close;
}

// Relative luminance of a #RRGGBB color, 0 (black) to 1 (white).
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Team accent that stays visible on the dark background: the primary color,
// or the secondary when the primary is too dark (and the secondary isn't white or black).
export function readableAccent(primary, secondary) {
  if (luminance(primary) >= 0.06) return primary;
  const l2 = luminance(secondary);
  if (l2 >= 0.06 && l2 <= 0.8) return secondary;
  return '#8aa4c8';
}
```

`readableAccent` keeps team colors visible on the dark background. For example, Michigan's navy (`#00274C`) is too dark, so it uses maize (`#FFCB05`). The button text color (`--accent-2`) switches to black on light accents.

- [ ] **Step 3: Write the router.** This first version has only the home and settings routes.

```js
// file: src/main.js
import { Rng } from './engine/rng.js';
import { loadFromStorage, saveToStorage } from './save.js';
import { h, luminance, readableAccent } from './ui/dom.js';
import { renderNewFranchise } from './ui/newFranchise.js';
import { renderHome } from './ui/home.js';
import { renderSettings } from './ui/settings.js';

const ROUTES = {
  home: { label: 'Home', render: renderHome },
  settings: { label: 'Settings', render: renderSettings },
};

const app = document.getElementById('app');
const ctx = {
  state: null,
  banner: null,
  storageOk: true,
  storage: (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })(),

  // Run engine code with the saved random number state, then store the new state.
  withRng(fn) {
    const rng = new Rng(ctx.state.rngState);
    const out = fn(rng);
    ctx.state.rngState = rng.state;
    return out;
  },

  save() {
    if (!ctx.state || !ctx.storage) return;
    ctx.storageOk = saveToStorage(ctx.storage, ctx.state);
  },

  setState(state) {
    ctx.state = state;
    ctx.save();
  },

  go(route) {
    if (location.hash === `#/${route}`) ctx.refresh();
    else location.hash = `#/${route}`;
  },

  refresh() {
    render();
  },
};

function currentRoute() {
  const r = location.hash.replace(/^#\//, '');
  return ROUTES[r] ? r : 'home';
}

function applyTeamColors() {
  const team = ctx.state && ctx.state.teams[ctx.state.coach.teamId];
  const accent = team ? readableAccent(team.colors.primary, team.colors.secondary) : '#d9363e';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-2', luminance(accent) > 0.4 ? '#111111' : '#ffffff');
}

function topbar(route) {
  const s = ctx.state;
  const team = s.teams[s.coach.teamId];
  return h(
    'header',
    { class: 'topbar' },
    h('span', { class: 'brand' }, 'CFB DYNASTY'),
    h('span', { class: 'teamtag' }, team.name, h('small', {}, `${team.record.w}-${team.record.l} · ${s.year}`)),
    h(
      'nav',
      { class: 'tabs' },
      Object.entries(ROUTES)
        .filter(([, r]) => !r.hidden)
        .map(([key, r]) => h('a', { href: `#/${key}`, class: key === route ? 'active' : '' }, r.label)),
    ),
  );
}

function render() {
  app.replaceChildren();
  applyTeamColors();
  if (!ctx.state) {
    app.append(renderNewFranchise(ctx));
    return;
  }
  const route = currentRoute();
  const main = h('main');
  if (ctx.banner) main.append(h('div', { class: `banner ${ctx.banner.kind || ''}` }, ctx.banner.text));
  if (!ctx.storage || !ctx.storageOk) main.append(h('div', { class: 'banner' }, "Your browser isn't letting this page save. You can keep playing, but progress will be lost when you close the tab. Use Settings → Export to keep a backup."));
  main.append(ROUTES[route].render(ctx));
  app.append(topbar(route), main);
  window.scrollTo(0, 0);
}

function boot() {
  if (!ctx.storage) {
    ctx.storageOk = false;
  } else {
    const loaded = loadFromStorage(ctx.storage);
    if (loaded.status === 'ok') ctx.state = loaded.state;
    else if (loaded.status === 'corrupt') ctx.banner = { kind: 'error', text: `Your saved franchise couldn't be loaded (${loaded.error}) It was kept as a backup. Start a new franchise or import a backup file.` };
    else if (loaded.status === 'unavailable') ctx.storageOk = false;
  }
  window.addEventListener('hashchange', render);
  render();
}

boot();
```

- [ ] **Step 4: Write the new-franchise, home and settings screens**

```js
// file: src/ui/newFranchise.js
import { h, stars } from './dom.js';
import { TEAMS, CONFERENCES } from '../data/teams.js';
import { createLeague } from '../engine/league.js';
import { deserialize } from '../save.js';

export function renderNewFranchise(ctx) {
  let teamId = null;
  const nameInput = h('input', { type: 'text', placeholder: 'Coach name', value: 'Coach', maxlength: '40', 'aria-label': 'Coach name' });
  const seedInput = h('input', { type: 'text', placeholder: 'Random', 'aria-label': 'League seed (optional)' });
  const start = h('button', { class: 'primary', disabled: true, onclick: begin }, 'Start franchise');
  const error = h('p', { class: 'muted' });

  const buttons = [];
  const groups = CONFERENCES.map((conf) =>
    h(
      'div',
      {},
      h('h3', { style: { margin: '14px 0 6px' } }, conf),
      h(
        'div',
        { class: 'team-pick' },
        TEAMS.filter((t) => t.conference === conf)
          .sort((a, b) => b.prestige - a.prestige || a.name.localeCompare(b.name))
          .map((t) => {
            const b = h('button', { onclick: () => select(t.id, b) }, h('span', {}, t.name), stars(t.prestige));
            buttons.push(b);
            return b;
          }),
      ),
    ),
  );

  function select(id, button) {
    teamId = id;
    buttons.forEach((b) => b.classList.remove('selected'));
    button.classList.add('selected');
    start.disabled = false;
  }

  function begin() {
    const seed = seedInput.value.trim() || String(Date.now());
    const coachName = nameInput.value.trim() || 'Coach';
    ctx.banner = null;
    ctx.setState(createLeague({ seed, coachName, teamId }));
    ctx.go('home');
  }

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, onchange: importFile });
  async function importFile() {
    const file = fileInput.files[0];
    if (!file) return;
    const r = deserialize(await file.text());
    if (!r.ok) {
      error.textContent = `That file couldn't be imported: ${r.error}`;
      return;
    }
    ctx.banner = null;
    ctx.setState(r.state);
    ctx.go('home');
  }

  return h(
    'main',
    { class: 'newfranchise' },
    ctx.banner ? h('div', { class: `banner ${ctx.banner.kind || ''}` }, ctx.banner.text) : null,
    h('h1', {}, 'CFB Dynasty'),
    h('p', { class: 'muted' }, 'Take over a college football program. Set your depth chart and game plan, coach the big moments, and chase a national title.'),
    h(
      'div',
      { class: 'card' },
      h('h2', {}, '1. Your coach'),
      nameInput,
      h('h2', { style: { marginTop: '16px' } }, '2. Pick a school'),
      h('p', { class: 'muted' }, 'Stars show program prestige. Higher prestige means a stronger roster and higher expectations.'),
      groups,
      h('h2', { style: { marginTop: '16px' } }, '3. League seed (optional)'),
      h('p', { class: 'muted' }, 'The same seed and school always build the same league.'),
      seedInput,
      h('div', { class: 'row', style: { marginTop: '16px' } }, start, h('span', { class: 'spacer' }), h('button', { onclick: () => fileInput.click() }, 'Import a save'), fileInput),
      error,
    ),
  );
}
```

```js
// file: src/ui/home.js
import { h, teamLabel, recordText } from './dom.js';
import { userGameThisWeek, advanceWeek, PHASE_LABELS, rankOf, conferenceStandings } from '../engine/season.js';
import { teamOverall, getStarters } from '../engine/league.js';
import { POSITIONS } from '../engine/players.js';
import { playerName } from '../engine/players.js';

export function renderHome(ctx) {
  const s = ctx.state;
  const us = s.coach.teamId;
  const team = s.teams[us];
  const game = userGameThisWeek(s);
  const rank = rankOf(s, us);

  const weekTitle = s.phase === 'regular' ? `Week ${s.week} of ${s.regularWeeks}` : PHASE_LABELS[s.phase];

  function advance() {
    ctx.withRng((rng) => advanceWeek(s, rng));
    ctx.save();
    ctx.go('home');
  }

  function play(mode) {
    s.liveGame = { gameId: game.id, mode, g: null };
    ctx.save();
    ctx.go('game');
  }

  let matchupCard;
  if (s.phase === 'complete') {
    const champ = s.playoff && s.playoff.champion;
    matchupCard = h(
      'div',
      { class: 'card' },
      h('h3', {}, 'Season complete'),
      h('p', { class: 'big' }, champ ? `${s.teams[champ].name} are national champions` : 'Season over'),
      h('p', { class: 'muted' }, `You finished ${recordText(team.record)}. The offseason (recruiting, transfer portal, player progression) comes in a later update.`),
    );
  } else if (game && !game.result) {
    const opp = game.home === us ? game.away : game.home;
    const where = game.neutral ? 'Neutral site' : game.home === us ? 'Home' : 'Away';
    matchupCard = h(
      'div',
      { class: 'card' },
      h('h3', {}, `${weekTitle}${game.label ? ` · ${game.label}` : ''}`),
      h('p', { class: 'big' }, `${game.home === us ? 'vs' : '@'} ${teamLabel(s, opp)}`),
      h('p', { class: 'muted' }, `${where} · ${recordText(s.teams[opp].record)}`),
      scoutingCard(s, opp),
      h(
        'div',
        { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'primary', onclick: () => play('coach') }, 'Coach key moments'),
        h('button', { onclick: () => play('sim') }, 'Sim to end'),
      ),
    );
  } else {
    const playedNote = game && game.result ? 'Your game is final. Advance when you are ready.' : 'Your team has a bye this week.';
    const eliminated = s.phase !== 'regular' && !game;
    matchupCard = h(
      'div',
      { class: 'card' },
      h('h3', {}, weekTitle),
      h('p', {}, eliminated ? 'Your season is over. Advance to watch the rest of the postseason.' : playedNote),
      h('button', { class: 'primary', onclick: advance }, s.phase === 'regular' ? 'Advance to next week' : 'Sim this round'),
    );
  }

  const security = s.coach.jobSecurity;
  return h(
    'div',
    {},
    h('h1', {}, `${rank ? `#${rank} ` : ''}${team.name}`),
    h(
      'div',
      { class: 'grid' },
      matchupCard,
      h(
        'div',
        { class: 'card' },
        h('h3', {}, 'Program'),
        h('p', {}, `Record: ${recordText(team.record)} (${team.record.cw}-${team.record.cl} ${team.conference === 'Independent' ? 'independent' : 'conference'})`),
        h('p', {}, `Team overall: ${teamOverall(s, us)} · Prestige: ${team.prestige}/5`),
        h('p', {}, `Coach ${s.coach.name}, career ${recordText(s.coach.record)}`),
        h('p', { class: 'muted' }, `Job security: ${security}/100`),
        h('div', { class: 'meter' }, h('span', { style: { width: `${security}%` } })),
        team.conference !== 'Independent' ? conferenceMini(s, team.conference, us) : null,
      ),
      h('div', { class: 'card' }, h('h3', {}, 'News'), h('ul', { class: 'news' }, s.news.length ? s.news.slice(0, 40).map((n) => h('li', {}, n.text)) : h('li', { class: 'muted' }, 'Welcome to your new job, coach.'))),
    ),
  );
}

function scoutingCard(s, opp) {
  const t = s.teams[opp];
  const best = POSITIONS.flatMap((pos) => getStarters(s, opp, pos))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 3);
  return h(
    'div',
    { style: { marginTop: '10px' } },
    h('h3', {}, 'Scouting report'),
    h('p', {}, `Team overall ${teamOverall(s, opp)} · Offense: ${t.plan.offense} · Defense: ${t.plan.defense}`),
    h('p', { class: 'muted' }, 'Top players: ', best.map((p) => `${playerName(p)} (${p.position}, ${p.overall})`).join(', ')),
  );
}

function conferenceMini(s, conf, us) {
  const ids = conferenceStandings(s, conf).slice(0, 6);
  return h(
    'div',
    { style: { marginTop: '12px' } },
    h('h3', {}, `${conf} standings`),
    h('table', {}, h('tbody', {}, ids.map((id, i) => h('tr', { class: id === us ? 'me' : '' }, h('td', {}, `${i + 1}. ${s.teams[id].name}`), h('td', { class: 'num' }, `${s.teams[id].record.cw}-${s.teams[id].record.cl}`))))),
  );
}
```

```js
// file: src/ui/settings.js
import { h, modal } from './dom.js';
import { serialize, deserialize, clearStorage } from '../save.js';

export function renderSettings(ctx) {
  const s = ctx.state;
  const msg = h('p', { class: 'muted' });

  function exportSave() {
    const blob = new Blob([serialize(s)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `cfb-dynasty-${s.teams[s.coach.teamId].short}-${s.year}-wk${s.week}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    msg.textContent = 'Save exported.';
  }

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, onchange: importSave });
  async function importSave() {
    const file = fileInput.files[0];
    if (!file) return;
    const r = deserialize(await file.text());
    if (!r.ok) {
      msg.textContent = `Import failed: ${r.error}`;
      return;
    }
    ctx.setState(r.state);
    ctx.go('home');
  }

  function confirmNew() {
    const close = modal(
      h(
        'div',
        {},
        h('h2', {}, 'Start a new franchise?'),
        h('p', {}, 'This deletes your current franchise from this browser. Export a backup first if you want to keep it. This cannot be undone.'),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { close(); if (ctx.storage) clearStorage(ctx.storage); ctx.state = null; ctx.go('home'); } }, 'Delete and start over'), h('button', { onclick: () => close() }, 'Cancel')),
      ),
    );
  }

  return h(
    'div',
    {},
    h('h1', {}, 'Settings'),
    h(
      'div',
      { class: 'grid' },
      h('div', { class: 'card' }, h('h2', {}, 'Backups'), h('p', { class: 'muted' }, 'Your franchise saves automatically in this browser. Export a file to back it up or move it to another device.'), h('div', { class: 'row' }, h('button', { onclick: exportSave }, 'Export save'), h('button', { onclick: () => fileInput.click() }, 'Import save'), fileInput), msg),
      h('div', { class: 'card' }, h('h2', {}, 'New franchise'), h('p', { class: 'muted' }, `Coach ${s.coach.name}, ${s.teams[s.coach.teamId].name}, seed ${s.seed}.`), h('button', { onclick: confirmNew }, 'Start a new franchise')),
    ),
  );
}
```

- [ ] **Step 5: Check it by hand in Chrome**

Run `python3 -I -m http.server 8765 --bind 127.0.0.1` in the background, then open http://127.0.0.1:8765/. Check each of these:

1. The new-franchise screen lists all 68 schools, grouped by conference, with stars.
2. Pick Michigan, enter the seed `demo`, and click **Start franchise**. Home shows "#1 Michigan", "Week 1 of 14", and an opponent with a scouting report.
3. The accent color is maize, not navy, and the buttons are readable.
4. Reload the page. The franchise is still there, which proves autosave works.
5. In Settings, **Export save** downloads a `.json` file.
6. **Start a new franchise** asks for confirmation, then returns to the new-franchise screen.
7. Run `./test.sh` and confirm it still ends with `0 failed`.
8. The browser console shows no errors.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css src/main.js src/ui
git commit -m "Add page shell, new franchise, home and settings screens"
```

### Task 10: Roster, depth chart and game plan screens

**Files:**
- Create: `src/ui/roster.js`, `src/ui/depth.js`, `src/ui/plan.js`
- Modify: `src/main.js` (imports and `ROUTES`)

**Interfaces:**
- Consumes: `ctx` and the `dom.js` helpers (Task 9); `POSITIONS`, `STARTERS` (Task 3); `autoDepth` (Task 5); `OFFENSE_STYLES`, `DEFENSE_STYLES`, `TEMPOS` (Task 6)
- Produces:
  - `renderRoster(ctx)`, `renderDepth(ctx)` and `renderPlan(ctx)`
  - `showPlayer(player)`, exported from `roster.js`, which opens a player-detail modal
  - Changes to the depth chart and game plan modify `state.teams[userTeam].depth` and `.plan` directly, followed by `ctx.save()`.

- [ ] **Step 1: Write the three screens**

```js
// file: src/ui/roster.js
import { h, modal } from './dom.js';
import { POSITIONS } from '../engine/players.js';

const COLUMNS = [
  ['position', 'Pos'],
  ['name', 'Name'],
  ['classYear', 'Class'],
  ['overall', 'OVR'],
  ['potential', 'POT'],
  ['injury', 'Injury'],
  ['morale', 'Morale'],
];

export function renderRoster(ctx) {
  const s = ctx.state;
  const team = s.teams[s.coach.teamId];
  let sortKey = 'position';
  let desc = false;
  let filter = 'ALL';
  const wrap = h('div', { class: 'table-wrap' });

  const posOrder = (p) => POSITIONS.indexOf(p.position) * 1000 + (99 - p.overall);
  function value(p, key) {
    if (key === 'name') return `${p.lastName} ${p.firstName}`;
    if (key === 'position') return posOrder(p);
    if (key === 'classYear') return ['FR', 'SO', 'JR', 'SR'].indexOf(p.classYear);
    return p[key];
  }

  function draw() {
    const players = team.roster
      .map((id) => s.players[id])
      .filter((p) => filter === 'ALL' || p.position === filter)
      .sort((a, b) => {
        const va = value(a, sortKey);
        const vb = value(b, sortKey);
        const c = va < vb ? -1 : va > vb ? 1 : 0;
        return desc ? -c : c;
      });
    wrap.replaceChildren(
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, COLUMNS.map(([key, label]) => h('th', { class: `sortable ${['overall', 'potential', 'morale'].includes(key) ? 'num' : ''}`, onclick: () => sortBy(key) }, label + (sortKey === key ? (desc ? ' ▼' : ' ▲') : ''))))),
        h(
          'tbody',
          {},
          players.map((p) =>
            h(
              'tr',
              { class: 'clickable', onclick: () => showPlayer(p) },
              h('td', {}, p.position),
              h('td', {}, `${p.firstName} ${p.lastName}`),
              h('td', {}, p.classYear + (p.redshirted ? ' (RS)' : '')),
              h('td', { class: 'num' }, p.overall),
              h('td', { class: 'num' }, p.potential),
              h('td', {}, p.injury > 0 ? h('span', { class: 'pill bad' }, `Out ${p.injury} wk`) : h('span', { class: 'pill good' }, 'Healthy')),
              h('td', { class: 'num' }, p.morale),
            ),
          ),
        ),
      ),
    );
  }

  function sortBy(key) {
    if (sortKey === key) desc = !desc;
    else {
      sortKey = key;
      desc = ['overall', 'potential', 'morale', 'injury'].includes(key);
    }
    draw();
  }

  const select = h('select', { 'aria-label': 'Filter by position', onchange: (e) => { filter = e.target.value; draw(); } }, h('option', { value: 'ALL' }, 'All positions'), POSITIONS.map((p) => h('option', { value: p }, p)));
  draw();
  return h('div', {}, h('h1', {}, `Roster (${team.roster.length}/85)`), h('div', { class: 'row', style: { marginBottom: '10px' } }, select, h('span', { class: 'muted' }, 'Click a column to sort, or a player for details.')), h('div', { class: 'card' }, wrap));
}

export function showPlayer(p) {
  const statLines = Object.entries(p.stats || {}).filter(([, v]) => v);
  modal(
    h(
      'div',
      {},
      h('h2', {}, `${p.firstName} ${p.lastName}`),
      h('p', { class: 'muted' }, `${p.position} · ${p.classYear}${p.redshirted ? ' (redshirt)' : ''} · from ${p.homeState}`),
      h('p', {}, `Overall ${p.overall} · Potential ${p.potential} · Morale ${p.morale}`),
      h('h3', {}, 'Ratings'),
      h('table', {}, h('tbody', {}, Object.entries(p.attrs).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, v))))),
      h('h3', { style: { marginTop: '10px' } }, 'Season stats'),
      statLines.length ? h('table', {}, h('tbody', {}, statLines.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, v))))) : h('p', { class: 'muted' }, 'No stats yet.'),
    ),
  );
}
```

```js
// file: src/ui/depth.js
import { h } from './dom.js';
import { POSITIONS, STARTERS } from '../engine/players.js';
import { autoDepth } from '../engine/league.js';

export function renderDepth(ctx) {
  const s = ctx.state;
  const us = s.coach.teamId;
  let position = 'QB';
  const list = h('ul', { class: 'depth-list' });
  const tabs = h('div', { class: 'row', style: { marginBottom: '10px' } });

  function move(index, delta) {
    const ids = s.teams[us].depth[position];
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    ctx.save();
    draw();
  }

  function draw() {
    tabs.replaceChildren(...POSITIONS.map((p) => h('button', { class: `small ${p === position ? 'primary' : ''}`, onclick: () => { position = p; draw(); } }, p)));
    const ids = s.teams[us].depth[position];
    const starters = STARTERS[position];
    let healthySeen = 0;
    list.replaceChildren(
      ...ids.map((id, i) => {
        const p = s.players[id];
        const injured = p.injury > 0;
        const starter = !injured && healthySeen < starters;
        if (!injured) healthySeen++;
        return h(
          'li',
          { class: `${starter ? 'starter' : ''} ${injured ? 'injured' : ''}` },
          h('span', { class: 'ovr' }, p.overall),
          h('span', { class: 'name' }, `${p.firstName} ${p.lastName}`, h('span', { class: 'muted' }, ` ${p.classYear}`), injured ? h('span', { class: 'pill bad', style: { marginLeft: '6px' } }, `Injured ${p.injury} wk`) : null, starter ? h('span', { class: 'pill good', style: { marginLeft: '6px' } }, 'Starter') : null),
          h('button', { class: 'small', disabled: i === 0, onclick: () => move(i, -1), 'aria-label': 'Move up' }, '▲'),
          h('button', { class: 'small', disabled: i === ids.length - 1, onclick: () => move(i, 1), 'aria-label': 'Move down' }, '▼'),
        );
      }),
    );
  }

  draw();
  return h(
    'div',
    {},
    h('div', { class: 'row' }, h('h1', {}, 'Depth Chart'), h('span', { class: 'spacer' }), h('button', { onclick: () => { autoDepth(s, us); ctx.save(); draw(); } }, 'Auto-fill best')),
    h('p', { class: 'muted' }, 'Players at the top start. Injured players are skipped automatically.'),
    tabs,
    h('div', { class: 'card' }, list),
  );
}
```

```js
// file: src/ui/plan.js
import { h } from './dom.js';
import { OFFENSE_STYLES, DEFENSE_STYLES, TEMPOS } from '../engine/sim.js';

const HELP = {
  Balanced: 'An even mix of plays.',
  'Run Heavy': 'Runs more often, with a small bonus on runs.',
  'Pass Heavy': 'Throws more often, with a small bonus on passes.',
  'Air Raid': 'Throws a lot, including deep, with a bonus on quick and deep passes.',
  'Stop the Run': 'More run blitzes, with a bonus against runs.',
  'Aggressive Blitz': 'Blitzes far more often: more sacks, but open to screens.',
  "Bend Don't Break": 'Plays coverage and gives up short gains, with a bonus against deep passes.',
  Normal: 'Standard pace.',
  'Hurry-Up': 'About 15–20% more plays, which helps the stronger team. Slightly more fumbles.',
};

export function renderPlan(ctx) {
  const s = ctx.state;
  const plan = s.teams[s.coach.teamId].plan;

  function group(title, key, options) {
    const grid = h('div', { class: 'choice-grid' });
    function draw() {
      grid.replaceChildren(...options.map((o) => h('button', { class: plan[key] === o ? 'selected' : '', onclick: () => { plan[key] = o; ctx.save(); draw(); } }, h('strong', {}, o), h('div', { class: 'muted', style: { fontSize: '13px' } }, HELP[o] || ''))));
    }
    draw();
    return h('div', { class: 'card' }, h('h2', {}, title), grid);
  }

  return h(
    'div',
    {},
    h('h1', {}, 'Game Plan'),
    h('p', { class: 'muted' }, 'Your plan shapes the plays called for you and gives a small boost to the plays it favors. Matchups between players still matter most.'),
    h('div', { class: 'grid' }, group('Offense', 'offense', OFFENSE_STYLES), group('Defense', 'defense', DEFENSE_STYLES), group('Tempo', 'tempo', TEMPOS)),
  );
}
```

- [ ] **Step 2: Add the routes**

In `src/main.js`, add these imports after `import { renderHome } from './ui/home.js';`:

```js
import { renderRoster } from './ui/roster.js';
import { renderDepth } from './ui/depth.js';
import { renderPlan } from './ui/plan.js';
```

Then add these entries to `ROUTES`, directly after the `home:` line:

```js
  roster: { label: 'Roster', render: renderRoster },
  depth: { label: 'Depth Chart', render: renderDepth },
  plan: { label: 'Game Plan', render: renderPlan },
```

- [ ] **Step 3: Check it by hand in Chrome** (with the server from Task 9 running)

1. **Roster:** it shows "Roster (75/85)". Clicking **OVR** sorts by overall, highest first, and clicking again reverses the order. The position filter works, and clicking a player opens their ratings.
2. **Depth Chart:** on the QB tab, the top player is marked "Starter". Pressing ▼ on the starter makes the second QB the starter. Reload the page and confirm the order stuck, then click **Auto-fill best** to restore it.
3. **Game Plan:** choose Air Raid, Aggressive Blitz and Hurry-Up. Reload, and confirm all three are still selected.
4. The browser console shows no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/roster.js src/ui/depth.js src/ui/plan.js src/main.js
git commit -m "Add roster, depth chart and game plan screens"
```

### Task 11: Game screen (both modes) and box score

**Files:**
- Create: `src/ui/boxscore.js`, `src/ui/game.js`
- Modify: `src/main.js` (imports and `ROUTES`)

**Interfaces:**
- Consumes: `Rng` (Task 1); `createGame`, `runPlay`, `simulateRest`, `finalizeGame`, `isKeyMoment`, `offenseOptions`, `DEFENSE_CALLS`, `situation` (Task 6); `applyResult` (Task 7); `state.liveGame` (set by Home in Task 9)
- Produces:
  - `boxScore(state, game) → HTMLElement`, used again by the schedule screen in Task 12. If the game kept only the score, it shows just the score.
  - `renderGame(ctx)`
  - **Game state during a live game:** `state.liveGame.g` holds the game and is saved at each key moment, so leaving and coming back resumes the game. When the game ends, `applyResult` runs, `state.liveGame` becomes `null`, and `state.lastGameId` is set.

- [ ] **Step 1: Write the box score and game screen**

```js
// file: src/ui/boxscore.js
import { h } from './dom.js';

const PASS = ['passComp', 'passAtt', 'passYds', 'passTD', 'intThrown'];

function leaders(result, ids, key, n = 3) {
  return ids
    .filter((id) => result.playerStats[id] && result.playerStats[id][key])
    .sort((a, b) => result.playerStats[b][key] - result.playerStats[a][key])
    .slice(0, n);
}

// Full box score for a game that kept its detailed result.
export function boxScore(state, game) {
  const r = game.result;
  const { home, away } = game;
  const name = (id) => (r.names && r.names[id]) || 'Player';
  const side = (id) => (state.players[id] ? state.players[id].teamId : null);
  if (!r.teamStats) {
    return h('p', {}, `${state.teams[away].name} ${r.awayScore} @ ${state.teams[home].name} ${r.homeScore}${r.overtime ? ' (OT)' : ''}`);
  }
  const teamRow = (label, f) => h('tr', {}, h('td', {}, label), h('td', { class: 'num' }, f(r.teamStats[away])), h('td', { class: 'num' }, f(r.teamStats[home])));
  const fmtTop = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  const allIds = Object.keys(r.playerStats);
  const block = (teamId) => {
    const ids = allIds.filter((id) => side(id) === teamId);
    const ps = (id) => r.playerStats[id];
    const passers = leaders(r, ids, 'passAtt', 1);
    const rushers = leaders(r, ids, 'rushYds', 2);
    const receivers = leaders(r, ids, 'recYds', 3);
    return h(
      'div',
      { class: 'card' },
      h('h3', {}, state.teams[teamId].name),
      passers.map((id) => h('p', {}, `${name(id)}: ${ps(id).passComp || 0}/${ps(id).passAtt || 0}, ${ps(id).passYds || 0} yds, ${ps(id).passTD || 0} TD, ${ps(id).intThrown || 0} INT`)),
      rushers.map((id) => h('p', {}, `${name(id)}: ${ps(id).rushAtt || 0} rush, ${ps(id).rushYds || 0} yds${ps(id).rushTD ? `, ${ps(id).rushTD} TD` : ''}`)),
      receivers.map((id) => h('p', {}, `${name(id)}: ${ps(id).rec || 0} rec, ${ps(id).recYds || 0} yds${ps(id).recTD ? `, ${ps(id).recTD} TD` : ''}`)),
    );
  };

  const quarters = (id) => [...r.quarters[id], r.overtime ? (id === home ? r.homeScore : r.awayScore) - r.quarters[id].reduce((a, b) => a + b, 0) : null].filter((x) => x !== null);
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'card' },
      h('h3', {}, game.label || 'Final'),
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, ''), ['1', '2', '3', '4', ...(r.overtime ? ['OT'] : [])].map((q) => h('th', { class: 'num' }, q)), h('th', { class: 'num' }, 'T'))),
        h('tbody', {}, [away, home].map((id) => h('tr', {}, h('td', {}, state.teams[id].name), quarters(id).map((x) => h('td', { class: 'num' }, x)), h('td', { class: 'num' }, h('strong', {}, id === home ? r.homeScore : r.awayScore))))),
      ),
    ),
    h(
      'div',
      { class: 'grid', style: { marginTop: '14px' } },
      h(
        'div',
        { class: 'card' },
        h('h3', {}, 'Team stats'),
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { class: 'num' }, state.teams[away].short), h('th', { class: 'num' }, state.teams[home].short))),
          h(
            'tbody',
            {},
            teamRow('Total yards', (t) => t.yards),
            teamRow('Passing', (t) => t.passYards),
            teamRow('Rushing', (t) => t.rushYards),
            teamRow('First downs', (t) => t.firstDowns),
            teamRow('3rd down', (t) => `${t.thirdConv}/${t.thirdAtt}`),
            teamRow('Turnovers', (t) => t.turnovers),
            teamRow('Possession', (t) => fmtTop(t.top)),
          ),
        ),
      ),
      h('div', { class: 'card' }, h('h3', {}, 'Highlights'), h('ul', { class: 'feed' }, r.highlights.map((e) => h('li', { class: e.scoring ? 'score' : e.turnover ? 'turnover' : '' }, h('span', { class: 'tag' }, `Q${e.q} ${e.clock}`), `${e.short}: ${e.text}`)))),
      block(away),
      block(home),
    ),
  );
}
```

```js
// file: src/ui/game.js
import { h } from './dom.js';
import { Rng } from '../engine/rng.js';
import { createGame, runPlay, simulateRest, finalizeGame, isKeyMoment, offenseOptions, DEFENSE_CALLS, situation } from '../engine/sim.js';
import { applyResult } from '../engine/season.js';
import { boxScore } from './boxscore.js';

const SPEEDS = { '1x': 900, '2x': 450, '4x': 150 };

export function renderGame(ctx) {
  const s = ctx.state;
  const us = s.coach.teamId;

  if (!s.liveGame) return finishedView(ctx);
  const game = s.games.find((x) => x.id === s.liveGame.gameId);
  if (!game || game.result) {
    s.liveGame = null;
    ctx.save();
    return finishedView(ctx);
  }

  const rng = new Rng(s.rngState);
  const persist = () => {
    s.rngState = rng.state;
    ctx.save();
  };
  if (!s.liveGame.g) s.liveGame.g = createGame(s, game);
  const g = s.liveGame.g;

  if (s.liveGame.mode === 'sim') {
    simulateRest(g, rng);
    complete();
    return finishedView(ctx, game);
  }

  function complete() {
    applyResult(s, game, finalizeGame(g));
    s.liveGame = null;
    s.lastGameId = game.id;
    persist();
  }

  // ----- Live view -----
  let speed = '2x';
  let timer = null;
  const root = h('div');
  const board = h('div', { class: 'card' });
  const feed = h('ul', { class: 'feed' });
  const panel = h('div');
  const speedRow = h('div', { class: 'row' });

  function drawBoard() {
    const sit = situation(g);
    const t = (id) => s.teams[id];
    const ballPct = 8 + (g.possession === g.home ? 100 - g.ball : g.ball) * 0.84;
    const lineTo = g.possession === g.home ? 100 - Math.min(100, g.ball + g.toGo) : Math.min(100, g.ball + g.toGo);
    const yardLine = g.ball > 50 ? `opp ${100 - g.ball}` : `own ${g.ball}`;
    board.replaceChildren(
      h(
        'div',
        { class: 'scoreboard' },
        h('div', {}, h('div', { class: 'team', style: { color: t(g.away).colors.primary === '#FFFFFF' ? '#fff' : undefined } }, t(g.away).name, g.possession === g.away ? ' 🏈' : ''), h('div', { class: 'score' }, g.score[g.away])),
        h('div', { class: 'clock' }, g.over ? 'FINAL' : g.ot ? `OT${g.ot.period}` : `Q${g.quarter} ${Math.floor(g.clock / 60)}:${String(g.clock % 60).padStart(2, '0')}`),
        h('div', {}, h('div', { class: 'team' }, t(g.home).name, g.possession === g.home ? ' 🏈' : ''), h('div', { class: 'score' }, g.score[g.home])),
      ),
      h('div', { class: 'field', 'aria-hidden': 'true' }, h('div', { class: 'endzone', style: { left: 0 } }), h('div', { class: 'endzone', style: { right: 0 } }), h('div', { class: 'marker', style: { left: `${8 + lineTo * 0.84}%` } }), h('div', { class: 'ball', style: { left: `${ballPct}%` } })),
      h('p', { class: 'muted', style: { textAlign: 'center', margin: '4px 0 0' } }, g.over ? '' : g.pat ? `${s.teams[sit.offense].short} try after touchdown` : `${s.teams[sit.offense].short} ball · ${ordinal(g.down)} & ${g.ball + g.toGo >= 100 ? 'Goal' : g.toGo} at the ${yardLine}`),
    );
  }

  function addFeed(entry) {
    if (!entry) return;
    const cls = entry.marker ? 'marker' : entry.scoring ? 'score' : entry.turnover || entry.turnoverOnDowns ? 'turnover' : '';
    feed.prepend(h('li', { class: cls }, entry.marker ? entry.text : [h('span', { class: 'tag' }, `${entry.q === 'OT' ? 'OT' : `Q${entry.q}`} ${entry.clock}`), `${entry.short}: ${entry.text}`]));
  }

  function drawSpeed() {
    speedRow.replaceChildren(
      h('span', { class: 'muted' }, 'Speed:'),
      ...Object.keys(SPEEDS).map((k) => h('button', { class: `small ${speed === k ? 'primary' : ''}`, onclick: () => { speed = k; drawSpeed(); } }, k)),
      h('button', { class: 'small', onclick: () => { speed = 'skip'; drawSpeed(); } }, 'Skip to my next call'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'small', onclick: simRest }, 'Sim rest of game'),
    );
  }

  function simRest() {
    clearTimeout(timer);
    const before = g.log.length;
    simulateRest(g, rng);
    g.log.slice(before).forEach(addFeed);
    complete();
    ctx.go('game');
  }

  function step() {
    if (!root.isConnected && timer !== null) return; // left the page; resume later from the save
    if (g.over) {
      complete();
      ctx.go('game');
      return;
    }
    if (isKeyMoment(g, us)) {
      persist();
      showCallPanel();
      return;
    }
    const before = g.log.length;
    runPlay(g, rng);
    g.log.slice(before).forEach(addFeed);
    drawBoard();
    timer = setTimeout(step, speed === 'skip' ? 0 : SPEEDS[speed]);
  }

  function showCallPanel() {
    const sit = situation(g);
    const onOffense = sit.offense === us;
    const opp = onOffense ? sit.defense : sit.offense;
    const oppPlan = s.teams[opp].plan;
    const options = onOffense ? offenseOptions(g) : DEFENSE_CALLS;
    const reason = g.pat ? 'Try after touchdown' : g.down === 4 ? '4th down' : g.ball >= 80 ? 'Red zone' : g.down === 3 ? '3rd and long' : 'Crunch time';
    panel.replaceChildren(
      h(
        'div',
        { class: 'card callpanel', style: { marginTop: '14px' } },
        h('h2', {}, `${reason}: make the call (${onOffense ? 'offense' : 'defense'})`),
        h('p', { class: 'muted' }, `${s.teams[opp].name} tendency: ${onOffense ? `${oppPlan.defense} defense` : `${oppPlan.offense} offense`}.`),
        h('div', { class: 'choice-grid' }, options.map((call) => h('button', { onclick: () => choose(onOffense, call) }, call))),
      ),
    );
  }

  function choose(onOffense, call) {
    panel.replaceChildren();
    const before = g.log.length;
    runPlay(g, rng, onOffense ? { offense: call } : { defense: call });
    g.log.slice(before).forEach(addFeed);
    drawBoard();
    persist();
    timer = setTimeout(step, speed === 'skip' ? 0 : SPEEDS[speed]);
  }

  g.log.forEach(addFeed);
  drawBoard();
  drawSpeed();
  root.append(h('h1', {}, game.label || 'Game day'), board, h('div', { class: 'card', style: { marginTop: '14px' } }, speedRow, h('div', { style: { marginTop: '10px' } }, feed)), panel);
  timer = setTimeout(step, 300);
  return root;
}

function finishedView(ctx, game) {
  const s = ctx.state;
  const g = game || s.games.find((x) => x.id === s.lastGameId);
  if (!g || !g.result) return h('div', {}, h('h1', {}, 'No game in progress'), h('button', { onclick: () => ctx.go('home') }, 'Back to Home'));
  return h('div', {}, h('div', { class: 'row' }, h('h1', {}, 'Final'), h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: () => ctx.go('home') }, 'Back to Home')), boxScore(s, g));
}

function ordinal(n) {
  return ['', '1st', '2nd', '3rd', '4th'][n] || `${n}th`;
}
```

- [ ] **Step 2: Add the route**

In `src/main.js`, add these imports after `import { renderHome } from './ui/home.js';`:

```js
import { renderGame } from './ui/game.js';
```

Then add these entries to `ROUTES`, directly after the `home:` line:

```js
  game: { label: 'Game', render: renderGame, hidden: true },
```

- [ ] **Step 3: Check it by hand in Chrome**

1. **Sim to end:** from Home, click **Sim to end**. The Final screen shows the scores by quarter, team stats (possession times add up to 60:00), highlights, and leaders for each team. **Back to Home** shows the record as 1-0 or 0-1, plus a news item.
2. **Coach key moments:** advance a week, then click **Coach key moments**. The feed scrolls and the scoreboard and field bar update. The game pauses with a "make the call" panel on 3rd-and-long, 4th down, red zone snaps and tries after touchdowns, for both offense and defense. On 4th down, Punt and Field Goal appear, and after a touchdown, Extra Point appears.
3. **Speed controls:** each one changes the pace. **Skip to my next call** jumps to the next decision.
4. **Resume:** at a call panel, reload the page and go to `#/game`. The game resumes at the same score and situation.
5. **Sim rest of game:** this finishes the game and shows the Final screen.
6. **Automated check:** in the browser console, a script that clicks a call button whenever `.callpanel` appears plays the game through to "Final" with no errors. The prototype saw about 49 decisions in one game, covering every kind of key moment.

- [ ] **Step 4: Commit**

```bash
git add src/ui/boxscore.js src/ui/game.js src/main.js
git commit -m "Add game screen with sim and coach modes, and box score"
```

### Task 12: Schedule and rankings screens, and a full-season check

**Files:**
- Create: `src/ui/schedule.js`, `src/ui/rankings.js`, `README.md`
- Modify: `src/main.js` (imports and `ROUTES`)

**Interfaces:**
- Consumes: `teamGames`, `conferenceStandings`, `CHAMPIONSHIP_CONFERENCES` (Task 7); `boxScore` (Task 11); `teamOverall` (Task 5); the `dom.js` helpers (Task 9)
- Produces: `renderSchedule(ctx)` and `renderRankings(ctx)`

- [ ] **Step 1: Write the two screens**

```js
// file: src/ui/schedule.js
import { h, modal, teamLabel } from './dom.js';
import { teamGames } from '../engine/season.js';
import { boxScore } from './boxscore.js';

export function renderSchedule(ctx) {
  const s = ctx.state;
  const us = s.coach.teamId;
  const games = teamGames(s, us).sort((a, b) => a.week - b.week);
  const weekSelect = h('select', { 'aria-label': 'League week', onchange: drawWeek });
  const maxWeek = Math.max(...s.games.map((g) => g.week));
  for (let w = 1; w <= maxWeek; w++) weekSelect.append(h('option', { value: w, selected: w === Math.min(s.week, maxWeek) }, `Week ${w}`));
  const weekList = h('div', { class: 'table-wrap' });

  function drawWeek() {
    const w = Number(weekSelect.value);
    weekList.replaceChildren(
      h(
        'table',
        {},
        h(
          'tbody',
          {},
          s.games
            .filter((g) => g.week === w)
            .map((g) => h('tr', { class: g.home === us || g.away === us ? 'me' : '' }, h('td', {}, s.teams[g.away].name), h('td', { class: 'num' }, g.result ? g.result.awayScore : ''), h('td', {}, g.neutral ? 'vs' : '@'), h('td', {}, s.teams[g.home].name), h('td', { class: 'num' }, g.result ? g.result.homeScore : ''), h('td', { class: 'muted' }, g.label || ''))),
        ),
      ),
    );
  }
  drawWeek();

  return h(
    'div',
    {},
    h('h1', {}, `${s.year} Schedule`),
    h(
      'div',
      { class: 'grid' },
      h(
        'div',
        { class: 'card' },
        h('h3', {}, s.teams[us].name),
        h(
          'div',
          { class: 'table-wrap' },
          h(
          'table',
          {},
          h(
            'tbody',
            {},
            games.map((g) => {
              const home = g.home === us;
              const opp = home ? g.away : g.home;
              let res = '';
              if (g.result) {
                const ours = home ? g.result.homeScore : g.result.awayScore;
                const theirs = home ? g.result.awayScore : g.result.homeScore;
                res = h('span', { class: `pill ${ours > theirs ? 'good' : 'bad'}` }, `${ours > theirs ? 'W' : 'L'} ${ours}-${theirs}${g.result.overtime ? ' OT' : ''}`);
              }
              return h('tr', { class: g.result ? 'clickable' : '', onclick: () => g.result && modal(boxScore(s, g)) }, h('td', {}, `Wk ${g.week}`), h('td', {}, `${g.neutral ? 'vs' : home ? 'vs' : '@'} ${teamLabel(s, opp)}`), h('td', { class: 'muted' }, g.label || ''), h('td', {}, res));
            }),
          ),
          ),
        ),
        h('p', { class: 'muted' }, 'Weeks not listed are byes. Click a result for the box score.'),
      ),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', {}, 'Around the league'), h('span', { class: 'spacer' }), weekSelect), weekList),
    ),
  );
}
```

```js
// file: src/ui/rankings.js
import { h } from './dom.js';
import { conferenceStandings, CHAMPIONSHIP_CONFERENCES } from '../engine/season.js';
import { teamOverall } from '../engine/league.js';

export function renderRankings(ctx) {
  const s = ctx.state;
  const us = s.coach.teamId;
  const top = s.rankings.slice(0, 25);
  return h(
    'div',
    {},
    h('h1', {}, 'Rankings'),
    h(
      'div',
      { class: 'grid' },
      h(
        'div',
        { class: 'card' },
        h('h3', {}, 'Top 25'),
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Team'), h('th', {}, 'Record'), h('th', { class: 'num' }, 'OVR'))),
          h('tbody', {}, top.map((id, i) => h('tr', { class: id === us ? 'me' : '' }, h('td', {}, i + 1), h('td', {}, s.teams[id].name), h('td', {}, `${s.teams[id].record.w}-${s.teams[id].record.l}`), h('td', { class: 'num' }, teamOverall(s, id))))),
        ),
        s.playoff ? h('p', { class: 'muted' }, `Playoff seeds: ${s.playoff.seeds.map((id, i) => `${i + 1}. ${s.teams[id].short}`).join(', ')}`) : null,
      ),
      CHAMPIONSHIP_CONFERENCES.map((conf) =>
        h(
          'div',
          { class: 'card' },
          h('h3', {}, conf),
          h(
            'table',
            {},
            h('thead', {}, h('tr', {}, h('th', {}, 'Team'), h('th', {}, 'Conf'), h('th', {}, 'All'))),
            h('tbody', {}, conferenceStandings(s, conf).map((id) => h('tr', { class: id === us ? 'me' : '' }, h('td', {}, s.teams[id].name), h('td', {}, `${s.teams[id].record.cw}-${s.teams[id].record.cl}`), h('td', {}, `${s.teams[id].record.w}-${s.teams[id].record.l}`)))),
          ),
        ),
      ),
    ),
  );
}
```

- [ ] **Step 2: Add the routes.** Insert the schedule and rankings entries after `plan:` so the navigation order is Home, Roster, Depth Chart, Game Plan, Schedule, Rankings, Settings.

In `src/main.js`, add these imports after `import { renderHome } from './ui/home.js';`:

```js
import { renderSchedule } from './ui/schedule.js';
import { renderRankings } from './ui/rankings.js';
```

Then add these entries to `ROUTES`, directly after the `home:` line:

```js
  schedule: { label: 'Schedule', render: renderSchedule },
  rankings: { label: 'Rankings', render: renderRankings },
```

- [ ] **Step 3: Write the README**

```markdown
# CFB Dynasty

A browser college football franchise game. Coach one of 68 real programs (with fictional players): set your depth chart and game plan, call plays in the key moments or sim to the end, and chase a 12-team playoff and a national title.

## Play locally

    python3 -I -m http.server 8765 --bind 127.0.0.1

Then open http://127.0.0.1:8765/. Your franchise saves in the browser; use Settings → Export to back it up.

## Tests

    ./test.sh            # all engine tests, in macOS's built-in JavaScriptCore
    ./test.sh sim        # only tests whose name contains "sim"

Or open http://127.0.0.1:8765/tests/tests.html in a browser.

## Layout

- `src/engine/`: game logic (pure, no browser APIs)
- `src/ui/`: one module per screen
- `docs/superpowers/`: design spec and implementation plans
```

- [ ] **Step 4: Check a full season by hand in Chrome**

1. **Schedule:** it lists your 12 games (weeks missing from the list are byes). Clicking a played game opens its box score. "Around the league" changes as you pick different weeks.
2. **Rankings:** it shows the Top 25 with your team highlighted, plus the four conference standings tables.
3. **Full season:** play or sim every week, using **Advance to next week** on byes and after your game is final. After the last regular week, Home shows "Conference championships".
4. **Postseason:** keep going through "Playoff first round and bowls", the quarterfinals, semifinals and national championship. If you're eliminated, Home says your season is over and **Sim this round** keeps the postseason going.
5. **Season complete:** the Home card names the national champion. Rankings lists the 12 playoff seeds.
6. **Record:** your record on Home equals the number of games in your Schedule tab.
7. **Phone width:** load the game in a 390px-wide window (or an iframe of that width). No screen scrolls sideways; wide tables scroll inside their cards. The CSS rule `.grid > * { min-width: 0; }` keeps grid cards from stretching to fit a wide table.
8. Run `./test.sh`, which must end with `0 failed`, and confirm the browser console shows no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/schedule.js src/ui/rankings.js src/main.js README.md
git commit -m "Add schedule and rankings screens and README"
```

### Task 13: Publish on GitHub Pages (only after the user says yes)

**Files:** none changed.

Before any step here, ask the user: "Plan 1 is built and checked. Do you want me to create the public GitHub repository `cfb-dynasty` and turn on GitHub Pages?" Continue only if they clearly say yes.

- [ ] **Step 1: Create the repository and push**

```bash
gh repo create cfb-dynasty --public --source=. --remote=origin --push
```

- [ ] **Step 2: Turn on Pages from `main`**

```bash
gh api -X POST repos/{owner}/cfb-dynasty/pages -f "source[branch]=main" -f "source[path]=/"
gh api repos/{owner}/cfb-dynasty/pages --jq .html_url
```

`{owner}` is the GitHub login, from `gh api user --jq .login`. The first Pages build can take a few minutes. Don't push again while it's building, because a push cancels the build that's running.

- [ ] **Step 3: Verify**

Wait until `gh run list -R {owner}/cfb-dynasty --limit 1` shows `completed success`. Then open the Pages URL in Chrome, start a franchise, and sim one game. Report the URL to the user.

---

## Self-review notes

**Spec coverage for Plan 1:**

| Spec section | Task |
|---|---|
| §1 Teams | 2 |
| §1 Players | 3, 5 |
| §1 Coach (fields only; job security changes come in Plan 3) | 5, shown in 9 |
| §1 New franchise | 5, 9 |
| §2 Schedule | 4 |
| §2 Rankings | 7, 12 |
| §2 Postseason | 7 |
| §2 Game engine and both modes | 6, 11 |
| §3 Depth chart and game plan | 5, 10 |
| §3 Scouting card | 9 |
| §3 Injuries | 6, 7 |
| §3 Weekly loop | 7, 9 |
| §5 Screens (except Recruiting and Portal, which come in Plans 2 and 3) | 9–12 |
| §5 Save handling | 8, 9 |
| §5 Testing | every engine task |

**Deferred to later plans:** §4 recruiting (Plan 2); §4 progression, NFL draft, transfer portal and NIL, the offseason order, prestige drift, and job security changes and firing (Plan 3).

**Known limits, accepted for Plan 1:**
- The season stops at "complete". There is no next season until Plan 3.
- Player stats accumulate for the single season only.
