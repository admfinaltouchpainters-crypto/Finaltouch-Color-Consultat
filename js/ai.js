/* AI helpers using Google's Gemini image model.
   The key is stored only in this browser (localStorage) and is sent only to
   generativelanguage.googleapis.com.

   detectSurfaces(): the main flow. Gemini returns the photo with each surface
   painted a flat "marker" color (walls red, trim blue...). The app turns those
   markers into masks and paints the real paint colors itself, so the colors are
   exact and everything else in the photo stays untouched. One call per photo
   covers all three options. */
(function (root) {
  'use strict';
  var R = root.FTRecommend;
  var ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
  var DEFAULT_MODEL = 'gemini-2.5-flash-image';

  // marker colors the model paints each surface with
  var MARKERS = {
    walls: { rgb: [255, 0, 0], name: 'pure red (#FF0000)' },
    trim: { rgb: [0, 0, 255], name: 'pure blue (#0000FF)' },
    ceiling: { rgb: [0, 255, 0], name: 'pure green (#00FF00)' },
    doors: { rgb: [255, 255, 0], name: 'pure yellow (#FFFF00)' },
    cabinets: { rgb: [255, 0, 255], name: 'pure magenta (#FF00FF)' },
    accent: { rgb: [0, 255, 255], name: 'pure cyan (#00FFFF)' }
  };
  var DESCRIBE = {
    interior: {
      walls: 'every painted WALL surface (all walls, including walls seen through doorways)',
      trim: 'all TRIM: baseboards, crown molding, door casings and window casings',
      ceiling: 'the CEILING',
      doors: 'interior DOOR slabs (the doors themselves, not the casings)',
      cabinets: 'CABINETS and built-in cabinetry (doors, drawer fronts and boxes)'
    },
    exterior: {
      walls: 'the house BODY: siding, clapboard, shingles, stucco or painted brick',
      trim: 'all exterior TRIM: fascia, soffits, corner boards and window/door casings',
      accent: 'the FRONT DOOR and SHUTTERS',
      doors: 'garage and other exterior DOORS'
    }
  };

  function dataUrlParts(dataUrl) {
    var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
    return m ? { mime: m[1], data: m[2] } : null;
  }

  // smaller upload = faster and cheaper; masks are scaled back to the full photo
  function downscale(src, maxSide) {
    return root.FTVisualizer.loadImage(src).then(function (img) {
      var k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      var cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', 0.9);
    });
  }

  function friendlyError(err, status, msg) {
    msg = msg || (err && err.message) || '';
    if (err && err.name === 'TypeError') {
      return 'Não consegui falar com a IA do Google. Confira a internet. Dentro do Claude a IA não funciona: abra o app pelo site (GitHub Pages) ou pelo arquivo index.html.';
    }
    if (/API key not valid|API_KEY_INVALID/i.test(msg)) return 'A chave do Gemini não é válida. Copie de novo em aistudio.google.com e cole em Configurações.';
    if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) return 'A cota da IA acabou por agora. Espere um minuto ou confira o plano/faturamento da chave no Google AI Studio.';
    if (status === 404 || /not found|is not supported/i.test(msg)) return 'O modelo de IA configurado não existe mais. Em Configurações, use: ' + DEFAULT_MODEL + '.';
    if (/billing|FAILED_PRECONDITION/i.test(msg)) return 'A chave precisa de faturamento ativo no Google AI Studio para gerar imagens.';
    if (/SAFETY|blocked/i.test(msg)) return 'A IA recusou esta foto. Tente outra foto do ambiente.';
    return 'A IA não conseguiu processar a foto (' + (msg || 'erro desconhecido').slice(0, 160) + ').';
  }

  function callImageModel(prompt, imageDataUrl, settings) {
    var key = (settings.geminiKey || '').trim();
    if (!key) return Promise.reject(new Error('Coloque a chave do Gemini em Configurações.'));
    var model = (settings.geminiModel || DEFAULT_MODEL).trim();
    var img = dataUrlParts(imageDataUrl);
    var body = {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: img.mime, data: img.data } }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    };
    var status = 0;
    return fetch(ENDPOINT + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body)
    }).then(function (res) {
      status = res.status;
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) throw new Error(friendlyError(null, status, (j.error && (j.error.message + ' ' + (j.error.status || ''))) || ('HTTP ' + status)));
        var cand = (j.candidates || [])[0] || {};
        var parts = (cand.content || {}).parts || [];
        for (var i = 0; i < parts.length; i++) {
          var d = parts[i].inlineData || parts[i].inline_data;
          if (d && d.data) return 'data:' + (d.mimeType || d.mime_type || 'image/png') + ';base64,' + d.data;
        }
        var why = cand.finishReason || (j.promptFeedback && j.promptFeedback.blockReason) || '';
        throw new Error(friendlyError(null, status, 'no image ' + why + ' ' + parts.map(function (p) { return p.text || ''; }).join(' ')));
      });
    }, function (err) { throw new Error(friendlyError(err, 0)); });
  }

  function markerPrompt(surfaces, project) {
    var kind = project === 'exterior' ? 'exterior' : 'interior';
    var lines = surfaces.filter(function (s) { return DESCRIBE[kind][s] && MARKERS[s]; }).map(function (s) {
      return '- Paint ' + DESCRIBE[kind][s] + ' solid ' + MARKERS[s].name + '.';
    });
    return [
      'You are making a paint-area map of this ' + (kind === 'exterior' ? 'house exterior' : 'room') + ' photo for a painting contractor.',
      'Edit the photo like this:',
      lines.join('\n'),
      'Use completely flat, solid colors with no shading, texture, gradients or highlights on those areas.',
      'Fill each area right up to its real edges. Do not paint anything in front of those surfaces: furniture, art, lamps, plants, curtains, windows, glass, outlets and switches keep their original look.',
      'Keep everything else exactly as in the original photo: same framing, same camera angle, same size. Do not add, remove or move anything.',
      'Return only the edited image.'
    ].join('\n');
  }

  function detectSurfaces(photoSrc, surfaces, project, settings) {
    var surf = surfaces.filter(function (s) { return MARKERS[s] && DESCRIBE[project === 'exterior' ? 'exterior' : 'interior'][s]; });
    if (!surf.length) surf = ['walls'];
    return downscale(photoSrc, 1280).then(function (small) {
      return callImageModel(markerPrompt(surf, project), small, settings);
    }).then(function (url) { return { marker: url, surfaces: surf }; });
  }

  /* Free-form AI repaint (kept as an extra: the model paints the colors itself). */
  function buildPrompt(option, project) {
    var lines = [];
    Object.keys(option.slots).forEach(function (s) {
      var c = option.slots[s].c;
      if (!c) return;
      lines.push('- ' + R.surfaceLabel(s, project, 'en') + ': ' + root.FTColor.brandName(c.brand) + ' "' + c.name + '" ' + c.code + ' (hex ' + c.hex + ')');
    });
    return [
      'Edit this photo of a ' + (project === 'exterior' ? 'house exterior' : 'room') + ' as a realistic paint color visualization.',
      'Repaint ONLY these surfaces with flat, realistic paint in the exact colors listed:',
      lines.join('\n'),
      'Keep the original lighting, shadows, reflections and surface texture on the repainted surfaces.',
      'Do not change anything else. Do not add, remove or move any object. Return only the edited photo.'
    ].join('\n');
  }
  function repaint(photoSrc, option, project, settings) {
    return downscale(photoSrc, 1536).then(function (small) { return callImageModel(buildPrompt(option, project), small, settings); });
  }

  /* ---------- Claude (inside the Claude app, no key needed) ----------
     The page asks Claude itself: it sends the photo with a labeled grid and
     gets back points that sit on each surface. The app grows each point to
     the surface's real edges. */
  var claudeSample = null, claudeChecked = null;
  function claudeProvider() {
    if (claudeChecked) return claudeChecked;
    claudeChecked = new Promise(function (res) {
      try {
        if (!root.claude || typeof root.claude.use !== 'function') return res(null);
        root.claude.use('sample').then(function (s) {
          if (!s) return res(null);
          s.limits().then(function (lim) {
            if (lim && lim.images) { claudeSample = s; res(s); } else res(null);
          }, function () { res(null); });
        }, function () { res(null); });
      } catch (e) { res(null); }
    });
    return claudeChecked;
  }

  // photo with a labeled 0-100 grid, so Claude can point precisely
  function gridImage(src) {
    return root.FTVisualizer.loadImage(src).then(function (img) {
      var k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var g = cv.getContext('2d');
      g.drawImage(img, 0, 0, w, h);
      g.lineWidth = 1;
      var fs = Math.max(11, Math.round(Math.min(w, h) / 50));
      g.font = 'bold ' + fs + 'px sans-serif';
      for (var i = 1; i < 10; i++) {
        var x = Math.round(w * i / 10) + 0.5, y = Math.round(h * i / 10) + 0.5;
        g.strokeStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.moveTo(x + 1, 0); g.lineTo(x + 1, h); g.moveTo(0, y + 1); g.lineTo(w, y + 1); g.stroke();
        g.strokeStyle = 'rgba(255,235,0,.85)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
        var lab = String(i * 10);
        [[x + 3, fs + 2], [3, y - 3]].forEach(function (p) {
          g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(lab, p[0], p[1]);
          g.fillStyle = '#ffeb00'; g.fillText(lab, p[0], p[1]); g.lineWidth = 1;
        });
      }
      return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, 'image/jpeg', 0.9); });
    });
  }

  function pointsPrompt(surfaces, project) {
    var kind = project === 'exterior' ? 'exterior' : 'interior';
    var list = surfaces.filter(function (s) { return DESCRIBE[kind][s]; });
    var lines = list.map(function (s) { return '- "' + s + '": ' + DESCRIBE[kind][s]; });
    var example = {}; list.forEach(function (s, i) { example[s] = i === 0 ? [[12, 30], [55, 22]] : []; });
    return [
      'This is a photo of a ' + (kind === 'exterior' ? 'house exterior' : 'room') + ' with a coordinate grid drawn on top.',
      'x goes from 0 (left edge) to 100 (right edge), y from 0 (top edge) to 100 (bottom edge); the yellow grid lines are every 10 units and are labeled.',
      'A painting contractor\'s software will recolor these surfaces. For each one, give points (x, y in grid units, decimals allowed) that land ON that surface:',
      lines.join('\n'),
      'Rules:',
      '- Only where the painted surface itself is visible: never on furniture, art, frames, mirrors, lamps, windows, glass, curtains, plants, outlets, switches or the floor.',
      '- Keep every point at least 2 units away from any edge, corner or object.',
      '- Cover every separate visible part of the surface (each wall plane; the wall above, below and beside furniture; each strip of trim; each door), with 3 to 6 points spread over big areas, including areas in shadow and in bright light. At most 20 points per surface.',
      '- If a surface is not visible in this photo, give an empty list.',
      'Reply with only JSON in exactly this shape: ' + JSON.stringify(example)
    ].join('\n');
  }

  function claudeError(e) {
    var c = e && e.code;
    if (c === 'not_granted') return 'O app não tem permissão para usar o Claude. Autorize quando o Claude perguntar (ou no menu de permissões do artifact) e toque em "Detectar áreas com IA".';
    if (c === 'rate_limited') return 'O Claude está com limite de uso agora. Espere um pouco e toque em "Detectar áreas com IA".';
    if (c === 'image_rejected') return 'O Claude não aceitou esta foto. Tente uma foto JPG ou PNG menor.';
    if (c === 'invalid_json' || c === 'empty_completion') return 'O Claude não devolveu as áreas desta vez. Toque em "Detectar áreas com IA" para tentar de novo.';
    if (c === 'refused') return 'O Claude recusou esta foto. Tente outra foto do ambiente.';
    if (c === 'sampling_disabled' || c === 'capability_disabled' || c === 'images_unavailable') return 'O Claude não está disponível para esta conta neste app. Marque as paredes com a Seleção inteligente.';
    if (c === 'session_expired') return 'Sua sessão do Claude expirou. Entre de novo e tente outra vez.';
    return 'Não consegui falar com o Claude agora. Tente "Detectar áreas com IA" de novo em instantes.';
  }

  function claudePoints(photoSrc, surfaces, project) {
    return claudeProvider().then(function (s) {
      if (!s) throw new Error('O Claude não está disponível aqui.');
      var kind = project === 'exterior' ? 'exterior' : 'interior';
      var surf = surfaces.filter(function (x) { return DESCRIBE[kind][x]; });
      if (!surf.length) surf = ['walls'];
      return gridImage(photoSrc).then(function (blob) {
        return s.json(pointsPrompt(surf, project), { images: blob, modelTier: 'default', cache: false });
      }).then(function (data) {
        var out = {};
        surf.forEach(function (k) {
          var arr = (data && Array.isArray(data[k])) ? data[k] : [];
          out[k] = arr.map(function (p) {
            var x = Array.isArray(p) ? +p[0] : +(p && p.x), y = Array.isArray(p) ? +p[1] : +(p && p.y);
            return [x, y];
          }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]) && p[0] >= 0 && p[0] <= 100 && p[1] >= 0 && p[1] <= 100; }).slice(0, 20);
        });
        return { points: out, surfaces: surf };
      }, function (e) {
        if (e && e.code) throw new Error(claudeError(e));
        throw e;
      });
    });
  }

  root.FTAI = {
    detectSurfaces: detectSurfaces, repaint: repaint, MARKERS: MARKERS, markerPrompt: markerPrompt, DEFAULT_MODEL: DEFAULT_MODEL,
    claudeProvider: claudeProvider, claudePoints: claudePoints, pointsPrompt: pointsPrompt, gridImage: gridImage
  };
})(typeof window !== 'undefined' ? window : globalThis);
