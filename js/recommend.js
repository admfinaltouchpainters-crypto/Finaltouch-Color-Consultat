/* Recommendation engine: turns interview answers into three complete color
   schemes (walls, trim, ceiling, accent/doors/cabinets) with reasons. */
(function (root) {
  'use strict';
  var F = root.FTColor;

  var STYLE_FAMILIES = {
    modern: ['white', 'gray', 'black', 'greige'],
    transitional: ['greige', 'gray', 'white', 'taupe', 'navy'],
    traditional: ['beige', 'greige', 'navy', 'green', 'sage', 'red', 'cream'],
    farmhouse: ['white', 'cream', 'greige', 'sage', 'black'],
    coastal: ['white', 'blue', 'teal', 'beige', 'sage'],
    scandi: ['white', 'gray', 'greige', 'sage', 'beige'],
    midcentury: ['teal', 'yellow', 'sage', 'orange', 'green', 'brown'],
    industrial: ['gray', 'black', 'greige', 'taupe'],
    boho: ['orange', 'brown', 'sage', 'green', 'pink', 'cream']
  };
  var MOOD_FAMILIES = {
    calm: ['blue', 'sage', 'greige', 'gray', 'teal'],
    cozy: ['beige', 'cream', 'taupe', 'brown', 'orange', 'greige'],
    airy: ['white', 'cream', 'blue', 'greige'],
    elegant: ['navy', 'greige', 'taupe', 'black', 'green'],
    dramatic: ['navy', 'black', 'green', 'red', 'brown', 'purple'],
    fresh: ['white', 'blue', 'sage', 'green', 'teal'],
    earthy: ['sage', 'brown', 'orange', 'beige', 'taupe', 'green'],
    energetic: ['yellow', 'orange', 'teal', 'green', 'pink', 'blue']
  };
  var ROOM_NOTES = {
    bedroom: 'restful', primary: 'restful', nursery: 'soft', office: 'focused',
    kitchen: 'clean', bath: 'clean', dining: 'rich', living: 'versatile',
    hall: 'durable', basement: 'bright', whole: 'flowing'
  };

  function depthRange(a) {
    var r = a.depth === 'deep' ? [3, 22] : a.depth === 'mid' ? [28, 55] : [55, 82];
    if (a.project === 'exterior' && a.depth === 'light') r = [50, 78];
    var shift = 0;
    if (a.light === 'low') shift += 5;
    if (a.light === 'high') shift -= 4;
    if (a.exposure === 'north') shift += 3;
    if (a.depth !== 'deep') { r = [r[0] + shift, Math.min(88, r[1] + shift)]; }
    return r;
  }

  function wantsTemp(a) {
    if (a.temp === 'warm' || a.temp === 'cool') return a.temp;
    if (a.temp === 'balanced') return 'neutral';
    // no stated preference: let the room's light decide
    if (a.exposure === 'north' || a.light === 'low') return 'warm';
    if (a.fixed === 'warmwood') return 'warm';
    if (a.fixed === 'coolgray') return 'cool';
    return null;
  }

  function preferredFamilies(a) {
    var set = {};
    function add(list, w) { (list || []).forEach(function (f) { set[f] = (set[f] || 0) + w; }); }
    add(a.likes, 3);
    (a.moods || []).forEach(function (m) { add(MOOD_FAMILIES[m], 1); });
    add(STYLE_FAMILIES[a.style], 1);
    if (!a.likes || !a.likes.length) {
      // sensible defaults when the client has no favorites
      if (a.depth === 'light') add(['greige', 'white', 'cream', 'gray', 'beige'], 1.2);
      if (a.depth === 'mid') add(['greige', 'sage', 'blue', 'taupe', 'gray'], 1);
      if (a.depth === 'deep') add(['navy', 'green', 'black', 'brown'], 1);
    }
    return set;
  }

  function brandOK(a, c) { return a.brand === 'both' || !a.brand || a.brand === c.brand; }
  function usable(a, c) {
    if (!brandOK(a, c)) return false;
    if (c.brand === 'BM' && /^(ES|PM)-/.test(c.code)) return false; // stain colors / duplicate codes
    if (a.project === 'exterior' && !c.exterior) return false;
    if (a.project !== 'exterior' && !c.interior) return false;
    return true;
  }

  /* Score a candidate main (wall) color. Returns {score, reasons[]} */
  function scoreWall(a, c, ctx) {
    var s = 0, why = [];
    if ((a.avoid || []).indexOf(c.family) >= 0) return null;
    // whites only as a wall color when asked for or when the brief is very light
    if ((c.family === 'white') && (a.likes || []).indexOf('white') < 0 && a.depth !== 'light') return null;

    var fw = ctx.families[c.family] || 0;
    var neutralFam = { greige: 1, gray: 1, beige: 1, taupe: 1, white: 1, cream: 1 };
    if (neutralFam[c.family] && c.undertone === 'pink/red' && (a.likes || []).indexOf('pink') < 0) s -= 1.2;
    s += fw * 1.4;
    if ((a.likes || []).indexOf(c.family) >= 0) why.push('it sits in the ' + F.FAMILY[c.family].en.toLowerCase() + ' family you said you love');

    var r = ctx.range, lrv = c.lrv;
    if (lrv >= r[0] && lrv <= r[1]) {
      var mid = (r[0] + r[1]) / 2;
      s += 3 - Math.abs(lrv - mid) / (r[1] - r[0]) * 2;
    } else {
      var off = lrv < r[0] ? r[0] - lrv : lrv - r[1];
      s -= off / 4;
      if (off > 18) return null;
    }

    var t = ctx.temp;
    if (t) {
      if (c.temp === t) { s += 1.6; }
      else if (c.temp === 'neutral' || t === 'neutral') { s += 0.3; }
      else { s -= 2.2; }
    }
    if ((a.exposure === 'north' || a.light === 'low') && c.temp === 'cool' && c.C > 0.015 && c.lrv > 30) {
      s -= 1.2;
    }
    if ((a.exposure === 'north' || a.light === 'low') && c.temp === 'warm') {
      why.push('the warm undertone balances the cooler, softer light in this room');
    }
    if ((a.exposure === 'south' || a.light === 'high') && c.temp === 'cool') {
      why.push('strong sunlight keeps this cooler tone from feeling cold');
    }

    var moods = a.moods || [];
    if (moods.indexOf('calm') >= 0 && c.C < 0.06) s += 0.8;
    if (moods.indexOf('energetic') >= 0) s += c.C > 0.08 ? 1.2 : -0.5;
    if (moods.indexOf('airy') >= 0 && c.lrv > 60) s += 0.8;
    if (moods.indexOf('dramatic') >= 0 && c.lrv < 20) s += 1;
    if (moods.indexOf('elegant') >= 0 && c.C < 0.05) s += 0.5;
    if (moods.indexOf('earthy') >= 0 && c.temp === 'warm' && c.C > 0.02 && c.C < 0.1) s += 0.7;
    if (moods.indexOf('cozy') >= 0 && c.temp === 'warm') s += 0.6;
    if (moods.indexOf('fresh') >= 0 && c.C < 0.07 && c.lrv > 50) s += 0.5;
    // strong, saturated colors on whole rooms are rarely what people want
    var cmax = moods.indexOf('energetic') >= 0 ? 0.16 : (c.lrv < 25 ? 0.085 : 0.12);
    if (c.C > cmax) s -= (c.C - cmax) * 45;

    if (a.fixed === 'warmwood' && c.temp === 'warm') { s += 0.5; why.push('it works with your warm wood and beige tones'); }
    if (a.fixed === 'coolgray' && c.temp !== 'warm') { s += 0.5; why.push('it ties in with the gray and cool stone already in the room'); }
    if (a.fixed === 'dark' && c.lrv > 45) { s += 0.4; why.push('it keeps contrast with your darker finishes'); }

    var pw = a.proven === 'proven' ? 3 : a.proven === 'unique' ? -0.8 : 1.2;
    if (c.popular) { s += pw; if (pw > 0) why.push('it is one of the brand’s best-selling, proven colors'); }

    return { score: s, why: why };
  }

  function pickDiverse(scored, n, minDist) {
    var out = [];
    for (var i = 0; i < scored.length && out.length < n; i++) {
      var c = scored[i].c, ok = true;
      for (var j = 0; j < out.length; j++) {
        if (F.dist(out[j].c, c) < minDist || out[j].c.name === c.name) { ok = false; break; }
      }
      if (ok) out.push(scored[i]);
    }
    return out;
  }

  function sameBrandPool(a, brand) {
    return F.colors.filter(function (c) { return c.brand === brand && usable(a, c); });
  }

  function bestBy(pool, fn) {
    var best = null, bs = -Infinity;
    for (var i = 0; i < pool.length; i++) {
      var s = fn(pool[i]);
      if (s != null && s > bs) { bs = s; best = pool[i]; }
    }
    return best;
  }

  function pickTrim(a, wall, pool) {
    var style = a.trimStyle || 'soft';
    if (style === 'match') return { c: wall, note: 'Same color as the walls in a semi-gloss sheen for a modern, tailored look.' };
    if (style === 'contrast') {
      var dark = bestBy(pool, function (c) {
        if (c.lrv > 12) return null;
        var s = -Math.abs(c.lrv - 6) / 3 + (c.popular ? 2 : 0);
        if (c.family === 'black') s += 1.5;
        if (wall.temp === c.temp || c.temp === 'neutral') s += 1;
        if (c.C > 0.05) s -= 2;
        return s;
      });
      return { c: dark, note: 'A deep contrast trim that outlines the windows and doors.' };
    }
    var t = style === 'crisp' ? 'cool' : (wall.temp === 'cool' ? 'neutral' : 'warm');
    var white = bestBy(pool, function (c) {
      if (c.family !== 'white' && c.family !== 'cream') return null;
      if (c.lrv < 80) return null;
      var s = c.popular ? 3 : 0;
      if (style === 'crisp') s += (0.02 - c.C) * 120 + (c.lrv - 80) / 3;
      else { s += -Math.abs(c.lrv - 84) / 2; s += c.temp === t ? 1.5 : 0; if (c.C > 0.03) s -= 2; }
      if (wall.family === 'white' && F.dist(c, wall) < 0.01) s += 1; // same white, different sheen
      return s;
    });
    return {
      c: white,
      note: style === 'crisp' ? 'A clean, crisp white that makes the trim look sharp and new.'
        : 'A soft white chosen to sit comfortably next to the wall color instead of glaring against it.'
    };
  }

  function pickCeiling(a, wall, trim, pool) {
    var style = a.ceilingStyle || 'white';
    if (style === 'match') return { c: wall, note: 'Same as the walls in a flat finish, which makes the room feel wrapped and taller.' };
    if (style === 'tint') {
      var target = { L: Math.min(0.97, wall.L + (0.97 - wall.L) * 0.72), a: wall.a * 0.4, b: wall.b * 0.4 };
      var m = F.nearest(target, { brand: wall.brand, filter: function (c) { return usable(a, c) && c.lrv > Math.max(wall.lrv, 58); } });
      return { c: m ? m.c : trim, note: 'A lighter tint of the wall color so the ceiling feels connected but still lifts the room.' };
    }
    if (trim && trim.lrv >= 80) return { c: trim, note: 'The trim white in a flat ceiling finish keeps everything coordinated and bright.' };
    var white = bestBy(pool, function (c) {
      if (c.family !== 'white' || c.lrv < 84) return null;
      return (c.popular ? 2 : 0) + (0.015 - c.C) * 100;
    });
    return { c: white, note: 'A bright flat white that reflects light back into the room.' };
  }

  function pickAccent(a, wall, pool, ctx, usedFamilies) {
    var likes = (a.likes || []).filter(function (f) { return f !== wall.family && f !== 'white' && f !== 'cream'; });
    var accent = bestBy(pool, function (c) {
      if ((a.avoid || []).indexOf(c.family) >= 0) return null;
      if (c.lrv > 25 || c.lrv < 2.5) return null;
      if (F.dist(c, wall) < 0.08) return null;
      var s = (ctx.families[c.family] || 0) * 0.8;
      if (likes.indexOf(c.family) >= 0) s += 2;
      if (usedFamilies[c.family]) s -= 1.2;
      s += c.popular ? 1.5 : 0;
      if (c.C > 0.1) s -= 1.5;
      // keep accent in harmony: same temperature or neutral
      if (wall.temp !== 'neutral' && c.temp !== 'neutral' && c.temp !== wall.temp) s -= 1;
      return s;
    });
    return { c: accent, note: 'A deeper color for an accent wall, doors, an island or the front door that gives the scheme depth.' };
  }

  var OPTION_TITLES = {
    0: 'The Signature',
    1: 'The Alternative',
    2: 'The Statement'
  };

  function describe(c, a) {
    var parts = [];
    var fam = F.FAMILY[c.family].en.toLowerCase();
    var tw = c.temp === 'neutral' ? 'balanced' : c.temp;
    parts.push(c.name + ' is a ' + tw + ' ' + fam + ' with an LRV of ' + Math.round(c.lrv) + ' (' + F.lrvWord(c.lrv) + ').');
    return parts.join(' ');
  }

  function recommend(a) {
    a = Object.assign({}, root.FTQuestions.DEFAULT_ANSWERS, a || {});
    var ctx = { range: depthRange(a), temp: wantsTemp(a), families: preferredFamilies(a) };

    var scored = [];
    for (var i = 0; i < F.colors.length; i++) {
      var c = F.colors[i];
      if (!usable(a, c)) continue;
      var r = scoreWall(a, c, ctx);
      if (r) scored.push({ c: c, score: r.score, why: r.why });
    }
    scored.sort(function (x, y) { return y.score - x.score; });

    // Options A and B: best and best-different. Option C: a bolder take.
    var top = pickDiverse(scored, 1, 0.045);
    // second option: prefer a different color family when one scores close to the leader
    if (top.length) {
      var lead = top[0];
      var alt = null;
      for (var k = 0; k < Math.min(scored.length, 200); k++) {
        var s2 = scored[k];
        if (s2.c.family !== lead.c.family && s2.score >= lead.score - 4 && F.dist(s2.c, lead.c) > 0.045) { alt = s2; break; }
      }
      if (!alt) alt = pickDiverse(scored, 2, 0.045)[1];
      if (alt) top.push(alt);
    }
    var bold = null;
    var boldCtx = Object.assign({}, a);
    if (a.depth === 'light') boldCtx.depth = 'mid';
    else if (a.depth === 'mid') boldCtx.depth = 'deep';
    else boldCtx.depth = 'deep';
    var ctx2 = { range: depthRange(boldCtx), temp: ctx.temp, families: ctx.families };
    var scored2 = [];
    for (i = 0; i < F.colors.length; i++) {
      c = F.colors[i];
      if (!usable(a, c)) continue;
      var r2 = scoreWall(boldCtx, c, ctx2);
      if (r2) scored2.push({ c: c, score: r2.score, why: r2.why });
    }
    scored2.sort(function (x, y) { return y.score - x.score; });
    var usedFam = top.map(function (t) { return t.c.family; });
    var firstOk = null;
    for (i = 0; i < Math.min(scored2.length, 300); i++) {
      var cand = scored2[i];
      if (!top.every(function (t) { return F.dist(t.c, cand.c) > 0.06 && t.c.name !== cand.c.name; })) continue;
      if (!firstOk) firstOk = cand;
      if (usedFam.indexOf(cand.c.family) < 0 && cand.score >= firstOk.score - 3) { bold = cand; break; }
      if (cand.score < firstOk.score - 3) break;
    }
    if (!bold) bold = firstOk;
    var mains = top.slice();
    if (bold) mains.push(bold);
    while (mains.length < 3 && scored.length > mains.length) {
      var more = pickDiverse(scored, mains.length + 1, 0.03);
      mains = more;
    }

    var usedFamilies = {};
    var surfaces = a.surfaces || [];
    var options = mains.map(function (m, idx) {
      var wall = m.c;
      var pool = sameBrandPool(a, wall.brand);
      var trim = pickTrim(a, wall, pool);
      var ceiling = pickCeiling(a, wall, trim.c, pool);
      var accent = pickAccent(a, wall, pool, ctx, usedFamilies);
      if (accent.c) usedFamilies[accent.c.family] = true;
      var why = m.why.slice(0, 3);
      if (idx === 2) why.unshift('a ' + (boldCtx.depth === 'deep' ? 'deeper, richer' : 'bolder, deeper') + ' take on your brief for a room with more character');
      var slots = {};
      var exterior = a.project === 'exterior';
      slots.walls = { c: wall, note: describe(wall, a) };
      if (surfaces.indexOf('trim') >= 0 || exterior) slots.trim = trim;
      if (!exterior && surfaces.indexOf('ceiling') >= 0) slots.ceiling = ceiling;
      if (surfaces.indexOf('accent') >= 0) slots.accent = accent;
      if (surfaces.indexOf('doors') >= 0) slots.doors = { c: accent.c && a.trimStyle !== 'contrast' ? (trim.c && trim.c.lrv > 70 ? trim.c : accent.c) : accent.c, note: 'Doors in a semi-gloss sheen for durability.' };
      if (surfaces.indexOf('cabinets') >= 0) slots.cabinets = { c: accent.c, note: 'A deeper tone for cabinets or built-ins grounds the room.' };
      // alternates for the main color: next-best nearby candidates
      var alts = scored.filter(function (s) {
        return s.c.key !== wall.key && s.c.name !== wall.name && F.dist(s.c, wall) < 0.06;
      }).slice(0, 4).map(function (s) { return s.c; });
      return {
        id: 'ABC'[idx],
        title: OPTION_TITLES[idx],
        why: why,
        slots: slots,
        alternates: alts
      };
    });
    return { options: options, ctx: ctx };
  }

  function crossMatch(c) {
    if (!c) return null;
    var other = c.brand === 'BM' ? 'SW' : 'BM';
    var m = F.nearest(c, { brand: other });
    return m ? { c: m.c, d: m.d, label: F.matchLabel(m.d) } : null;
  }

  var SHEEN = {
    walls: { interior: 'Eggshell or matte', exterior: 'Satin or flat' },
    trim: { interior: 'Semi-gloss', exterior: 'Satin or semi-gloss' },
    ceiling: { interior: 'Flat', exterior: 'Flat' },
    accent: { interior: 'Eggshell or matte', exterior: 'Semi-gloss (front door)' },
    doors: { interior: 'Semi-gloss', exterior: 'Semi-gloss' },
    cabinets: { interior: 'Satin or semi-gloss (cabinet enamel)', exterior: 'Satin' }
  };
  var SURFACE_LABEL = {
    walls: { en: 'Walls', pt: 'Paredes', ext: 'Body', extpt: 'Corpo da casa' },
    trim: { en: 'Trim', pt: 'Trim / rodapé', ext: 'Trim', extpt: 'Trim' },
    ceiling: { en: 'Ceiling', pt: 'Teto' },
    accent: { en: 'Accent wall', pt: 'Parede destaque', ext: 'Front door & shutters', extpt: 'Porta e venezianas' },
    doors: { en: 'Doors', pt: 'Portas' },
    cabinets: { en: 'Cabinets', pt: 'Armários' }
  };
  function surfaceLabel(s, project, lang) {
    var l = SURFACE_LABEL[s];
    if (!l) return s;
    if (project === 'exterior') return lang === 'pt' ? (l.extpt || l.pt) : (l.ext || l.en);
    return lang === 'pt' ? l.pt : l.en;
  }

  root.FTRecommend = {
    recommend: recommend, crossMatch: crossMatch, SHEEN: SHEEN, surfaceLabel: surfaceLabel,
    SURFACES: ['walls', 'trim', 'ceiling', 'accent', 'doors', 'cabinets'], ROOM_NOTES: ROOM_NOTES
  };
})(typeof window !== 'undefined' ? window : globalThis);
