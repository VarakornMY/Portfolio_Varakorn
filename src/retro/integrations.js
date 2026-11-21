import { authConfigured, authedFetch, getSession, onAuth, userOf } from '../js/supa.js';
import { openAuthDialog } from '../js/authui.js';
import { mountComments } from '../js/comments.js';
import { mountTestimonials } from '../js/testimonials.js';
import { mountWall } from '../js/wall.js';
import '../styles/comments.css';
import '../styles/account.css';
import './community.css';

export function community(host, page, isReading, kind) {
  const dispose = [];
  if (kind === 'stamp') {
    const vouches = document.createElement('section');
    vouches.className = 'vouches';
    host.before(vouches);
    dispose.push(mountTestimonials(vouches, page));
  }
  dispose.push(mountComments(host, page, { title: 'Comments' }));
  let elapsed = 0;
  const timer = setInterval(async () => {
    if (document.hidden || !isReading()) return;
    if (++elapsed < 20) return;
    clearInterval(timer);
    if (await getSession())
      await authedFetch('/api/me', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(kind === 'stamp' ? { stamp: page } : { read: page.split('#')[1] }),
      }).catch(() => {});
  }, 1000);
  return () => {
    clearInterval(timer);
    dispose.forEach((fn) => fn?.());
  };
}
export function guestbook(host) {
  host.innerHTML =
    '<article class="reader standalone"><div class="article-copy"><h1>Guestbook</h1><p>Notes from people who have visited or worked with me.</p><div data-wall aria-live="polite">Loading guestbook…</div></div></article>';
  mountWall(host);
}
export async function account(host) {
  host.innerHTML =
    '<article class="reader standalone"><div class="article-copy" data-acct></div></article>';
  await import('../js/pages/account.js');
  if (!authConfigured)
    host.querySelector('[data-acct]').innerHTML =
      '<h1>My Account</h1><p>Sign-in is unavailable in this preview.</p>';
}
export function chat(host) {
  host.innerHTML =
    '<div class="chat-room"><div class="chat-banner"><b>Varakorn AI</b><span>Personal assistant</span></div><div class="transcript" role="log" aria-label="Chat history"></div><div class="chat-gate"></div><form><label for="chat-text">Message</label><input id="chat-text" maxlength="2000" required autocomplete="off"><button>Send</button></form></div>';
  const log = host.querySelector('.transcript'),
    form = host.querySelector('form'),
    gate = host.querySelector('.chat-gate');
  const field = form.querySelector('input');
  let history = [],
    userId,
    revision = 0,
    busy = false;
  const line = (label, body) => {
    const paragraph = document.createElement('p'),
      name = document.createElement('b');
    name.textContent = label + ' ';
    paragraph.append(name, document.createTextNode(body));
    log.append(paragraph);
    log.scrollTop = log.scrollHeight;
  };
  gate.onclick = () => {
    if (authConfigured) openAuthDialog();
  };
  function syncForm() {
    field.disabled = !userId || busy;
    form.querySelector('button').disabled = field.disabled;
  }
  onAuth(async (session) => {
    const next = session?.user?.id || null;
    if (next === userId) return;
    userId = next;
    const version = ++revision;
    busy = !!next;
    history = [];
    log.replaceChildren();
    syncForm();
    if (!next) {
      gate.innerHTML = authConfigured
        ? '<p>Sign in to ask a question and keep your conversation.</p><button class="xp-button">Sign in</button>'
        : '<p>Sign-in is unavailable in this preview.</p>';
      return;
    }
    gate.textContent = 'Signed in as ' + userOf(session).name;
    try {
      const result = await authedFetch('/api/chat');
      if (!result.ok) throw new Error();
      const data = await result.json();
      if (version !== revision) return;
      history = Array.isArray(data.history) ? data.history.slice(-10) : [];
      for (const m of history) line(m.role === 'user' ? 'You' : 'Varakorn AI', m.text);
    } catch {
      if (version === revision) line('System', 'Chat history could not be loaded.');
    } finally {
      if (version === revision) {
        busy = false;
        syncForm();
      }
    }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const q = field.value.trim();
    if (!q || !userId || busy) return;
    const version = revision;
    busy = true;
    syncForm();
    field.value = '';
    line('You', q);
    const messages = [...history, { role: 'user', text: q }].slice(-10);
    try {
      const response = await authedFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      const data = await response.json();
      if (version !== revision) return;
      if (!response.ok || !data.reply || data.gate) throw new Error();
      line('Varakorn AI', data.reply);
      history = [...messages, { role: 'model', text: data.reply }];
    } catch {
      if (version === revision) {
        line('System', 'The assistant is unavailable. Try again in a moment.');
        field.value = q;
      }
    } finally {
      if (version === revision) {
        busy = false;
        syncForm();
        field.focus();
      }
    }
  };
}
