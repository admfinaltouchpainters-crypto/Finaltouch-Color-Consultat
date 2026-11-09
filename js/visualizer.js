/* Photo visualizer: mark walls / trim / ceiling on a real photo and repaint
   only those pixels. Lighting is preserved by keeping each pixel's brightness
   relative to the surface average (paint color x original shading), so
   shadows, corners and texture stay exactly where they were. */
(function (root) {
  'use strict';
  var F = root.FTColor;
  var MAX_SIDE = 1600;

  var SURFACE_TINT = {
    walls: [226, 69, 60], trim: [60, 132, 226], ceiling: [240, 196, 40],
    accent: [160, 70, 220], doors: [40, 190, 120], cabinets: [240, 120, 30]
  };

  /* ---------- loading ---------- */
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('Could not read this image. Try a JPG or PNG.')); };
      img.src = src;
    });
  }

  function fileToPhoto(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () {
        loadImage(fr.result).then(function (img) {
          var w = img.naturalWidth, h = img.naturalHeight;
          var k = Math.min(1, MAX_SIDE / Math.max(w, h));
          var cw = Math.round(w * k), ch = Math.round(h * k);
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
          res({
            id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: file.name.replace(/\.[^.]+$/, ''), w: cw, h: ch,
            src: cv.toDataURL('image/jpeg', 0.92), masks: {}, renders: {}, ai: {}, useAi: {}
          });
        }, rej);
      };
      fr.onerror = function () { rej(new Error('Could not read the file.')); };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- per-photo working data ---------- */
  function Work(photo, img) {
    var w = photo.w, h = photo.h, n = w * h;
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    this.orig = ctx.getImageData(0, 0, w, h);
    var d = this.orig.data;
    this.w = w; this.h = h; this.n = n;
    this.Y = new Float32Array(n);
    this.Yb = new Float32Array(n);   // 3x3 smoothed luminance (less camera noise)
    this.lab = new Float32Array(n * 3);
    // light 3x3 box blur before Lab so camera noise does not stop the fill
    var tmp = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var r = F.LIN[d[i * 4]], g = F.LIN[d[i * 4 + 1]], b = F.LIN[d[i * 4 + 2]];
      tmp[i * 3] = r; tmp[i * 3 + 1] = g; tmp[i * 3 + 2] = b;
      this.Y[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    var out = [0, 0, 0];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var sr = 0, sg = 0, sb = 0, cnt = 0;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx; if (xx < 0 || xx >= w) continue;
            var j = (yy * w + xx) * 3;
            sr += tmp[j]; sg += tmp[j + 1]; sb += tmp[j + 2]; cnt++;
          }
        }
        F.linToOklab(sr / cnt, sg / cnt, sb / cnt, out);
        var k = (y * w + x) * 3;
        this.lab[k] = out[0]; this.lab[k + 1] = out[1]; this.lab[k + 2] = out[2];
        this.Yb[y * w + x] = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb) / cnt;
      }
    }
    this.masks = {};
    this.version = {};
    this.cache = {};
    var self = this;
    Object.keys(photo.masks || {}).forEach(function (s) {
      var m = photo.masks[s];
      self.masks[s] = m instanceof Uint8Array && m.length === n ? m : decodeMask(m, n);
      self.version[s] = 1;
    });
  }

  Work.prototype.mask = function (s) {
    if (!this.masks[s]) { this.masks[s] = new Uint8Array(this.n); this.version[s] = 0; }
    return this.masks[s];
  };
  Work.prototype.touch = function (s) { this.version[s] = (this.version[s] || 0) + 1; };

  // Each pixel belongs to one surface: claiming it for one clears the others.
  Work.prototype.claim = function (s, idxList) {
    var m = this.mask(s), others = [];
    for (var k in this.masks) if (k !== s) others.push(k);
    for (var i = 0; i < idxList.length; i++) {
      var p = idxList[i];
      m[p] = 255;
      for (var o = 0; o < others.length; o++) this.masks[others[o]][p] = 0;
    }
    this.touch(s);
    for (var o2 = 0; o2 < others.length; o2++) this.touch(others[o2]);
  };

  /* Smart fill: grow from the clicked pixel while colors stay close to the
     seed AND there is no sharp edge between neighbors. */
  Work.prototype.smartFill = function (sx, sy, tolerance, surface) {
    var w = this.w, h = this.h, lab = this.lab;
    var tol = 0.02 + tolerance / 100 * 0.16;         // distance from seed color
    var step = Math.max(0.008, tol * 0.22);           // max jump between neighbors (edges)
    var seed = (sy * w + sx);
    var L0 = lab[seed * 3], a0 = lab[seed * 3 + 1], b0 = lab[seed * 3 + 2];
    var seen = new Uint8Array(this.n);
    // pixels already marked as another surface are walls the fill cannot cross
    for (var ms in this.masks) {
      if (ms === surface) continue;
      var om = this.masks[ms];
      for (var z = 0; z < om.length; z++) if (om[z]) seen[z] = 1;
    }
    var blockedSeed = seen[seed];
    seen[seed] = 0;
    var stack = new Int32Array(this.n);
    var sp = 0, out = [];
    if (blockedSeed) return [];
    stack[sp++] = seed; seen[seed] = 1;
    // lightness gets less weight so shading across a wall does not stop the fill
    var wl = 0.3, wc = 4;
    while (sp > 0) {
      var p = stack[--sp];
      out.push(p);
      var px = p % w, py = (p / w) | 0;
      var pL = lab[p * 3], pa = lab[p * 3 + 1], pb = lab[p * 3 + 2];
      for (var dir = 0; dir < 4; dir++) {
        var nx = px + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
        var ny = py + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var q = ny * w + nx;
        if (seen[q]) continue;
        var qL = lab[q * 3], qa = lab[q * 3 + 1], qb = lab[q * 3 + 2];
        // hue/chroma differences count more than brightness: paint color is constant across a
        // surface while light varies, so a change in hue is the strongest sign of an edge
        var e1 = (qL - pL) * (qL - pL) + wc * ((qa - pa) * (qa - pa) + (qb - pb) * (qb - pb));
        if (e1 > step * step) continue;
        var dl = (qL - L0) * wl, e2 = dl * dl + wc * ((qa - a0) * (qa - a0) + (qb - b0) * (qb - b0));
        if (e2 > tol * tol) continue;
        seen[q] = 1;
        stack[sp++] = q;
      }
    }
    // close pinholes: include pixels with >= 3 of 4 filled neighbors
    var extra = [];
    for (var i = 0; i < out.length; i++) {
      var pp = out[i], x0 = pp % w, y0 = (pp / w) | 0;
      for (var d2 = 0; d2 < 4; d2++) {
        var ax = x0 + (d2 === 0 ? 1 : d2 === 1 ? -1 : 0), ay = y0 + (d2 === 2 ? 1 : d2 === 3 ? -1 : 0);
        if (ax < 1 || ay < 1 || ax >= w - 1 || ay >= h - 1) continue;
        var r = ay * w + ax;
        if (seen[r]) continue;
        var c = seen[r - 1] + seen[r + 1] + seen[r - w] + seen[r + w];
        if (c >= 3) { seen[r] = 1; extra.push(r); }
      }
    }
    return out.concat(extra);
  };

  Work.prototype.brush = function (s, x0, y0, x1, y1, radius, erase) {
    var w = this.w, h = this.h, m = this.mask(s);
    var others = [];
    if (!erase) for (var k in this.masks) if (k !== s) others.push(this.masks[k]);
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(len / Math.max(1, radius / 3)));
    var r2 = radius * radius;
    for (var t = 0; t <= steps; t++) {
      var cx = x0 + dx * t / steps, cy = y0 + dy * t / steps;
      var xa = Math.max(0, Math.floor(cx - radius)), xb = Math.min(w - 1, Math.ceil(cx + radius));
      var ya = Math.max(0, Math.floor(cy - radius)), yb = Math.min(h - 1, Math.ceil(cy + radius));
      for (var y = ya; y <= yb; y++) {
        for (var x = xa; x <= xb; x++) {
          var ddx = x - cx, ddy = y - cy;
          if (ddx * ddx + ddy * ddy > r2) continue;
          var p = y * w + x;
          if (erase) { m[p] = 0; }
          else {
            m[p] = 255;
            for (var o = 0; o < others.length; o++) others[o][p] = 0;
          }
        }
      }
    }
    this.touch(s);
    if (!erase) for (var k2 in this.masks) if (k2 !== s) this.touch(k2);
  };

  // feathered alpha (0..1) for soft, natural edges; cached per mask version
  Work.prototype.alpha = function (s) {
    var v = this.version[s];
    var c = this.cache[s];
    if (c && c.v === v) return c;
    var m = this.masks[s], w = this.w, h = this.h, n = this.n;
    var a = new Float32Array(n), tmp = new Float32Array(n);
    var R = 1;
    for (var y = 0; y < h; y++) {
      var row = y * w;
      for (var x = 0; x < w; x++) {
        var sum = 0, cnt = 0;
        for (var d = -R; d <= R; d++) { var xx = x + d; if (xx >= 0 && xx < w) { sum += m[row + xx]; cnt++; } }
        tmp[row + x] = sum / cnt;
      }
    }
    var sumY = 0, sumW = 0, any = false;
    for (var y2 = 0; y2 < h; y2++) {
      for (var x2 = 0; x2 < w; x2++) {
        var s2 = 0, c2 = 0;
        for (var d2 = -R; d2 <= R; d2++) { var yy = y2 + d2; if (yy >= 0 && yy < h) { s2 += tmp[yy * w + x2]; c2++; } }
        var al = s2 / c2 / 255;
        var p = y2 * w + x2;
        a[p] = al;
        if (m[p]) { sumY += this.Yb[p]; sumW++; any = true; }
      }
    }
    // reference brightness: average of the surface (median-ish robust mean)
    var meanY = sumW ? sumY / sumW : 0.5;
    c = { v: v, a: a, meanY: meanY, any: any, count: sumW };
    this.cache[s] = c;
    return c;
  };

  /* Recolor. colors = { walls: '#RRGGBB', trim: ..., ... } */
  Work.prototype.render = function (colors, outImageData) {
    var src = this.orig.data, n = this.n;
    var out = outImageData || new ImageData(this.w, this.h);
    var o = out.data;
    o.set(src);
    var self = this;
    Object.keys(colors).forEach(function (s) {
      var hex = colors[s];
      if (!hex || !self.masks[s]) return;
      var A = self.alpha(s);
      if (!A.any) return;
      var rgb = F.hexToRgb(hex);
      var tr = F.LIN[rgb[0]], tg = F.LIN[rgb[1]], tb = F.LIN[rgb[2]];
      var meanY = Math.max(0.002, A.meanY);
      var a = A.a, Y = self.Y, Yb = self.Yb;
      // On dark originals, fine detail is mostly sensor noise; amplifying it onto a light
      // color looks grainy, so keep less of it there.
      var detail = Math.max(0.25, Math.min(1, meanY / 0.15));
      for (var p = 0; p < n; p++) {
        var al = a[p];
        if (al <= 0.003) continue;
        var sh = (Yb[p] + (Y[p] - Yb[p]) * detail) / meanY;   // shading relative to the surface
        if (sh < 0) sh = 0;
        if (sh > 2.5) sh = 2.5;
        var r = tr * sh, g = tg * sh, b = tb * sh;
        // soft roll-off instead of hard clipping in highlights
        var mx = Math.max(r, g, b);
        if (mx > 1) { var k = 1 / mx; r *= k; g *= k; b *= k; }
        var i4 = p * 4;
        o[i4] = o[i4] + (F.fromLinear(r) - o[i4]) * al;
        o[i4 + 1] = o[i4 + 1] + (F.fromLinear(g) - o[i4 + 1]) * al;
        o[i4 + 2] = o[i4 + 2] + (F.fromLinear(b) - o[i4 + 2]) * al;
      }
    });
    return out;
  };

  Work.prototype.overlay = function (activeSurface, outImageData) {
    var src = this.orig.data, n = this.n;
    var out = outImageData || new ImageData(this.w, this.h);
    var o = out.data;
    o.set(src);
    for (var s in this.masks) {
      var m = this.masks[s], t = SURFACE_TINT[s] || [255, 0, 0];
      var k = s === activeSurface ? 0.55 : 0.3;
      for (var p = 0; p < n; p++) {
        if (!m[p]) continue;
        var i4 = p * 4;
        o[i4] += (t[0] - o[i4]) * k; o[i4 + 1] += (t[1] - o[i4 + 1]) * k; o[i4 + 2] += (t[2] - o[i4 + 2]) * k;
      }
    }
    return out;
  };

  Work.prototype.toDataURL = function (colors, quality) {
    var cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    var ctx = cv.getContext('2d');
    ctx.putImageData(this.render(colors), 0, 0);
    return cv.toDataURL('image/jpeg', quality || 0.9);
  };

  Work.prototype.coverage = function (s) {
    var m = this.masks[s]; if (!m) return 0;
    var c = 0; for (var i = 0; i < m.length; i++) if (m[i]) c++;
    return c / this.n;
  };

  /* Masks are stored run-length encoded so projects stay small. */
  function encodeMask(m) {
    var runs = [], cur = 0, len = 0;
    for (var i = 0; i < m.length; i++) {
      var v = m[i] ? 1 : 0;
      if (v === cur) len++;
      else { runs.push(len); cur = v; len = 1; }
    }
    runs.push(len);
    return { rle: runs };
  }
  function decodeMask(enc, n) {
    var m = new Uint8Array(n);
    if (!enc || !enc.rle) return m;
    var p = 0, v = 0;
    for (var i = 0; i < enc.rle.length; i++) {
      var len = enc.rle[i];
      if (v) m.fill(255, p, Math.min(n, p + len));
      p += len; v = 1 - v;
    }
    return m;
  }

  root.FTVisualizer = {
    fileToPhoto: fileToPhoto, loadImage: loadImage, Work: Work, SURFACE_TINT: SURFACE_TINT,
    encodeMask: encodeMask, decodeMask: decodeMask, MAX_SIDE: MAX_SIDE
  };
})(typeof window !== 'undefined' ? window : globalThis);
