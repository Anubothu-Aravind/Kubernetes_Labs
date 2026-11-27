(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  };

  /* copy buttons: icon turns into a tick for 1.4s, or shows error on failure */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy');
    if (!btn) return;
    const text = btn.dataset.copy ?? btn.closest('.well')?.querySelector('code')?.innerText ?? '';
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text.replace(/\n$/, ''));
      btn.classList.remove('err');
      btn.classList.add('done');
      btn.setAttribute('aria-label', 'Copied');
      setTimeout(() => { btn.classList.remove('done'); btn.setAttribute('aria-label', 'Copy to clipboard'); }, 1400);
    } catch {
      btn.classList.add('err');
      btn.setAttribute('aria-label', 'Copy failed');
      setTimeout(() => { btn.classList.remove('err'); btn.setAttribute('aria-label', 'Copy to clipboard'); }, 2000);
    }
  });


  /* shell switch: macOS / Linux (bash) or Windows (PowerShell), remembered */
  const shellButtons = [...document.querySelectorAll('.shell-switch [data-shell]')];
  const setShell = (sh) => {
    root.dataset.shell = sh;
    shellButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shell === sh)));
    store.set('shell', sh);
  };
  shellButtons.forEach((b) => b.addEventListener('click', () => setShell(b.dataset.shell)));
  setShell(root.dataset.shell === 'ps' ? 'ps' : 'bash');

  /* sidebar folds into a menu on small screens */
  const sideDetails = document.querySelector('.side-details');
  if (sideDetails && matchMedia('(max-width: 60rem)').matches) sideDetails.open = false;

  /* tab switchers: arrow keys move, every panel shows without script */
  document.querySelectorAll('[data-switch]').forEach((sw) => {
    const tabs = [...sw.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        select(tabs[(i + d + tabs.length) % tabs.length], true);
      });
    });
    select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0]);
  });

  /* OS tabs on the install page */
  const osTabs = [...document.querySelectorAll('.os-tabs [data-os]')];
  if (osTabs.length) {
    const detect = () => {
      const ua = navigator.userAgent;
      if (/Windows/i.test(ua)) return 'windows';
      if (/Mac/i.test(ua)) return 'mac';
      if (/Fedora|Red Hat/i.test(ua)) return 'fedora';
      return 'ubuntu';
    };
    const select = (os, focus) => {
      root.dataset.os = os;
      osTabs.forEach((t) => { const on = t.dataset.os === os; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
      store.set('os', os);
      setShell(os === 'windows' ? 'ps' : 'bash');
    };
    osTabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t.dataset.os));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        select(osTabs[(i + d + osTabs.length) % osTabs.length].dataset.os, true);
      });
    });
    const saved = store.get('os');
    select(osTabs.some((t) => t.dataset.os === saved) ? saved : detect());
  }

  /* hero: interactive cluster console + tabs + replay */
  const session = document.querySelector('[data-session]');
  const diagram = document.querySelector('.hero-diagram');
  const replayBtn = document.querySelector('[data-replay]');
  const heroTabs = [...document.querySelectorAll('[data-hero-tab]')];
  const HERO_SCENARIOS = {
    boot: [
      { t: 'cmd', text: 'kind create cluster --config kind-3node.yaml' },
      { t: 'out', text: 'Creating cluster "klu" ...', nodeState: { cp: 'NotReady', w1: 'NotReady', w2: 'NotReady' } },
      { t: 'out', text: ' ok  Preparing nodes', nodeState: { cp: 'NotReady', w1: 'NotReady', w2: 'NotReady' } },
      { t: 'out', text: ' ok  Starting control-plane', light: 'cp', nodeState: { cp: 'Ready' } },
      { t: 'out', text: ' ok  Joining worker nodes', light: 'w1,w2', wires: true, nodeState: { w1: 'Ready', w2: 'Ready' } },
      { t: 'out', text: 'Set kubectl context to "kind-klu"' },
      { t: 'gap' },
      { t: 'cmd', text: 'kubectl get nodes' },
      { t: 'out', text: 'NAME                STATUS   ROLES' },
      { t: 'out', text: 'klu-control-plane   Ready    control-plane', light: 'cp', ready: true },
      { t: 'out', text: 'klu-worker          Ready    <none>', light: 'w1', ready: true },
      { t: 'out', text: 'klu-worker2         Ready    <none>', light: 'w2', ready: true },
    ],
    deploy: [
      { t: 'cmd', text: 'kubectl apply -f web.yaml' },
      { t: 'out', text: 'deployment.apps/web created', light: 'cp', rs: '0/3 Pending' },
      { t: 'out', text: 'replicaset.apps/web-6d8f scaled to 3', rs: '0/3 Pending', setPods: { w1: [['web-9xk2p', 'pending'], ['web-7t2vn', 'pending']], w2: [['web-4m7qr', 'pending']] } },
      { t: 'out', text: 'scheduler assigned Pods to workers -> starting containers', wires: true, rs: '0/3 Creating', setPods: { w1: [['web-9xk2p', 'creating'], ['web-7t2vn', 'creating']], w2: [['web-4m7qr', 'creating']] } },
      { t: 'gap' },
      { t: 'cmd', text: 'kubectl get pods -o wide' },
      { t: 'out', text: 'NAME         READY   STATUS    NODE' },
      { t: 'out', text: 'web-9xk2p    1/1     Running   klu-worker', podState: ['w1', 'web-9xk2p', 'ok'], rs: '1/3 Ready', ready: true },
      { t: 'out', text: 'web-4m7qr    1/1     Running   klu-worker2', podState: ['w2', 'web-4m7qr', 'ok'], rs: '2/3 Ready', ready: true },
      { t: 'out', text: 'web-7t2vn    1/1     Running   klu-worker', podState: ['w1', 'web-7t2vn', 'ok'], rs: '3/3 Ready', ready: true },
    ],
    heal: [
      { t: 'cmd', text: 'kubectl delete pod web-9xk2p' },
      { t: 'out', text: 'pod "web-9xk2p" deleted', podState: ['w1', 'web-9xk2p', 'dead'], rs: '2/3 Ready' },
      { t: 'out', text: 'ReplicaSet web-6d8f saw 2/3 -> creating web-8p4lz', light: 'cp', removePod: ['w1', 'web-9xk2p'], addPod: ['w2', 'web-8p4lz', 'pending'], rs: '2/3 Pending' },
      { t: 'out', text: 'scheduler placed web-8p4lz on klu-worker2 (example)', wires: true, podState: ['w2', 'web-8p4lz', 'creating'], rs: '2/3 Creating' },
      { t: 'gap' },
      { t: 'cmd', text: 'kubectl get pods -o wide' },
      { t: 'out', text: 'NAME         READY   STATUS    NODE' },
      { t: 'out', text: 'web-8p4lz    1/1     Running   klu-worker2', podState: ['w2', 'web-8p4lz', 'ok'], rs: '3/3 Ready', ready: true },
      { t: 'out', text: 'web-4m7qr    1/1     Running   klu-worker2', ready: true },
      { t: 'out', text: 'web-7t2vn    1/1     Running   klu-worker', ready: true },
    ],
  };

  if (session && diagram) {
    let runId = 0;
    const HERO_POD_SVG = '<svg class="k8s-hex" viewBox="0 0 40 40" width="18" height="18" aria-hidden="true"><polygon points="20,2 34,9 38,24 28,36 12,36 2,24 6,9" fill="currentColor"/><polygon points="20,10 29,15 29,25 20,30 11,25 11,15" fill="none" stroke="#fff" stroke-width="2"/><path d="M11 15l9 5 9-5M20 20v10" stroke="#fff" stroke-width="1.8"/></svg>';
    const w1Pods = diagram.querySelector('[data-node-pods="w1"]');
    const w2Pods = diagram.querySelector('[data-node-pods="w2"]');
    const wiresEl = diagram.querySelector('[data-node-wires]');
    const ctrlChain = diagram.querySelector('[data-ctrl-chain]');
    const rsCount = diagram.querySelector('[data-rs-count]');
    const podState = { w1: [], w2: [] };
    const defaultRoles = { cp: 'control-plane', w1: 'worker', w2: 'worker' };

    const syncPods = () => {
      const render = (list) => list.map((p) => `<span class="hero-pod is-${p.st}">${HERO_POD_SVG}<span>${p.name}</span></span>`).join('');
      if (w1Pods) w1Pods.innerHTML = render(podState.w1);
      if (w2Pods) w2Pods.innerHTML = render(podState.w2);
    };

    const setNodeRole = (id, label) => {
      const roleEl = diagram.querySelector(`[data-node-role="${id}"]`);
      const card = diagram.querySelector(`[data-node="${id}"]`);
      if (roleEl) roleEl.textContent = label;
      if (card) card.classList.toggle('is-notready', label === 'NotReady');
    };

    const light = (ids) => ids.split(',').forEach((id) => diagram.querySelector(`[data-node="${id}"]`)?.classList.add('lit'));

    const renderScenario = (key) => {
      const items = HERO_SCENARIOS[key] || HERO_SCENARIOS.boot;
      session.innerHTML = items.map((l, idx) => {
        if (l.t === 'gap') return '<span class="ln ln-gap"> </span>';
        const cls = l.t === 'cmd' ? 'ln ln-cmd' : `ln ln-out${l.ready ? ' ready' : ''}`;
        if (l.t === 'cmd') return `<span class="${cls}" data-step="${idx}"><span class="ps">$ </span><span class="typed" data-full="${l.text.replace(/"/g, '&quot;')}">${l.text}</span></span>`;
        return `<span class="${cls}" data-step="${idx}">${l.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
      }).join('') + '<span class="caret" aria-hidden="true"> </span>';
    };

    const applyStepEffect = (step) => {
      if (!step) return;
      if (step.light) light(step.light);
      if (step.wires && wiresEl) wiresEl.classList.add('is-active');
      if (step.nodeState) Object.entries(step.nodeState).forEach(([k, v]) => setNodeRole(k, v));
      if (step.rs && rsCount) rsCount.textContent = step.rs;
      if (step.setPods) {
        podState.w1 = step.setPods.w1.map(([name, st]) => ({ name, st }));
        podState.w2 = step.setPods.w2.map(([name, st]) => ({ name, st }));
        syncPods();
      }
      if (step.removePod) {
        const [w, name] = step.removePod;
        podState[w] = podState[w].filter((p) => p.name !== name);
        syncPods();
      }
      if (step.addPod) {
        const [w, name, st] = step.addPod;
        if (!podState[w].some((p) => p.name === name)) podState[w].push({ name, st });
        syncPods();
      }
      if (step.podState) {
        const [w, name, st] = step.podState;
        const target = podState[w].find((p) => p.name === name);
        if (target) target.st = st;
        syncPods();
      }
    };

    const run = async (key = 'boot') => {
      const id = ++runId;
      const steps = HERO_SCENARIOS[key] || HERO_SCENARIOS.boot;
      renderScenario(key);
      if (wiresEl) wiresEl.classList.remove('is-active');
      if (ctrlChain) ctrlChain.hidden = key === 'boot';
      if (rsCount) rsCount.textContent = key === 'heal' ? '3/3 Ready' : '0/3';
      diagram.querySelectorAll('[data-node]').forEach((n) => n.classList.remove('lit', 'is-notready'));
      if (key === 'boot') {
        Object.entries(defaultRoles).forEach(([k, v]) => setNodeRole(k, v));
      } else {
        light('cp,w1,w2');
        if (wiresEl) wiresEl.classList.add('is-active');
        setNodeRole('cp', 'Ready'); setNodeRole('w1', 'Ready'); setNodeRole('w2', 'Ready');
      }
      podState.w1 = key === 'heal' ? [{ name: 'web-9xk2p', st: 'ok' }, { name: 'web-7t2vn', st: 'ok' }] : [];
      podState.w2 = key === 'heal' ? [{ name: 'web-4m7qr', st: 'ok' }] : [];
      syncPods();

      const lines = [...session.querySelectorAll('.ln')];
      if (reduced) {
        lines.forEach((ln) => {
          ln.classList.add('shown');
          if (ln.dataset.step != null) applyStepEffect(steps[Number(ln.dataset.step)]);
        });
        if (replayBtn) replayBtn.hidden = false;
        return;
      }
      if (replayBtn) replayBtn.hidden = true;
      session.classList.add('is-running');
      diagram.classList.add('is-running');
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const ln of lines) {
        if (id !== runId) return;
        const typed = ln.querySelector('.typed');
        if (typed) {
          const full = typed.dataset.full || typed.textContent;
          typed.textContent = '';
          ln.classList.add('shown');
          for (let i = 1; i <= full.length; i++) {
            if (id !== runId) return;
            typed.textContent = full.slice(0, i);
            await wait(16);
          }
          await wait(180);
        } else {
          ln.classList.add('shown');
          await wait(ln.classList.contains('ln-gap') ? 90 : 200);
        }
        if (id !== runId) return;
        if (ln.dataset.step != null) applyStepEffect(steps[Number(ln.dataset.step)]);
      }
      if (id === runId && replayBtn) replayBtn.hidden = false;
    };

    let currentTab = 'boot';
    heroTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.heroTab;
        heroTabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
        run(currentTab);
      });
    });

    if (!reduced && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run('boot'); }
      });
      io.observe(session);
    } else {
      run('boot');
    }
    replayBtn?.addEventListener('click', () => run(currentTab));
  }

  /* home: interactive first deployment hierarchy simulator */
  const deploySim = document.querySelector('[data-deploy-sim]');
  if (deploySim) {
    const applyBtn = deploySim.querySelector('[data-sim-apply]');
    const killBtn = deploySim.querySelector('[data-sim-kill]');
    const resetBtn = deploySim.querySelector('[data-sim-reset]');
    const logEl = deploySim.querySelector('[data-sim-log]');
    const podsWrap = deploySim.querySelector('[data-res-pods]');
    const setBadge = (k, text, cls) => {
      const el = deploySim.querySelector(`[data-res-badge="${k}"]`);
      const node = deploySim.querySelector(`[data-res="${k}"]`);
      if (el) el.textContent = text;
      if (node) { node.classList.remove('is-active', 'is-ready'); if (cls) node.classList.add(cls); }
    };
    const POD_SVG = '<svg class="k8s-hex" viewBox="0 0 40 40" width="36" height="36" aria-hidden="true"><polygon points="20,2 34,9 38,24 28,36 12,36 2,24 6,9" fill="currentColor"/><polygon points="20,10 29,15 29,25 20,30 11,25 11,15" fill="none" stroke="#fff" stroke-width="2"/><path d="M11 15l9 5 9-5M20 20v10" stroke="#fff" stroke-width="1.8"/></svg>';
    const setPods = (items) => {
      podsWrap.innerHTML = items.map((p) => `<div class="res-pod ${p.cls}">${POD_SVG}<div><strong>${p.name}</strong><span>${p.state}</span></div></div>`).join('');
    };
    let timerIds = [];
    const clearTimers = () => { timerIds.forEach(clearTimeout); timerIds = []; };
    const later = (fn, ms) => timerIds.push(setTimeout(fn, reduced ? 0 : ms));

    const reset = () => {
      clearTimers();
      setBadge('deploy', 'idle', '');
      setBadge('rs', 'waiting', '');
      setBadge('svc', 'waiting', '');
      setPods([
        { name: 'web-1', state: 'idle', cls: '' },
        { name: 'web-2', state: 'idle', cls: '' },
        { name: 'web-3', state: 'idle', cls: '' },
      ]);
      logEl.textContent = 'Ready: click Apply web.yaml to create the Deployment and Service.';
      applyBtn.disabled = false;
      applyBtn.removeAttribute('aria-busy');
      applyBtn.textContent = 'Apply web.yaml';
      killBtn.disabled = true;
    };

    applyBtn.addEventListener('click', () => {
      clearTimers();
      applyBtn.disabled = true;
      applyBtn.setAttribute('aria-busy', 'true');
      applyBtn.textContent = 'Applying...';
      logEl.textContent = '1/4 Parsing web.yaml and posting Deployment/web to kube-apiserver...';
      setBadge('deploy', 'active', 'is-active');
      later(() => {
        logEl.textContent = '2/4 Deployment created ReplicaSet/web-6d8f (desired: 3)...';
        setBadge('rs', '3/3 desired', 'is-active');
        setPods([
          { name: 'web-1', state: 'ContainerCreating', cls: 'is-creating' },
          { name: 'web-2', state: 'ContainerCreating', cls: 'is-creating' },
          { name: 'web-3', state: 'ContainerCreating', cls: 'is-creating' },
        ]);
      }, 320);
      later(() => {
        logEl.textContent = '3/4 All 3 Pods passed readiness and are Running across worker nodes.';
        setPods([
          { name: 'web-1', state: 'Running', cls: 'is-running' },
          { name: 'web-2', state: 'Running', cls: 'is-running' },
          { name: 'web-3', state: 'Running', cls: 'is-running' },
        ]);
      }, 760);
      later(() => {
        logEl.textContent = '4/4 Service/web bound 3 endpoints on port 80. Ready for traffic.';
        setBadge('deploy', 'ready', 'is-ready');
        setBadge('rs', '3/3 ready', 'is-ready');
        setBadge('svc', '3 endpoints', 'is-ready');
        applyBtn.removeAttribute('aria-busy');
        applyBtn.textContent = 'Applied';
        killBtn.disabled = false;
      }, 1150);
    });

    killBtn.addEventListener('click', () => {
      clearTimers();
      killBtn.disabled = true;
      logEl.textContent = 'Pod web-2 terminated. ReplicaSet noticed 2/3 and scheduled web-4...';
      setPods([
        { name: 'web-1', state: 'Running', cls: 'is-running' },
        { name: 'web-2', state: 'Terminating', cls: 'is-terminating' },
        { name: 'web-3', state: 'Running', cls: 'is-running' },
      ]);
      later(() => {
        setPods([
          { name: 'web-1', state: 'Running', cls: 'is-running' },
          { name: 'web-4', state: 'Running (healed)', cls: 'is-running' },
          { name: 'web-3', state: 'Running', cls: 'is-running' },
        ]);
        logEl.textContent = 'Self-healed: web-4 replaced web-2 and Service/web updated its endpoints.';
        killBtn.disabled = false;
      }, 650);
    });

    resetBtn.addEventListener('click', reset);
  }

  /* roadmap: scroll reveal */
  const reveals = [...document.querySelectorAll('[data-reveal]')];
  if (reveals.length && !reduced && 'IntersectionObserver' in window) {
    const ro = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('shown'); ro.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => { el.classList.add('will-reveal'); ro.observe(el); });
  }

  /* lab reading progress bar */
  const prog = document.querySelector('.read-progress span');
  if (prog) {
    const updateProg = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      prog.style.transform = `scaleX(${pct.toFixed(4)})`;
    };
    window.addEventListener('scroll', updateProg, { passive: true });
    updateProg();
  }

  /* screenshot loading skeleton & error fallback + lightbox with aria-busy */
  document.querySelectorAll('.shot img').forEach((im) => {
    const fig = im.closest('.shot');
    if (!fig) return;
    const onLoad = () => fig.classList.remove('is-loading');
    const onErr = () => {
      fig.classList.remove('is-loading');
      fig.classList.add('is-error');
      if (!fig.querySelector('.shot-err')) {
        const p = document.createElement('p');
        p.className = 'shot-err';
        p.textContent = 'Screenshot could not be loaded.';
        fig.appendChild(p);
      }
    };
    if (im.complete) {
      if (im.naturalWidth === 0) onErr();
      else onLoad();
    } else {
      fig.classList.add('is-loading');
      im.addEventListener('load', onLoad, { once: true });
      im.addEventListener('error', onErr, { once: true });
    }
  });

  const box = document.querySelector('.lightbox');
  if (box) {
    const stage = document.createElement('div');
    stage.className = 'lightbox-stage';
    const img = new Image();
    stage.appendChild(img);
    const cap = box.querySelector('p');
    box.insertBefore(stage, cap);
    let opener = null;
    const close = () => {
      box.hidden = true;
      box.removeAttribute('aria-busy');
      stage.classList.remove('is-error');
      document.body.style.overflow = '';
      opener?.focus();
    };
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a.zoom');
      if (!a) return;
      e.preventDefault();
      opener = a;
      const caption = a.dataset.caption || '';
      stage.classList.remove('is-error');
      box.setAttribute('aria-busy', 'true');
      cap.textContent = 'Loading screenshot...';
      img.onload = () => { box.removeAttribute('aria-busy'); cap.textContent = caption; };
      img.onerror = () => {
        box.removeAttribute('aria-busy');
        stage.classList.add('is-error');
        cap.textContent = 'Screenshot could not be loaded.';
      };
      img.src = a.getAttribute('href');
      img.alt = a.querySelector('img')?.alt || '';
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      box.querySelector('.lightbox-close').focus();
    });
    box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('.lightbox-close')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) close(); });
  }

  /* command search and filter */
  const search = document.getElementById('cmd-search');
  if (search) {
    const cards = [...document.querySelectorAll('.cmd')];
    const groups = [...document.querySelectorAll('.cmd-group')];
    const chips = [...document.querySelectorAll('.chip')];
    const empty = document.querySelector('.empty');
    const countEl = document.getElementById('cmd-count');
    let cat = 'all';
    const apply = () => {
      const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      cards.forEach((c) => {
        const ok = (cat === 'all' || c.dataset.cat === cat) && words.every((w) => c.dataset.text.includes(w));
        c.hidden = !ok;
        if (ok) shown++;
      });
      groups.forEach((g) => { g.hidden = !g.querySelector('.cmd:not([hidden])'); });
      empty.hidden = shown > 0;
      if (countEl) countEl.textContent = `${shown} ${shown === 1 ? 'command' : 'commands'}`;
    };
    chips.forEach((ch) => ch.addEventListener('click', () => {
      cat = ch.dataset.cat;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === ch)));
      apply();
    }));
    search.addEventListener('input', apply);
    document.querySelector('[data-cmd-reset]')?.addEventListener('click', () => {
      search.value = '';
      cat = 'all';
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.cat === 'all')));
      apply();
      search.focus();
    });
    const q = new URLSearchParams(location.search).get('q');
    if (q) { search.value = q; apply(); }
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); search.focus(); }
    });
  }

  /* open a recipe or fix when linked to directly */
  const openHash = () => {
    const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el && el.tagName === 'DETAILS') el.open = true;
  };
  openHash();
  window.addEventListener('hashchange', openHash);

  /* mark the section being read in the lab contents */
  const tocLinks = [...document.querySelectorAll('.toc-box .toc a[href^="#"]')];
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        tocLinks.forEach((a) => a.classList.remove('active'));
        map.get(en.target.id)?.classList.add('active');
      });
    }, { rootMargin: '0px 0px -75% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
  }

  /* interactive simulators (chapters & lessons) */
  document.querySelectorAll('[data-sim]').forEach((boxEl) => {
    const kind = boxEl.dataset.sim;
    const status = boxEl.querySelector('[data-sim-status]');
    const pods = boxEl.querySelector('[data-sim-pods]');
    const out = boxEl.querySelector('[data-sim-out]');
    let rep = 3, ver = 'v1.27', ipN = 4, traceIdx = 0, lab4Mode = 'cpu', workerDown = false;

    const POD_HEX = '<svg class="k8s-hex" viewBox="0 0 40 40" width="28" height="28" aria-hidden="true"><polygon points="20,2 34,9 38,24 28,36 12,36 2,24 6,9" fill="currentColor"/><polygon points="20,10 29,15 29,25 20,30 11,25 11,15" fill="none" stroke="#fff" stroke-width="2"/><path d="M11 15l9 5 9-5M20 20v10" stroke="#fff" stroke-width="1.8"/></svg>';
    const NODE_HEX = '<svg class="k8s-hex" viewBox="0 0 40 40" width="28" height="28" aria-hidden="true"><polygon points="20,2 34,9 38,24 28,36 12,36 2,24 6,9" fill="currentColor"/><rect x="12" y="13" width="16" height="6" rx="1.5" fill="none" stroke="#fff" stroke-width="1.8"/><rect x="12" y="22" width="16" height="6" rx="1.5" fill="none" stroke="#fff" stroke-width="1.8"/></svg>';
    const CM_HEX = '<svg class="k8s-hex" viewBox="0 0 40 40" width="28" height="28" aria-hidden="true"><polygon points="20,2 34,9 38,24 28,36 12,36 2,24 6,9" fill="currentColor"/><path d="M14 11h9l4 4v14H14z" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M17 20h6M17 24h6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';

    const renderRep = () => {
      status.textContent = `${rep} / ${rep} Ready (nginx:${ver})`;
      pods.innerHTML = Array.from({ length: rep }, (_, i) => `<span class="k8s-pod-pill is-running">${POD_HEX}<span>web-${i + 1} (${ver})</span></span>`).join('');
    };

    const traceSteps = [
      '<code>kubectl create deployment web</code> sends HTTP POST to <code>kube-apiserver</code> (returns <code>201 Created</code>).',
      '<code>kube-apiserver</code> persists the Deployment key under <code>/registry/deployments/default/web</code> in <code>etcd</code>.',
      '<code>deployment-controller</code> watches the new Deployment and creates a <code>ReplicaSet</code> with <code>ownerReferences</code>.',
      '<code>replicaset-controller</code> sees 0/2 Pods and creates 2 Pod objects with empty <code>spec.nodeName</code>.',
      '<code>default-scheduler</code> filters and scores nodes, then binds each Pod by writing <code>spec.nodeName</code>.',
      '<code>kubelet</code> on the chosen worker invokes <code>containerd</code> via CRI and reports <code>status.podIP</code>.'
    ];

    const lab4Msgs = {
      cpu: ['0/3 nodes available: 1 untolerated taint, 2 Insufficient cpu (NodeResourcesFit)', 'Fixed: lowered CPU request to 100m. Pod big is now Running on klu-worker.'],
      ssd: ['0/3 nodes available: 1 untolerated taint, 2 didn\'t match Pod\'s node affinity/selector (NodeAffinity)', 'Fixed: kubectl label node klu-worker disktype=ssd. Pod needs-ssd is Running on klu-worker.'],
      taint: ['klu-worker tainted (exam=running:NoSchedule): all 4 Pods piled onto klu-worker2 (TaintToleration)', 'Fixed: added matching toleration in spread-tol.yaml. Pods spread 2 + 2 across both workers.'],
      port: ['2/3 Running, 1 Pending: 2 node(s) didn\'t have free ports for requested pod ports (NodePorts)', 'Fixed: removed hostPort: 8080 or scaled to 2 replicas. All Pods Running.'],
      cordon: ['0/3 nodes available: 1 untolerated taint, 2 node(s) were unschedulable (NodeUnschedulable)', 'Fixed: kubectl uncordon klu-worker klu-worker2. Pod closed is Running on klu-worker.']
    };

    boxEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sim-act]');
      if (!btn) return;
      const act = btn.dataset.simAct;

      if (kind === 'replicas') {
        if (act === 'inc' && rep < 5) rep++;
        else if (act === 'dec' && rep > 1) rep--;
        else if (act === 'rollout') ver = 'v1.28';
        else if (act === 'rollback') ver = 'v1.27';
        renderRep();
      } else if (kind === 'service') {
        ipN += 3;
        const ipEl = boxEl.querySelector('[data-pod-ip]');
        if (ipEl) ipEl.textContent = `web-1 (10.244.1.${ipN})`;
        status.textContent = `EndpointSlice updated to 10.244.1.${ipN}`;
      } else if (kind === 'triage') {
        if (act === 'pending') { status.textContent = 'Check scheduling events'; out.innerHTML = 'Run <code>kubectl describe pod &lt;name&gt;</code> and read the <code>FailedScheduling</code> event at the bottom.'; }
        if (act === 'crash') { status.textContent = 'Check container stdout'; out.innerHTML = 'Run <code>kubectl logs &lt;name&gt; --previous</code> to read why the container exited before restarting.'; }
        if (act === 'conflict') { status.textContent = 'Stale resourceVersion'; out.innerHTML = 'Re-fetch the latest YAML with <code>kubectl get -o yaml</code> before running <code>kubectl replace</code>.'; }
      } else if (kind === 'lab1') {
        if (act === 'kill' && !workerDown) {
          btn.disabled = true;
          btn.setAttribute('aria-busy', 'true');
          btn.textContent = 'Healing...';
          status.textContent = '2 / 3 Ready: ReplicaSet recreating Pod...';
          setTimeout(() => {
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
            btn.textContent = 'Kill a Pod';
            if (!workerDown) status.textContent = '3 / 3 Pods Running (self-healed)';
          }, 550);
        } else if (act === 'stop') {
          workerDown = true;
          status.textContent = 'klu-worker NotReady: Pods moved to klu-worker2';
          pods.innerHTML = `<div class="sim-node is-down" data-n="w1"><div class="sim-node-head">${NODE_HEX}<strong>klu-worker (NotReady)</strong></div><div class="pod-strip"><span class="k8s-pod-pill is-dead">${POD_HEX}<span>evicted</span></span></div></div><div class="sim-node" data-n="w2"><div class="sim-node-head">${NODE_HEX}<strong>klu-worker2 (Ready)</strong></div><div class="pod-strip"><span class="k8s-pod-pill is-running">${POD_HEX}<span>web-1</span></span><span class="k8s-pod-pill is-running">${POD_HEX}<span>web-2</span></span><span class="k8s-pod-pill is-running">${POD_HEX}<span>web-3</span></span></div></div>`;
        } else if (act === 'reset') {
          workerDown = false;
          status.textContent = '3 / 3 Pods Running';
          pods.innerHTML = `<div class="sim-node" data-n="w1"><div class="sim-node-head">${NODE_HEX}<strong>klu-worker (Ready)</strong></div><div class="pod-strip"><span class="k8s-pod-pill is-running">${POD_HEX}<span>web-1</span></span><span class="k8s-pod-pill is-running">${POD_HEX}<span>web-2</span></span></div></div><div class="sim-node" data-n="w2"><div class="sim-node-head">${NODE_HEX}<strong>klu-worker2 (Ready)</strong></div><div class="pod-strip"><span class="k8s-pod-pill is-running">${POD_HEX}<span>web-3</span></span></div></div>`;
        }
      } else if (kind === 'lab2') {
        traceIdx = act === 'reset' ? 0 : (traceIdx + 1) % traceSteps.length;
        status.textContent = `Step ${traceIdx + 1} of ${traceSteps.length}`;
        out.innerHTML = traceSteps[traceIdx];
      } else if (kind === 'lab3') {
        if (act === 'label') {
          status.textContent = 'nsInformer Add/Update → Queue → reconcile()';
          if (pods) pods.innerHTML = `<span class="k8s-pod-pill is-running">${CM_HEX}<span>welcome ConfigMap (Present)</span></span>`;
          out.innerHTML = '<code>created ConfigMap welcome in namespace team-a</code>';
        }
        if (act === 'delete') {
          status.textContent = 'cmInformer DeleteFunc → Queue → self-healed';
          if (pods) pods.innerHTML = `<span class="k8s-pod-pill is-running">${CM_HEX}<span>welcome ConfigMap (Self-Healed)</span></span>`;
          out.innerHTML = '<code>created ConfigMap welcome in namespace team-a (healed drift)</code>';
        }
        if (act === 'unlabel') {
          status.textContent = 'Label removed → Task 3 cleanup';
          if (pods) pods.innerHTML = `<span class="k8s-pod-pill is-dead">${CM_HEX}<span>welcome ConfigMap (Deleted)</span></span>`;
          out.innerHTML = '<code>deleted ConfigMap student-2601050069 in namespace team-a</code>';
        }
      } else if (kind === 'lab4') {
        if (act === 'fix') {
          status.textContent = 'Running';
          out.textContent = lab4Msgs[lab4Mode][1];
        } else {
          lab4Mode = act;
          status.textContent = 'Pending (FailedScheduling)';
          out.textContent = lab4Msgs[lab4Mode][0];
        }
      }
    });
  });

  /* install checklist persistence */
  const checkBoxWrap = document.querySelector('[data-install-checks]');
  const readyBanner = document.querySelector('[data-check-ready]');
  if (checkBoxWrap && readyBanner) {
    const boxes = [...checkBoxWrap.querySelectorAll('input[type="checkbox"]')];
    const sync = () => {
      const done = boxes.every((b) => b.checked);
      readyBanner.hidden = !done;
    };
    boxes.forEach((b) => {
      if (store.get(`tool_${b.dataset.tool}`) === '1') b.checked = true;
      b.addEventListener('change', () => { store.set(`tool_${b.dataset.tool}`, b.checked ? '1' : '0'); sync(); });
    });
    sync();
  }

  /* troubleshooting symptom chips */
  const troubleWrap = document.querySelector('[data-trouble-chips]');
  if (troubleWrap) {
    const tChips = [...troubleWrap.querySelectorAll('.chip')];
    const tItems = [...document.querySelectorAll('.trouble')];
    tChips.forEach((ch) => ch.addEventListener('click', () => {
      const sym = ch.dataset.sym;
      tChips.forEach((c) => c.setAttribute('aria-pressed', String(c === ch)));
      tItems.forEach((it) => { it.hidden = !(sym === 'all' || it.dataset.sym.includes(sym)); });
    }));
  }
})();
