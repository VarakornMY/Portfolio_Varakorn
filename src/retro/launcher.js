export const apps = {
  about: { label: 'About Me', path: '/home#about' },
  projects: { label: 'My Projects', path: '/home#work' },
  experience: { label: 'Experience', path: '/experience' },
  journey: { label: 'My Journey', path: '/journey' },
  blog: { label: 'Blog', path: '/blog' },
  contact: { label: 'Contact', path: '/contact' },
  resume: { label: 'My Résumé', path: '/home#resume' },
  chat: { label: 'AI Chat', path: '/home#chat' },
  guestbook: { label: 'Guestbook', path: '/home#guestbook' },
  account: { label: 'My Account', path: '/account' },
  help: { label: 'Help', path: '/home#help' },
  privacy: { label: 'Privacy Policy', path: '/privacy', icon: 'legal' },
  terms: { label: 'Terms of Use', path: '/terms', icon: 'legal' },
};
export const shortcuts = Object.keys(apps).slice(0, 10);
export const icon = (id) =>
  '<img class="app-icon" alt="" draggable="false" src="/retro/icons/' +
  (apps[id]?.icon || id) +
  '.png">';
export const pocketQuery = '(max-width: 700px), (hover: none) and (max-height: 540px)';
export const pocket = matchMedia(pocketQuery);

export function routeFor(url) {
  const path = url.pathname.replace(/\.html$/, '').replace(/\/$/, '');
  if (path.startsWith('/experience/')) return 'experience';
  if (path === '/home' || !path || path === '/index') {
    const hash = url.hash.slice(1);
    const aliases = {
      work: 'projects',
      projects: 'projects',
      services: 'about',
      chapters: 'journey',
      contact: 'contact',
    };
    return Object.hasOwn(aliases, hash) ? aliases[hash] : Object.hasOwn(apps, hash) ? hash : null;
  }
  return Object.keys(apps).find((id) => apps[id].path === path);
}

export function launcherMarkup() {
  const tiles = shortcuts
    .map(
      (id) =>
        `<a class="shortcut" href="${apps[id].path}" data-launch="${id}">${icon(id)}<span>${apps[id].label}</span></a>`,
    )
    .join('');
  const pad = ['up', 'left', 'right', 'down']
    .map(
      (dir, i) =>
        `<button class="pad-${dir}" aria-label="Move ${dir}" data-control="${dir}"><span aria-hidden="true">${['▲', '◀', '▶', '▼'][i]}</span></button>`,
    )
    .join('');
  return `<div class="machine">
    <div class="lid">
      <div class="bezel">
        <main class="display-area" aria-label="Varakorn's portfolio desktop">
          <div class="wallpaper-brand"><div>Varakorn<sup>xp</sup></div><span>Portfolio Edition</span></div>
          <div class="system-tools"><button data-sound aria-label="Mute sound" title="Mute sound"></button><button data-launch="help" aria-label="Open help" title="Help">${icon('help')}</button></div>
          <div class="pocket-head"><b>VARAKORN</b><span>APP MENU</span></div>
          <nav class="shortcut-grid" aria-label="Portfolio applications">${tiles}</nav>
          <div class="pocket-status" aria-live="polite"></div>
          <div class="windows"></div>
        </main>
        <div class="bezel-brand">VARAKORN <strong>ADVANCE</strong> <i>SP</i></div>
      </div>
    </div>
    <div class="hinge" aria-hidden="true"><b></b><b></b><b></b></div>
    <div class="lower-deck">
      <button class="deck-sound" data-sound aria-label="Mute sound"></button><span class="power-light" aria-label="Power on"></span>
      <div class="controller-row"><div class="dpad-well"><div class="dpad">${pad}<i></i></div></div>
      <div class="ab-well"><button class="button-b" data-control="b" aria-label="B, go back">B</button><button class="button-a" data-control="a" aria-label="A, open selection">A</button></div></div>
      <div class="speaker-grille" aria-hidden="true"></div>
      <div class="system-keys"><button data-control="select"><i></i>SELECT</button><button data-control="start"><i></i>START</button></div>
    </div>
  </div>`;
}
