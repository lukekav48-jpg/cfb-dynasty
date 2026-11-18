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
