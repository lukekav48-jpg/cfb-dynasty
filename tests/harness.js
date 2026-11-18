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
