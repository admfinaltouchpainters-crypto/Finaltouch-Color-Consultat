/* Final Touch Color Consultant: UI wiring. */
(function () {
  'use strict';
  var F = window.FTColor, Q = window.FTQuestions, R = window.FTRecommend, V = window.FTVisualizer;
  var S = window.FTStore, AI = window.FTAI, REP = window.FTReport;
  var esc = REP.esc;

  F.loadCatalog(window.FT_BM, window.FT_SW);

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

  var settings = S.getSettings();
  var state = null;            // current project
  var works = {};              // photoId -> Work (pixel data, masks)
  var ui = { view: 'interview', surface: 'walls', tool: 'fill', show: 'paint', opt: 'A', photo: null, zoom: 1, undo: [] };

  /* ---------- toast ---------- */
  var toastT;
  function toast(msg, err) {
    var t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, err ? 6000 : 2600);
  }

  /* ---------- project ---------- */
  function today() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function newProject(sample) {
    var p = {
      id: 'prj' + Date.now().toString(36),
      client: { name: '', town: '', address: '', space: '', email: '', phone: '', date: today() },
      answers: JSON.parse(JSON.stringify(Q.DEFAULT_ANSWERS)),
      options: [], photos: [], sample: !!sample
    };
    if (sample) {
      p.client = { name: 'Sample Client', town: 'Rumson, NJ', address: '', space: 'Living room', email: '', phone: '', date: today() };
      Object.assign(p.answers, {
        room: 'living', surfaces: ['walls', 'trim', 'ceiling', 'accent'], exposure: 'north', light: 'medium',
        moods: ['calm', 'cozy'], style: 'transitional', depth: 'light', temp: 'warm', likes: ['greige', 'sage'], avoid: ['pink'],
        fixed: 'warmwood', trimStyle: 'soft', ceilingStyle: 'white', brand: 'both', proven: 'mix', notes: ''
      });
    }
    return p;
  }

  function serializeOption(o) {
    var slots = {};
    Object.keys(o.slots).forEach(function (k) { slots[k] = { key: o.slots[k].c ? o.slots[k].c.key : null, note: o.slots[k].note || '' }; });
    return { id: o.id, title: o.title, why: o.why || [], slots: slots, alternates: (o.alternates || []).map(function (c) { return c.key; }) };
  }
  function hydrate(o) {
    var slots = {};
    Object.keys(o.slots).forEach(function (k) { slots[k] = { c: F.get(o.slots[k].key), note: o.slots[k].note }; });
    return { id: o.id, title: o.title, why: o.why, slots: slots, alternates: (o.alternates || []).map(F.get).filter(Boolean) };
  }
  function optColors(o) {
    var out = {};
    Object.keys(o.slots).forEach(function (k) { var c = F.get(o.slots[k].key); if (c) out[k] = c.hex; });
    return out;
  }

  var saveT;
  function persist(now) {
    clearTimeout(saveT);
    saveT = setTimeout(doSave, now ? 0 : 600);
  }
  function doSave() {
    if (!state) return Promise.resolve();
    state.photos.forEach(function (ph) {
      var w = works[ph.id];
      if (!w) return;
      var enc = {};
      Object.keys(w.masks).forEach(function (s) { enc[s] = V.encodeMask(w.masks[s]); });
      ph.masks = enc;
    });
    return S.save(state).catch(function (e) { console.warn(e); toast('Não consegui salvar neste aparelho: ' + e.message, true); });
  }

  /* ---------- routing ---------- */
  var VIEWS = ['interview', 'colors', 'photos', 'presentation'];
  function route() {
    var v = (location.hash || '#interview').slice(1);
    if (VIEWS.indexOf(v) < 0) v = 'interview';
    if ((v === 'colors' || v === 'photos' || v === 'presentation') && !state.options.length) {
      makeRecommendations(true);
    }
    ui.view = v;
    VIEWS.forEach(function (x) { $('#view-' + x).hidden = x !== v; });
    $$('.steps a').forEach(function (a) { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (v === 'interview') renderInterview();
    if (v === 'colors') renderOptions();
    if (v === 'photos') renderPhotos();
    if (v === 'presentation') renderReport();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- 1. interview ---------- */
  var CLIENT_FIELDS = ['name', 'town', 'address', 'space', 'email', 'phone', 'date'];
  function renderInterview() {
    $('#sampleBadge').hidden = !state.sample;
    CLIENT_FIELDS.forEach(function (f) { $('#c_' + f).value = state.client[f] || ''; });
    var a = state.answers, html = '', lastSec = null;
    Q.list.forEach(function (q) {
      if (q.showIf && !q.showIf(a)) return;
      if (q.section !== lastSec) { if (lastSec) html += '</div>'; html += '<div class="q-section"><h2>' + esc(q.section) + '</h2>'; lastSec = q.section; }
      html += '<div class="q" data-q="' + q.id + '"><div class="q-text">' + esc(q.q) + '</div><div class="q-pt">' + esc(q.pt) + (q.max ? ' · até ' + q.max : '') + '</div>';
      if (q.type === 'text') {
        html += '<textarea id="q_' + q.id + '" data-text="' + q.id + '" placeholder="Anote aqui">' + esc(a[q.id] || '') + '</textarea>';
      } else {
        var opts = q.options === 'families' ? Q.FAMILY_ORDER.map(function (f) { return { v: f, en: F.FAMILY[f].en, pt: F.FAMILY[f].pt, fam: f }; })
          : (typeof q.options === 'function' ? q.options(a) : q.options);
        html += '<div class="chips">';
        opts.forEach(function (o) {
          var on = q.type === 'multi' ? (a[q.id] || []).indexOf(o.v) >= 0 : a[q.id] === o.v;
          var dot = o.fam ? '<span class="dot" style="background:' + famSwatch(o.fam) + '"></span>' : '';
          html += '<button type="button" class="chip' + (on ? ' on' : '') + '" data-q="' + q.id + '" data-v="' + o.v + '" aria-pressed="' + on + '">' + dot + esc(o.en) +
            (o.pt && o.pt !== o.en ? ' <small>· ' + esc(o.pt) + '</small>' : '') + '</button>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    if (lastSec) html += '</div>';
    $('#questions').innerHTML = html;
  }
  var FAM_SW = { white: '#F2F0EA', cream: '#F1E7CF', greige: '#CFC8BA', gray: '#B9BCBD', beige: '#D8C6A8', taupe: '#9C8B7E', black: '#333436', brown: '#7A5A44', blue: '#7FA3C4', navy: '#2F3D4C', teal: '#4E8C8C', green: '#4F7A55', sage: '#A8B39A', yellow: '#E6C76A', orange: '#C2714F', pink: '#E3B5B0', red: '#9B2E2E', purple: '#8E7AA8' };
  function famSwatch(f) { return FAM_SW[f] || '#ccc'; }

  $('#questions').addEventListener('click', function (e) {
    var b = e.target.closest('.chip[data-q]');
    if (!b) return;
    var q = Q.list.filter(function (x) { return x.id === b.dataset.q; })[0], v = b.dataset.v, a = state.answers;
    if (q.type === 'multi') {
      var arr = (a[q.id] || []).slice(), i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1);
      else {
        if (q.max && arr.length >= q.max) arr.shift();
        arr.push(v);
        // a family cannot be both loved and avoided
        if (q.id === 'likes') a.avoid = (a.avoid || []).filter(function (x) { return x !== v; });
        if (q.id === 'avoid') a.likes = (a.likes || []).filter(function (x) { return x !== v; });
      }
      a[q.id] = arr;
    } else {
      a[q.id] = v;
      if (q.id === 'project') a.surfaces = v === 'exterior' ? ['walls', 'trim', 'accent'] : ['walls', 'trim', 'ceiling'];
    }
    state.sample = false;
    renderInterview();
    persist();
  });
  $('#questions').addEventListener('input', function (e) {
    if (e.target.dataset.text) { state.answers[e.target.dataset.text] = e.target.value; persist(); }
  });
  CLIENT_FIELDS.forEach(function (f) {
    $('#c_' + f).addEventListener('input', function (e) { state.client[f] = e.target.value; state.sample = false; $('#sampleBadge').hidden = true; persist(); });
  });

  function makeRecommendations(silent) {
    var res = R.recommend(state.answers);
    state.options = res.options.map(serializeOption);
    // old renders no longer match the new colors
    state.photos.forEach(function (ph) { ph.renders = {}; ph.ai = {}; ph.useAi = {}; });
    persist();
    if (!silent) toast('3 opções prontas');
  }
  $('#btnRecommend').addEventListener('click', function () {
    makeRecommendations();
    location.hash = '#colors';
  });
  $('#btnRegenerate').addEventListener('click', function () { makeRecommendations(); renderOptions(); });

  /* ---------- 2. options ---------- */
  function slotHTML(o, k, c) {
    var project = state.answers.project;
    if (!c) return '<div class="slot"><div class="sw" style="background:repeating-linear-gradient(45deg,#ddd 0 6px,#f4f4f4 6px 12px)"></div><div class="slot-info"><div class="slot-surface">' + esc(R.surfaceLabel(k, project, 'pt')) + '</div><div class="slot-name">Escolher cor</div></div><button type="button" class="ghost sm" data-swap="' + o.id + ':' + k + '">Escolher</button></div>';
    var m = R.crossMatch(c);
    return '<div class="slot">' +
      '<div class="sw" style="background:' + c.hex + '" title="' + c.hex + '"></div>' +
      '<div class="slot-info">' +
      '<div class="slot-surface">' + esc(R.surfaceLabel(k, project, 'pt')) + '</div>' +
      '<div class="slot-name">' + esc(c.name) + '</div>' +
      '<div class="slot-meta">' + (c.brand === 'BM' ? 'Benjamin Moore' : 'Sherwin-Williams') + ' · <b>' + esc(c.code) + '</b> · LRV ' + Math.round(c.lrv) + (c.locator ? ' · leque ' + esc(c.locator) : '') + '</div>' +
      (m ? '<div class="slot-match">Na ' + (c.brand === 'BM' ? 'SW' : 'BM') + ': ' + esc(m.c.name) + ' ' + esc(m.c.code) + ' (' + matchPt(m.d) + ')</div>' : '') +
      '</div>' +
      '<div class="row-gap" style="flex-direction:column;align-items:stretch">' +
      '<button type="button" class="ghost sm" data-swap="' + o.id + ':' + k + '">Trocar</button>' +
      '<button type="button" class="ghost copy" data-copy="' + esc(c.name + ' ' + c.code + ' (' + F.brandName(c.brand) + ')') + '">Copiar</button>' +
      '</div></div>';
  }
  function matchPt(d) {
    if (d < 0.012) return 'quase idêntica';
    if (d < 0.025) return 'bem parecida';
    if (d < 0.045) return 'parecida';
    return 'aproximada';
  }
  function renderOptions() {
    var html = '';
    state.options.forEach(function (so) {
      var o = hydrate(so), wall = o.slots.walls && o.slots.walls.c;
      var trim = o.slots.trim && o.slots.trim.c, ceil = o.slots.ceiling && o.slots.ceiling.c;
      html += '<article class="opt">' +
        '<div class="opt-hero" style="background:' + (wall ? wall.hex : '#ddd') + ';color:' + (wall ? F.textOn(wall) : '#000') + '">' +
        (ceil ? '<div class="ceil" style="background:' + ceil.hex + '"></div>' : '') +
        (trim ? '<div class="trimline" style="background:' + trim.hex + '"></div>' : '') +
        '<div><span class="tag">Opção ' + o.id + ' · ' + esc(o.title) + '</span><h3>' + esc(wall ? wall.name : '') + '</h3></div></div>' +
        '<div class="opt-body">';
      Object.keys(o.slots).forEach(function (k) { html += slotHTML(o, k, o.slots[k].c); });
      if (o.why && o.why.length) html += '<ul class="why">' + o.why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
      if (o.alternates.length) {
        html += '<div class="alts"><span class="lbl">Parede, outras parecidas:</span>' + o.alternates.map(function (c) {
          return '<button type="button" class="alt" data-alt="' + o.id + ':' + c.key + '"><i style="background:' + c.hex + '"></i>' + esc(c.name) + '</button>';
        }).join('') + '</div>';
      }
      html += '</div></article>';
    });
    $('#options').innerHTML = html || '<p class="muted">Responda a entrevista e toque em “Gerar 3 opções de cores”.</p>';
  }
  $('#options').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.swap) {
      var parts = b.dataset.swap.split(':');
      var so = state.options.filter(function (o) { return o.id === parts[0]; })[0];
      openPicker({
        title: 'Trocar cor · Opção ' + parts[0] + ' · ' + R.surfaceLabel(parts[1], state.answers.project, 'pt'),
        current: F.get(so.slots[parts[1]].key),
        onPick: function (c) {
          var prevWall = so.slots[parts[1]].key;
          so.slots[parts[1]].key = c.key;
          if (parts[1] === 'walls') {
            so.slots.walls.note = c.name + ' is a ' + (c.temp === 'neutral' ? 'balanced' : c.temp) + ' ' + F.FAMILY[c.family].en.toLowerCase() + ' with an LRV of ' + Math.round(c.lrv) + ' (' + F.lrvWord(c.lrv) + ').';
            // keep "same as walls" surfaces in sync
            Object.keys(so.slots).forEach(function (k) { if (k !== 'walls' && so.slots[k].key === prevWall) so.slots[k].key = c.key; });
          }
          invalidateRenders(so.id);
          persist(); renderOptions();
        }
      });
    } else if (b.dataset.alt) {
      var p2 = b.dataset.alt.split(':'), key = p2.slice(1).join(':');
      var so2 = state.options.filter(function (o) { return o.id === p2[0]; })[0];
      var old = so2.slots.walls.key;
      so2.alternates = so2.alternates.filter(function (k) { return k !== key; }).concat([old]);
      so2.slots.walls.key = key;
      Object.keys(so2.slots).forEach(function (k) { if (k !== 'walls' && so2.slots[k].key === old) so2.slots[k].key = key; });
      var c2 = F.get(key);
      so2.slots.walls.note = c2.name + ' is a ' + (c2.temp === 'neutral' ? 'balanced' : c2.temp) + ' ' + F.FAMILY[c2.family].en.toLowerCase() + ' with an LRV of ' + Math.round(c2.lrv) + ' (' + F.lrvWord(c2.lrv) + ').';
      invalidateRenders(so2.id);
      persist(); renderOptions();
    } else if (b.dataset.copy) {
      copyText(b.dataset.copy);
    }
  });
  function invalidateRenders(optId) {
    state.photos.forEach(function (ph) { delete ph.renders[optId]; delete ph.ai[optId]; if (ph.useAi) delete ph.useAi[optId]; });
  }
  function copyText(t) {
    try {
      navigator.clipboard.writeText(t).then(function () { toast('Copiado: ' + t); }, function () { toast(t); });
    } catch (e) { toast(t); }
  }

  /* ---------- color picker / catalog ---------- */
  var picker = { onPick: null, current: null };
  (function initPickerFamilies() {
    $('#pkFamily').innerHTML += Q.FAMILY_ORDER.map(function (f) { return '<option value="' + f + '">' + esc(F.FAMILY[f].pt) + '</option>'; }).join('');
  })();
  function openPicker(opts) {
    picker.onPick = opts.onPick || null;
    picker.current = opts.current || null;
    $('#pickerTitle').textContent = opts.title || 'Catálogo de cores';
    $('#pkSearch').value = '';
    $('#pkFamily').value = opts.current ? '' : '';
    $('#pkBrand').value = state.answers.brand !== 'both' ? state.answers.brand : '';
    renderPickerCurrent();
    renderPicker();
    $('#dlgPicker').showModal();
    setTimeout(function () { $('#pkSearch').focus(); }, 30);
  }
  function pkCard(c) {
    return '<button type="button" class="pk" data-key="' + esc(c.key) + '"><i style="background:' + c.hex + '"></i><span><b>' + esc(c.name) + '</b>' +
      esc(c.code) + ' · ' + c.brand + '<br><em>LRV ' + Math.round(c.lrv) + (c.popular ? ' · ★' : '') + (c.locator ? ' · ' + esc(c.locator) : '') + '</em></span></button>';
  }
  function renderPickerCurrent() {
    var c = picker.current, el = $('#pkCurrent');
    if (!c) { el.innerHTML = ''; return; }
    var sim = F.nearest(c, { n: 9, exclude: c.key, filter: function (x) { return x.name !== c.name; } }).map(function (x) { return x.c; });
    var lighter = F.nearest({ L: Math.min(0.98, c.L + 0.05), a: c.a * 0.9, b: c.b * 0.9 }, { brand: c.brand, n: 3, filter: function (x) { return x.L > c.L + 0.02; } }).map(function (x) { return x.c; });
    var darker = F.nearest({ L: c.L - 0.06, a: c.a, b: c.b }, { brand: c.brand, n: 3, filter: function (x) { return x.L < c.L - 0.02; } }).map(function (x) { return x.c; });
    el.innerHTML = '<div class="pk-row"><b>Atual:</b> <span class="alt"><i style="background:' + c.hex + '"></i>' + esc(c.name) + ' ' + esc(c.code) + '</span></div>' +
      '<div class="pk-row"><span class="muted small">Mais clara:</span>' + lighter.map(altBtn).join('') + '<span class="muted small">Mais escura:</span>' + darker.map(altBtn).join('') + '</div>' +
      '<div class="pk-row"><span class="muted small">Parecidas (as duas marcas):</span>' + sim.map(altBtn).join('') + '</div>';
  }
  function altBtn(c) { return '<button type="button" class="alt" data-key="' + esc(c.key) + '"><i style="background:' + c.hex + '"></i>' + esc(c.name) + ' <small class="muted">' + esc(c.code) + '</small></button>'; }
  function renderPicker() {
    var q = $('#pkSearch').value.trim().toLowerCase(), qc = q.replace(/[\s-]/g, '');
    var brand = $('#pkBrand').value, fam = $('#pkFamily').value, pop = $('#pkPopular').checked;
    var res = F.colors.filter(function (c) {
      if (brand && c.brand !== brand) return false;
      if (fam && c.family !== fam) return false;
      if (pop && !c.popular) return false;
      if (q && c.search.indexOf(q) < 0 && c.search.indexOf(qc) < 0) return false;
      return true;
    });
    if (q) {
      res.sort(function (x, y) {
        var ax = x.name.toLowerCase().indexOf(q) === 0 || x.code.toLowerCase() === q ? 0 : 1;
        var ay = y.name.toLowerCase().indexOf(q) === 0 || y.code.toLowerCase() === q ? 0 : 1;
        return ax - ay || (y.popular - x.popular);
      });
    } else if (picker.current) {
      var cur = picker.current;
      res.sort(function (x, y) { return F.dist(x, cur) - F.dist(y, cur); });
    } else {
      res.sort(function (x, y) { return (y.popular - x.popular) || (y.L - x.L); });
    }
    var shown = res.slice(0, 160);
    $('#pkResults').innerHTML = shown.map(pkCard).join('') || '<p class="muted" style="grid-column:1/-1">Nenhuma cor encontrada. Confira a marca e a família selecionadas.</p>';
    $('#pkCount').textContent = res.length + ' cores' + (res.length > shown.length ? ' · mostrando ' + shown.length + ', refine a busca' : '') +
      ' · Base: ' + window.FT_COLOR_META.bmCount + ' Benjamin Moore + ' + window.FT_COLOR_META.swCount + ' Sherwin-Williams.' + (picker.current ? ' Ordenado pela mais parecida com a atual.' : '');
  }
  ['#pkSearch', '#pkBrand', '#pkFamily', '#pkPopular'].forEach(function (s) { $(s).addEventListener('input', renderPicker); });
  $('#pkSearch').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
  $('#pickerForm').addEventListener('submit', function (e) { if (e.submitter && e.submitter.value === 'cancel') return; e.preventDefault(); });
  $('#dlgPicker').addEventListener('click', function (e) {
    var b = e.target.closest('[data-key]');
    if (!b) return;
    e.preventDefault();
    var c = F.get(b.dataset.key);
    if (picker.onPick) { picker.onPick(c); $('#dlgPicker').close(); toast(c.name + ' ' + c.code + ' escolhida'); }
    else { picker.current = c; renderPickerCurrent(); copyText(c.name + ' ' + c.code + ' (' + F.brandName(c.brand) + ')' + (c.locator ? ' · fan deck ' + c.locator : '')); }
  });
  $('#btnCatalog').addEventListener('click', function () { openPicker({ title: 'Catálogo de cores' }); });

  /* ---------- 3. photos ---------- */
  var cv = $('#cv'), cvc = cv.getContext('2d'), cur = $('#cvCursor'), curc = cur.getContext('2d');
  var frame = null; // ImageData reused between renders

  function surfacesForProject() {
    var s = (state.answers.surfaces || []).slice();
    if (!s.length) s = ['walls'];
    return s;
  }
  function renderPhotos() {
    var surfs = surfacesForProject();
    if (surfs.indexOf(ui.surface) < 0) ui.surface = surfs[0];
    $('#surfaceChips').innerHTML = surfs.map(function (s) {
      var t = V.SURFACE_TINT[s];
      return '<button type="button" class="chip' + (s === ui.surface ? ' on' : '') + '" data-surface="' + s + '"><span class="dot" style="background:rgb(' + t.join(',') + ')"></span>' + esc(R.surfaceLabel(s, state.answers.project, 'pt')) + '</button>';
    }).join('');
    $('#optChips').innerHTML = state.options.map(function (o) {
      var c = F.get(o.slots.walls.key);
      return '<button type="button" class="chip' + (o.id === ui.opt ? ' on' : '') + '" data-opt="' + o.id + '"><span class="dot" style="background:' + (c ? c.hex : '#ccc') + '"></span>' + o.id + (c ? ' · ' + esc(c.name) : '') + '</button>';
    }).join('');
    var list = state.photos.map(function (ph) {
      return '<div class="thumb' + (ph.id === ui.photo ? ' on' : '') + '" data-photo="' + ph.id + '" role="button" tabindex="0" aria-label="Abrir ' + esc(ph.name) + '"><img src="' + ph.src + '" alt=""><span>' + esc(ph.name) + '</span><button type="button" class="del" data-del="' + ph.id + '" aria-label="Remover foto">×</button></div>';
    }).join('');
    $('#photoList').innerHTML = list;
    if (!ui.photo && state.photos.length) ui.photo = state.photos[0].id;
    if (ui.photo && !state.photos.some(function (p) { return p.id === ui.photo; })) ui.photo = state.photos.length ? state.photos[0].id : null;
    $('#stageEmpty').hidden = !!ui.photo;
    $('#canvasBox').hidden = !ui.photo;
    $('#tolWrap').hidden = ui.tool !== 'fill';
    $('#sizeWrap').hidden = ui.tool === 'fill';
    if (ui.photo) ensureWork(ui.photo).then(draw);
    else { $('#coverage').innerHTML = ''; }
    renderRenders();
  }

  function photoById(id) { return state.photos.filter(function (p) { return p.id === id; })[0]; }
  var loading = {};
  function ensureWork(id) {
    if (works[id]) return Promise.resolve(works[id]);
    if (loading[id]) return loading[id];
    var ph = photoById(id);
    loading[id] = V.loadImage(ph.src).then(function (img) {
      works[id] = new V.Work(ph, img);
      delete loading[id];
      return works[id];
    });
    return loading[id];
  }

  function currentOption() { return state.options.filter(function (o) { return o.id === ui.opt; })[0] || state.options[0]; }

  function draw() {
    var w = works[ui.photo];
    if (!w) return;
    if (cv.width !== w.w || cv.height !== w.h) { cv.width = w.w; cv.height = w.h; cur.width = w.w; cur.height = w.h; frame = null; }
    $('#canvasBox').style.width = (ui.zoom * 100) + '%';
    if (!frame) frame = new ImageData(w.w, w.h);
    if (ui.show === 'orig') frame.data.set(w.orig.data);
    else if (ui.show === 'mask') w.overlay(ui.surface, frame);
    else w.render(currentOption() ? optColors(currentOption()) : {}, frame);
    cvc.putImageData(frame, 0, 0);
    var cov = surfacesForProject().map(function (s) {
      return '<span>' + esc(R.surfaceLabel(s, state.answers.project, 'pt')) + ': ' + Math.round(w.coverage(s) * 100) + '%</span>';
    }).join('');
    $('#coverage').innerHTML = cov;
  }

  function canvasPoint(e) {
    var r = cv.getBoundingClientRect();
    return { x: Math.max(0, Math.min(cv.width - 1, Math.round((e.clientX - r.left) / r.width * cv.width))), y: Math.max(0, Math.min(cv.height - 1, Math.round((e.clientY - r.top) / r.height * cv.height))) };
  }
  function pushUndo(w) {
    var snap = {};
    Object.keys(w.masks).forEach(function (s) { snap[s] = w.masks[s].slice(); });
    ui.undo.push({ photo: ui.photo, snap: snap });
    if (ui.undo.length > 20) ui.undo.shift();
  }
  var drag = null;
  cv.addEventListener('pointerdown', function (e) {
    var w = works[ui.photo]; if (!w) return;
    e.preventDefault();
    var p = canvasPoint(e);
    pushUndo(w);
    if (ui.show === 'orig') setShow('paint');
    if (ui.tool === 'fill') {
      var other = Object.keys(w.masks).filter(function (s) { return s !== ui.surface && w.masks[s][p.y * w.w + p.x]; })[0];
      if (other) {
        toast('Essa área já é ' + R.surfaceLabel(other, state.answers.project, 'pt') + '. Use a borracha ou “Limpar superfície” para refazer.');
        ui.undo.pop();
        return;
      }
      var idx = w.smartFill(p.x, p.y, +$('#tol').value, ui.surface);
      w.claim(ui.surface, idx);
      afterEdit();
      if (idx.length < 50) toast('Área muito pequena. Aumente a sensibilidade ou use o pincel.');
      return;
    }
    cv.setPointerCapture(e.pointerId);
    var rad = brushRadius();
    var from = e.shiftKey && drag && drag.last ? drag.last : p;
    w.brush(ui.surface, from.x, from.y, p.x, p.y, rad, ui.tool === 'erase');
    drag = { last: p, active: true };
    draw();
  });
  cv.addEventListener('pointermove', function (e) {
    var p = canvasPoint(e);
    drawCursor(p);
    if (!drag || !drag.active) return;
    var w = works[ui.photo]; if (!w) return;
    w.brush(ui.surface, drag.last.x, drag.last.y, p.x, p.y, brushRadius(), ui.tool === 'erase');
    drag.last = p;
    requestDraw();
  });
  function endDrag() { if (drag && drag.active) { drag.active = false; afterEdit(); } }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { curc.clearRect(0, 0, cur.width, cur.height); });
  var rafPending = false;
  function requestDraw() { if (rafPending) return; rafPending = true; requestAnimationFrame(function () { rafPending = false; draw(); }); }
  function brushRadius() { var w = works[ui.photo]; return Math.max(1, +$('#brushSize').value * (w ? Math.max(w.w, w.h) / 1600 : 1) / 2 * 1.6); }
  function drawCursor(p) {
    curc.clearRect(0, 0, cur.width, cur.height);
    if (ui.tool === 'fill') return;
    curc.beginPath(); curc.arc(p.x, p.y, brushRadius(), 0, Math.PI * 2);
    curc.lineWidth = Math.max(1.5, cur.width / 700); curc.strokeStyle = '#fff'; curc.stroke();
    curc.setLineDash([4, 4]); curc.strokeStyle = '#000'; curc.stroke(); curc.setLineDash([]);
  }
  function afterEdit() {
    var ph = photoById(ui.photo);
    ph.renders = {}; ph.ai = {}; ph.useAi = {};
    draw(); renderRenders(); persist();
  }
  $('#btnUndo').addEventListener('click', function () {
    var u = ui.undo.pop();
    if (!u) { toast('Nada para desfazer'); return; }
    var w = works[u.photo]; if (!w) return;
    Object.keys(w.masks).forEach(function (s) { w.masks[s] = u.snap[s] || new Uint8Array(w.n); w.touch(s); });
    ui.photo = u.photo; afterEdit(); renderPhotos();
  });
  $('#btnClearSurface').addEventListener('click', function () {
    var w = works[ui.photo]; if (!w) return;
    pushUndo(w);
    w.mask(ui.surface).fill(0); w.touch(ui.surface); afterEdit();
  });
  $('#tol').addEventListener('input', function (e) { $('#tolOut').textContent = e.target.value; });
  $('#brushSize').addEventListener('input', function (e) { $('#sizeOut').textContent = e.target.value; });
  $('#btnZoomIn').addEventListener('click', function () { ui.zoom = Math.min(4, ui.zoom * 1.4); draw(); });
  $('#btnZoomOut').addEventListener('click', function () { ui.zoom = Math.max(1, ui.zoom / 1.4); draw(); });

  function setShow(v) {
    ui.show = v;
    $$('[data-show]').forEach(function (b) { b.classList.toggle('on', b.dataset.show === v); });
    draw();
  }
  $('#view-photos').addEventListener('click', function (e) {
    var b = e.target.closest('button, [data-photo]');
    if (!b) return;
    if (b.dataset.surface) { ui.surface = b.dataset.surface; renderPhotos(); if (ui.show === 'orig') setShow('paint'); }
    else if (b.dataset.tool) {
      ui.tool = b.dataset.tool;
      $$('[data-tool]').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#tolWrap').hidden = ui.tool !== 'fill'; $('#sizeWrap').hidden = ui.tool === 'fill';
    }
    else if (b.dataset.show) setShow(b.dataset.show);
    else if (b.dataset.opt) { ui.opt = b.dataset.opt; renderPhotos(); }
    else if (b.dataset.del) {
      e.stopPropagation();
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Remover?'; setTimeout(function () { b.dataset.confirm = ''; b.textContent = '×'; }, 2500); return; }
      state.photos = state.photos.filter(function (p) { return p.id !== b.dataset.del; });
      delete works[b.dataset.del];
      if (ui.photo === b.dataset.del) ui.photo = null;
      persist(); renderPhotos();
    }
    else if (b.dataset.photo) { ui.photo = b.dataset.photo; ui.undo = []; frame = null; renderPhotos(); }
    else if (b.dataset.useai) {
      var ph = photoById(ui.photo);
      ph.useAi = ph.useAi || {};
      ph.useAi[b.dataset.useai] = !ph.useAi[b.dataset.useai];
      persist(); renderRenders();
    }
  });
  $('#photoList').addEventListener('keydown', function (e) {
    var t = e.target.closest('[data-photo]');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); }
  });

  $('#photoInput').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    toast('Carregando ' + files.length + ' foto(s)…');
    Promise.all(files.map(V.fileToPhoto)).then(function (photos) {
      photos.forEach(function (p) { state.photos.push(p); });
      ui.photo = photos[0].id; ui.undo = [];
      persist(); renderPhotos();
      toast('Agora toque na parede com a Seleção inteligente');
    }).catch(function (err) { toast(err.message, true); });
  });

  $('#btnSamplePhoto').addEventListener('click', function () {
    var p = samplePhoto();
    state.photos.push(p); ui.photo = p.id; persist(); renderPhotos();
    toast('Foto de exemplo criada. Toque na parede para testar.');
  });

  function renderAll() {
    var w = works[ui.photo]; if (!w) { toast('Adicione uma foto primeiro', true); return; }
    var ph = photoById(ui.photo);
    var hasMask = surfacesForProject().some(function (s) { return w.coverage(s) > 0; });
    if (!hasMask) { toast('Marque pelo menos a parede antes de gerar.', true); return; }
    state.options.forEach(function (o) { ph.renders[o.id] = w.toDataURL(optColors(o), 0.88); });
    persist(); renderRenders();
    toast('Fotos das 3 opções prontas para a apresentação');
  }
  $('#btnRenderAll').addEventListener('click', renderAll);

  function renderRenders() {
    var ph = ui.photo && photoById(ui.photo);
    if (!ph) { $('#renders').innerHTML = ''; return; }
    var html = '';
    state.options.forEach(function (o) {
      var c = F.get(o.slots.walls.key);
      if (ph.renders[o.id]) html += '<div class="render"><img src="' + ph.renders[o.id] + '" alt="Opção ' + o.id + '"><div><span><b>Opção ' + o.id + '</b> · ' + esc(c ? c.name : '') + '</span>' +
        (ph.ai[o.id] && !(ph.useAi || {})[o.id] ? '<span class="muted small">usando versão local</span>' : '') + '</div></div>';
      if (ph.ai[o.id]) {
        var on = (ph.useAi || {})[o.id];
        html += '<div class="render"><img src="' + ph.ai[o.id] + '" alt="Opção ' + o.id + ' gerada por IA"><div><span><b>Opção ' + o.id + ' · IA</b></span>' +
          '<button type="button" class="ghost sm" data-useai="' + o.id + '">' + (on ? '✓ Usando na apresentação' : 'Usar na apresentação') + '</button></div></div>';
      }
    });
    $('#renders').innerHTML = html;
  }

  $('#btnAi').addEventListener('click', function () {
    var ph = ui.photo && photoById(ui.photo);
    if (!ph) { toast('Adicione uma foto primeiro', true); return; }
    if (!settings.geminiKey) { toast('Coloque a chave do Gemini em Configurações (é opcional).', true); openSettings(); return; }
    var so = currentOption(), o = hydrate(so), btn = $('#btnAi');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Gerando opção ' + so.id + '…';
    AI.repaint(ph.src, o, state.answers.project, settings).then(function (url) {
      ph.ai[so.id] = url; ph.useAi = ph.useAi || {}; ph.useAi[so.id] = true;
      if (!ph.renders[so.id] && works[ph.id]) ph.renders[so.id] = works[ph.id].toDataURL(optColors(so), 0.88);
      persist(); renderRenders(); toast('Versão IA da opção ' + so.id + ' pronta');
    }).catch(function (err) { toast(err.message, true); })
      .then(function () { btn.disabled = false; btn.textContent = 'Gerar com IA (opcional)'; });
  });

  /* synthetic room so the tool can be tried without a client photo */
  function samplePhoto() {
    var W = 1200, H = 860, c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    function lin(x0, y0, x1, y1, stops) { var gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); }); return gr; }
    g.fillStyle = lin(0, 0, 0, 130, [[0, '#d9d6cf'], [1, '#ebe8e1']]); g.fillRect(0, 0, W, 130);              // ceiling
    g.fillStyle = '#f3f1ec'; g.fillRect(0, 120, W, 14);                                                     // crown
    g.fillStyle = lin(0, 0, W, 0, [[0, '#b7b0a3'], [0.45, '#cfc8bb'], [1, '#bdb6a9']]); g.fillRect(0, 134, W, 556); // wall
    g.fillStyle = lin(0, 0, 0, H, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.08)']]); g.fillRect(0, 134, W, 556);
    g.fillStyle = '#f1efea'; g.fillRect(700, 210, 330, 300);                                                // window casing
    g.fillStyle = lin(0, 232, 0, 488, [[0, '#a9cdeb'], [0.55, '#cfe2f1'], [0.56, '#7f9c6a'], [1, '#5f7d4c']]); g.fillRect(722, 232, 286, 256);
    g.fillStyle = '#f1efea'; g.fillRect(860, 232, 10, 256); g.fillRect(722, 356, 286, 10);
    g.fillStyle = '#f2f0eb'; g.fillRect(0, 690, W, 34);                                                     // baseboard
    g.fillStyle = lin(0, 724, 0, H, [[0, '#9a7452'], [1, '#7d5b3e']]); g.fillRect(0, 724, W, H - 724);     // floor
    g.fillStyle = '#5a6670'; g.fillRect(90, 520, 470, 150); g.fillRect(70, 470, 60, 200); g.fillRect(520, 470, 60, 200); // sofa
    g.fillStyle = '#6b7882'; g.fillRect(110, 440, 430, 110);
    g.fillStyle = '#c8a24a'; g.fillRect(250, 250, 160, 120); g.fillStyle = '#2f3d4c'; g.fillRect(262, 262, 136, 96); // art
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.beginPath(); g.moveTo(1030, 134); g.lineTo(1200, 134); g.lineTo(1200, 690); g.lineTo(1030, 690); g.fill();
    return { id: 'p' + Date.now().toString(36), name: 'Sample room', w: W, h: H, src: c.toDataURL('image/jpeg', 0.92), masks: {}, renders: {}, ai: {}, useAi: {} };
  }

  /* ---------- 4. presentation ---------- */
  function logoSrc() { return settings.logo || 'assets/logo.svg'; }
  function renderReport() {
    $('#report').innerHTML = REP.build(state, {
      settings: settings, logo: logoSrc(), options: state.options.map(hydrate),
      compare: $('#optCompare').checked, shopping: $('#optShopping').checked
    });
  }
  $('#optCompare').addEventListener('change', renderReport);
  $('#optShopping').addEventListener('change', renderReport);
  var embedded = false;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  $('#btnPrint').addEventListener('click', function () {
    if (embedded) {
      toast('Aqui dentro do Claude o PDF não abre. Use o site (index.html) para salvar o PDF.', true);
      return;
    }
    var name = (state.client.name || 'Client').replace(/[^\w\s&-]/g, '').trim();
    var old = document.title;
    document.title = 'Final Touch Color Consultation - ' + name;
    window.print();
    setTimeout(function () { document.title = old; }, 1000);
  });

  /* ---------- settings ---------- */
  var SET_FIELDS = ['company', 'address', 'phone', 'email', 'web', 'hic', 'consultant', 'tagline', 'geminiKey', 'geminiModel'];
  var pendingLogo = null;
  function openSettings() {
    SET_FIELDS.forEach(function (f) { $('#s_' + f).value = settings[f] || ''; });
    pendingLogo = settings.logo || '';
    $('#s_logoPreview').src = pendingLogo || 'assets/logo.svg';
    $('#dlgSettings').showModal();
  }
  $('#btnSettings').addEventListener('click', openSettings);
  $('#s_logo').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onload = function () { pendingLogo = fr.result; $('#s_logoPreview').src = pendingLogo; };
    fr.readAsDataURL(f);
  });
  $('#s_logoReset').addEventListener('click', function () { pendingLogo = ''; $('#s_logoPreview').src = 'assets/logo.svg'; });
  $('#settingsForm').addEventListener('submit', function (e) {
    if (!e.submitter || e.submitter.value !== 'save') return;
    SET_FIELDS.forEach(function (f) { settings[f] = $('#s_' + f).value.trim(); });
    settings.logo = pendingLogo || '';
    if (!S.setSettings(settings)) toast('Não consegui salvar as configurações neste navegador.', true);
    else toast('Configurações salvas');
    applyLogo();
    if (ui.view === 'presentation') renderReport();
  });
  function applyLogo() { $('#brandLogo').src = logoSrc(); }

  /* ---------- projects ---------- */
  function openProjects() {
    S.list().then(function (rows) {
      $('#projList').innerHTML = rows.length ? rows.map(function (r) {
        return '<div class="proj' + (r.id === state.id ? ' on' : '') + '"><div><b>' + esc(r.client || 'Sem nome') + '</b> <span class="muted small">' + esc(r.town || '') + '</span><br>' +
          '<span class="muted small">' + (r.updated ? new Date(r.updated).toLocaleString('pt-BR') : '') + ' · ' + r.photos + ' foto(s)</span></div>' +
          '<div class="row-gap"><button type="button" class="ghost sm" data-open="' + r.id + '">Abrir</button><button type="button" class="ghost sm" data-remove="' + r.id + '">Excluir</button></div></div>';
      }).join('') : '<p class="muted">Nenhum projeto salvo ainda.</p>';
    }).catch(function () { $('#projList').innerHTML = '<p class="muted">Este navegador não permite salvar projetos.</p>'; });
    $('#dlgProjects').showModal();
  }
  $('#btnProjects').addEventListener('click', openProjects);
  $('#projList').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.open) {
      doSave().then(function () { return S.load(b.dataset.open); }).then(function (p) {
        if (!p) return;
        setProject(p); $('#dlgProjects').close(); toast('Projeto aberto'); location.hash = '#interview'; route();
      });
    } else if (b.dataset.remove) {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmar exclusão'; return; }
      S.remove(b.dataset.remove).then(function () {
        if (b.dataset.remove === state.id) setProject(newProject(false));
        openProjects();
      });
    }
  });
  $('#btnNewProject').addEventListener('click', function () {
    doSave().then(function () {
      setProject(newProject(false)); persist(true);
      $('#dlgProjects').close(); location.hash = '#interview'; route(); toast('Novo projeto');
    });
  });
  function setProject(p) {
    state = p; works = {}; ui.photo = null; ui.undo = []; frame = null; ui.opt = 'A';
    state.photos = state.photos || []; state.options = state.options || [];
    state.photos.forEach(function (ph) { ph.renders = ph.renders || {}; ph.ai = ph.ai || {}; ph.useAi = ph.useAi || {}; });
    try { localStorage.setItem('ft-cc-last', p.id); } catch (e) { /* private mode */ }
  }

  /* ---------- boot ---------- */
  function boot() {
    applyLogo();
    var last = null;
    try { last = localStorage.getItem('ft-cc-last'); } catch (e) { /* ignore */ }
    var start = last ? S.load(last).catch(function () { return null; }) : Promise.resolve(null);
    start.then(function (p) {
      if (p) setProject(p);
      else { setProject(newProject(true)); makeRecommendations(true); }
      route();
    });
  }
  window.addEventListener('beforeunload', function () { doSave(); });
  boot();
})();
