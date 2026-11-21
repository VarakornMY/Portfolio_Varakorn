import { apps, shortcuts, icon, launcherMarkup, routeFor, pocket } from './launcher.js';
import { libraries, mountLibrary } from './library.js';
import { enableAudio, play, queueStartupSound, renderSound, toggleSound } from './sound.js';

const computer = document.querySelector('#computer');
const originalPath = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
const source = document.querySelector('#document-source');
source.remove();
computer.innerHTML = launcherMarkup();
document.documentElement.classList.add('desktop-ready');
const screen = computer.querySelector('.display-area');
const windows = screen.querySelector('.windows');
const tiles = [...screen.querySelectorAll('.shortcut')];
// Account and community dialogs share the active screen on both form factors.
const overlayClasses = '.authdlg,.wcompose,.vkconfirm,.pcard';
const attachDialogs = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof HTMLElement && node.matches(overlayClasses)) screen.append(node);
    }
  }
});
attachDialogs.observe(document.body, { childList: true });
const frames = new Map();
let active = null,
  selected = 0,
  z = 0,
  controlFocus = null;
const integration = () => import('./integrations.js');
const pathOf = (url) => url.pathname + url.search + url.hash;
const safeFocus = (el) => el?.focus({ preventScroll: true });

function chooseTile(index, focus = false) {
  selected = (index + tiles.length) % tiles.length;
  tiles.forEach((tile, i) => {
    tile.classList.toggle('selected', i === selected);
  });
  screen.querySelector('.pocket-status').textContent =
    'A  Open   ·   ' + apps[shortcuts[selected]].label;
  if (focus) {
    safeFocus(tiles[selected]);
    tiles[selected].scrollIntoView({ block: 'nearest' });
  }
}
function updateLocation(path, replace = false) {
  if (path !== pathOf(new URL(location.href)))
    history[replace ? 'replaceState' : 'pushState'](null, '', path);
}
function front(frame, { record = false, focus = false } = {}) {
  if (active !== frame) {
    active?.el.classList.remove('front');
    active = frame;
    controlFocus = null;
    frame.el.style.zIndex = String(++z);
    frame.el.classList.add('front');
  }
  frame.el.hidden = false;
  frame.el.inert = false;
  screen.classList.add('app-open');
  if (record) updateLocation(frame.url, true);
  document.title = apps[frame.id].label + ' · Varakorn';
  for (const f of frames.values()) f.el.inert = pocket.matches && active !== f;
  if (focus) safeFocus(frame.el);
}
function revealDesktop(record = true) {
  if (active) active.el.classList.remove('front');
  active = null;
  controlFocus = null;
  for (const frame of frames.values()) {
    frame.el.hidden = true;
    frame.el.inert = true;
  }
  screen.classList.remove('app-open');
  document.title = 'Varakorn · Portfolio';
  if (record) updateLocation('/home');
  chooseTile(selected, true);
}
function hide(frame, close) {
  if (!frame) return;
  const tile = tiles.find((t) => t.dataset.launch === frame.id);
  frame.el.hidden = true;
  frame.el.inert = true;
  if (close) {
    tile?.classList.remove('running');
    if (!['account', 'chat', 'guestbook'].includes(frame.id)) {
      frame.cleanup?.();
      frame.revision++;
      frames.delete(frame.id);
      frame.el.remove();
    }
  }
  play('close');
  if (frame === active) {
    const visible = [...frames.values()]
      .filter((f) => !f.el.hidden)
      .sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex));
    if (visible[0] && !pocket.matches) {
      front(visible[0], { focus: true });
      updateLocation(active.url);
    } else revealDesktop();
  }
}
function maximize(frame) {
  const max = frame.el.classList.toggle('maximized');
  const button = frame.el.querySelector('[data-win="max"]');
  button.title = button.ariaLabel = max ? 'Restore window' : 'Maximize window';
}
function keepInBounds(frame) {
  if (pocket.matches || frame.el.classList.contains('maximized') || frame.el.hidden) return;
  const width = screen.clientWidth,
    height = screen.clientHeight;
  frame.el.style.left =
    Math.max(0, Math.min(frame.el.offsetLeft, width - frame.el.offsetWidth)) + 'px';
  frame.el.style.top =
    Math.max(0, Math.min(frame.el.offsetTop, height - frame.el.offsetHeight)) + 'px';
}
function makeFrame(id) {
  const el = document.createElement('section');
  el.className = 'retro-window';
  el.tabIndex = -1;
  el.setAttribute('role', 'region');
  el.ariaLabel = apps[id].label;
  el.innerHTML = `<header class="titlebar">${icon(id)}<strong>${apps[id].label}</strong><div class="window-buttons"><button data-win="min" title="Minimize window" aria-label="Minimize window"><i></i></button><button data-win="max" title="Maximize window" aria-label="Maximize window"><i></i></button><button data-win="close" title="Close window" aria-label="Close window"><i></i></button></div></header><div class="window-body"></div><footer class="window-status"><span>${apps[id].label}</span><i aria-hidden="true"></i></footer>`;
  windows.append(el);
  const step = (frames.size % 5) * 20;
  el.style.left = Math.max(0, (screen.clientWidth - el.offsetWidth) / 2 + step) + 'px';
  el.style.top = Math.max(4, (screen.clientHeight - el.offsetHeight) / 2 + step) + 'px';
  const frame = {
    id,
    el,
    host: el.querySelector('.window-body'),
    url: apps[id].path,
    revision: 0,
    reader: false,
  };
  frames.set(id, frame);
  el.onpointerdown = () => front(frame, { record: true });
  el.onfocusin = () => {
    if (!el.hidden) front(frame, { record: true });
  };
  const bar = el.querySelector('.titlebar');
  bar.ondblclick = (e) => {
    if (!pocket.matches && !e.target.closest('button')) maximize(frame);
  };
  bar.onpointerdown = (e) => {
    if (
      pocket.matches ||
      el.classList.contains('maximized') ||
      e.target.closest('button') ||
      e.button !== 0
    )
      return;
    const left = el.offsetLeft,
      top = el.offsetTop,
      x = e.clientX,
      y = e.clientY;
    bar.setPointerCapture(e.pointerId);
    bar.onpointermove = (ev) => {
      el.style.left = left + ev.clientX - x + 'px';
      el.style.top = top + ev.clientY - y + 'px';
      keepInBounds(frame);
    };
    bar.onlostpointercapture = () => {
      bar.onpointermove = null;
    };
  };
  el.querySelector('.window-buttons').onclick = (e) => {
    const op = e.target.closest('button')?.dataset.win;
    if (op === 'max') maximize(frame);
    else if (op) hide(frame, op === 'close');
  };
  return frame;
}

async function staticDocument(path) {
  if (path === originalPath) return source.querySelector('main').cloneNode(true);
  const r = await fetch(path, { headers: { Accept: 'text/html' } });
  if (!r.ok) throw new Error('Document unavailable');
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  const main = doc.querySelector('#document-source main');
  if (!main) throw new Error('Document unavailable');
  return main;
}
function setReader(frame, on) {
  frame.reader = on;
  frame.el.classList.toggle('reading', on);
  controlFocus = null;
}
function showHelp(host) {
  host.innerHTML = `<article class="reader standalone"><div class="article-copy"><h1>Help</h1><h2>Desktop</h2><p>Click an icon to open its app. Drag the blue title bar to move a window. Drag the lower right corner to resize it. Reopen a minimized window from its desktop icon.</p><h2>Handheld</h2><p>Use the D-pad to choose an app or an entry. Press A to open and B to go back. While reading, up and down scroll, and left and right select links and buttons. You can also tap the screen.</p><p>Start returns home. Select opens Help.</p><button class="xp-button" data-sound></button><p><a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of use</a></p></div></article>`;
  renderSound();
}
async function render(frame, url) {
  const version = ++frame.revision;
  frame.cleanup?.();
  frame.cleanup = null;
  setReader(frame, false);
  const { id, host } = frame;
  const path = url.pathname.replace(/\.html$/, '').replace(/\/$/, '');
  frame.chapter = id === 'experience' && path.startsWith('/experience/');
  const live = () => version === frame.revision;
  const isReading = () =>
    live() && active === frame && !frame.el.hidden && (!pocket.matches || frame.reader);
  let readingVersion = 0;
  const dispose = () => {
    readingVersion++;
    frame.cleanup?.();
    frame.cleanup = null;
  };
  if (id === 'privacy' || id === 'terms' || frame.chapter) {
    setReader(frame, true);
    host.innerHTML =
      '<article class="reader standalone"><div class="document-copy">Loading…</div></article>';
    const body = host.querySelector('.document-copy');
    const main = await staticDocument(path);
    if (!live()) return;
    for (const item of main.querySelectorAll('nav.crumbs,.hanko-stamp,.tape,script')) item.remove();
    body.replaceChildren(...main.childNodes);
    // Load video players only after the visitor chooses one in this chapter.
    for (const clip of body.querySelectorAll('blockquote[data-video-id]')) {
      const videoId = clip.dataset.videoId;
      if (!/^\d+$/.test(videoId)) continue;
      const button = document.createElement('button');
      button.className = 'xp-button';
      button.textContent = 'Play video';
      button.onclick = () => {
        const player = document.createElement('iframe');
        player.title = 'HYGR video';
        player.src = 'https://www.tiktok.com/player/v1/' + videoId;
        player.allowFullscreen = true;
        player.className = 'chapter-video';
        clip.replaceChildren(player);
      };
      clip.prepend(button);
    }
    const comments = body.querySelector('[data-guestbook]');
    if (comments) {
      const mods = await integration();
      if (live()) frame.cleanup = mods.community(comments, path, isReading, 'stamp');
    }
  } else if (libraries[id]) {
    mountLibrary(host, id, url, {
      navigate: (newPath, record, replace) => {
        frame.url = newPath;
        if (record && active === frame) updateLocation(newPath, replace);
      },
      showReader: (on) => setReader(frame, on),
      disposeReader: dispose,
      mountPost: async (node, slug, read) => {
        if (pocket.matches && !read) return;
        const token = readingVersion;
        const mods = await integration();
        if (live() && token === readingVersion)
          frame.cleanup = mods.community(node, '/blog#' + slug, isReading, 'read');
      },
    });
  } else if (id === 'help') {
    setReader(frame, true);
    showHelp(host);
  } else {
    setReader(frame, true);
    const mods = await integration();
    if (live()) await mods[id](host);
  }
}
function openApp(id, path = apps[id]?.path, { record = true, restore = false, sound = true } = {}) {
  if (!apps[id]) return;
  const previous = active;
  let frame = frames.get(id);
  if (restore && frame) path = frame.url;
  const same = frame?.url === path;
  frame ||= makeFrame(id);
  frame.url = path;
  if (pocket.matches && previous?.id !== id) {
    frame.returnTo = previous && { id: previous.id, path: previous.url };
  }
  if (record) updateLocation(path);
  front(frame, { focus: true });
  if (!same)
    render(frame, new URL(path, location.origin)).catch(() => {
      frame.host.innerHTML =
        '<div class="article-copy"><h2>Could not open this document</h2><button class="xp-button" data-retry>Try again</button></div>';
      frame.host.querySelector('button').onclick = () => {
        frame.url = '';
        openApp(id, path);
      };
    });
  const index = shortcuts.indexOf(id);
  if (index >= 0) {
    chooseTile(index);
    tiles[index].classList.add('running');
  }
  if (sound) play('open');
  keepInBounds(frame);
}
function back() {
  if (!active) return;
  const frame = active;
  if (frame.chapter) {
    openApp('experience');
    return;
  }
  if (frame.reader && libraries[frame.id] && !['resume', 'contact'].includes(frame.id)) {
    setReader(frame, false);
    if (frame.id === 'blog') {
      const url = new URL(frame.url, location.origin);
      url.hash = '';
      frame.url = pathOf(url);
      updateLocation(frame.url);
    }
    safeFocus(frame.host.querySelector('[aria-current="true"]'));
    play('close');
    return;
  }
  const previous = frame.returnTo;
  hide(frame, true);
  if (previous && frames.has(previous.id)) openApp(previous.id, previous.path, { restore: true });
}
function moveFocus(items, by, initial = document.activeElement) {
  if (!items.length) return;
  const old = items.indexOf(items.includes(controlFocus) ? controlFocus : initial);
  const i = old < 0 ? (by > 0 ? 0 : items.length - 1) : (old + by + items.length) % items.length;
  screen.querySelector('[data-pad-focus]')?.removeAttribute('data-pad-focus');
  controlFocus = items[i];
  controlFocus.setAttribute('data-pad-focus', '');
  safeFocus(controlFocus);
  controlFocus.scrollIntoView({ block: 'nearest' });
  play('select');
}
const interactive =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary';
function command(key) {
  enableAudio();
  const dialog = [
    ...document.querySelectorAll(
      '.authdlg.is-open,.wcompose.is-open,.vkconfirm.is-open,.pcard.is-open',
    ),
  ].at(-1);
  if (dialog) {
    if (key === 'b' || key === 'start')
      dialog.querySelector('.vkc-no,.pcard-close,.ad-close,.wcompose-close')?.click();
    else if (key === 'a')
      (controlFocus && dialog.contains(controlFocus)
        ? controlFocus
        : dialog.querySelector(interactive)
      )?.click();
    else if (['left', 'right', 'up', 'down'].includes(key))
      moveFocus(
        [...dialog.querySelectorAll(interactive)].filter((el) => el.getClientRects().length),
        ['left', 'up'].includes(key) ? -1 : 1,
      );
    return;
  }
  if (key === 'start') {
    revealDesktop();
    play('close');
    return;
  }
  if (key === 'select') {
    if (active?.id === 'help') back();
    else openApp('help');
    return;
  }
  if (key === 'b') {
    back();
    return;
  }
  if (!active) {
    if (key === 'a') {
      openApp(shortcuts[selected], undefined, { restore: true });
      return;
    }
    const steps = pocket.matches ? {up:-3,down:3,left:-1,right:1} : {up:-1,down:1,left:-5,right:5};
    const delta = steps[key];
    if (delta) {
      chooseTile(selected + delta, true);
      play('select');
    }
    return;
  }
  const host = active.host;
  const reader = host.querySelector('.reader,.chat-room');
  const visible = [...host.querySelectorAll(interactive)].filter(
    (el) => el.getClientRects().length && el.tabIndex !== -1,
  );
  if (key === 'a') {
    const el = visible.includes(controlFocus)
      ? controlFocus
      : visible.includes(document.activeElement)
        ? document.activeElement
        : visible.find((item) => item.matches('.file-list [aria-current="true"]')) || visible[0];
    if (el?.matches('input,textarea,select')) el.focus();
    else el?.click();
    return;
  }
  if (active.reader && (key === 'up' || key === 'down')) {
    const scroll = reader?.querySelector('.transcript') || reader;
    scroll?.scrollBy({
      top: (key === 'up' ? -1 : 1) * Math.max(64, scroll.clientHeight * 0.72),
      behavior: 'instant',
    });
    play('select');
    return;
  }
  if (!active.reader && (key === 'up' || key === 'down')) {
    const rows = visible.filter(el => el.matches('[data-row]'));
    if(rows.length) {
      moveFocus(rows,key === 'up' ? -1 : 1,host.querySelector('[data-row][aria-current=true]'));
      return;
    }
  }
  moveFocus(visible, ['left', 'up'].includes(key) ? -1 : 1);
}

computer.addEventListener('pointerdown', (e) => {
  enableAudio();
  if (e.target.closest('[data-control]')) e.preventDefault();
});
computer.addEventListener('click', (e) => {
  const sound = e.target.closest('[data-sound]');
  if (sound) {
    toggleSound();
    return;
  }
  const control = e.target.closest('[data-control]');
  if (control) {
    command(control.dataset.control);
    return;
  }
  const launcher = e.target.closest('[data-launch]');
  if (launcher && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    e.preventDefault();
    openApp(launcher.dataset.launch, undefined, { restore: true });
    return;
  }
  const anchor = e.target.closest('a[href]');
  if (
    !anchor ||
    anchor.target ||
    anchor.hasAttribute('download') ||
    e.ctrlKey ||
    e.metaKey ||
    e.shiftKey
  )
    return;
  const url = new URL(anchor.href);
  if (url.origin !== location.origin) return;
  const id = routeFor(url);
  if (id) {
    e.preventDefault();
    openApp(id, pathOf(url));
  } else if (id === null) {
    e.preventDefault();
    revealDesktop();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  enableAudio();
  if (
    e.target.closest(
      'input,textarea,select,[contenteditable=true],.authdlg,.wcompose,.pcard,.vkconfirm',
    )
  )
    return;
  if (e.key === 'Escape' && active) {
    e.preventDefault();
    if (pocket.matches) back();
    else hide(active, true);
    return;
  }
  const arrows = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  if (arrows[e.key] && (pocket.matches || !active)) {
    e.preventDefault();
    command(arrows[e.key]);
  }
  if (pocket.matches && e.key === 'Enter' && !e.target.closest(interactive)) {
    e.preventDefault();
    command('a');
  }
});
tiles.forEach((tile, i) => tile.addEventListener('focus', () => chooseTile(i)));
window.addEventListener('resize', () => {
  for (const frame of frames.values()) keepInBounds(frame);
});
pocket.addEventListener('change', () => {
  if (active) front(active);
  else chooseTile(selected);
});
function followLocation() {
  const url = new URL(location.href),
    id = routeFor(url);
  if (id) openApp(id, pathOf(url), { record: false, sound: false });
  else revealDesktop(false);
}
window.addEventListener('popstate', followLocation);
renderSound();
chooseTile(0);
if (routeFor(new URL(location.href))) followLocation();
else {
  let seen = false;
  try {
    seen = sessionStorage.getItem('vk-booted') === '1';
    sessionStorage.setItem('vk-booted', '1');
  } catch {}
  if (!seen && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const boot = document.createElement('button');
    boot.className = 'boot';
    boot.ariaLabel = 'Skip startup';
    boot.innerHTML =
      '<span class="boot-logo">Varakorn<sup>xp</sup></span><span class="boot-edition">Portfolio Edition</span><span class="boot-meter"><i></i></span>';
    screen.append(boot);
    const finish = () => {
      boot.remove();
      queueStartupSound();
    };
    const timer = setTimeout(finish, 1200);
    boot.onclick = () => {
      clearTimeout(timer);
      finish();
    };
  }
}
