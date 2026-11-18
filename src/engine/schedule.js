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
