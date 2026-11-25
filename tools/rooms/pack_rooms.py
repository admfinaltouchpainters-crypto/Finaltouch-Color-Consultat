#!/usr/bin/env python3
"""Pack rendered sample rooms into rooms/rooms.js for the app.

Usage: python3 tools/rooms/pack_rooms.py <render_dir> <out_js>
Each room: <id>.png (photo) + <id>-labels.png (label id * 40 as gray).
Masks are run-length encoded like FTVisualizer.encodeMask (first run = 0s).
"""
import base64, io, json, sys
import numpy as np
from PIL import Image

ROOMS = [
    ('living', 'Sala de estar', 'Living room', 'interior'),
    ('bedroom', 'Quarto (parede de destaque)', 'Bedroom', 'interior'),
    ('kitchen', 'Cozinha', 'Kitchen', 'interior'),
    ('dining', 'Sala de jantar', 'Dining room', 'interior'),
    ('exterior', 'Fachada colonial', 'Colonial exterior', 'exterior'),
]
LABELS = {1: 'walls', 2: 'ceiling', 3: 'trim', 4: 'doors', 5: 'cabinets', 6: 'accent'}


def rle(mask):
    flat = mask.ravel().astype(np.uint8)
    change = np.flatnonzero(np.diff(flat)) + 1
    bounds = np.concatenate(([0], change, [flat.size]))
    runs = np.diff(bounds).tolist()
    if flat[0]:
        runs = [0] + runs
    return runs


def data_url(im, q, max_w=None):
    if max_w and im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=q, optimize=True, progressive=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def main(src, out):
    rooms = []
    for rid, pt, en, kind in ROOMS:
        im = Image.open(f'{src}/{rid}.png').convert('RGB')
        lab = np.rint(np.asarray(Image.open(f'{src}/{rid}-labels.png').convert('L')) / 40.0).astype(np.uint8)
        assert lab.shape == (im.height, im.width)
        masks = {}
        for k, name in LABELS.items():
            m = lab == k
            if m.sum() > 0:
                masks[name] = {'rle': rle(m)}
        rooms.append({'id': rid, 'name': pt, 'nameEn': en, 'kind': kind, 'w': im.width, 'h': im.height,
                      'thumb': data_url(im, 80, 360), 'src': data_url(im, 88), 'masks': masks})
        print(rid, im.size, sorted(masks))
    with open(out, 'w') as f:
        f.write('/* Sample rooms rendered with tools/rooms/build_rooms.py; exact surface masks. */\n')
        f.write('window.FT_ROOMS=' + json.dumps(rooms, separators=(',', ':')) + ';\n')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
