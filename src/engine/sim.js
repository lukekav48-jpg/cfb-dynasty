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
