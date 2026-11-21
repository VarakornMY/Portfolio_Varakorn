import {
  profile,
  valueCategories,
  services,
  projects,
  timeline,
  experience,
  goals,
  skills,
  posts,
  postCategories,
  socials,
} from '../js/data.js';
import { apps, icon } from './launcher.js';
import { play } from './sound.js';

export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const photo = (src, alt, pos = '50% 45%') =>
  src
    ? `<img class="feature-photo" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="object-position:${escapeHtml(pos)}" loading="lazy">`
    : '';
const chips = (values) =>
  `<ul class="chips">${values.map((v) => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`;
const link = (label, url) =>
  `<a class="xp-button" href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
const entry = (title, meta, body, more = {}) => ({ title, meta, body, ...more });
const group = (label, rows) => ({ label, rows });
const portrait = '/photos/Varakorn-Gamuda-Ai-Academy-Graduate.jpg';
const roles = experience.map((x) =>
  entry(
    x.org,
    x.role,
    `<p>${x.period} · ${x.place}</p><ul>${x.points.map((p) => '<li>' + p + '</li>').join('')}</ul>${link('Read full chapter', x.page)}`,
    { image: x.card?.photo, pos: x.card?.photoPos, chapter: x.page },
  ),
);
const notes = [...posts]
  .sort((a, b) => b.date.localeCompare(a.date))
  .map((p) =>
    entry(
      p.title,
      p.dateLabel + ' · ' + p.minutes + ' min read',
      '<p class="intro">' + p.excerpt + '</p>' + p.body + chips(p.tags),
      {
        image: p.cover,
        alt: p.coverAlt,
        pos: p.coverPos,
        slug: p.slug,
        category: p.category,
        tags: p.tags,
        year: p.date.slice(0, 4),
      },
    ),
  );

export const libraries = {
  about: [
    group('Profile', [
      entry(
        'Varakorn',
        profile.role,
        `<p class="intro">${profile.tagline}</p><p>I'm Varakorn, Kazumi online, a Full Stack AI Engineer from Subang Jaya, Malaysia. I spent two years making 261+ videos that crossed 38 million views, then moved behind the terminal.</p><p>At Gamuda AI Academy I led the team that built Tendervise AI. Today I build AI workflows at P10X Media and run Orion Automation.</p>${chips(profile.languages)}${link('View my projects', apps.projects.path)}`,
        { image: portrait, pos: '50% 57%' },
      ),
      ...valueCategories.map((c) =>
        entry(
          c.title,
          c.stat.value + c.stat.suffix + ' ' + c.stat.label,
          '<p>' + c.story + '</p>' + chips(c.chips),
        ),
      ),
    ]),
    group(
      'Services',
      services.map((s) =>
        entry(s.title, 'Services', '<p>' + s.body + '</p>' + link('Contact me', apps.contact.path)),
      ),
    ),
  ],
  projects: [
    group(
      'Projects',
      projects.map((p) =>
        entry(p.title, p.kicker, '<p class="intro">' + p.description + '</p>' + chips(p.stack), {
          image: p.title === 'Tendervise AI' ? '/photos/gamuda-graduation.jpg' : null,
        }),
      ),
    ),
  ],
  experience: [
    group('Experience', roles),
    group(
      'Skills',
      skills.map((s) => entry(s.group, 'Toolkit', chips(s.items))),
    ),
    group(
      'Goals',
      goals.map((g) => entry(g.title, 'Career goals', '<p>' + g.body + '</p>')),
    ),
  ],
  journey: [
    group(
      'Chapters',
      timeline.map((t) =>
        entry(
          t.title,
          t.period,
          '<p class="intro">' +
            t.role +
            '</p><p>' +
            t.story +
            '</p>' +
            link('Read full chapter', t.page),
          {
            image: t.photo || experience.find((x) => x.page === t.page)?.card?.photo,
            alt: t.photoCaption,
          },
        ),
      ),
    ),
  ],
  blog: postCategories.map((c) =>
    group(
      c.label,
      notes.filter((n) => n.category === c.id),
    ),
  ),
  contact: [
    group('Contact', [
      entry(
        'Get in touch',
        profile.location,
        `<p class="intro">For AI engineering, automation, content work, or a quick hello.</p><div class="contact-links">${socials.map((s) => `<a href="${escapeHtml(s.href)}"${s.href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${s.label}</a>`).join('')}</div><p><a href="/varakorn.vcf" download>Save contact card (.vcf)</a></p>`,
        { image: '/photos/varakorn-portrait.jpg', pos: '50% 32%' },
      ),
    ]),
  ],
  resume: [
    group('Résumé', [
      entry(
        'Varakorn Meunukdomn',
        profile.role,
        `<p class="intro">${profile.tagline}</p><p>${profile.location}</p><div class="doc-actions"><a class="xp-button" href="${profile.resume}" target="_blank" rel="noopener">View PDF</a> <a class="xp-button" href="${profile.resume}" download>Download PDF</a></div><h3>Experience</h3>${roles.map((r) => `<p><b>${r.title}</b><br>${r.meta}</p>`).join('')}`,
      ),
    ]),
  ],
};
export function mountLibrary(host, id, url, { navigate, showReader, mountPost, disposeReader }) {
  const groups = libraries[id];
  let groupIndex = 0;
  let selected = 0;
  const query = url.searchParams;
  let search = id === 'blog' ? query.get('q') || '' : '';
  let year = id === 'blog' ? query.get('y') || '' : '';
  let topic = id === 'blog' ? query.get('t') || '' : '';
  let deep = false;
  if (id === 'blog') {
    groupIndex = Math.max(
      0,
      groups.findIndex((g) => g.rows[0]?.category === query.get('c')),
    );
    for (const [i, g] of groups.entries()) {
      const j = g.rows.findIndex((row) => row.slug === url.hash.slice(1));
      if (j !== -1) {
        groupIndex = i;
        selected = j;
        deep = true;
        search = year = topic = '';
        break;
      }
    }
  }
  if (id === 'about' && url.hash === '#services') groupIndex = 1;
  host.innerHTML = `<div class="library"><div class="library-tabs" aria-label="Categories"></div>${id === 'blog' ? '<div class="blog-tools"><input type="search" aria-label="Search posts" placeholder="Search notes…"><select aria-label="Filter by year"></select><select aria-label="Filter by topic"></select></div>' : ''}<div class="split"><nav class="file-list" aria-label="Entries"></nav><article class="reader" tabindex="-1"></article></div></div>`;
  const tabs = host.querySelector('.library-tabs'),
    list = host.querySelector('.file-list'),
    reader = host.querySelector('.reader');
  const matches = (r) =>
    (!year || r.year === year) &&
    (!topic || r.tags?.includes(topic)) &&
    (!search || [r.title, r.body, r.meta].join(' ').toLowerCase().includes(search.toLowerCase()));
  const urlFor = (row) => {
    const path = new URL(apps[id].path, location.origin);
    if (id === 'blog') {
      path.searchParams.set('c', groups[groupIndex].rows[0].category);
      if (search) path.searchParams.set('q', search);
      if (year) path.searchParams.set('y', year);
      if (topic) path.searchParams.set('t', topic);
      path.hash = row?.slug || '';
    }
    return path.pathname + path.search + path.hash;
  };
  function paint(read = false) {
    disposeReader();
    const rows = groups[groupIndex].rows;
    tabs.innerHTML = groups
      .map(
        (g, i) =>
          `<button aria-pressed="${i === groupIndex}" data-group="${i}">${icon(id)}${escapeHtml(g.label)}</button>`,
      )
      .join('');
    list.innerHTML = rows
      .map((r, i) =>
        !matches(r)
          ? ''
          : `<button data-row="${i}" aria-current="${i === selected}">${icon(id)}<span><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.meta)}</small></span></button>`,
      )
      .join('');
    const row = rows[selected];
    if (!row || !matches(row)) {
      reader.innerHTML = '<p>No matching entries.</p>';
      list.innerHTML = '<p>No matching entries.</p>';
      showReader(false);
      return;
    }
    reader.innerHTML = `${photo(row.image, row.alt || row.title, row.pos)}<div class="article-copy"><p class="file-meta">${escapeHtml(row.meta)}</p><h1>${escapeHtml(row.title)}</h1>${row.body}${row.slug ? '<div class="guestbook" data-comments></div>' : ''}</div>`;
    reader.scrollTop = 0;
    showReader(read);
    if (row.slug) mountPost(reader.querySelector('[data-comments]'), row.slug, read);
  }
  tabs.onclick = (e) => {
    const button = e.target.closest('[data-group]');
    if (!button) return;
    groupIndex = Number(button.dataset.group);
    selected = groups[groupIndex].rows.findIndex(matches);
    play('select');
    paint();
    if (id === 'blog') navigate(urlFor(), true);
    tabs.children[groupIndex]?.focus({ preventScroll: true });
  };
  list.onclick = (e) => {
    const button = e.target.closest('[data-row]');
    if (!button) return;
    selected = Number(button.dataset.row);
    play('open');
    paint(true);
    if (id === 'blog') navigate(urlFor(groups[groupIndex].rows[selected]), true);
    reader.focus({ preventScroll: true });
  };
  if (id === 'blog') {
    const controls = host.querySelector('.blog-tools');
    const [yearPicker, topicPicker] = controls.querySelectorAll('select');
    const fill = (picker, label, values, current) => {
      picker.innerHTML =
        '<option value="">' +
        label +
        '</option>' +
        [...new Set(values)]
          .sort()
          .map((v) => '<option>' + escapeHtml(v) + '</option>')
          .join('');
      picker.value = current;
    };
    fill(
      yearPicker,
      'All years',
      notes.map((r) => r.year),
      year,
    );
    fill(
      topicPicker,
      'All topics',
      notes.flatMap((r) => r.tags),
      topic,
    );
    controls.querySelector('input').value = search;
    controls.oninput = () => {
      search = controls.querySelector('input').value;
      year = yearPicker.value;
      topic = topicPicker.value;
      selected = groups[groupIndex].rows.findIndex(matches);
      paint();
      navigate(urlFor(), true, true);
    };
  }
  paint(deep || ['resume', 'contact'].includes(id));
}
