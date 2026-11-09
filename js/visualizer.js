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
     seed AND there is no sharp edge between neighbors. Thin lines (panel
     moldings, siding gaps, grout) are bridged when the same color continues
     on the other side, and small enclosed holes of the same color are closed. */
  Work.prototype.smartFill = function (sx, sy, tolerance, surface) {
    var w = this.w, h = this.h, n = this.n, lab = this.lab;
    var tol = 0.02 + tolerance / 100 * 0.16;         // distance from seed color
    var step = Math.max(0.008, tol * 0.22);           // max jump between neighbors (edges)
    var seed = (sy * w + sx);
    var L0 = lab[seed * 3], a0 = lab[seed * 3 + 1], b0 = lab[seed * 3 + 2];
    // pixels already marked as another surface are walls the fill cannot cross
    var blocked = new Uint8Array(n);
    for (var ms in this.masks) {
      if (ms === surface) continue;
      var om = this.masks[ms];
      for (var z = 0; z < n; z++) if (om[z]) blocked[z] = 1;
    }
    if (blocked[seed]) return [];
    var inR = new Uint8Array(n);       // in the region
    var seen = new Uint8Array(n);      // queued
    var stack = new Int32Array(n);
    var sp = 0, out = [];
    // lightness gets less weight so shading across a wall does not stop the fill;
    // hue/chroma count more: paint color is constant while light varies
    var wl = 0.3, wc = 4, tol2 = tol * tol, step2 = step * step, bridgeTol2 = tol2 * 0.64;
    function seedDist2(q) {
      var dl = (lab[q * 3] - L0) * wl, da = lab[q * 3 + 1] - a0, db = lab[q * 3 + 2] - b0;
      return dl * dl + wc * (da * da + db * db);
    }
    function stepDist2(p, q) {
      var dL = lab[q * 3] - lab[p * 3], da = lab[q * 3 + 1] - lab[p * 3 + 1], db = lab[q * 3 + 2] - lab[p * 3 + 2];
      return dL * dL + wc * (da * da + db * db);
    }
    function add(q) { seen[q] = 1; stack[sp++] = q; }
    add(seed);
    var DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
    while (sp > 0) {
      var p = stack[--sp];
      if (inR[p]) continue;
      inR[p] = 1; out.push(p);
      var px = p % w, py = (p / w) | 0;
      for (var dir = 0; dir < 4; dir++) {
        var nx = px + DX[dir], ny = py + DY[dir];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var q = ny * w + nx;
        if (seen[q] || blocked[q]) continue;
        if (stepDist2(p, q) <= step2 && seedDist2(q) <= tol2) { add(q); continue; }
        // bridge a thin line: look 2..4 px further in the same direction
        for (var k = 2; k <= 4; k++) {
          var bx = px + DX[dir] * k, by = py + DY[dir] * k;
          if (bx < 1 || by < 1 || bx >= w - 1 || by >= h - 1) break;
          var r = by * w + bx;
          if (blocked[r]) break;
          if (seen[r]) break;
          var r2 = r + DY[dir] * w + DX[dir];
          // same paint on both sides of the line: close to the seed AND to the pixel before the line
          if (seedDist2(r) <= bridgeTol2 && stepDist2(r, r2) <= step2 && stepDist2(p, r) <= step2 * 2.25) {
            var okPath = true;
            for (var j = 1; j < k; j++) { if (blocked[(py + DY[dir] * j) * w + px + DX[dir] * j]) { okPath = false; break; } }
            if (!okPath) break;
            for (var j2 = 1; j2 < k; j2++) {
              var mid = (py + DY[dir] * j2) * w + px + DX[dir] * j2;
              if (!inR[mid]) { inR[mid] = 1; seen[mid] = 1; out.push(mid); }
            }
            add(r);
            break;
          }
        }
      }
    }
    // close small enclosed holes whose color matches the surface (reflections, texture);
    // objects hanging on the wall (frames, clocks) differ in color and stay out
    if (out.length > 200) {
      var x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (var i = 0; i < out.length; i++) {
        var ox = out[i] % w, oy = (out[i] / w) | 0;
        if (ox < x0) x0 = ox; if (ox > x1) x1 = ox; if (oy < y0) y0 = oy; if (oy > y1) y1 = oy;
      }
      var outside = new Uint8Array(n), qs = new Int32Array(n), qh = 0, qt = 0;
      function pushOut(q) { if (!inR[q] && !outside[q]) { outside[q] = 1; qs[qt++] = q; } }
      for (var xx = x0; xx <= x1; xx++) { pushOut(y0 * w + xx); pushOut(y1 * w + xx); }
      for (var yy = y0; yy <= y1; yy++) { pushOut(yy * w + x0); pushOut(yy * w + x1); }
      while (qh < qt) {
        var o = qs[qh++], ox2 = o % w, oy2 = (o / w) | 0;
        if (ox2 > x0) pushOut(o - 1); if (ox2 < x1) pushOut(o + 1);
        if (oy2 > y0) pushOut(o - w); if (oy2 < y1) pushOut(o + w);
      }
      var maxHole = Math.max(60, out.length * 0.02), lab2 = new Uint8Array(n);
      for (var yy2 = y0; yy2 <= y1; yy2++) {
        for (var xx2 = x0; xx2 <= x1; xx2++) {
          var s0 = yy2 * w + xx2;
          if (inR[s0] || outside[s0] || lab2[s0]) continue;
          // collect this hole
          var comp = [s0], ci = 0, sum = 0, bad = false; lab2[s0] = 1;
          while (ci < comp.length) {
            var c = comp[ci++]; sum += seedDist2(c); if (blocked[c]) bad = true;
            var cx = c % w, cy = (c / w) | 0;
            var nb = [cx > x0 ? c - 1 : -1, cx < x1 ? c + 1 : -1, cy > y0 ? c - w : -1, cy < y1 ? c + w : -1];
            for (var t = 0; t < 4; t++) {
              var u = nb[t];
              if (u < 0 || inR[u] || outside[u] || lab2[u]) continue;
              lab2[u] = 1; comp.push(u);
            }
            if (comp.length > maxHole) bad = true;
          }
          if (!bad && sum / comp.length <= tol2 * 2.25) {
            for (var t2 = 0; t2 < comp.length; t2++) { inR[comp[t2]] = 1; out.push(comp[t2]); }
          }
        }
      }
    }
    return out;
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

  var SMOOTH_SURFACES = { trim: 1, doors: 1, cabinets: 1 };

  // 9x9 box-blurred luminance, computed once: keeps panel shadows, drops wood grain
  Work.prototype.wideBlurY = function () {
    if (this._wide) return this._wide;
    var w = this.w, h = this.h, src = this.Yb, tmp = new Float32Array(this.n), out = new Float32Array(this.n), R = 4;
    for (var y = 0; y < h; y++) {
      var row = y * w, acc = 0, cnt = 0;
      for (var x = -R; x < w; x++) {
        if (x + R < w) { acc += src[row + x + R]; cnt++; }
        if (x - R - 1 >= 0) { acc -= src[row + x - R - 1]; cnt--; }
        if (x >= 0) tmp[row + x] = acc / cnt;
      }
    }
    for (var x2 = 0; x2 < w; x2++) {
      var acc2 = 0, cnt2 = 0;
      for (var y2 = -R; y2 < h; y2++) {
        if (y2 + R < h) { acc2 += tmp[(y2 + R) * w + x2]; cnt2++; }
        if (y2 - R - 1 >= 0) { acc2 -= tmp[(y2 - R - 1) * w + x2]; cnt2--; }
        if (y2 >= 0) out[y2 * w + x2] = acc2 / cnt2;
      }
    }
    this._wide = out;
    return out;
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
      var smooth = SMOOTH_SURFACES[s] ? self.wideBlurY() : null;
      for (var p = 0; p < n; p++) {
        var al = a[p];
        if (al <= 0.003) continue;
        var base = smooth ? smooth[p] + (Yb[p] - smooth[p]) * 0.45 : Yb[p];
        var sh = (base + (Y[p] - Yb[p]) * (smooth ? detail * 0.25 : detail)) / meanY;   // shading relative to the surface
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
