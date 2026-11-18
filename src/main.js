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
