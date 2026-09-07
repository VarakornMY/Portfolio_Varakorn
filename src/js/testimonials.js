// ---------------------------------------------------------------------------
// Vouches on experience detail pages: people who actually worked with
// Varakorn leave one, and it goes up as they write it. An account is
// optional, a name is not: signed in it comes from the profile, otherwise
// they write it in the sheet along with how they know him, which this form
// has always asked for. They also feed a Review JSON-LD block so answer
// engines can quote them.
// Mounted by expDetail.js above the guestbook; styling in comments.css.
// ---------------------------------------------------------------------------
import { authConfigured, userOf, onAuth, authedFetch } from './supa.js';
import { openAuthDialog } from './authui.js';
import { bindProfileClicks } from './profilecard.js';
import { askConfirm } from './confirm.js';
import { pageLabel } from './pagelabel.js';
import { authedFetch as apost } from './supa.js';

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENT[c]);

const fmtDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d)
    ? ''
    : d.toLocaleDateString('en-MY', { month: 'short', year: 'numeric' });
};

const avatar = (t) =>
  t.picture
    ? `<img class="gb-ava" src="${esc(t.picture)}" alt="" referrerpolicy="no-referrer" />`
    : `<span class="gb-ava gb-ava--letter">${esc((t.name || '?')[0].toUpperCase())}</span>`;

function cardHtml(t, people, admin = false) {
  const pid = 't' + t.id;
  people.set(pid, { name: t.name, picture: t.picture, title: t.title, bio: t.bio, links: t.links });
  return `
    <li class="vouch${t.approved ? '' : ' vouch--pending'}">
      <p class="vouch-body">${esc(t.body)}</p>
      <div class="vouch-foot">
        <button class="gb-name gb-name--btn" type="button" data-pc="${pid}"
                title="View profile">${avatar(t)}${esc(t.name)}</button>
        <span class="vouch-rel">${esc(t.relation)} · ${esc(fmtDate(t.created_at))}</span>
        ${
          t.mine || admin
            ? `<span class="vouch-own-actions">
          ${t.mine ? `<button class="gb-mini" type="button" data-v-edit="${t.id}">Edit</button>` : ''}
          ${
            admin && !t.mine
              ? `<button class="gb-mini" type="button" data-v-mod="${t.id}" data-show="${t.approved ? '0' : '1'}">${t.approved ? 'Hide' : 'Show'}</button>`
              : ''
          }
          <button class="gb-mini gb-mini--danger" type="button" data-v-del="${t.id}">Delete</button>
        </span>`
            : ''
        }
      </div>
      ${t.approved ? '' : `<span class="vouch-wait">${t.mine ? 'Only you can see this' : 'Hidden from the site'}</span>`}
    </li>`;
}

/** Vouches that are showing become quotable Review schema, at runtime. */
function injectReviewLd(approved) {
  if (!approved.length) return;
  document.getElementById('vouch-ld')?.remove();
  const ld = {
    '@context': 'https://schema.org',
    '@graph': approved.slice(0, 20).map((t) => ({
      '@type': 'Review',
      itemReviewed: { '@id': 'https://www.varakorn.me/#varakorn' },
      reviewBody: t.body,
      datePublished: String(t.created_at).slice(0, 10),
      author: { '@type': 'Person', name: t.name },
    })),
  };
  const tag = document.createElement('script');
  tag.type = 'application/ld+json';
  tag.id = 'vouch-ld';
  tag.textContent = JSON.stringify(ld);
  document.head.appendChild(tag);
}

/* The honeypot, same trick as the guestbook: off screen, never seen by a
   person, filled in by a bot, and the server quietly writes nothing. */
const honeypot = `
  <div class="gb-hp" aria-hidden="true">
    <label for="v-web">Leave this one empty</label>
    <input id="v-web" name="website" type="text" tabindex="-1" autocomplete="off" />
  </div>`;

export function mountTestimonials(host, page) {
  if (!host || host.dataset.vMounted) return;
  host.dataset.vMounted = '1';

  let user = null;
  let mine = null;
  let admin = false; // the owner moderates from inside the page
  const people = new Map();

  host.innerHTML = `
    <div class="vpanel">
      <div class="vpanel-head">
        <span class="vpanel-seal" aria-hidden="true">✦</span>
        <div class="vpanel-headings">
          <h3 class="vpanel-title">Vouches <span class="vpanel-count" data-v-count hidden></span></h3>
          <p class="vpanel-sub">Short words from people who worked with Varakorn in this chapter. Not comments, endorsements.</p>
        </div>
      </div>
      <ul class="vouch-list"></ul>
      <p class="vouch-empty" data-v-empty hidden>None here yet. Shared this chapter with him? Yours can be the first.</p>
      <div class="vouch-cta"></div>
    </div>`;

  const list = host.querySelector('.vouch-list');
  const empty = host.querySelector('[data-v-empty]');
  const cta = host.querySelector('.vouch-cta');
  const count = host.querySelector('[data-v-count]');
  let formOpen = false;

  function formHtml() {
    return `
      <form class="gb-form gb-sheet" novalidate data-born="${Date.now()}">
        <p class="gb-sheet-head">
          <span class="gb-sheet-for">Your vouch on <strong>${esc(pageLabel(page))}</strong></span>
        </p>
        ${
          user
            ? ''
            : `<div class="gb-field">
                 <label class="ad-label" for="v-name">Your name</label>
                 <input class="gb-input gb-input--short" id="v-name" name="name" maxlength="60"
                        required autocomplete="name" placeholder="The name he would know you by" />
               </div>`
        }
        <div class="gb-field">
          <label class="ad-label" for="v-rel">How you know Varakorn</label>
          <input class="gb-input gb-input--short" id="v-rel" name="relation" maxlength="80" required
                 placeholder="Teammate at JAAVIS, client, classmate…" value="${esc(mine?.relation || '')}" />
        </div>
        <div class="gb-field">
          <label class="ad-label" for="v-body">Your vouch</label>
          <textarea class="gb-input gb-area" id="v-body" name="body" maxlength="2000" rows="4" required
                    placeholder="What was he like to work with?">${esc(mine?.body || '')}</textarea>
        </div>
        ${user ? '' : honeypot}
        <div class="gb-actions">
          <button class="btn gb-submit" type="submit">${mine ? 'Update my vouch' : 'Leave a vouch'}</button>
          <button class="gb-cancel" type="button" data-v-cancel>Cancel</button>
          <p class="gb-status" role="status" aria-live="polite"></p>
        </div>
        <p class="vouch-note">
          ${
            user
              ? 'It goes up straight away, and you can change or remove it later.'
              : `It goes up straight away. Without an account it is not yours to edit afterwards, so
                 ${authConfigured ? `<button class="gb-linkish gb-signin" type="button">sign in</button> first if you might want to change it.` : 'write it the way you want it to stand.'}`
          }
        </p>
      </form>`;
  }

  function renderCta() {
    if (formOpen) {
      cta.innerHTML = formHtml();
      cta.querySelector('[data-v-cancel]')?.addEventListener('click', () => {
        formOpen = false;
        renderCta();
      });
      // a guest starts at their name, everybody else at the first empty box
      (cta.querySelector('[name="name"]') || cta.querySelector('[name="relation"]'))?.focus();
      return;
    }
    // one quiet, contextual invitation; the form only unfolds on purpose
    const label = mine ? 'Edit my vouch' : 'Worked with him? Leave a vouch';
    cta.innerHTML = `<button class="vouch-open" type="button">
        <span aria-hidden="true">✎</span> ${label}
      </button>`;
    cta.querySelector('.vouch-open').addEventListener('click', () => {
      formOpen = true;
      renderCta();
    });
  }

  async function refresh({ keepForm = false } = {}) {
    try {
      const r = await authedFetch(`/api/testimonials?page=${encodeURIComponent(page)}`);
      const out = await r.json();
      if (!r.ok || out.offline) {
        host.hidden = true;
        return;
      }
      const items = out.testimonials || [];
      admin = Boolean(out.admin);
      mine = items.find((t) => t.mine) || null;
      people.clear();
      list.innerHTML = items.map((t) => cardHtml(t, people, admin)).join('');
      empty.hidden = items.length > 0;
      const approvedCount = items.filter((t) => t.approved).length;
      count.hidden = approvedCount === 0;
      count.textContent = String(approvedCount);
      injectReviewLd(items.filter((t) => t.approved));
      // right after a submit the form stays put, or the thank you note
      // would be wiped by its own success
      if (!keepForm) renderCta();
    } catch {
      host.hidden = true;
    }
  }

  bindProfileClicks(host, people);

  host.addEventListener('click', async (e) => {
    if (e.target.closest('.gb-signin')) {
      openAuthDialog();
      return;
    }
    if (e.target.closest('[data-v-edit]')) {
      formOpen = true;
      renderCta();
      cta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const mod = e.target.closest('[data-v-mod]');
    if (mod && admin) {
      mod.disabled = true;
      try {
        await apost('/api/me', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            moderate: { kind: 'testimonial', id: Number(mod.dataset.vMod), show: mod.dataset.show === '1' },
          }),
        });
        refresh();
      } catch {
        mod.disabled = false;
      }
      return;
    }

    const del = e.target.closest('[data-v-del]');
    if (del) {
      const own = Boolean(mine && String(mine.id) === del.dataset.vDel);
      const sure = await askConfirm({
        title: own ? 'Delete your vouch?' : 'Delete someone else\u2019s vouch?',
        message: own
          ? 'It goes for good. You can always write a new one later.'
          : 'It goes for good. Hide it instead if you only want it off the page.',
        yes: 'Delete it',
        no: 'Keep it',
        danger: true,
      });
      if (!sure) return;
      del.disabled = true;
      try {
        await apost('/api/me', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ remove: { kind: 'testimonial', id: Number(del.dataset.vDel) } }),
        });
        mine = null;
        formOpen = false;
        refresh();
      } catch {
        del.disabled = false;
      }
    }
  });

  host.addEventListener('submit', async (e) => {
    const form = e.target.closest('.gb-form');
    if (!form) return;
    e.preventDefault();
    const relation = form.querySelector('[name="relation"]').value.trim();
    const body = form.querySelector('[name="body"]').value.trim();
    const name = form.querySelector('[name="name"]')?.value.trim() || '';
    const asGuest = !user;
    const status = form.querySelector('.gb-status');
    if (asGuest && !name) {
      status.textContent = 'Leave a name first, so he knows who this is from.';
      status.dataset.tone = 'err';
      return;
    }
    if (!relation || !body) {
      status.textContent = 'Both fields, please.';
      status.dataset.tone = 'err';
      return;
    }
    const sure = await askConfirm({
      title: (mine ? 'Update your vouch on ' : 'Leave your vouch on ') + pageLabel(page) + '?',
      message: mine
        ? 'The new version replaces the old one right away. You can edit or delete it any time.'
        : asGuest
          ? 'It goes up straight away, under the name you gave. Without an account it is not yours to edit or remove afterwards, only Varakorn can take it down.'
          : 'It goes up straight away, under your name. You can leave one on every chapter you shared with him, and edit or delete this one any time.',
      yes: mine ? 'Yes, update it' : 'Yes, leave it',
    });
    if (!sure) return;
    const btn = form.querySelector('.gb-submit');
    btn.disabled = true;
    status.textContent = 'Sending…';
    status.dataset.tone = '';
    try {
      const r = await authedFetch('/api/testimonials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          page,
          relation,
          body,
          ...(asGuest
            ? {
                name,
                hp: form.querySelector('[name="website"]')?.value || '',
                dwell: Date.now() - Number(form.dataset.born || 0),
              }
            : {}),
        }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || 'error');
      formOpen = false;
      await refresh();
      empty.hidden = true;
    } catch (err) {
      status.textContent = String(err.message || 'That did not go through.');
      status.dataset.tone = 'err';
    } finally {
      btn.disabled = false;
    }
  });

  onAuth((session) => {
    user = userOf(session);
    refresh();
  });
}
