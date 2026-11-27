// Builds the static lab website into ../_site
// Lab pages are generated from every Lab_<n>/README.md in the repo, so adding
// a new lab folder and pushing is all it takes to publish it.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import hljs from 'highlight.js';

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SITE_DIR, '..');
const OUT = path.join(REPO_ROOT, '_site');

const course = readJson('data/course.json');
const install = readJson('data/install.json');
const commands = readJson('data/commands.json');
const troubles = readJson('data/troubleshooting.json');
const repo = detectRepo();

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);
const LANG_ALIASES = {
  powershell: 'powershell', ps: 'powershell', ps1: 'powershell', pwsh: 'powershell',
  bash: 'bash', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  yaml: 'yaml', yml: 'yaml', go: 'go', golang: 'go', json: 'json', text: 'plaintext', txt: 'plaintext',
};
const LANG_LABELS = { powershell: 'powershell', bash: 'bash', yaml: 'yaml', go: 'go', json: 'json', plaintext: 'output' };


function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'labs'), { recursive: true });
  copyDir(path.join(SITE_DIR, 'assets'), path.join(OUT, 'assets'));

  const labs = discoverLabs();
  LABS = labs;
  for (const lab of labs) writePage(`labs/lab-${lab.n}.html`, renderLabPage(lab, labs));
  for (const id of LESSON_ORDER) writePage(`learn/${id}.html`, renderLesson(id));
  writePage('index.html', renderHome(labs));
  writePage('install.html', renderInstall(labs));
  writePage('commands.html', renderCommands());
  writePage('troubleshooting.html', renderTroubleshooting());
  writePage('roadmap.html', renderRoadmap(labs));
  writePage('404.html', render404());
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  console.log(`Built ${labs.length} lab page(s) into ${path.relative(process.cwd(), OUT) || OUT}`);
}

/* ------------------------------------------------------------------ data */

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(SITE_DIR, rel), 'utf8'));
}

function detectRepo() {
  let slug = process.env.GITHUB_REPOSITORY;
  if (!slug) {
    try {
      const url = execSync('git remote get-url origin', { cwd: REPO_ROOT }).toString().trim();
      slug = url.replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '');
    } catch { slug = ''; }
  }
  const branch = process.env.GITHUB_REF_NAME || 'main';
  return { slug, branch, url: slug ? `https://github.com/${slug}` : '' };
}

function githubLink(repoRelPath, isDir = false) {
  if (!repo.url) return null;
  return `${repo.url}/${isDir ? 'tree' : 'blob'}/${repo.branch}/${repoRelPath.split('/').map(encodeURIComponent).join('/')}`;
}

function discoverLabs() {
  return fs.readdirSync(REPO_ROOT)
    .map((name) => ({ name, m: /^Lab_(\d+)$/.exec(name) }))
    .filter(({ name, m }) => m && fs.existsSync(path.join(REPO_ROOT, name, 'README.md')))
    .map(({ name, m }) => buildLab(name, Number(m[1])))
    .sort((a, b) => a.n - b.n);
}

function buildLab(dir, n) {
  const md = fs.readFileSync(path.join(REPO_ROOT, dir, 'README.md'), 'utf8');
  const session = course.sessions.find((s) => s.n === n);
  const h1 = /^#\s+(.+)$/m.exec(md);
  const title = h1 ? h1[1].replace(/^Lab\s*\d+\s*[:–-]\s*/i, '').trim() : `Lab ${n}`;
  const sections = countQuestions(md);
  const shots = (md.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  const langs = new Set([...md.matchAll(/^```(\w+)/gm)].map((m) => LANG_ALIASES[m[1].toLowerCase()] || m[1]));
  return { n, dir, md, title, session, sections, shots, usesPowerShell: langs.has('powershell'), sourceFiles: listSourceFiles(dir), steps: labSteps(md) };
}

function countQuestions(md) {
  const counts = { InLab: 0, PostLab: 0 };
  let current = null;
  for (const line of md.split('\n')) {
    const h2 = /^##\s+(.+)/.exec(line);
    if (h2 && !line.startsWith('###')) current = /postlab/i.test(h2[1]) ? 'PostLab' : /inlab/i.test(h2[1]) ? 'InLab' : null;
    if (current && /^###\s+Question/i.test(line)) counts[current]++;
  }
  return counts;
}

function listSourceFiles(dir) {
  const out = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(REPO_ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) { if (entry.name !== 'ScreenShots') walk(child); continue; }
      const ext = path.extname(entry.name).toLowerCase();
      if (['.go', '.yaml', '.yml', '.json', '.sh', '.ps1', '.mod'].includes(ext)) out.push(child);
    }
  };
  walk(dir);
  return out.sort();
}

/* ------------------------------------------------------ lab step digest */

// The first command of each step, for the home page's per-lab session.
function labSteps(md) {
  const steps = [];
  let pending = null;
  for (const tok of new Marked().lexer(md)) {
    if (tok.type === 'heading' && tok.depth === 4) {
      const m = /^Step\s+\d+\s*:\s*(.+)$/i.exec(tok.text);
      pending = m ? { title: m[1].replace(/`/g, '') } : null;
    } else if (pending && tok.type === 'code' && !/^(text|yaml|yml|go)$/i.test(tok.lang || '')) {
      const line = tok.text.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
      if (line) steps.push({ ...pending, cmd: line });
      pending = null;
    }
  }
  return steps;
}

/* ------------------------------------------------------- markdown → html */

const COPY_ICON = '<svg class="i-copy" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="5" y="5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 2.5H2.5V11" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><svg class="i-tick" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

function copyButton(text) {
  return `<button class="copy" type="button" aria-label="Copy to clipboard"${text != null ? ` data-copy="${escAttr(text)}"` : ''}>${COPY_ICON}</button>`;
}

function renderMarkdown(md, labDir) {
  const toc = [];
  const used = new Map();
  const slug = (text) => {
    const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        if (depth === 1) return '';
        const inner = this.parser.parseInline(tokens);
        const plain = unescape(inner.replace(/<[^>]+>/g, ''));
        const id = slug(plain);
        let html = inner;
        let m;
        if ((m = /^Question\s+(\d+)\s*:\s*([\s\S]*)$/i.exec(inner))) {
          html = `<span class="q-n">${m[1]}.</span><span>${m[2]}</span>`;
          toc.push({ depth, id, text: `${m[1]}. ${unescape(m[2].replace(/<[^>]+>/g, ''))}` });
        } else if ((m = /^Sub Question\s+(\w+)\s*:\s*([\s\S]*)$/i.exec(inner))) {
          html = `<span class="q-n">${m[1]}.</span><span>${m[2]}</span>`;
        } else if ((m = /^Step\s+(\d+)\s*:\s*([\s\S]*)$/i.exec(inner))) {
          html = `<span class="step-n">${m[1]}</span><span>${m[2]}</span>`;
        } else if (depth <= 3) {
          toc.push({ depth, id, text: plain });
        }
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const key = (lang || '').split(/\s+/)[0].toLowerCase();
        if (key === 'powershell' || key === 'ps' || key === 'ps1' || key === 'pwsh') {
          return variantBlock(psToBash(text), text);
        }
        if (key === 'bash' || key === 'sh' || key === 'shell' || key === 'zsh') {
          return variantBlock(text, bashToPs(text));
        }
        return codeBlock(text, lang);
      },
      image({ href, text }) {
        const { src, w, h } = rewriteAsset(href, labDir);
        const cap = prettyCaption(text);
        const shotName = prettyShotName(href, text);
        const dims = w && h ? ` width="${w}" height="${h}"` : '';
        return `<figure class="shot"><figcaption><span class="shot-when">Take screenshot: <strong>${esc(shotName)}</strong></span><span class="shot-hint">Click to zoom</span></figcaption><a href="${src}" class="zoom" data-caption="${escAttr(`${shotName}: ${cap}`)}"><img loading="lazy" decoding="async"${dims} src="${src}" alt="${escAttr(cap)}"></a></figure>`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const target = rewriteLink(href, labDir);
        const ext = /^https?:/.test(target) ? ' rel="noopener"' : '';
        return `<a href="${target}"${title ? ` title="${escAttr(title)}"` : ''}${ext}>${inner}</a>`;
      },
      table(token) {
        const head = token.header.map((c) => `<th scope="col">${this.parser.parseInline(c.tokens)}</th>`).join('');
        const rows = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      },
      hr() { return ''; },
    },
  });

  let html = marked.parse(md);
  html = html
    .replace(/<p>((?:\s*<figure class="shot">[\s\S]*?<\/figure>\s*)+)<\/p>/g, '<div class="shots">$1</div>')
    .replace(/<ul>\s*<li><strong>Why and what we are doing:<\/strong>([\s\S]*?)<\/li>\s*<\/ul>/g, '<p class="why">$1</p>')
    .replace(/<p><em>Observation(?: &amp; Design Finding)?:<\/em>/g, '<p class="finding">')
    .replace(/<p><em>([^<]*(?:Output|File content)[^<]*)<\/em><\/p>/gi, (_, t) => `<p class="out-label">${t.replace(/:\s*$/, '').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</p>`);
  return { html: proseTypography(html), toc: toc.map((t) => ({ ...t, text: t.text.replace(/ [–—] /g, ': ') })) };
}

// Curly quotes and no dashes in running text; code and pre are left alone.
function proseTypography(html) {
  let depth = 0;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) {
      if (/^<(pre|code)\b/i.test(part)) depth++;
      else if (/^<\/(pre|code)>/i.test(part)) depth--;
      return part;
    }
    if (depth > 0) return part;
    return part
      .replace(/\s*[–—]\s*/g, (m, off, str) => (/^\d/.test(str[off - 1] || '') && /^\d/.test(str[off + m.length] || '') ? ' to ' : ', '))
      .replace(/(\w)(?:&#39;|')(\w)/g, '$1\u2019$2')
      .replace(/&quot;([^&]*)&quot;/g, '\u201c$1\u201d')
      .replace(/\.\.\./g, '\u2026');
  }).join('');
}

function unescape(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function codeBlock(text, lang = '', file = '') {
  const key = (lang || '').split(/\s+/)[0].toLowerCase();
  const language = LANG_ALIASES[key] || (hljs.getLanguage(key) ? key : 'plaintext');
  const label = file || LANG_LABELS[language] || key || 'text';
  if (!file && (language === 'bash' || language === 'powershell')) {
    const cmds = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (cmds.length) {
      const prompt = language === 'powershell' ? 'PS&gt; ' : '$ ';
      const rows = cmds.map((c) => `<div class="cmd-line"><code><span class="ps">${prompt}</span>${esc(c)}</code>${copyButton(c)}</div>`).join('');
      return `<div class="well code cmd-stack"><div class="well-head"><span>${esc(label)}</span><span>${cmds.length} ${cmds.length === 1 ? 'command' : 'commands'}</span></div><div class="cmd-stack-body">${rows}</div></div>`;
    }
  }
  const body = language === 'plaintext' ? esc(text) : hljs.highlight(text, { language, ignoreIllegals: true }).value;
  const kind = language === 'plaintext' ? ' is-output' : '';
  return `<div class="well code${kind}"><div class="well-head"><span>${esc(label)}</span>${copyButton(null)}</div><pre><code class="hljs">${body}</code></pre></div>`;
}

function pngDimensions(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(24);
    const n = fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    if (n >= 24 && buf.toString('ascii', 1, 4) === 'PNG') {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
  } catch { /* ignore */ }
  return { w: 0, h: 0 };
}

function rewriteAsset(href, labDir) {
  if (/^https?:/.test(href)) return { src: href, w: 0, h: 0 };
  const decoded = decodeURI(href);
  const repoRel = path.posix.normalize(path.posix.join(labDir, decoded));
  const src = path.join(REPO_ROOT, repoRel);
  let dims = { w: 0, h: 0 };
  if (fs.existsSync(src)) {
    const dest = path.join(OUT, 'labs', repoRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    dims = pngDimensions(src);
  } else {
    console.warn(`  ! missing image ${repoRel}`);
  }
  return { src: repoRel.split('/').map(encodeURIComponent).join('/'), ...dims };
}

function rewriteLink(href, labDir) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [p, hash] = href.split('#');
  const repoRel = path.posix.normalize(path.posix.join(labDir, decodeURI(p)));
  const labMatch = /^Lab_(\d+)\/README\.md$/.exec(repoRel);
  if (labMatch) return `lab-${labMatch[1]}.html${hash ? `#${hash}` : ''}`;
  const abs = path.join(REPO_ROOT, repoRel);
  const isDir = fs.existsSync(abs) && fs.statSync(abs).isDirectory();
  return githubLink(repoRel, isDir) || href;
}

function prettyCaption(alt) {
  const s = alt.replace(/^(PL-)?\d+[A-Z]?\d*[-_ ]*/i, '').replace(/^task\d+_/i, '').replace(/[-_]+/g, ' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : alt;
}

function prettyShotName(href, alt) {
  const base = path.posix.basename(decodeURI(href || alt || 'screenshot.png'));
  const ext = path.posix.extname(base) || '.png';
  const stem = base.slice(0, base.length - ext.length)
    .replace(/[-_]+/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (/^(PL|\d+[a-z]?)$/i.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
  return `${stem}${ext}`;
}

/* ------------------------------------------------------------- layout */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
function typo(s) {
  return s.replace(/\.\.\./g, '\u2026').replace(/(\w)'(\w)/g, '$1\u2019$2').replace(/"([^"]*)"/g, '\u201c$1\u201d');
}
function inlineCode(s) {
  return String(s).split(/(`[^`]+`)/).map((part) => (/^`[^`]+`$/.test(part) ? `<code>${esc(part.slice(1, -1))}</code>` : esc(typo(part)))).join('');
}


/* ------------------------------------------------------------ site map */

// Lesson order, the way the tutorial reads from start to finish.
const LESSON_ORDER = ['setup', 'cluster', 'deploy', 'scale', 'expose', 'config', 'inspect', 'ns', 'clean', 'helm', 'trace', 'go'];
const lessonCat = (id) => commands.categories.find((c) => c.id === id);
const lessonHref = (id) => `learn/${id}.html`;

// The reading order for previous / next: install, then the lessons.
const READING = [
  { key: 'install', href: 'install.html', label: 'Install the tools' },
  ...LESSON_ORDER.map((id) => ({ key: `learn-${id}`, href: lessonHref(id), label: lessonCat(id).label })),
];

function sideGroups(labs) {
  const item = (key, href, label) => ({ key, href, label });
  return [
    { title: 'Start here', items: [item('home', 'index.html', 'Home'), item('install', 'install.html', 'Install the tools'), item('learn-setup', lessonHref('setup'), lessonCat('setup').label)] },
    { title: 'Basics', items: ['cluster', 'deploy', 'scale', 'expose', 'config', 'inspect', 'ns', 'clean'].map((id) => item(`learn-${id}`, lessonHref(id), lessonCat(id).label)) },
    { title: 'Going further', items: ['helm', 'trace', 'go'].map((id) => item(`learn-${id}`, lessonHref(id), lessonCat(id).label)) },
    { title: 'Chapters (Labs)', items: [item('labs', 'roadmap.html', 'All chapters'), ...labs.map((l) => item(`lab-${l.n}`, `labs/lab-${l.n}.html`, `Chapter ${l.n}`))] },
    { title: 'Reference', items: [item('commands', 'commands.html', 'All commands'), item('stuck', 'troubleshooting.html', 'Fixes for common errors')] },
  ];
}

const TOP = [
  { key: 'learn', href: 'learn/setup.html', label: 'Tutorial' },
  { key: 'commands', href: 'commands.html', label: 'Commands' },
  { key: 'install', href: 'install.html', label: 'Install' },
  { key: 'labs', href: 'roadmap.html', label: 'Labs' },
  { key: 'stuck', href: 'troubleshooting.html', label: 'Fixes' },
];
const topKey = (active) => (active.startsWith('learn-') ? 'learn' : active.startsWith('lab-') ? 'labs' : active);

/* --------------------------------------------------------------- layout */

let LABS = [];

function layout({ title, description, active = '', body, depth = 0, side = true }) {
  const root = depth ? '../'.repeat(depth) : '';
  const top = TOP.map((n) => `<li><a href="${root}${n.href}"${n.key === topKey(active) ? ' aria-current="page"' : ''}>${n.label}</a></li>`).join('');
  const sidebar = side ? `<nav class="side" aria-label="Lessons">
    <details class="side-details" open>
      <summary>Lessons and labs</summary>
      ${sideGroups(LABS).map((g) => `<p class="side-group">${g.title}</p><ul>${g.items.map((it) => `<li><a href="${root}${it.href}"${it.key === active ? ' aria-current="page"' : ''}>${esc(it.label)}</a></li>`).join('')}</ul>`).join('')}
    </details>
  </nav>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | kubelabs</title>
<meta name="description" content="${escAttr(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escAttr(title)} | kubelabs">
<meta property="og:description" content="${escAttr(description)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escAttr(title)} | kubelabs">
<meta name="twitter:description" content="${escAttr(description)}">
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}assets/style.css">
<script>document.documentElement.classList.add('js');try{var s=localStorage.getItem('shell');document.documentElement.dataset.shell=s==='ps'||s==='bash'?s:(/Windows/i.test(navigator.userAgent)?'ps':'bash')}catch(e){document.documentElement.dataset.shell=/Windows/i.test(navigator.userAgent)?'ps':'bash'}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <div class="topbar-inner">
    <a class="mark" href="${root}index.html" aria-label="kubelabs home"><span class="mark-glyph" aria-hidden="true">k</span>kubelabs</a>
    <nav aria-label="Main"><ul class="top-links">${top}</ul></nav>
    <form class="top-search" action="${root}commands.html" role="search">
      <label class="visually-hidden" for="top-q">Search commands</label>
      <input id="top-q" name="q" type="search" placeholder="Search commands" autocomplete="off">
    </form>
  </div>
</header>
<div class="${side ? 'doc' : 'page'}">
  ${sidebar}
  <main id="main" class="${side ? 'doc-main' : ''}">
${body}
  </main>
</div>
<footer class="colophon">
  <div class="colophon-inner">
    <p class="colophon-mark">kubelabs</p>
    <p class="colophon-text">Kubernetes commands and hands-on labs for macOS, Windows and Linux. Written by a student while learning, rebuilt from Markdown by GitHub Actions on every push.</p>
    <ul class="colophon-links">
      <li><a href="${root}learn/setup.html">Tutorial</a></li>
      <li><a href="${root}commands.html">All commands</a></li>
      <li><a href="${root}install.html">Install</a></li>
      <li><a href="${root}roadmap.html">Labs</a></li>
      ${repo.url ? `<li><a href="${repo.url}" rel="noopener">Source on GitHub</a></li>` : ''}
    </ul>
  </div>
</footer>
<div class="lightbox" hidden><button class="lightbox-close" type="button" aria-label="Close screenshot">Close</button><p></p></div>
<script src="${root}assets/app.js" defer></script>
</body>
</html>`;
}

function writePage(rel, html) {
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

/* ------------------------------------------------------ shell variants */

function shellSwitch() {
  return `<div class="shell-switch" role="group" aria-label="Show commands for">
    <span class="shell-switch-label">Show commands for</span>
    <span class="tray"><button type="button" data-shell="bash" aria-pressed="true">macOS / Linux</button><button type="button" data-shell="ps" aria-pressed="false">Windows</button></span>
  </div>`;
}

function cmdLines(x) {
  const line = (cmd, prompt, cls, label) => `<div class="cmd-line${cls}">${label ? `<span class="v-label">${label}</span>` : ''}<code><span class="ps">${prompt}</span>${esc(cmd)}</code>${copyButton(cmd)}</div>`;
  if (!x.ps) return `<div class="cmd-line"><code><span class="ps v-bash">$ </span><span class="ps v-ps">PS&gt; </span>${esc(x.cmd)}</code>${copyButton(x.cmd)}</div>`;
  return line(x.cmd, '$ ', ' v-bash', 'macOS / Linux') + line(x.ps, 'PS&gt; ', ' v-ps', 'Windows PowerShell');
}

function psToBash(text) {
  return text.split('\n').map((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return line;
    return line
      .replace(/^mkdir \$HOME\\(.+)$/, 'mkdir -p ~/$1')
      .replace(/^cd \$HOME\\(.+)$/, 'cd ~/$1')
      .replace(/^notepad (.+)$/, 'nano $1')
      .replace(/^cmd \/c "(.+)"$/, '$1')
      .replace(/^Get-Content\s+([^\s|]+)\s*\|\s*Select-String\s+"([^"]+)"$/, (_, f, pat) => `grep ${pat} ${f.replace(/\\/g, '/')}`)
      .replace(/^Select-String\s+"([^"]+)"\s+(\S+)$/, 'grep $1 $2')
      .replace(/\|\s*Select-String\s+"([^"]+)"\s*\|\s*Select-Object\s+-Last\s+(\d+)/g, '| grep "$1" | tail -n $2')
      .replace(/\|\s*Select-String\s+'([^']+)'/g, "| grep '$1'")
      .replace(/\|\s*Select-String\s+"([^"]+)"/g, '| grep "$1"')
      .replace(/^\$NODE\s*=\s*"([^"]+)"$/, 'NODE="$1"')
      .replace(/\\([^\\])/g, '/$1');
  }).join('\n');
}

function bashToPs(text) {
  return text.split('\n').map((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return line;
    if (/^cd\s+~\/(.+)$/.test(t)) return `cd $HOME\\${t.slice(5).replace(/\//g, '\\')}`;
    if (/^cd\s+(.+)$/.test(t)) return `cd ${t.slice(3).replace(/\//g, '\\')}`;
    if (/^cp\s+(\S+)\s+(\S+)$/.test(t)) {
      const m = /^cp\s+(\S+)\s+(\S+)$/.exec(t);
      return `Copy-Item ${m[1].replace(/\//g, '\\')} ${m[2].replace(/\//g, '\\')}`;
    }
    if (t === 'tree -L 3') return 'tree /F';
    if (/\|\s*grep\s+(\S+)$/.test(t)) return t.replace(/\|\s*grep\s+(\S+)$/, '| Select-String "$1"');
    let m;
    if ((m = /^grep\s+-RnE\s+'([^']+)'\s+(\S+)\s+--include='\*\.go'\s*\|\s*grep\s+-v\s+'_test\.go'$/.exec(t))) {
      return `Get-ChildItem -Recurse -Filter *.go -Exclude *_test.go ${m[2].replace(/\//g, '\\')} | Select-String -Pattern '${m[1]}'`;
    }
    if ((m = /^grep\s+-nE?\s+'([^']+)'\s+(\S+)$/.exec(t))) {
      return `Select-String -Pattern '${m[1]}' -Path ${m[2].replace(/^~\//, '$HOME\\').replace(/\//g, '\\')}`;
    }
    if ((m = /^grep\s+-n\s+-C\s+(\d+)\s+(['"])(.+?)\2\s+(\S+)$/.exec(t))) {
      return `Select-String -Pattern "${m[3]}" -Context ${m[1]} -Path ${m[4].replace(/^~\//, '$HOME\\').replace(/\//g, '\\')}`;
    }
    return line;
  }).join('\n');
}

function variantBlock(code, ps) {
  return `<div class="v-bash">${codeBlock(code, 'bash', 'bash, macOS / Linux')}</div><div class="v-ps">${codeBlock(ps || code, 'powershell', 'powershell, Windows')}</div>`;
}

function pager(key, root) {
  const i = READING.findIndex((r) => r.key === key);
  if (i < 0) return '';
  const prev = READING[i - 1];
  const next = READING[i + 1];
  return `<nav class="pager" aria-label="Lesson pages">
    ${prev ? `<a class="key" href="${root}${prev.href}"><span>Previous</span>${esc(prev.label)}</a>` : '<span></span>'}
    ${next ? `<a class="key key--primary next" href="${root}${next.href}"><span>Next</span>${esc(next.label)}</a>` : `<a class="key key--primary next" href="${root}roadmap.html"><span>Next</span>Try a lab</a>`}
  </nav>`;
}

function exampleBox(x, root = '') {
  const partsHtml = x.parts && x.parts.length
    ? `<details class="cmd-parts"><summary>Break down this command (${x.parts.length} parts)</summary><dl class="parts-list">${x.parts.map((p) => `<div class="part-row"><dt><code>${esc(p.flag)}</code></dt><dd>${inlineCode(p.text)}</dd></div>`).join('')}</dl></details>`
    : '';
  return `<section class="example-item" data-cat="${x.cat}" data-text="${escAttr(`${x.cmd} ${x.ps || ''} ${x.desc} ${x.when}`.toLowerCase())}">
    <p>${inlineCode(x.desc)}</p>
    <figure class="example">
      <figcaption>Example</figcaption>
      ${cmdLines(x)}
    </figure>
    ${partsHtml}
    ${x.snippet ? codeBlock(x.snippet.code, x.snippet.lang || 'yaml', x.snippet.name || '') : ''}
    <p class="when"><strong>Use it when:</strong> ${inlineCode(x.when)}${x.lab ? ` <a href="${root}labs/lab-${x.lab}.html">Seen in lab ${x.lab}</a>` : ''}</p>
  </section>`;
}

function recipeBlock(r) {
  return `<section class="walk" id="recipe-${r.id}">
    <h2>${esc(r.title)}</h2>
    <p>${inlineCode(r.intro)}</p>
    <ol class="walk-steps">${r.steps.map((st) => `<li><p>${inlineCode(st.text)}</p>${st.code ? variantBlock(st.code, st.ps) : ''}</li>`).join('')}</ol>
  </section>`;
}

/* ------------------------------------------------------------ home page */


// The hero session: what Lab 1 does first, with the nodes it lights.
const HERO_SESSION = [
  { t: 'cmd', text: 'kind create cluster --config kind-3node.yaml' },
  { t: 'out', text: 'Creating cluster "klu" ...' },
  { t: 'out', text: ' ok  Preparing nodes' },
  { t: 'out', text: ' ok  Starting control-plane', light: 'cp' },
  { t: 'out', text: ' ok  Joining worker nodes' },
  { t: 'out', text: 'Set kubectl context to "kind-klu"' },
  { t: 'gap' },
  { t: 'cmd', text: 'kubectl get nodes' },
  { t: 'out', text: 'NAME                STATUS   ROLES' },
  { t: 'out', text: 'klu-control-plane   Ready    control-plane', light: 'cp', ready: true },
  { t: 'out', text: 'klu-worker          Ready    <none>', light: 'w1', ready: true },
  { t: 'out', text: 'klu-worker2         Ready    <none>', light: 'w2', ready: true },
];

function heroSession() {
  return HERO_SESSION.map((l) => {
    if (l.t === 'gap') return '<span class="ln ln-gap"> </span>';
    const attrs = `${l.light ? ` data-light="${l.light}"` : ''}`;
    if (l.t === 'cmd') return `<span class="ln ln-cmd"${attrs}><span class="ps">$ </span><span class="typed">${esc(l.text)}</span></span>`;
    return `<span class="ln ln-out${l.ready ? ' ready' : ''}"${attrs}>${esc(l.text)}</span>`;
  }).join('');
}

const k8sHex = (glyph, cls = '') => `<svg class="k8s-hex ${cls}" viewBox="0 0 40 40" width="36" height="36" aria-hidden="true"><polygon points="20,2 34,9 38,24 28,36 12,36 2,24 6,9" fill="currentColor"/>${glyph}</svg>`;
const K8S_ICONS = {
  deploy: k8sHex('<rect x="13" y="13" width="14" height="14" rx="2" fill="none" stroke="#fff" stroke-width="2"/><path d="M16 20h8M20 16v8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'),
  rs: k8sHex('<rect x="11" y="12" width="7" height="7" rx="1" fill="#fff"/><rect x="22" y="12" width="7" height="7" rx="1" fill="#fff"/><rect x="16.5" y="22" width="7" height="7" rx="1" fill="#fff"/>'),
  svc: k8sHex('<circle cx="20" cy="12" r="2.5" fill="#fff"/><circle cx="13" cy="26" r="2.5" fill="#fff"/><circle cx="20" cy="26" r="2.5" fill="#fff"/><circle cx="27" cy="26" r="2.5" fill="#fff"/><path d="M20 14.5V20M13 20h14M13 20v3.5M20 20v3.5M27 20v3.5" stroke="#fff" stroke-width="1.6"/>'),
  pod: k8sHex('<polygon points="20,10 29,15 29,25 20,30 11,25 11,15" fill="none" stroke="#fff" stroke-width="2"/><path d="M11 15l9 5 9-5M20 20v10" stroke="#fff" stroke-width="1.8"/>'),
  ns: k8sHex('<rect x="12" y="12" width="16" height="16" rx="2" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 2"/>'),
  cp: k8sHex('<circle cx="20" cy="20" r="6" fill="none" stroke="#fff" stroke-width="2"/><path d="M20 10v4M20 26v4M10 20h4M26 20h4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'),
  node: k8sHex('<rect x="12" y="13" width="16" height="6" rx="1.5" fill="none" stroke="#fff" stroke-width="1.8"/><rect x="12" y="22" width="16" height="6" rx="1.5" fill="none" stroke="#fff" stroke-width="1.8"/>'),
  cm: k8sHex('<path d="M14 11h9l4 4v14H14z" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M17 20h6M17 24h6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>'),
};

function clusterDiagram() {
  return `
  <div class="node-card node-cp node" data-node="cp">
    <div class="node-head"><span class="node-id">${K8S_ICONS.cp}<strong>klu-control-plane</strong></span><span class="node-role" data-node-role="cp">control-plane</span></div>
    <div class="node-pills"><span>kube-apiserver</span><span>etcd</span><span>scheduler</span><span>controllers</span></div>
    <div class="ctrl-chain" data-ctrl-chain hidden><span>Deployment/web</span><span aria-hidden="true">→</span><span>ReplicaSet/web-6d8f</span><strong data-rs-count>0/3</strong></div>
  </div>
  <svg class="node-wires" data-node-wires viewBox="0 0 260 32" aria-hidden="true" preserveAspectRatio="none">
    <path d="M130 0 V14 M58 14 H202 M58 14 V32 M202 14 V32" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>
  <div class="node-workers">
    <div class="node-card node" data-node="w1">
      <div class="node-head"><span class="node-id">${K8S_ICONS.node}<strong>klu-worker</strong></span><span class="node-role" data-node-role="w1">worker</span></div>
      <div class="node-pills"><span>kubelet</span><span>pods</span></div>
      <div class="node-pods" data-node-pods="w1"></div>
    </div>
    <div class="node-card node" data-node="w2">
      <div class="node-head"><span class="node-id">${K8S_ICONS.node}<strong>klu-worker2</strong></span><span class="node-role" data-node-role="w2">worker</span></div>
      <div class="node-pills"><span>kubelet</span><span>pods</span></div>
      <div class="node-pods" data-node-pods="w2"></div>
    </div>
  </div>`;
}



function renderHome(labs) {
  const startLink = lessonHref('setup');
  const groups = [
    { id: 'act1', n: '01', name: 'Setup & Basics', sub: 'Tools, 3-node cluster, first app, networking', ids: ['setup', 'cluster', 'deploy', 'expose'] },
    { id: 'act2', n: '02', name: 'Scale, Config & Debug', sub: 'Replicas, secrets, logs, namespaces', ids: ['scale', 'config', 'inspect', 'ns'] },
    { id: 'act3', n: '03', name: 'Internals, Helm & Go', sub: 'Cleanup, charts, etcd trace, client-go', ids: ['clean', 'helm', 'trace', 'go'] },
  ];
  let stepNum = 0;
  const lessonRow = (id) => {
    stepNum++;
    const c = lessonCat(id);
    const first = commands.commands.find((x) => x.cat === id && x.top) || commands.commands.find((x) => x.cat === id);
    const n = commands.commands.filter((x) => x.cat === id).length;
    return `<li class="ledger-row"><a class="ledger-link" href="${lessonHref(id)}"><span class="ledger-n">${String(stepNum).padStart(2, '0')}</span><span class="ledger-title">${esc(c.label)}</span><span class="ledger-desc">${inlineCode(c.line)}</span><code class="ledger-cmd">${esc(first.cmd)}</code><span class="ledger-count">${n}</span></a></li>`;
  };

  const actTabs = groups.map((g, i) => `<button type="button" role="tab" id="tab-${g.id}" aria-controls="panel-${g.id}" aria-selected="${i === 0}" data-act-tab="${g.id}"><span class="act-idx">${g.n}</span><span><strong>${esc(g.name)}</strong><small>${esc(g.sub)}</small></span></button>`).join('');
  const actPanels = groups.map((g, i) => `<div class="act-panel" id="panel-${g.id}" role="tabpanel" aria-labelledby="tab-${g.id}"${i > 0 ? ' hidden' : ''}><ol class="ledger-list">${g.ids.map(lessonRow).join('')}</ol></div>`).join('');

  const chapterCells = labs.map((l) => {
    const s = l.session;
    const tools = (s ? s.tools : []).map((t) => `<span>${esc(t)}</span>`).join('');
    return `<article class="chap-cell">
      <div class="chap-head"><span class="chap-num">Chapter 0${l.n}</span><span class="chap-meta">${l.steps.length} steps</span></div>
      <h3><a href="labs/lab-${l.n}.html">${inlineCode(l.title)}</a></h3>
      <p class="chap-out">${esc(s ? s.outcome : '')}</p>
      <div class="chap-foot"><div class="chap-tools">${tools}</div><a class="chap-link" href="labs/lab-${l.n}.html">Read chapter</a></div>
    </article>`;
  }).join('');

  const ICON_DEPLOY = K8S_ICONS.deploy;
  const ICON_RS = K8S_ICONS.rs;
  const ICON_SVC = K8S_ICONS.svc;
  const ICON_POD = K8S_ICONS.pod;
  const ICON_NS = K8S_ICONS.ns;

  const yamlRecipe = commands.recipes.find((r) => r.id === 'yaml');
  const yamlFile = /cat > web\.yaml <<'EOF'\n([\s\S]*)\nEOF/.exec(yamlRecipe.steps[0].code)[1];

  const body = `
<div class="home-v2">
<section class="v2-hero">
  <div class="container">
    <div class="v2-hero-top">
      <div class="v2-hero-copy">
        <h1>Learn Kubernetes by typing it.</h1>
        <p class="lead">Practical commands, live cluster simulations, and hands-on labs for every OS.</p>
      </div>
      <div class="v2-hero-side">
        <div class="actions">
          <a class="key key--primary" href="${startLink}">Start learning</a>
          <a class="key" href="commands.html">Explore all commands</a>
        </div>
        <div class="v2-stats" aria-label="Platform contents">
          <span><strong>12</strong> lessons</span>
          <span><strong>4</strong> lab chapters</span>
          <span><strong>${commands.commands.length}</strong> commands</span>
        </div>
      </div>
    </div>

    <figure class="graphite v2-workbench" aria-label="Interactive Kubernetes cluster workbench">
      <div class="graphite-head">
        <div class="hero-tabs" role="tablist" aria-label="Cluster scenario">
          <button type="button" role="tab" data-hero-tab="boot" aria-selected="true">01 Boot cluster</button>
          <button type="button" role="tab" data-hero-tab="deploy" aria-selected="false">02 Deploy nginx</button>
          <button type="button" role="tab" data-hero-tab="heal" aria-selected="false">03 Self-heal</button>
        </div>
        <button class="replay-btn" type="button" data-replay hidden>Replay</button>
      </div>
      <div class="v2-wb-grid">
        <pre class="hero-session" data-session>${heroSession()}<span class="caret" aria-hidden="true"> </span></pre>
        <div class="hero-diagram" role="img" aria-label="Cluster topology: one control-plane node and two worker nodes">${clusterDiagram()}</div>
      </div>
    </figure>
  </div>
</section>

<section class="v2-sec" id="lessons">
  <div class="container">
    <div class="v2-sec-head">
      <h2>Twelve lessons, three acts.</h2>
      <p class="lead">Pick an act to inspect its commands, or start at 01 and work straight through.</p>
    </div>
    <div class="acts-studio" data-switch>
      <div class="acts-rail" role="tablist" aria-label="Learning acts">${actTabs}</div>
      <div class="acts-stage">${actPanels}</div>
    </div>
  </div>
</section>

<section class="v2-band" id="first">
  <div class="container">
    <div class="v2-sec-head">
      <h2>Your first deployment, live.</h2>
      <p class="lead">Apply <code>web.yaml</code> and watch Deployment, ReplicaSet, Pods and Service wire together.</p>
    </div>
    <div class="deploy-lab" data-deploy-sim>
      <div class="deploy-left">
        <div class="actions">
          <button class="key key--primary" type="button" data-sim-apply>Apply web.yaml</button>
          <button class="key" type="button" data-sim-kill disabled>Kill Pod 2</button>
          <button class="key" type="button" data-sim-reset>Reset</button>
          <a class="key" href="${lessonHref('deploy')}#recipe-yaml">Full walkthrough</a>
        </div>
        <p class="deploy-log" data-sim-log>Ready: click Apply web.yaml to create the Deployment and Service.</p>
        ${codeBlock(yamlFile, 'yaml', 'web.yaml')}
      </div>
      <div class="deploy-right k8s-canvas" aria-live="polite">
        <div class="ns-frame">
          <div class="ns-tag">${ICON_NS}<span>namespace: default</span></div>
          <div class="ctrl-row">
            <div class="k8s-node" data-res="deploy">${ICON_DEPLOY}<div class="k8s-lbl"><strong>Deployment</strong><span>web (3x)</span><em data-res-badge="deploy">idle</em></div></div>
            <svg class="k8s-arrow" viewBox="0 0 28 16" aria-hidden="true"><path d="M2 8 H22 M17 3 L23 8 L17 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <div class="k8s-node" data-res="rs">${ICON_RS}<div class="k8s-lbl"><strong>ReplicaSet</strong><span>web-6d8f</span><em data-res-badge="rs">waiting</em></div></div>
          </div>
          <div class="traffic-row">
            <div class="k8s-client"><strong>Browser</strong><span>:8080</span></div>
            <svg class="k8s-arrow" viewBox="0 0 28 16" aria-hidden="true"><path d="M2 8 H22 M17 3 L23 8 L17 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <div class="k8s-node" data-res="svc">${ICON_SVC}<div class="k8s-lbl"><strong>Service</strong><span>web :80</span><em data-res-badge="svc">waiting</em></div></div>
            <svg class="k8s-branch" viewBox="0 0 36 120" aria-hidden="true"><path d="M0 60 H16 M16 20 V100 M16 20 H34 M16 60 H34 M16 100 H34" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
            <div class="res-pods" data-res-pods>
              <div class="res-pod" data-pod="1">${ICON_POD}<div><strong>web-1</strong><span>idle</span></div></div>
              <div class="res-pod" data-pod="2">${ICON_POD}<div><strong>web-2</strong><span>idle</span></div></div>
              <div class="res-pod" data-pod="3">${ICON_POD}<div><strong>web-3</strong><span>idle</span></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="v2-sec" id="labs">
  <div class="container">
    <div class="v2-sec-head">
      <h2>Hands-on lab chapters.</h2>
      <p class="lead">Four multi-step labs recorded from real kind clusters, source files and terminal logs.</p>
    </div>
    <div class="chap-grid">${chapterCells}</div>
    <div class="res-strip" aria-label="Quick resources">
      <a href="commands.html"><strong>Command reference</strong><span>Search all ${commands.commands.length} commands</span></a>
      <a href="install.html"><strong>Install tools</strong><span>Docker, kind, kubectl, Go</span></a>
      <a href="troubleshooting.html"><strong>Troubleshooting</strong><span>Fix Pending &amp; connection errors</span></a>
      <a href="roadmap.html"><strong>Chapter roadmap</strong><span>Full lab sequence</span></a>
    </div>
  </div>
</section>
</div>`;
  return layout({ title: 'Learn Kubernetes by typing it', description: 'Learn Kubernetes through practical commands, interactive experiments, and hands-on labs for macOS, Windows and Linux.', active: 'home', body, side: false });
}

/* -------------------------------------------------------- lesson pages */

function lessonStory(s) {
  if (!s) return '';
  return `<section class="story-box" aria-label="Scenario">
    <p class="story-beat">${esc(s.beat)}</p>
    <div class="micro-loop">
      <div class="micro-card"><strong>1. The Hook</strong><p>${inlineCode(s.hook)}</p></div>
      <div class="micro-card"><strong>2. The Break</strong><p>${inlineCode(s.break)}</p></div>
      <div class="micro-card"><strong>3. The Fix</strong><p>${inlineCode(s.fix)}</p></div>
      <div class="micro-card"><strong>4. The Verify</strong><p>${inlineCode(s.verify)}</p></div>
    </div>
  </section>`;
}

function lessonLab(id) {
  if (id === 'deploy' || id === 'scale') {
    return `<section class="sim-box" data-sim="replicas" aria-label="Interactive replica and rollout simulator">
      <div class="sim-head"><strong>Try it: Replica &amp; Rollout Simulator</strong><span class="sim-state" data-sim-status>3 / 3 Ready (nginx:1.27)</span></div>
      <div class="sim-controls">
        <button class="key" type="button" data-sim-act="dec">-1 Replica</button>
        <button class="key" type="button" data-sim-act="inc">+1 Replica</button>
        <button class="key key--primary" type="button" data-sim-act="rollout">Rollout v1.28</button>
        <button class="key" type="button" data-sim-act="rollback">Rollback</button>
      </div>
      <div class="ns-frame">
        <div class="ns-tag">${K8S_ICONS.deploy}<span>Deployment: web</span></div>
        <div class="pod-strip" data-sim-pods>
          <span class="k8s-pod-pill is-running">${K8S_ICONS.pod}<span>web-1 (v1.27)</span></span>
          <span class="k8s-pod-pill is-running">${K8S_ICONS.pod}<span>web-2 (v1.27)</span></span>
          <span class="k8s-pod-pill is-running">${K8S_ICONS.pod}<span>web-3 (v1.27)</span></span>
        </div>
      </div>
    </section>`;
  }
  if (id === 'expose') {
    return `<section class="sim-box" data-sim="service" aria-label="Interactive Service routing simulator">
      <div class="sim-head"><strong>Try it: Service &amp; Changing Pod IPs</strong><span class="sim-state" data-sim-status>svc/web (10.96.0.42:80)</span></div>
      <div class="sim-controls">
        <button class="key key--primary" type="button" data-sim-act="restart">Restart Pod 1</button>
      </div>
      <div class="ns-frame">
        <div class="ns-tag">${K8S_ICONS.svc}<span>Service routing</span></div>
        <div class="pod-strip" data-sim-pods>
          <span class="k8s-pod-pill is-svc">${K8S_ICONS.svc}<span>svc/web → 10.96.0.42</span></span>
          <span class="k8s-pod-pill is-running">${K8S_ICONS.pod}<span data-pod-ip>web-1 (10.244.1.4)</span></span>
          <span class="k8s-pod-pill is-running">${K8S_ICONS.pod}<span>web-2 (10.244.2.7)</span></span>
        </div>
      </div>
    </section>`;
  }
  if (id === 'inspect') {
    return `<section class="sim-box" data-sim="triage" aria-label="Interactive symptom triage">
      <div class="sim-head"><strong>Try it: Pick a broken Pod symptom</strong><span class="sim-state" data-sim-status>Click a status to see the right command</span></div>
      <div class="sim-controls">
        <button class="key" type="button" data-sim-act="pending">Pending</button>
        <button class="key" type="button" data-sim-act="crash">CrashLoopBackOff</button>
        <button class="key" type="button" data-sim-act="conflict">409 Conflict</button>
      </div>
      <p class="sim-out" data-sim-out>Run <code>kubectl get pods</code> first, then pick the status you see above.</p>
    </section>`;
  }
  return '';
}

function renderLesson(id) {
  const c = lessonCat(id);
  const items = commands.commands.filter((x) => x.cat === id);
  const recipes = (c.recipes || []).map((rid) => commands.recipes.find((r) => r.id === rid)).filter(Boolean);
  const body = `
<article class="lesson-page">
  <h1>${esc(c.label)}</h1>
  ${pager(`learn-${id}`, '../')}
  <p class="lead">${inlineCode(c.intro)}</p>
  ${lessonStory(c.story)}
  ${lessonLab(id)}
  ${shellSwitch()}
  <h2>Commands</h2>
  ${items.map((x) => exampleBox(x, '../')).join('')}
  ${recipes.map(recipeBlock).join('')}
  ${pager(`learn-${id}`, '../')}
</article>`;
  return layout({ title: `Kubernetes: ${c.label}`, description: `${c.label}: ${c.line} Commands for macOS, Windows and Linux.`, active: `learn-${id}`, body, depth: 1 });
}

/* ----------------------------------------------------------- other pages */

function pageHead(title, lead) {
  return `<h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}`;
}

function labTools(lab, root = '') {
  return (lab.session ? lab.session.tools : []).map((t) => `<a href="${root}install.html#tool-${t}">${t}</a>`).join(' ');
}

function renderRoadmap(labs) {
  const cards = labs.map((l) => {
    const s = l.session;
    return `<article class="chapter-card" data-reveal>
      <div class="chapter-meta">
        <span class="chapter-num">Chapter ${l.n}</span>
        <span class="chapter-steps">${l.steps.length} steps</span>
      </div>
      <h2><a href="labs/lab-${l.n}.html">${inlineCode(l.title)}</a></h2>
      ${s && s.storyArc ? `<p class="chapter-hook">${inlineCode(s.storyArc.hook)}</p>` : ''}
      <p class="chapter-outcome"><strong>Outcome:</strong> ${esc(s ? s.outcome : '')}</p>
      <div class="chapter-foot">
        <span class="tools">${labTools(l)}</span>
        <a class="key key--primary" href="labs/lab-${l.n}.html">Open chapter ${l.n}</a>
      </div>
    </article>`;
  }).join('');
  const body = `<article class="lesson-page">
  ${pageHead('Chapters', 'Hands-on walkthroughs arranged as a story: from your first 3-node cluster to reading the scheduler source.')}
  <div class="chapter-timeline">${cards}</div>
</article>`;
  return layout({ title: 'Chapters', description: 'Hands-on Kubernetes labs with every command, its output and the reason for it.', active: 'labs', body });
}

const LAB_FLOWS = {
  1: {
    title: 'How Kubernetes heals a deleted Pod',
    nodes: [
      { icon: 'rs', title: 'Desired: 3 Pods', sub: 'ReplicaSet rule' },
      { icon: 'pod', title: '1 Pod deleted', sub: 'Actual drops to 2' },
      { icon: 'cp', title: 'Controller reacts', sub: 'Creates replacement' },
      { icon: 'pod', title: '3/3 Running', sub: 'Cluster self-healed' },
    ],
  },
  2: {
    title: 'What happens after kubectl create deployment',
    nodes: [
      { icon: 'deploy', title: 'kubectl POST', sub: 'Writes to API Server' },
      { icon: 'rs', title: 'etcd + Controllers', sub: 'Deployment → ReplicaSet' },
      { icon: 'cp', title: 'Scheduler', sub: 'Picks worker node' },
      { icon: 'node', title: 'Kubelet + containerd', sub: 'Starts nginx container' },
    ],
  },
  3: {
    title: 'Inside our custom Go controller',
    nodes: [
      { icon: 'cp', title: 'API Server Watch', sub: 'Streams NS & CM events' },
      { icon: 'ns', title: 'Informer Cache', sub: 'Fast local snapshot' },
      { icon: 'deploy', title: 'Work Queue', sub: 'Deduplicated names' },
      { icon: 'cm', title: 'reconcile()', sub: 'Creates missing welcome' },
    ],
  },
  4: {
    title: 'How the scheduler decides Pending vs Running',
    nodes: [
      { icon: 'pod', title: 'Pod Pending', sub: 'spec.nodeName empty' },
      { icon: 'cp', title: 'Filter Plugins', sub: 'CPU, labels, taints, ports' },
      { icon: 'rs', title: 'Score Plugins', sub: 'Marks × weight' },
      { icon: 'node', title: 'Bind to Node', sub: 'Runs or logs event' },
    ],
  },
};

function labFlowchart(n) {
  const f = LAB_FLOWS[n];
  if (!f) return '';
  const items = f.nodes.map((nd, i) => `
    <div class="flow-step" style="--i:${i}">
      ${K8S_ICONS[nd.icon] || K8S_ICONS.pod}
      <div><strong>${esc(nd.title)}</strong><span>${esc(nd.sub)}</span></div>
    </div>${i < f.nodes.length - 1 ? `<svg class="flow-arrow" viewBox="0 0 28 16" aria-hidden="true"><path d="M2 8 H22 M17 3 L23 8 L17 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}`).join('');
  return `<section class="flow-box" aria-label="${escAttr(f.title)}"><p class="flow-title">${esc(f.title)}</p><div class="flow-track">${items}</div></section>`;
}

function labSimulator(n) {
  if (n === 1) {
    return `<section class="sim-box" data-sim="lab1" aria-label="Interactive self-healing and node failure simulator">
      <div class="sim-head"><strong>Interactive Cluster Simulator</strong><span class="sim-state" data-sim-status>3 / 3 Pods Running</span></div>
      <div class="sim-controls">
        <button class="key" type="button" data-sim-act="kill">Kill a Pod</button>
        <button class="key" type="button" data-sim-act="stop">Stop klu-worker</button>
        <button class="key" type="button" data-sim-act="reset">Restore Node</button>
      </div>
      <div class="ns-frame">
        <div class="ns-tag">${K8S_ICONS.ns}<span>cluster: kind-klu</span></div>
        <div class="sim-nodes" data-sim-pods>
          <div class="sim-node" data-n="w1"><div class="sim-node-head">${K8S_ICONS.node}<strong>klu-worker (Ready)</strong></div><div class="pod-strip"><span class="k8s-pod-pill is-running">${K8S_ICONS.pod}<span>web-1</span></span><span class="k8s-pod-pill is-running">${K8S_ICONS.pod}<span>web-2</span></span></div></div>
          <div class="sim-node" data-n="w2"><div class="sim-node-head">${K8S_ICONS.node}<strong>klu-worker2 (Ready)</strong></div><div class="pod-strip"><span class="k8s-pod-pill is-running">${K8S_ICONS.pod}<span>web-3</span></span></div></div>
        </div>
      </div>
    </section>`;
  }
  if (n === 2) {
    return `<section class="sim-box" data-sim="lab2" aria-label="Interactive Deployment trace stepper">
      <div class="sim-head"><strong>Interactive Request Trace</strong><span class="sim-state" data-sim-status>Step 1 of 6</span></div>
      <div class="sim-controls">
        <button class="key key--primary" type="button" data-sim-act="next">Next Handoff</button>
        <button class="key" type="button" data-sim-act="reset">Reset</button>
      </div>
      <div class="ns-frame">
        <div class="ns-tag">${K8S_ICONS.cp}<span>control-plane → worker handoff</span></div>
        <p class="sim-out" data-sim-out><code>kubectl create deployment web</code> sends HTTP POST to <code>kube-apiserver</code> (returns <code>201 Created</code>).</p>
      </div>
    </section>`;
  }
  if (n === 3) {
    return `<section class="sim-box" data-sim="lab3" aria-label="Interactive controller reconcile simulator">
      <div class="sim-head"><strong>Interactive Controller Loop</strong><span class="sim-state" data-sim-status>Watching namespaces...</span></div>
      <div class="sim-controls">
        <button class="key key--primary" type="button" data-sim-act="label">Label team-a</button>
        <button class="key" type="button" data-sim-act="delete">Delete welcome</button>
        <button class="key" type="button" data-sim-act="unlabel">Remove Label</button>
      </div>
      <div class="ns-frame">
        <div class="ns-tag">${K8S_ICONS.ns}<span>namespace: team-a</span></div>
        <div class="sim-ctrl-vis" data-sim-pods>
          <span class="k8s-pod-pill">${K8S_ICONS.cm}<span>welcome ConfigMap (waiting)</span></span>
        </div>
        <p class="sim-out" data-sim-out><code>welcome-controller started; waiting for work...</code></p>
      </div>
    </section>`;
  }
  if (n === 4) {
    return `<section class="sim-box" data-sim="lab4" aria-label="Interactive scheduler filter simulator">
      <div class="sim-head"><strong>Interactive Scheduler Filter</strong><span class="sim-state" data-sim-status>Pick a scenario to test</span></div>
      <div class="sim-controls">
        <button class="key" type="button" data-sim-act="cpu">big.yaml (64 CPU)</button>
        <button class="key" type="button" data-sim-act="ssd">ssd.yaml (disktype=ssd)</button>
        <button class="key" type="button" data-sim-act="taint">Tainted Node</button>
        <button class="key" type="button" data-sim-act="port">HostPort 8080</button>
        <button class="key" type="button" data-sim-act="cordon">Cordoned</button>
        <button class="key key--primary" type="button" data-sim-act="fix">Fix Constraint</button>
      </div>
      <div class="ns-frame">
        <div class="ns-tag">${K8S_ICONS.cp}<span>kube-scheduler filter result</span></div>
        <div class="sim-nodes" data-sim-pods>
          <div class="sim-node"><div class="sim-node-head">${K8S_ICONS.cp}<strong>klu-control-plane</strong></div><span class="sim-badge">Tainted (NoSchedule)</span></div>
          <div class="sim-node"><div class="sim-node-head">${K8S_ICONS.node}<strong>klu-worker &amp; worker2</strong></div><span class="sim-badge">Ready</span></div>
        </div>
        <p class="sim-out" data-sim-out>Select a Pod failure mode above to see which scheduler filter rejects each node.</p>
      </div>
    </section>`;
  }
  return '';
}

function renderLabPage(lab, labs) {
  const { html, toc } = renderMarkdown(lab.md, lab.dir);
  const s = lab.session;
  const idx = labs.indexOf(lab);
  const prev = labs[idx - 1];
  const next = labs[idx + 1];
  const tocHtml = toc.map((t) => `<li class="toc-${t.depth}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('');
  const body = `
<div class="read-progress" aria-hidden="true"><span></span></div>
<article class="lesson-page lab-page">
  <h1>Chapter ${lab.n}: ${inlineCode(lab.title)}</h1>
  ${s ? `<p class="lead">${esc(s.topic)}.</p>` : ''}
  <dl class="facts">
    ${s ? `<div><dt>You will</dt><dd>${esc(s.outcome)}</dd></div>` : ''}
    ${s ? `<div><dt>Needs</dt><dd>${labTools(lab, '../')}</dd></div>` : ''}
    <div><dt>Steps</dt><dd>${lab.steps.length} with commands</dd></div>
  </dl>
  ${s && s.story ? `<div class="story-box"><p>${inlineCode(s.story)}</p></div>` : ''}
  ${s && s.storyArc ? lessonStory(s.storyArc) : ''}
  ${labFlowchart(lab.n)}
  ${labSimulator(lab.n)}
  ${shellSwitch()}
  <details class="toc-box"><summary>On this page</summary><ol class="toc">${tocHtml}</ol></details>
  ${lab.sourceFiles.length && repo.url ? `<p class="sources"><strong>Source files:</strong> ${lab.sourceFiles.map((f) => `<a href="${githubLink(f)}" rel="noopener"><code>${esc(f.replace(`${lab.dir}/`, ''))}</code></a>`).join(' ')}</p>` : ''}
  <div class="prose">${html}</div>
  <p class="back-top"><a class="key" href="#main">Back to top</a></p>
  <nav class="pager" aria-label="Other chapters">
    ${prev ? `<a class="key" href="lab-${prev.n}.html"><span>Previous</span>Chapter ${prev.n}</a>` : `<a class="key" href="../roadmap.html"><span>Back to</span>All chapters</a>`}
    ${next ? `<a class="key key--primary next" href="lab-${next.n}.html"><span>Next</span>Chapter ${next.n}</a>` : `<a class="key key--primary next" href="../commands.html"><span>Next</span>All commands</a>`}
  </nav>
</article>`;
  return layout({ title: `Chapter ${lab.n}: ${lab.title.replace(/`/g, '')}`, description: s ? s.topic : lab.title, active: `lab-${lab.n}`, body, depth: 1 });
}

function renderInstall(labs) {
  const osTabs = install.os.map((o, i) => `<button type="button" role="tab" data-os="${o.id}" aria-selected="${i === 0}">${esc(o.label)}</button>`).join('');
  const tools = install.tools.map((t) => {
    const used = labs.filter((l) => l.session && l.session.tools.includes(t.id)).map((l) => l.n);
    const range = used.length ? `Used in lab ${used.join(', ')}.` : 'For operators, charts and multi-cluster work.';
    return `<section class="tool" id="tool-${t.id}">
      <h2>${esc(t.name)}</h2>
      <p>${inlineCode(t.what)} <span class="muted">${range}</span></p>
      ${install.os.map((o) => `<div class="os-pane" data-os="${o.id}">${(t.steps[o.id] || []).map((st) => `${st.title ? `<p class="step-title">${esc(st.title.replace(/^\d+\.\s*/, ''))}</p>` : ''}<figure class="example"><figcaption>${esc(o.label)}</figcaption>${codeBlock(st.code, o.shell)}</figure>${st.note ? `<p class="note">${inlineCode(st.note)}</p>` : ''}`).join('')}</div>`).join('')}
      <p class="verify"><strong>Check it worked:</strong> <code>${esc(t.verify)}</code></p>
    </section>`;
  }).join('');
  const body = `<article class="lesson-page">
  <h1>Install the tools</h1>
  ${pager('install', '')}
  <p class="lead">Pick your system once; every block below follows it. Docker, kind and kubectl are all you need to start.</p>
  <div class="os-bar"><div class="tray os-tabs" role="tablist" aria-label="Operating system">${osTabs}</div>
  ${install.os.map((o) => `<p class="os-hint" data-os="${o.id}">${inlineCode(o.hint)}</p>`).join('')}</div>
  ${tools}
  <section class="tool" id="check">
    <h2>All three answer?</h2>
    <p>Check off each tool as you verify it, then jump into Chapter 1.</p>
    <div class="check-grid" data-install-checks>
      <label class="check-pill"><input type="checkbox" data-tool="docker"><code>docker run hello-world</code></label>
      <label class="check-pill"><input type="checkbox" data-tool="kind"><code>kind version</code></label>
      <label class="check-pill"><input type="checkbox" data-tool="kubectl"><code>kubectl version --client</code></label>
    </div>
    <p class="check-ready" data-check-ready hidden>All three verified. <a href="${lessonHref('cluster')}">Start your first cluster</a> or <a href="labs/lab-1.html">open Chapter 1</a>.</p>
    <figure class="example"><figcaption>Example</figcaption>${codeBlock('docker run hello-world\nkind version\nkubectl version --client', 'bash')}</figure>
  </section>
  ${pager('install', '')}
</article>`;
  return layout({ title: 'Install the tools', description: 'Install Docker, kind, kubectl, Go, kubebuilder and Helm on macOS, Windows, Ubuntu, Fedora and Arch.', active: 'install', body });
}

function renderCommands() {
  const cats = commands.categories;
  const count = (id) => commands.commands.filter((c) => c.cat === id).length;
  const rows = (id) => commands.commands.filter((x) => x.cat === id).map((x) => `
      <tr class="cmd" data-cat="${x.cat}" data-text="${escAttr(`${x.cmd} ${x.ps || ''} ${x.desc} ${x.when}`.toLowerCase())}">
        <td class="cmd-cell">${cmdLines(x)}</td>
        <td>${inlineCode(x.desc)}</td>
      </tr>`).join('');
  const groups = LESSON_ORDER.map((id) => {
    const c = lessonCat(id);
    return `<section class="cmd-group" data-cat="${c.id}" id="cat-${c.id}" aria-labelledby="h-${c.id}">
      <h2 id="h-${c.id}"><a href="${lessonHref(c.id)}">${esc(c.label)}</a></h2>
      <div class="table-wrap"><table class="ref"><thead><tr><th scope="col">Command</th><th scope="col">What it does</th></tr></thead><tbody>${rows(c.id)}</tbody></table></div>
    </section>`;
  }).join('');
  const body = `<article class="lesson-page lesson-page--wide">
  <h1>All commands</h1>
  <p class="lead">${commands.commands.length} commands in one table. Search, or filter by lesson. Press <kbd>/</kbd> to jump to search.</p>
  <div class="cmd-tools">
    <div class="cmd-tools-row">
      <label class="search"><span class="visually-hidden">Search commands</span><input id="cmd-search" type="search" placeholder="deploy, logs, secret" autocomplete="off"></label>
      <span id="cmd-count" class="cmd-count" role="status">${commands.commands.length} commands</span>
      ${shellSwitch()}
    </div>
    <div class="chips" role="group" aria-label="Filter by lesson">
      <button type="button" class="chip" data-cat="all" aria-pressed="true">All ${commands.commands.length}</button>
      ${LESSON_ORDER.map((id) => `<button type="button" class="chip" data-cat="${id}" aria-pressed="false">${esc(lessonCat(id).label)} ${count(id)}</button>`).join('')}
    </div>
  </div>
  <div class="empty" role="status" hidden><p>No command matches that filter.</p><button type="button" class="key" data-cmd-reset>Reset search &amp; filters</button></div>
  ${groups}
  <section id="shell-diffs">
    <h2>bash and PowerShell, side by side</h2>
    <div class="table-wrap"><table><thead><tr><th scope="col">Task</th><th scope="col">bash or zsh</th><th scope="col">PowerShell</th></tr></thead><tbody>
      ${commands.shellDiffs.map((d) => `<tr><th scope="row">${esc(d.task)}</th><td><code>${esc(d.bash)}</code></td><td><code>${esc(d.ps)}</code></td></tr>`).join('')}
    </tbody></table></div>
  </section>
</article>`;
  return layout({ title: 'All commands', description: 'Every Kubernetes command in the tutorial, for macOS, Windows and Linux, searchable in one table.', active: 'commands', body });
}

function renderTroubleshooting() {
  const items = troubles.map((t, i) => `
    <details class="trouble" data-sym="${escAttr(`${t.title} ${t.symptom} ${t.fix}`.toLowerCase())}"${i === 0 ? ' open' : ''}>
      <summary>${inlineCode(t.title)}</summary>
      <div class="trouble-body">
        <p><strong>You see:</strong> ${inlineCode(t.symptom)}</p>
        <p><strong>Fix:</strong> ${inlineCode(t.fix)}</p>
        <figure class="example"><figcaption>Example</figcaption>${codeBlock(t.code, 'bash')}</figure>
      </div>
    </details>`).join('');
  const body = `<article class="lesson-page">
  ${pageHead('Fixes for common errors', 'The errors people hit most, and the line that usually fixes them.')}
  <div class="chips" role="group" aria-label="Filter by symptom" data-trouble-chips>
    <button type="button" class="chip" data-sym="all" aria-pressed="true">All ${troubles.length}</button>
    <button type="button" class="chip" data-sym="pending" aria-pressed="false">Pending</button>
    <button type="button" class="chip" data-sym="refused" aria-pressed="false">Connection refused</button>
    <button type="button" class="chip" data-sym="image" aria-pressed="false">Image pull</button>
    <button type="button" class="chip" data-sym="go" aria-pressed="false">Go / client-go</button>
  </div>
  <div class="trouble-list">${items}</div>
  <p class="note-box"><strong>Not listed?</strong> Run <code>kubectl describe</code> on the broken object and read the events at the bottom. They almost always name the problem.</p>
  <h2>Official docs</h2>
  <ul class="link-list">${course.links.map((l) => `<li><a href="${l.url}" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul>
</article>`;
  return layout({ title: 'Fixes', description: 'Fixes for common kind, kubectl, Docker and Go errors.', active: 'stuck', body });
}

function render404() {
  return layout({
    title: 'Not found',
    description: 'Page not found',
    body: `<article class="lesson-page">
      ${pageHead('404: Page not found', 'The resource you asked for is not in this cluster.')}
      <div class="well code is-output"><div class="well-head"><span>kubectl</span></div><pre><code>$ kubectl get page
Error from server (NotFound): pages "this-route" not found</code></pre></div>
      <div class="actions"><a class="key key--primary" href="./index.html">Back to home</a><a class="key" href="./roadmap.html">All chapters</a></div>
    </article>`,
  });
}

main();
