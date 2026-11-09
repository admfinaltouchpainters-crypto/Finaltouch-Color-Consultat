/* Optional AI repaint using Google's Gemini image editing model.
   The key is stored only in this browser (localStorage) and is sent only to
   generativelanguage.googleapis.com. The local recolor needs no key. */
(function (root) {
  'use strict';
  var R = root.FTRecommend;

  function buildPrompt(option, project) {
    var lines = [];
    Object.keys(option.slots).forEach(function (s) {
      var c = option.slots[s].c;
      if (!c) return;
      lines.push('- ' + R.surfaceLabel(s, project, 'en') + ': ' + root.FTColor.brandName(c.brand) + ' "' + c.name + '" ' + c.code +
        ' (hex ' + c.hex + ')');
    });
    return [
      'Edit this photo of a ' + (project === 'exterior' ? 'house exterior' : 'room') + ' as a realistic paint color visualization.',
      'Repaint ONLY these surfaces with flat, realistic paint in the exact colors listed:',
      lines.join('\n'),
      'Keep the original lighting, shadows, reflections and surface texture on the repainted surfaces.',
      'Do not change anything else: keep furniture, floors, decor, windows, fixtures, people, plants, the view outside, the camera angle, framing and image size exactly as they are.',
      'Do not add, remove or move any object. Do not restyle the room. Return only the edited photo.'
    ].join('\n');
  }

  function dataUrlParts(dataUrl) {
    var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
    return m ? { mime: m[1], data: m[2] } : null;
  }

  function repaint(photoSrc, option, project, settings) {
    var key = (settings.geminiKey || '').trim();
    if (!key) return Promise.reject(new Error('Add your Gemini API key in Settings first.'));
    var model = (settings.geminiModel || 'gemini-2.5-flash-image').trim();
    var img = dataUrlParts(photoSrc);
    var body = {
      contents: [{
        role: 'user',
        parts: [
          { text: buildPrompt(option, project) },
          { inline_data: { mime_type: img.mime, data: img.data } }
        ]
      }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    };
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) {
          var msg = (j.error && j.error.message) || ('HTTP ' + res.status);
          throw new Error('Gemini: ' + msg);
        }
        var parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        for (var i = 0; i < parts.length; i++) {
          var d = parts[i].inlineData || parts[i].inline_data;
          if (d && d.data) return 'data:' + (d.mimeType || d.mime_type || 'image/png') + ';base64,' + d.data;
        }
        var txt = parts.map(function (p) { return p.text || ''; }).join(' ').trim();
        throw new Error('Gemini did not return an image.' + (txt ? ' It said: ' + txt.slice(0, 200) : ''));
      });
    });
  }

  root.FTAI = { repaint: repaint, buildPrompt: buildPrompt };
})(typeof window !== 'undefined' ? window : globalThis);
