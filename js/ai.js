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

  root.FTAI = { detectSurfaces: detectSurfaces, repaint: repaint, MARKERS: MARKERS, markerPrompt: markerPrompt, DEFAULT_MODEL: DEFAULT_MODEL };
})(typeof window !== 'undefined' ? window : globalThis);
