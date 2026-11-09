/* Room recognition in the browser: DeepLabV3 MobileNetV2 trained on ADE20K
   (150 kinds of things in rooms and buildings). It tells walls from ceilings,
   doors and cabinets by shape and context, not by color. Runs with
   TensorFlow.js (loaded on first use); the weights ship with the app in
   models/seg-weights.bin (exported by tools/export_segmodel.py). */
(function (root) {
  'use strict';
  var TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
  var SIZE = 513;
  // ADE20K ids (0 = nothing) -> our surfaces
  var CLASS = { wall: 1, building: 2, floor: 4, ceiling: 6, window: 9, cabinet: 11, door: 15, house: 26, screenDoor: 59 };
  var KEEP = [1, 2, 4, 6, 9, 11, 15, 26, 59];       // channels kept at full resolution; the rest become "other"

  var libP = null, modelP = null;
  function loadTf() {
    if (root.tf) return Promise.resolve(root.tf);
    if (libP) return libP;
    libP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = TF_URL; s.async = true;
      s.onload = function () { root.tf ? res(root.tf) : rej(new Error('TensorFlow.js did not load')); };
      s.onerror = function () { libP = null; rej(new Error('Não consegui carregar o reconhecimento de ambientes (sem internet?).')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  function baseUrl() {
    var s = document.currentScript && document.currentScript.src;
    return root.FT_MODEL_BASE || 'models/';
  }
  function loadModel() {
    if (modelP) return modelP;
    var base = baseUrl();
    modelP = loadTf().then(function (tf) {
      return Promise.all([
        fetch(base + 'seg-graph.json').then(function (r) { if (!r.ok) throw new Error('graph ' + r.status); return r.json(); }),
        fetch(base + 'seg-weights.bin').then(function (r) { if (!r.ok) throw new Error('weights ' + r.status); return r.arrayBuffer(); }),
        tf.ready()
      ]).then(function (res) {
        var graph = res[0], data = new Float32Array(res[1]);
        // build weight tensors once
        graph.ops.forEach(function (o) {
          if (o.w) {
            var w = data.subarray(o.w.offset, o.w.offset + o.w.shape.reduce(function (a, b) { return a * b; }, 1));
            o.wt = tf.tensor(w, o.w.shape, 'float32');
            o.bt = tf.tensor(data.subarray(o.b.offset, o.b.offset + o.b.shape[0]), o.b.shape, 'float32');
          }
        });
        // last use of every tensor id, to free memory as we go
        var last = {};
        graph.ops.forEach(function (o, i) { o.in.forEach(function (t) { last[t] = i; }); });
        graph.lastUse = last;
        graph.tf = tf;
        return graph;
      });
    });
    modelP.catch(function () { modelP = null; });
    return modelP;
  }

  function act(tf, x, a) {
    if (a === 'relu6') return tf.relu6(x);
    if (a === 'relu') return tf.relu(x);
    return x;
  }

  /* Returns { labels: Uint8Array(lw*lh) of ADE20K ids, lw, lh } for the image. */
  function segment(img) {
    return loadModel().then(function (g) {
      var tf = g.tf;
      var k = SIZE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
      var w = Math.max(1, Math.round((img.naturalWidth || img.width) * k)), h = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
      var cv = document.createElement('canvas'); cv.width = SIZE; cv.height = SIZE;
      var cx = cv.getContext('2d', { willReadFrequently: true });
      cx.fillStyle = 'rgb(128,128,128)'; cx.fillRect(0, 0, SIZE, SIZE);   // pad value ~0 after scaling
      cx.drawImage(img, 0, 0, w, h);
      var px = cx.getImageData(0, 0, SIZE, SIZE).data;
      var input = new Float32Array(SIZE * SIZE * 3);
      for (var i = 0, j = 0; i < px.length; i += 4) {
        input[j++] = px[i] / 127.5 - 1; input[j++] = px[i + 1] / 127.5 - 1; input[j++] = px[i + 2] / 127.5 - 1;
      }
      var out = tf.tidy(function () {
        var T = {};
        T[g.input] = tf.tensor4d(input, [1, SIZE, SIZE, 3]);
        var n = g.ops.length - 1;              // stop before the final upsample to 513 x 513 x 151
        for (var oi = 0; oi < n; oi++) {
          var o = g.ops[oi], x = T[o.in[0]], y;
          if (o.op === 'CONV_2D') {
            y = tf.conv2d(x, o.wt, o.stride, o.pad, 'NHWC', o.dilation);
            y = act(tf, tf.add(y, o.bt), o.act);
          } else if (o.op === 'DEPTHWISE_CONV_2D') {
            y = tf.depthwiseConv2d(x, o.wt, o.stride, o.pad, 'NHWC', o.dilation);
            y = act(tf, tf.add(y, o.bt), o.act);
          } else if (o.op === 'ADD') {
            y = act(tf, tf.add(x, T[o.in[1]]), o.act);
          } else if (o.op === 'AVERAGE_POOL_2D') {
            y = tf.avgPool(x, o.filter, o.stride, o.pad);
          } else if (o.op === 'RESIZE_BILINEAR') {
            y = tf.image.resizeBilinear(x, o.size, o.alignCorners, o.halfPixel);
          } else if (o.op === 'CONCATENATION') {
            y = tf.concat(o.in.map(function (t) { return T[t]; }), o.axis);
          }
          T[o.out] = y;
        }
        var logits = T[g.ops[n].in[0]];                      // [1,129,129,151]
        // keep the classes we care about, fold the rest into one "other" channel
        var kept = tf.gather(logits, KEEP, 3);
        var mask = new Float32Array(151); KEEP.forEach(function (c) { mask[c] = -1e9; });
        var other = tf.max(tf.add(logits, tf.tensor1d(mask)), 3, true);
        var small = tf.concat([other, kept], 3);              // channel 0 = other
        var up = tf.image.resizeBilinear(small, [SIZE, SIZE], true, false);
        return tf.argMax(up, 3).squeeze();
      });
      return out.data().then(function (arr) {
        out.dispose();
        var labels = new Uint8Array(w * h);
        for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
          var c = arr[yy * SIZE + xx];
          labels[yy * w + xx] = c === 0 ? 0 : KEEP[c - 1];
        }
        return { labels: labels, lw: w, lh: h, backend: tf.getBackend() };
      });
    });
  }

  root.FTSegment = { segment: segment, loadModel: loadModel, CLASS: CLASS };
})(typeof window !== 'undefined' ? window : globalThis);
