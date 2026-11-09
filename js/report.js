/* Client-facing presentation (US English), laid out as Letter pages for PDF. */
(function (root) {
  'use strict';
  var F = root.FTColor, R = root.FTRecommend, Q = root.FTQuestions;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function optLabel(qid, v) {
    var q = Q.list.filter(function (x) { return x.id === qid; })[0];
    if (!q) return v;
    var opts = typeof q.options === 'function' ? q.options({}) : q.options;
    if (opts === 'families') return F.FAMILY[v] ? F.FAMILY[v].en : v;
    var o = (opts || []).filter(function (x) { return x.v === v; })[0];
    return o ? o.en : v;
  }
  function list(qid, arr) {
    return (arr || []).map(function (v) { return optLabel(qid, v); }).join(', ');
  }
  function fmtDate(d) {
    if (!d) return '';
    var dt = new Date(d + 'T12:00:00');
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function chip(c, surface, project, big) {
    if (!c) return '';
    var m = R.crossMatch(c);
    var sheen = (R.SHEEN[surface] || {})[project === 'exterior' ? 'exterior' : 'interior'] || '';
    return '<div class="r-chip' + (big ? ' big' : '') + '">' +
      '<div class="r-chip-sw" style="background:' + c.hex + '"></div>' +
      '<div class="r-chip-tx">' +
      '<div class="r-surface">' + esc(R.surfaceLabel(surface, project, 'en')) + '</div>' +
      '<div class="r-name">' + esc(c.name) + '</div>' +
      '<div class="r-code">' + esc(F.brandName(c.brand)) + ' · <b>' + esc(c.code) + '</b></div>' +
      '<div class="r-meta">LRV ' + Math.round(c.lrv) + (sheen ? ' · ' + esc(sheen) : '') + (c.locator ? ' · Fan deck ' + esc(c.locator) : '') + '</div>' +
      (m ? '<div class="r-meta soft">Closest ' + (c.brand === 'BM' ? 'Sherwin-Williams' : 'Benjamin Moore') + ': ' + esc(m.c.name) + ' ' + esc(m.c.code) + '</div>' : '') +
      '</div></div>';
  }

  function header(settings, logo) {
    return '<div class="r-head"><img src="' + esc(logo) + '" alt="' + esc(settings.company) + '"><span>Color Consultation</span></div>';
  }
  function footer(settings, n) {
    return '<div class="r-foot"><span>' + esc(settings.company) + ' · ' + esc(settings.phone) + ' · ' + esc(settings.web) +
      (settings.hic ? ' · NJ HIC #' + esc(settings.hic) : '') + '</span><span>' + n + '</span></div>';
  }

  function build(p, opts) {
    var s = opts.settings, logo = opts.logo, a = p.answers, project = a.project;
    var options = opts.options; // hydrated
    var photos = (p.photos || []).filter(function (ph) { return Object.keys(ph.renders || {}).length || Object.keys(ph.ai || {}).length; });
    var client = p.client || {};
    var pages = [], n = 0;
    function page(inner, cls) { n++; pages.push('<section class="r-page ' + (cls || '') + '">' + inner + footer(s, n) + '</section>'); }

    /* cover */
    var stripes = options.map(function (o) {
      return ['walls', 'trim', 'ceiling', 'accent'].map(function (k) { var c = o.slots[k] && o.slots[k].c; return c ? '<i style="background:' + c.hex + '"></i>' : ''; }).join('');
    }).join('');
    page(
      '<div class="r-cover">' +
      '<img class="r-cover-logo" src="' + esc(logo) + '" alt="' + esc(s.company) + '">' +
      '<div class="r-cover-mid">' +
      '<p class="r-kicker">Color Consultation</p>' +
      '<h1>' + esc(client.name || 'Your Home') + '</h1>' +
      '<p class="r-sub">' + esc([client.space, client.town].filter(Boolean).join(' · ')) + '</p>' +
      '</div>' +
      '<div class="r-stripes">' + stripes + '</div>' +
      '<div class="r-cover-foot"><div><span>Prepared</span>' + esc(fmtDate(client.date)) + '</div>' +
      (s.consultant ? '<div><span>Consultant</span>' + esc(s.consultant) + '</div>' : '') +
      '<div><span>Contact</span>' + esc(s.phone) + '<br>' + esc(s.email) + '</div></div>' +
      '</div>', 'cover');

    /* the brief */
    var rows = [];
    function row(k, v) { if (v) rows.push('<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>'); }
    row('Project', project === 'exterior' ? 'Exterior' : optLabel('room', a.room));
    row('Surfaces', list('surfaces', a.surfaces).replace('walls', 'Walls'));
    if (project !== 'exterior') row('Natural light', optLabel('light', a.light) + (a.exposure && a.exposure !== 'unknown' ? ', ' + optLabel('exposure', a.exposure).toLowerCase() : ''));
    row('How it should feel', list('moods', a.moods));
    row('Style', a.style ? optLabel('style', a.style) : '');
    row('Color direction', [optLabel('depth', a.depth), a.temp !== 'any' ? optLabel('temp', a.temp) : ''].filter(Boolean).join(' · '));
    row('Colors you love', list('likes', a.likes));
    row('Colors to avoid', list('avoid', a.avoid));
    row('What stays', optLabel('fixed', a.fixed));
    row('Notes', a.notes);
    var surfLabels = (a.surfaces || []).map(function (x) { return R.surfaceLabel(x, project, 'en'); });
    page(header(s, logo) +
      '<div class="r-body"><p class="r-kicker">Your brief</p><h2>What we heard from you</h2>' +
      '<table class="r-brief">' + rows.join('') + '</table>' +
      '<div class="r-how"><h3>How we chose your colors</h3>' +
      '<p>We matched your answers against the full Benjamin Moore and Sherwin-Williams collections. Each option is a complete scheme for ' + esc(surfLabels.join(', ').toLowerCase()) + ', balanced for your light and the finishes that are staying in the room. Every color on the following pages is a real, in-stock paint with its official store code.</p></div>' +
      '</div>');

    /* one page per option */
    options.forEach(function (o) {
      var wall = o.slots.walls && o.slots.walls.c;
      var chips = Object.keys(o.slots).map(function (k) { return chip(o.slots[k].c, k, project, k === 'walls'); }).join('');
      var shots = photos.slice(0, 2).map(function (ph) {
        var src = (ph.useAi && ph.useAi[o.id] && ph.ai[o.id]) || ph.renders[o.id];
        if (!src) return '';
        return '<figure><img src="' + src + '" alt="' + esc(ph.name) + ' in option ' + o.id + '"><figcaption>' + esc(ph.name) + '</figcaption></figure>';
      }).join('');
      page(header(s, logo) +
        '<div class="r-body">' +
        '<div class="r-opt-head"><div class="r-opt-badge" style="background:' + (wall ? wall.hex : '#ccc') + ';color:' + (wall ? F.textOn(wall) : '#000') + '">' + o.id + '</div>' +
        '<div><p class="r-kicker">Option ' + o.id + '</p><h2>' + esc(o.title) + (wall ? ': ' + esc(wall.name) : '') + '</h2></div></div>' +
        (shots ? '<div class="r-shots n' + Math.min(2, photos.length) + '">' + shots + '</div>' : '') +
        '<div class="r-chips">' + chips + '</div>' +
        (o.why && o.why.length ? '<div class="r-why"><h3>Why it works</h3><ul>' + o.why.map(function (w) { return '<li>' + esc(w.charAt(0).toUpperCase() + w.slice(1)) + '.</li>'; }).join('') + '</ul>' +
          (wall ? '<p class="soft">' + esc(o.slots.walls.note || '') + '</p>' : '') + '</div>' : '') +
        '</div>');
    });

    /* side-by-side comparison */
    if (opts.compare && photos.length) {
      photos.forEach(function (ph) {
        var cells = '<figure><img src="' + ph.src + '" alt="Current"><figcaption>Today</figcaption></figure>' +
          options.map(function (o) {
            var src = (ph.useAi && ph.useAi[o.id] && ph.ai[o.id]) || ph.renders[o.id];
            var w = o.slots.walls && o.slots.walls.c;
            return src ? '<figure><img src="' + src + '" alt="Option ' + o.id + '"><figcaption><b>Option ' + o.id + '</b> · ' + esc(w ? w.name : '') + '</figcaption></figure>' : '';
          }).join('');
        page(header(s, logo) + '<div class="r-body"><p class="r-kicker">Side by side</p><h2>' + esc(ph.name) + '</h2><div class="r-compare">' + cells + '</div></div>');
      });
    }

    /* shopping list */
    if (opts.shopping) {
      var trs = '';
      options.forEach(function (o) {
        Object.keys(o.slots).forEach(function (k, i) {
          var c = o.slots[k].c; if (!c) return;
          var m = R.crossMatch(c);
          var sheen = (R.SHEEN[k] || {})[project === 'exterior' ? 'exterior' : 'interior'] || '';
          trs += '<tr' + (i === 0 ? ' class="first"' : '') + '><td>' + (i === 0 ? '<b>' + o.id + '</b>' : '') + '</td><td>' + esc(R.surfaceLabel(k, project, 'en')) + '</td>' +
            '<td><i class="r-dot" style="background:' + c.hex + '"></i>' + esc(c.name) + '</td><td><b>' + esc(c.code) + '</b><br><span class="soft">' + esc(F.brandName(c.brand)) + '</span></td>' +
            '<td>' + esc(sheen) + '</td><td>' + esc(c.locator || '') + '</td>' +
            '<td class="soft">' + (m ? esc(m.c.name) + ' ' + esc(m.c.code) : '') + '</td></tr>';
        });
      });
      page(header(s, logo) + '<div class="r-body"><p class="r-kicker">Paint list</p><h2>Everything you need at the store</h2>' +
        '<p class="soft">Give the code to the paint counter. Benjamin Moore and Sherwin-Williams codes are exact. The last column is the closest color in the other brand, which is similar but not identical.</p>' +
        '<table class="r-shop"><thead><tr><th>Opt.</th><th>Surface</th><th>Color</th><th>Code</th><th>Suggested sheen</th><th>Fan deck</th><th>Closest in other brand</th></tr></thead><tbody>' + trs + '</tbody></table>' +
        '<div class="r-next"><h3>Next steps</h3><ol>' +
        '<li>Pick your favorite option, or mix: we can swap any single color.</li>' +
        '<li>We put up large samples of your top choice so you can see them in morning and evening light.</li>' +
        '<li>We confirm colors and sheens in your written estimate, with start and finish dates.</li></ol>' +
        '<p class="soft small">Screens and printers cannot show paint color exactly, and the photos are a visualization. Please confirm every color with a physical sample on your wall before painting.</p></div>' +
        '</div>');
    }

    /* closing */
    page('<div class="r-close"><img src="' + esc(logo) + '" alt="' + esc(s.company) + '">' +
      '<p class="r-tag">' + esc(s.tagline) + '</p>' +
      '<div class="r-contact"><div>' + esc(s.company) + '</div><div>' + esc(s.address) + '</div><div>' + esc(s.phone) + ' · ' + esc(s.email) + '</div><div>' + esc(s.web) + '</div>' +
      (s.hic ? '<div>NJ HIC #' + esc(s.hic) + '</div>' : '') + '</div></div>', 'closing');

    return pages.join('');
  }

  root.FTReport = { build: build, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
