import '../../styles/opening.css';
import { openingConfig as config } from './config.js';
import { ScrollExpand, clamp, smoothstep } from './ScrollExpand.js';
import { STAND_COMPLETE } from './stance.js';

let active = false;
// Require a desktop layout and a mouse/trackpad. Wide phones and tablets still
// bypass the prologue, including when ?intro=1 or a replay is requested.
const desktopViewport = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const canPlayOpening = () => desktopViewport.matches && !reducedMotion();
const hasSeen = () => {
  try { return sessionStorage.getItem(config.sessionKey) === '1'; } catch { return false; }
};

const markup = `
  <div class="scroll-expand__track">
    <div class="scroll-expand__stage">
      <div class="scroll-expand__frame">
        <canvas class="opening__canvas" aria-label="A kneeling 3D anime character looks toward your cursor. Scroll to help the character stand and break free of the wrist chains."></canvas>
        <div class="opening__vignette"></div>
      </div>
      <header class="opening__header">
        <div class="opening__identity"><span class="opening__wordmark">Varakorn.</span><span class="opening__edition">An interactive prologue</span></div>
        <button class="opening__skip" type="button">Skip intro <span aria-hidden="true">↗</span></button>
      </header>
      <div class="opening__intro">
        <div class="opening__eyebrow opening__micro">Every limit is a beginning.</div>
        <h1 class="opening__title">Nothing holds<br><em>forever.</em></h1>
        <p class="opening__sub">A little resistance. A different kind of entrance.</p>
      </div>
      <div class="opening__chapter">01 / AWAKEN<span>Look a little closer.</span></div>
      <div class="opening__caption"><h2></h2><p></p></div>
      <div class="opening__tension" aria-hidden="true">
        <div class="opening__tension-label opening__micro"><span>Chain tension</span><span class="opening__tension-number">00%</span></div>
        <div class="opening__tension-track"><div class="opening__tension-fill"></div></div>
        <div class="opening__attempts"><i></i><i></i><i></i><i></i></div>
      </div>
      <footer class="opening__footer">
        <div class="opening__progress" role="progressbar" aria-label="Opening sequence" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="opening__progress-label opening__micro"><span>Prologue</span><span class="opening__progress-number">000</span></div>
          <div class="opening__progress-track"><div class="opening__progress-fill"></div></div>
        </div>
        <button class="opening__hint" type="button" aria-label="Advance the opening sequence"><span class="opening__hint-text">Scroll to awaken</span><span class="opening__hint-arrow" aria-hidden="true">↓</span></button>
        <a class="opening__credit" href="https://github.com/pixiv/three-vrm" target="_blank" rel="noopener noreferrer">Character by pixiv<br>Scroll to break free</a>
      </footer>
      <div class="opening__loading" role="status">
        <div class="opening__loading-mark">V.</div><div class="opening__micro">Entering the prologue <span class="opening__load-number">00</span></div>
        <div class="opening__loading-line"><span></span></div>
      </div>
      <div class="opening__error" aria-hidden="true">
        <div class="opening__micro">Connection to the ordinary lost</div>
        <div class="opening__error-number">404</div>
        <h2>Limits not found.</h2>
        <p>The character is free. So is the way forward.</p>
        <div class="opening__recovery"><span></span></div>
        <div class="opening__micro opening__recover-text">Finding a new way in...</div>
      </div>
      <p class="sr-only opening__status" role="status" aria-live="polite">Scroll, use the arrow keys, or select the advance button to help the character break free. Escape skips to the home page.</p>
    </div>
  </div>`;

/** Resolves after the prologue, so the home scene is loaded only when needed. */
export function mountOpening({ force = false } = {}) {
  const requested = new URLSearchParams(location.search).get('intro') === '1';
  if (active || !canPlayOpening() || (!force && !requested && (hasSeen() || location.hash))) return Promise.resolve();
  active = true;
  return new Promise((resolve) => {
    const root = document.createElement('section');
    root.className = 'opening scroll-expand';
    root.dataset.state = 'loading';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Unchained. An interactive opening.');
    root.innerHTML = markup;
    root.tabIndex = -1;
    const previousFocus = document.activeElement;
    const pageScroll = scrollY;
    const siblings = [...document.body.children].map((element) => ({ element, inert: element.inert }));
    siblings.forEach(({ element }) => { element.inert = true; });
    document.body.append(root);
    document.documentElement.classList.add('opening-active');
    window.dispatchEvent(new CustomEvent('openingchange', { detail: { active: true } }));
    const $ = (selector) => root.querySelector(selector);
    const credit = $('.opening__credit');
    credit.href = config.creditUrl;
    credit.textContent = config.creditLabel;
    $('.opening__canvas').setAttribute('aria-label', `${config.characterName}. A kneeling 3D anime character looks toward your cursor. Scroll to help the character stand and break free of the wrist chains.`);
    const skip = $('.opening__skip');
    const hint = $('.opening__hint');
    const hintText = $('.opening__hint-text');
    const chapter = $('.opening__chapter');
    const intro = $('.opening__intro');
    const caption = $('.opening__caption');
    const tension = $('.opening__tension');
    const fill = $('.opening__tension-fill');
    const tensionNumber = $('.opening__tension-number');
    const attemptMarks = [...root.querySelectorAll('.opening__attempts i')];
    const progress = $('.opening__progress');
    const progressFill = $('.opening__progress-fill');
    const progressNumber = $('.opening__progress-number');
    const status = $('.opening__status');
    const errorScreen = $('.opening__error');
    const recoveryFill = $('.opening__recovery span');
    const stage = $('.scroll-expand__stage');
    const abort = new AbortController();
    const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    let scene;
    let scroll;
    let raf = 0;
    let closed = false;
    let ready = false;
    let lastTime = 0;
    let elapsed = 0;
    let outro = -1;
    let lastChapter = '';
    let lastPercent = -1;
    let loadTimeout;
    root.style.overflowY = 'hidden';
    root.focus({ preventScroll: true });

    function finish(immediate = false) {
      if (closed) return;
      closed = true;
      clearTimeout(loadTimeout);
      abort.abort();
      cancelAnimationFrame(raf);
      scroll?.dispose();
      scene?.dispose();
      root.dataset.state = 'complete';
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      motionPreference.removeEventListener('change', onMotionChange);
      desktopViewport.removeEventListener('change', onViewportChange);
      try { sessionStorage.setItem(config.sessionKey, '1'); } catch { /* Storage can be disabled. */ }
      // A query-driven replay is one-shot too; reload/back should stay useful.
      if (requested) {
        const url = new URL(location.href);
        url.searchParams.delete('intro');
        history.replaceState(history.state, '', url);
      }
      const complete = () => {
        root.remove();
        siblings.forEach(({ element, inert }) => { element.inert = inert; });
        document.documentElement.classList.remove('opening-active');
        window.scrollTo({ top: force ? pageScroll : 0, behavior: 'instant' });
        active = false;
        window.dispatchEvent(new CustomEvent('openingchange', { detail: { active: false } }));
        if (force && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        else {
          const heading = document.querySelector('.hero-title');
          if (heading) {
            const previousTabIndex = heading.getAttribute('tabindex');
            heading.setAttribute('tabindex', '-1');
            heading.focus({ preventScroll: true });
            heading.addEventListener('blur', () => {
              if (previousTabIndex === null) heading.removeAttribute('tabindex');
              else heading.setAttribute('tabindex', previousTabIndex);
            }, { once: true });
          }
        }
        resolve();
      };
      if (immediate || reducedMotion()) complete();
      else { root.classList.add('is-leaving'); setTimeout(complete, 650); }
    }

    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); finish(); return; }
      if (event.key === 'Tab') {
        const controls = [...root.querySelectorAll('button, a[href]')].filter((element) => !element.disabled && element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      if (!ready || outro >= 0) return;
      // Space/Enter retain normal button semantics when a control has focus.
      if (event.key === ' ' && event.target.closest('button, a')) return;
      const directions = { ArrowDown: .045, PageDown: .13, ' ': .12, ArrowUp: -.045, PageUp: -.13 };
      if (event.key in directions) {
        event.preventDefault();
        scroll.advance(directions[event.key]);
      } else if (event.key === 'End' || event.key === 'Home') {
        event.preventDefault();
        root.scrollTo({ top: event.key === 'End' ? scroll.span : 0, behavior: 'smooth' });
      }
    }
    const onPageHide = () => finish(true);
    const onMotionChange = () => { if (motionPreference.matches) finish(true); };
    const onViewportChange = () => { if (!desktopViewport.matches) finish(true); };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      lastTime = 0;
      if (!document.hidden && ready && !closed) raf = requestAnimationFrame(tick);
    };
    skip.addEventListener('click', () => finish());
    hint.addEventListener('click', () => { if (ready && outro < 0) scroll.advance(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    motionPreference.addEventListener('change', onMotionChange);
    desktopViewport.addEventListener('change', onViewportChange);
    root.addEventListener('pointermove', (event) => {
      // Touch stays a scroll gesture; a mouse or pen controls the eye line.
      if (event.pointerType === 'touch' || !scene || outro >= 0) return;
      scene.setPointer(event.clientX / root.clientWidth * 2 - 1, 1 - event.clientY / root.clientHeight * 2);
    }, { passive: true, signal: abort.signal });
    const resetGaze = () => scene?.setPointer(0, 0);
    root.addEventListener('pointerleave', resetGaze, { signal: abort.signal });
    window.addEventListener('blur', resetGaze, { signal: abort.signal });
    $('.opening__canvas').addEventListener('webglcontextlost', (event) => { event.preventDefault(); finish(true); }, { signal: abort.signal });

    function updateCopy(p) {
      let text, title, description, cue;
      if (p < .20) { text = '01 / AWAKEN'; title = ''; description = 'Move your cursor. Meet my eyes.'; cue = 'Scroll to awaken'; }
      else if (p < .38) { text = '02 / RESIST'; title = 'Down, but not done.'; description = 'The first pull lifts you from your heels.'; cue = 'Keep scrolling to rise'; }
      else if (p < .51) { text = '03 / PERSIST'; title = 'Find your footing.'; description = 'One foot forward. One more attempt.'; cue = 'Pull again'; }
      else if (p < .63) { text = '04 / RISE'; title = 'Get back up.'; description = 'Push against the weight. Keep rising.'; cue = 'Keep rising'; }
      else if (p < STAND_COMPLETE) { text = '05 / STAND'; title = 'Stand your ground.'; description = 'One last push. Freedom is within reach.'; cue = 'Stand to break free'; }
      else { text = '06 / UNCHAINED'; title = 'On your feet. Free.'; description = 'Nothing can hold you here anymore.'; cue = 'A new beginning'; }
      if (lastChapter !== text) {
        lastChapter = text;
        chapter.replaceChildren(document.createTextNode(text));
        const sub = document.createElement('span');
        sub.textContent = description;
        chapter.append(sub);
        caption.querySelector('h2').textContent = title;
        caption.querySelector('p').textContent = description;
        hintText.textContent = cue;
        status.textContent = `${text.split('/ ')[1]}. ${title} ${description}`;
      }
    }

    function tick(now) {
      if (closed) return;
      const dt = lastTime ? Math.min((now - lastTime) / 1000, .05) : 1 / 60;
      lastTime = now;
      elapsed += dt;
      let p = scroll.update(dt);
      if (p >= STAND_COMPLETE && outro < 0) { outro = 0; root.dataset.state = 'freed'; root.style.overflowY = 'hidden'; }
      if (outro >= 0) { outro += dt; p = STAND_COMPLETE + smoothstep(0, 1.1, outro) * (.9 - STAND_COMPLETE); }
      const shatter = outro >= .85 ? smoothstep(.85, 2.6, outro) : 0;
      const frame = scene.render(p, elapsed, dt, shatter);
      root.dataset.progress = p.toFixed(3);
      stage.style.transform = `translate3d(${Math.sin(elapsed * 73) * frame.shake}px,${Math.cos(elapsed * 91) * frame.shake * .6}px,0)`;
      const introOut = smoothstep(.015, .14, p);
      intro.style.opacity = `${1 - introOut}`;
      intro.style.transform = `translateY(${-35 * introOut}px)`;
      caption.style.opacity = `${smoothstep(.17, .25, p) * (1 - smoothstep(.4, .9, Math.max(0, outro)))}`;
      tension.style.opacity = `${smoothstep(.21, .28, p) * (1 - smoothstep(.76, .8, p))}`;
      const tensionPercent = Math.round(frame.tension * 100);
      fill.style.width = `${tensionPercent}%`;
      tensionNumber.textContent = `${String(tensionPercent).padStart(2, '0')}%`;
      attemptMarks.forEach((mark, i) => mark.classList.toggle('is-done', p > [.35, .47, .59, .71][i]));
      const percent = Math.round(outro < 0 ? p * 100 : STAND_COMPLETE * 100 + clamp(outro / 5.9) * (100 - STAND_COMPLETE * 100));
      if (percent !== lastPercent) {
        lastPercent = percent;
        progress.setAttribute('aria-valuenow', percent);
        progressNumber.textContent = String(percent).padStart(3, '0');
        progressFill.style.width = `${percent}%`;
      }
      updateCopy(p);
      if (shatter > 0 && outro < 2.8) root.dataset.state = 'shattering';
      if (outro >= 2.8) {
        if (!errorScreen.classList.contains('is-visible')) {
          root.dataset.state = '404';
          errorScreen.classList.add('is-visible');
          errorScreen.setAttribute('aria-hidden', 'false');
          status.textContent = '404. Limits not found. Opening Varakorn’s home page.';
          hint.disabled = true;
          stage.style.transform = '';
        }
        recoveryFill.style.width = `${clamp((outro - 3.1) / 2.4) * 100}%`;
        if (outro > 5.1) $('.opening__recover-text').textContent = 'Welcome to my world.';
      }
      if (outro >= 5.9) { finish(); return; }
      raf = requestAnimationFrame(tick);
    }

    // No missing asset or unavailable GPU is allowed to strand the visitor.
    loadTimeout = setTimeout(() => finish(true), 25000);
    import('./scene.js').then(({ createOpeningScene }) => {
      if (closed) return null;
      return createOpeningScene($('.opening__canvas'), {
        signal: abort.signal,
        onProgress(value) {
          if (closed) return;
          $('.opening__load-number').textContent = String(Math.round(value * 100)).padStart(2, '0');
          $('.opening__loading-line span').style.width = `${value * 100}%`;
        },
      });
    }).then((loaded) => {
      if (!loaded) return;
      if (closed) { loaded.dispose(); return; }
      clearTimeout(loadTimeout);
      scene = loaded;
      scroll = new ScrollExpand(root, config);
      root.style.overflowY = 'auto';
      root.dataset.state = 'ready';
      $('.opening__loading').hidden = true;
      ready = true;
      if (!document.hidden) raf = requestAnimationFrame(tick);
    }).catch((error) => {
      if (!closed) {
        console.warn('Opening unavailable; continuing to the portfolio.', error.message);
        finish(true);
      }
    });
  });
}

export function mountOpeningReplay() {
  if (document.querySelector('.opening-replay')) return;
  const button = document.createElement('button');
  button.className = 'opening-replay';
  button.type = 'button';
  button.textContent = '↻ Replay intro';
  const updateVisibility = () => { button.hidden = !canPlayOpening(); };
  updateVisibility();
  button.addEventListener('click', () => mountOpening({ force: true }));
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', updateVisibility);
  desktopViewport.addEventListener('change', updateVisibility);
  document.body.append(button);
}
