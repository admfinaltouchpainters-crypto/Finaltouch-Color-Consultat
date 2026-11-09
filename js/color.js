/* Color science + paint catalog for the Final Touch Color Consultant.
   OKLab is used for every distance and classification because it tracks
   how people see color differences far better than RGB or HSL. */
(function (root) {
  'use strict';

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('').toUpperCase();
  }

  // sRGB 0..255 <-> linear 0..1, with a lookup table for speed (photos have millions of pixels)
  var LIN = new Float32Array(256);
  for (var i = 0; i < 256; i++) {
    var c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function toLinear(v) { return LIN[v | 0]; }
  function fromLinear(v) {
    if (v <= 0) return 0;
    if (v >= 1) return 255;
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  }

  function linToOklab(r, g, b, out) {
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    out = out || [0, 0, 0];
    out[0] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    out[1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return out;
  }
  function rgbToOklab(r, g, b, out) { return linToOklab(LIN[r], LIN[g], LIN[b], out); }
  function oklabToLin(L, a, b) {
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }
  function dist(p, q) {
    var dL = p.L - q.L, da = p.a - q.a, db = p.b - q.b;
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  /* ---------- Family + undertone classification ---------- */
  var FAMILY = {
    white:  { en: 'White',            pt: 'Branco' },
    cream:  { en: 'Cream / Off-white', pt: 'Creme / Off-white' },
    greige: { en: 'Greige',           pt: 'Greige (cinza-bege)' },
    gray:   { en: 'Gray',             pt: 'Cinza' },
    beige:  { en: 'Beige / Tan',      pt: 'Bege' },
    taupe:  { en: 'Taupe',            pt: 'Taupe (marrom-acinzentado)' },
    black:  { en: 'Charcoal / Black', pt: 'Grafite / Preto' },
    brown:  { en: 'Brown / Earth',    pt: 'Marrom / Terroso' },
    blue:   { en: 'Blue',             pt: 'Azul' },
    navy:   { en: 'Navy',             pt: 'Azul-marinho' },
    green:  { en: 'Green',            pt: 'Verde' },
    sage:   { en: 'Sage / Olive',     pt: 'Verde-sálvia / Oliva' },
    teal:   { en: 'Teal / Aqua',      pt: 'Azul-petróleo / Água' },
    yellow: { en: 'Yellow / Gold',    pt: 'Amarelo / Dourado' },
    orange: { en: 'Terracotta / Orange', pt: 'Terracota / Laranja' },
    pink:   { en: 'Blush / Pink',     pt: 'Rosa' },
    red:    { en: 'Red / Burgundy',   pt: 'Vermelho / Vinho' },
    purple: { en: 'Purple / Lavender', pt: 'Roxo / Lavanda' }
  };

  function hueIn(h, a, b) { return a <= b ? h >= a && h < b : h >= a || h < b; }

  function classify(c) {
    var L = c.L, C = c.C, h = c.h, lrv = c.lrv;
    var fam;
    if (C < 0.012) {
      fam = lrv >= 74 ? 'white' : L < 0.52 ? 'black' : 'gray';
    } else if (C < 0.042 || (L < 0.42 && C < 0.05)) {
      // neutrals with an undertone
      if (lrv >= 74) fam = hueIn(h, 40, 105) && C > 0.022 ? 'cream' : 'white';
      else if (L < 0.36) fam = hueIn(h, 200, 290) && C > 0.018 ? 'navy' : 'black';
      else if (hueIn(h, 225, 290)) fam = L < 0.5 && C > 0.018 ? 'navy' : (C > 0.02 ? 'blue' : 'gray');
      else if (hueIn(h, 150, 225)) fam = C > 0.015 ? (L > 0.78 ? 'blue' : 'teal') : 'gray';
      else if (hueIn(h, 105, 150)) fam = C > 0.016 ? 'sage' : 'gray';
      else if (hueIn(h, 290, 20)) fam = C > 0.03 && L > 0.6 ? 'pink' : 'taupe';
      else if (hueIn(h, 20, 60)) fam = C > 0.03 ? (L > 0.62 ? 'beige' : 'taupe') : (C < 0.02 ? 'greige' : 'taupe');
      else /* 60-105 yellowish */ fam = C < 0.024 ? 'greige' : (L < 0.55 ? 'taupe' : 'beige');
    } else {
      if (lrv >= 78 && C < 0.06 && hueIn(h, 40, 115)) fam = 'cream';
      else if (hueIn(h, 345, 40)) fam = L > 0.72 ? 'pink' : (L < 0.5 && C < 0.06 ? 'brown' : 'red');
      else if (hueIn(h, 40, 80)) fam = L < 0.5 && C < 0.12 ? 'brown' : (L > 0.82 && C < 0.08 ? 'beige' : 'orange');
      else if (hueIn(h, 80, 108)) fam = L < 0.55 ? (C < 0.09 ? 'brown' : 'sage') : (C < 0.06 ? 'beige' : 'yellow');
      else if (hueIn(h, 108, 175)) fam = C < 0.085 ? 'sage' : 'green';
      else if (hueIn(h, 175, 225)) fam = 'teal';
      else if (hueIn(h, 225, 285)) fam = L < 0.48 ? 'navy' : 'blue';
      else fam = L > 0.75 && C < 0.08 ? 'purple' : (hueIn(h, 320, 345) ? 'pink' : 'purple');
      if (fam === 'pink' && L < 0.6) fam = 'red';
    }
    // temperature
    var temp;
    if (C < 0.008) temp = 'neutral';
    else if (hueIn(h, 330, 120)) temp = 'warm';
    else if (hueIn(h, 160, 300)) temp = 'cool';
    else temp = 'neutral';
    // undertone (most useful for neutrals)
    var under;
    if (C < 0.008) under = 'true neutral';
    else if (hueIn(h, 330, 45)) under = 'pink/red';
    else if (hueIn(h, 45, 75)) under = 'warm beige';
    else if (hueIn(h, 75, 120)) under = 'yellow';
    else if (hueIn(h, 120, 185)) under = 'green';
    else if (hueIn(h, 185, 280)) under = 'blue';
    else under = 'violet';
    return { family: fam, temp: temp, undertone: under };
  }

  /* ---------- Catalog ---------- */
  var colors = [];
  var byKey = {};

  function addColor(brand, row) {
    var rgb = hexToRgb(row[2]);
    var lab = rgbToOklab(rgb[0], rgb[1], rgb[2]);
    var C = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
    var h = (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
    var lrv = row[3];
    if (lrv == null) {
      var Y = 0.2126 * LIN[rgb[0]] + 0.7152 * LIN[rgb[1]] + 0.0722 * LIN[rgb[2]];
      lrv = Math.round(Y * 1000) / 10;
    }
    var c = {
      key: brand + ':' + row[0], brand: brand, code: row[0], name: row[1], hex: '#' + row[2],
      rgb: rgb, lrv: lrv, popular: !!row[4],
      interior: brand === 'BM' ? true : !!row[5], exterior: brand === 'BM' ? true : !!row[6],
      locator: brand === 'SW' ? row[7] : '', coord: brand === 'SW' ? row[8] : [],
      L: lab[0], a: lab[1], b: lab[2], C: C, h: h
    };
    var cl = classify(c);
    c.family = cl.family; c.temp = cl.temp; c.undertone = cl.undertone;
    c.search = (c.name + ' ' + c.code + ' ' + c.code.replace(/[\s-]/g, '')).toLowerCase();
    colors.push(c);
    byKey[c.key] = c;
  }

  function loadCatalog(bmRows, swRows) {
    colors.length = 0;
    (bmRows || []).forEach(function (r) { addColor('BM', r); });
    (swRows || []).forEach(function (r) { addColor('SW', r); });
    return colors;
  }

  function get(key) { return byKey[key] || null; }

  function nearest(target, opts) {
    opts = opts || {};
    var best = [], n = opts.n || 1;
    for (var i = 0; i < colors.length; i++) {
      var c = colors[i];
      if (opts.brand && c.brand !== opts.brand) continue;
      if (opts.exclude && opts.exclude === c.key) continue;
      if (opts.filter && !opts.filter(c)) continue;
      var d = dist(target, c);
      if (best.length < n || d < best[best.length - 1].d) {
        best.push({ c: c, d: d });
        best.sort(function (x, y) { return x.d - y.d; });
        if (best.length > n) best.pop();
      }
    }
    return n === 1 ? (best[0] || null) : best;
  }

  function matchLabel(d) {
    // d is an OKLab distance. ~0.02 is barely visible on a wall chip.
    if (d < 0.012) return 'Very close match';
    if (d < 0.025) return 'Close match';
    if (d < 0.045) return 'Similar';
    return 'Loose match';
  }

  function lrvWord(lrv) {
    if (lrv >= 80) return 'very bright';
    if (lrv >= 60) return 'light';
    if (lrv >= 40) return 'mid-tone';
    if (lrv >= 20) return 'deep';
    return 'very deep';
  }

  function textOn(c) {
    // readable text color on a swatch
    return c.L > 0.68 ? '#1b1f24' : '#ffffff';
  }

  function brandName(b) { return b === 'BM' ? 'Benjamin Moore' : 'Sherwin-Williams'; }

  root.FTColor = {
    hexToRgb: hexToRgb, rgbToHex: rgbToHex, toLinear: toLinear, fromLinear: fromLinear, LIN: LIN,
    rgbToOklab: rgbToOklab, linToOklab: linToOklab, oklabToLin: oklabToLin, dist: dist,
    classify: classify, FAMILY: FAMILY, colors: colors, loadCatalog: loadCatalog, get: get,
    nearest: nearest, matchLabel: matchLabel, lrvWord: lrvWord, textOn: textOn, brandName: brandName
  };
})(typeof window !== 'undefined' ? window : globalThis);
