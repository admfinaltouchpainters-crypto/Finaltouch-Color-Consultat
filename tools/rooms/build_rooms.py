"""Build and render the sample rooms with Blender (bpy) + Cycles.

Every paintable surface is its own object with a label, so the app gets exact
masks: 1 walls, 2 ceiling, 3 trim, 4 doors, 5 cabinets, 6 accent.
Paintable surfaces are rendered in a neutral white; the app repaints them.

Usage:  python build_rooms.py <out_dir> [room ...] [--samples N] [--size W]
Writes <room>.png (photo) and <room>-labels.png (label ids as gray levels).
"""
import bpy, math, sys, os, random, time
from mathutils import Vector

LABEL = {'none': 0, 'walls': 1, 'ceiling': 2, 'trim': 3, 'doors': 4, 'cabinets': 5, 'accent': 6}

# ----------------------------------------------------------------- scene setup

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module='cycles')
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.view_settings.view_transform = 'AgX'
    s.view_settings.look = 'AgX - Medium High Contrast'
    s.cycles.use_denoising = True
    s.cycles.denoiser = 'OPENIMAGEDENOISE'
    s.cycles.max_bounces = 8
    s.cycles.diffuse_bounces = 5
    s.cycles.glossy_bounces = 3
    s.cycles.transmission_bounces = 6
    s.cycles.caustics_reflective = False
    s.cycles.caustics_refractive = False
    s.cycles.blur_glossy = 1.0
    return s

_mats = {}
def mat(name, color, rough=0.6, spec=0.5, metal=0.0, transmission=0.0, emit=None, bump=None, tex=None):
    key = name
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in p.inputs:
        p.inputs['Specular IOR Level'].default_value = spec
    if transmission:
        p.inputs['Transmission Weight'].default_value = transmission
        p.inputs['IOR'].default_value = 1.45
    if emit:
        p.inputs['Emission Color'].default_value = (*emit[0], 1)
        p.inputs['Emission Strength'].default_value = emit[1]
    if tex:
        tex(nt, p)
    if bump:
        bump(nt, p)
    _mats[key] = m
    return m

def tex_wood(scale=6.0, c1=(0.36, 0.22, 0.12), c2=(0.55, 0.36, 0.2), planks=True):
    def f(nt, p):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 14, 1)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        wave = nt.nodes.new('ShaderNodeTexWave'); wave.inputs['Scale'].default_value = scale
        wave.inputs['Distortion'].default_value = 6; wave.inputs['Detail'].default_value = 3
        noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 3
        nt.links.new(mp.outputs['Vector'], wave.inputs['Vector'])
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*c1, 1); ramp.color_ramp.elements[1].color = (*c2, 1)
        nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
        if planks:
            brick = nt.nodes.new('ShaderNodeTexBrick')
            brick.inputs['Scale'].default_value = 1.0
            brick.inputs['Mortar Size'].default_value = 0.004
            brick.inputs['Brick Width'].default_value = 1.6
            brick.inputs['Row Height'].default_value = 0.12
            brick.inputs['Color1'].default_value = (1, 1, 1, 1); brick.inputs['Color2'].default_value = (0.82, 0.82, 0.82, 1)
            brick.inputs['Mortar'].default_value = (0.25, 0.25, 0.25, 1)
            nt.links.new(tc.outputs['Object'], brick.inputs['Vector'])
            mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
            mul.inputs['Factor'].default_value = 1.0
            nt.links.new(ramp.outputs['Color'], mul.inputs['A']); nt.links.new(brick.outputs['Color'], mul.inputs['B'])
            nt.links.new(mul.outputs['Result'], p.inputs['Base Color'])
        else:
            nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    return f

def tex_noise_color(c1, c2, scale=8.0, detail=6.0):
    def f(nt, p):
        noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = scale
        noise.inputs['Detail'].default_value = detail
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*c1, 1); ramp.color_ramp.elements[1].color = (*c2, 1)
        nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    return f

def tex_rug(c1, c2, c3, scale=6.0):
    def f(nt, p):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        v = nt.nodes.new('ShaderNodeTexVoronoi'); v.inputs['Scale'].default_value = scale
        nt.links.new(tc.outputs['Object'], v.inputs['Vector'])
        noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 40
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*c1, 1); ramp.color_ramp.elements[1].color = (*c2, 1)
        e = ramp.color_ramp.elements.new(0.5); e.color = (*c3, 1)
        nt.links.new(v.outputs['Distance'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
        bmp = nt.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = 0.4
        nt.links.new(noise.outputs['Fac'], bmp.inputs['Height']); nt.links.new(bmp.outputs['Normal'], p.inputs['Normal'])
    return f

def bump_noise(strength=0.15, scale=60.0):
    def f(nt, p):
        noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = scale
        bmp = nt.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = strength
        nt.links.new(noise.outputs['Fac'], bmp.inputs['Height']); nt.links.new(bmp.outputs['Normal'], p.inputs['Normal'])
    return f

def bump_tiles(scale=1.0, w=0.3, hgt=0.15):
    def f(nt, p):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        brick = nt.nodes.new('ShaderNodeTexBrick')
        brick.inputs['Scale'].default_value = scale; brick.inputs['Mortar Size'].default_value = 0.006
        brick.inputs['Brick Width'].default_value = w; brick.inputs['Row Height'].default_value = hgt
        brick.inputs['Mortar'].default_value = (0.55, 0.55, 0.53, 1)
        brick.inputs['Color1'].default_value = (*p.inputs['Base Color'].default_value[:3], 1)
        brick.inputs['Color2'].default_value = (*p.inputs['Base Color'].default_value[:3], 1)
        nt.links.new(tc.outputs['Object'], brick.inputs['Vector'])
        nt.links.new(brick.outputs['Color'], p.inputs['Base Color'])
        bmp = nt.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = 0.5; bmp.invert = True
        nt.links.new(brick.outputs['Fac'], bmp.inputs['Height']); nt.links.new(bmp.outputs['Normal'], p.inputs['Normal'])
    return f

# paint: neutral whites the app repaints
def M_WALL(): return mat('wall', (0.78, 0.775, 0.76), rough=0.92, spec=0.3, bump=bump_noise(0.04, 140))
def M_CEIL(): return mat('ceiling', (0.8, 0.8, 0.79), rough=0.97, spec=0.2)
def M_TRIM(): return mat('trim', (0.8, 0.8, 0.79), rough=0.32, spec=0.5)

def obj_set(o, m, label, bevel=0.0, smooth=False):
    o.data.materials.clear(); o.data.materials.append(m)
    o['label'] = LABEL[label]
    if bevel:
        bm = o.modifiers.new('bevel', 'BEVEL'); bm.width = bevel; bm.segments = 2
        bm.limit_method = 'ANGLE'
    if smooth:
        for poly in o.data.polygons:
            poly.use_smooth = True
    return o

def box(name, size, center, m, label='none', bevel=0.0, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.object; o.name = name
    o.scale = size
    if rot:
        o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True, rotation=False, location=False)
    return obj_set(o, m, label, bevel)

def cyl(name, r, h, center, m, label='none', verts=48, rot=None, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=center, vertices=verts)
    o = bpy.context.object; o.name = name
    if rot:
        o.rotation_euler = rot
    obj_set(o, m, label, bevel, smooth=True)
    return o

def sphere(name, r, center, m, label='none', scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=center, segments=48, ring_count=24)
    o = bpy.context.object; o.name = name; o.scale = scale
    return obj_set(o, m, label, smooth=True)

def cut(target, size, center):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    c = bpy.context.object; c.scale = size
    bpy.ops.object.transform_apply(scale=True)
    mod = target.modifiers.new('cut', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = c
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(c, do_unlink=True)

# ------------------------------------------------------------------ room kit

T = 0.12   # wall thickness

def shell(W, D, H, walls_label=None):
    """Floor, ceiling and 4 walls of a W x D x H room (inside x 0..W, y 0..D)."""
    walls_label = walls_label or {}
    parts = {}
    parts['back'] = box('wall_back', (W + 2 * T, T, H), (W / 2, D + T / 2, H / 2), M_WALL(), walls_label.get('back', 'walls'))
    parts['left'] = box('wall_left', (T, D + 2 * T, H), (-T / 2, D / 2, H / 2), M_WALL(), walls_label.get('left', 'walls'))
    parts['right'] = box('wall_right', (T, D + 2 * T, H), (W + T / 2, D / 2, H / 2), M_WALL(), walls_label.get('right', 'walls'))
    parts['front'] = box('wall_front', (W + 2 * T, T, H), (W / 2, -T / 2, H / 2), M_WALL(), walls_label.get('front', 'walls'))
    box('ceiling', (W + 2 * T, D + 2 * T, 0.1), (W / 2, D / 2, H + 0.05), M_CEIL(), 'ceiling')
    return parts

def floor_wood(W, D, c1=(0.19, 0.13, 0.08), c2=(0.31, 0.21, 0.13)):
    m = mat('floor_wood_%d' % int(c1[0] * 100), (0.4, 0.26, 0.15), rough=0.35, spec=0.5, tex=tex_wood(6, c1, c2))
    box('floor', (W + 2 * T, D + 2 * T, 0.1), (W / 2, D / 2, -0.05), m)

def baseboards(W, D, skip=()):
    h, t = 0.13, 0.018
    m = M_TRIM()
    if 'back' not in skip: box('bb_back', (W, t, h), (W / 2, D - t / 2, h / 2), m, 'trim', 0.004)
    if 'left' not in skip: box('bb_left', (t, D, h), (t / 2, D / 2, h / 2), m, 'trim', 0.004)
    if 'right' not in skip: box('bb_right', (t, D, h), (W - t / 2, D / 2, h / 2), m, 'trim', 0.004)

def crown(W, D, H):
    s = 0.075
    m = M_TRIM()
    for name, size, c in (('cr_back', (W, s, s), (W / 2, D - s / 2, H - s / 2)),
                          ('cr_left', (s, D, s), (s / 2, D / 2, H - s / 2)),
                          ('cr_right', (s, D, s), (W - s / 2, D / 2, H - s / 2))):
        o = box(name, size, c, m, 'trim', 0.012)
    # stepped profile: a thinner band below
    box('cr2_back', (W, 0.03, 0.035), (W / 2, D - 0.075 - 0.015, H - 0.075 - 0.0), m, 'trim', 0.006)
    box('cr2_left', (0.03, D, 0.035), (0.075 + 0.015, D / 2, H - 0.075), m, 'trim', 0.006)
    box('cr2_right', (0.03, D, 0.035), (W - 0.075 - 0.015, D / 2, H - 0.075), m, 'trim', 0.006)

def glass():
    return mat('glass', (0.95, 0.97, 0.98), rough=0.0, spec=0.5, transmission=1.0)

def window(wall, wall_obj, W, D, cx, sill, ww, wh, shutters=False):
    """Window with casing, sash and muntins on a given wall. cx = center along the wall."""
    m = M_TRIM()
    if wall == 'back':
        y = D
        cut(wall_obj, (ww, 0.6, wh), (cx, y, sill + wh / 2))
        cw = 0.075; dp = 0.02
        box('win_cas_l', (cw, dp, wh + 2 * cw), (cx - ww / 2 - cw / 2, y - dp / 2, sill + wh / 2), m, 'trim', 0.004)
        box('win_cas_r', (cw, dp, wh + 2 * cw), (cx + ww / 2 + cw / 2, y - dp / 2, sill + wh / 2), m, 'trim', 0.004)
        box('win_cas_t', (ww + 2 * cw + 0.04, dp + 0.01, cw + 0.02), (cx, y - dp / 2, sill + wh + cw / 2 + 0.01), m, 'trim', 0.004)
        box('win_sill', (ww + 2 * cw + 0.08, 0.07, 0.03), (cx, y - 0.035, sill - 0.015), m, 'trim', 0.006)
        box('win_apron', (ww + 2 * cw, dp, 0.08), (cx, y - dp / 2, sill - 0.07), m, 'trim', 0.004)
        # jambs (reveal inside the wall thickness)
        box('win_jamb_l', (0.02, T, wh), (cx - ww / 2 + 0.01, y + T / 2, sill + wh / 2), m, 'trim')
        box('win_jamb_r', (0.02, T, wh), (cx + ww / 2 - 0.01, y + T / 2, sill + wh / 2), m, 'trim')
        box('win_jamb_t', (ww, T, 0.02), (cx, y + T / 2, sill + wh - 0.01), m, 'trim')
        box('win_stool', (ww, T, 0.02), (cx, y + T / 2, sill + 0.01), m, 'trim')
        # sash frame + muntins (double hung look)
        sy = y + T * 0.55
        f = 0.045
        box('sash_mid', (ww, 0.05, 0.05), (cx, sy, sill + wh / 2), m, 'trim')
        box('sash_l', (f, 0.04, wh), (cx - ww / 2 + f / 2, sy, sill + wh / 2), m, 'trim')
        box('sash_r', (f, 0.04, wh), (cx + ww / 2 - f / 2, sy, sill + wh / 2), m, 'trim')
        box('sash_t', (ww, 0.04, f), (cx, sy, sill + wh - f / 2), m, 'trim')
        box('sash_b', (ww, 0.04, f), (cx, sy, sill + f / 2), m, 'trim')
        n = 2 if ww < 1.3 else 3
        for i in range(1, n):
            xx = cx - ww / 2 + ww * i / n
            box('munt_v%d' % i, (0.018, 0.03, wh), (xx, sy, sill + wh / 2), m, 'trim')
        for j in (1, 3):
            box('munt_h%d' % j, (ww, 0.03, 0.018), (cx, sy, sill + wh * j / 4), m, 'trim')
        box('glass', (ww, 0.006, wh), (cx, sy + 0.01, sill + wh / 2), glass())
    elif wall in ('left', 'right'):
        x = 0 if wall == 'left' else W
        sgn = 1 if wall == 'left' else -1
        cut(wall_obj, (0.6, ww, wh), (x, cx, sill + wh / 2))
        cw = 0.075; dp = 0.02
        xi = x + sgn * dp / 2
        box('win_cas_l', (dp, cw, wh + 2 * cw), (xi, cx - ww / 2 - cw / 2, sill + wh / 2), m, 'trim', 0.004)
        box('win_cas_r', (dp, cw, wh + 2 * cw), (xi, cx + ww / 2 + cw / 2, sill + wh / 2), m, 'trim', 0.004)
        box('win_cas_t', (dp + 0.01, ww + 2 * cw + 0.04, cw + 0.02), (xi, cx, sill + wh + cw / 2 + 0.01), m, 'trim', 0.004)
        box('win_sill', (0.07, ww + 2 * cw + 0.08, 0.03), (x + sgn * 0.035, cx, sill - 0.015), m, 'trim', 0.006)
        box('win_apron', (dp, ww + 2 * cw, 0.08), (xi, cx, sill - 0.07), m, 'trim', 0.004)
        xo = x - sgn * T / 2
        box('win_jamb_l', (T, 0.02, wh), (xo, cx - ww / 2 + 0.01, sill + wh / 2), m, 'trim')
        box('win_jamb_r', (T, 0.02, wh), (xo, cx + ww / 2 - 0.01, sill + wh / 2), m, 'trim')
        box('win_jamb_t', (T, ww, 0.02), (xo, cx, sill + wh - 0.01), m, 'trim')
        box('win_stool', (T, ww, 0.02), (xo, cx, sill + 0.01), m, 'trim')
        sx = x - sgn * T * 0.55
        f = 0.045
        box('sash_mid', (0.05, ww, 0.05), (sx, cx, sill + wh / 2), m, 'trim')
        box('sash_l', (0.04, f, wh), (sx, cx - ww / 2 + f / 2, sill + wh / 2), m, 'trim')
        box('sash_r', (0.04, f, wh), (sx, cx + ww / 2 - f / 2, sill + wh / 2), m, 'trim')
        box('sash_t', (0.04, ww, f), (sx, cx, sill + wh - f / 2), m, 'trim')
        box('sash_b', (0.04, ww, f), (sx, cx, sill + f / 2), m, 'trim')
        box('munt_v', (0.03, 0.018, wh), (sx, cx, sill + wh / 2), m, 'trim')
        for j in (1, 3):
            box('munt_h%d' % j, (0.03, ww, 0.018), (sx, cx, sill + wh * j / 4), m, 'trim')
        box('glass', (0.006, ww, wh), (sx - sgn * 0.01, cx, sill + wh / 2), glass())

def door(wall, wall_obj, W, D, cx, dw=0.86, dh=2.05, open_frac=0.0):
    """Interior 6-panel style door with casing. Door slab label 'doors', casing 'trim'."""
    mt = M_TRIM()
    md = mat('door', (0.8, 0.8, 0.79), rough=0.3, spec=0.5)
    knob = mat('brass', (0.75, 0.6, 0.35), rough=0.25, metal=1.0)
    if wall == 'right':
        x = W
        cut(wall_obj, (0.6, dw, dh), (x, cx, dh / 2))
        cw, dp = 0.085, 0.02
        box('door_cas_l', (dp, cw, dh + cw), (x - dp / 2, cx - dw / 2 - cw / 2, (dh + cw) / 2), mt, 'trim', 0.004)
        box('door_cas_r', (dp, cw, dh + cw), (x - dp / 2, cx + dw / 2 + cw / 2, (dh + cw) / 2), mt, 'trim', 0.004)
        box('door_cas_t', (dp + 0.01, dw + 2 * cw + 0.03, cw + 0.015), (x - dp / 2, cx, dh + cw / 2 + 0.008), mt, 'trim', 0.004)
        box('door_jamb_l', (T, 0.02, dh), (x + T / 2, cx - dw / 2 + 0.01, dh / 2), mt, 'trim')
        box('door_jamb_r', (T, 0.02, dh), (x + T / 2, cx + dw / 2 - 0.01, dh / 2), mt, 'trim')
        box('door_jamb_t', (T, dw, 0.02), (x + T / 2, cx, dh - 0.01), mt, 'trim')
        slab = box('door_slab', (0.04, dw - 0.04, dh - 0.02), (x + 0.03, cx, (dh - 0.02) / 2), md, 'doors', 0.003)
        # raised panels (3 rows x 2)
        pw = (dw - 0.04 - 0.3) / 2
        for i, (z0, ph) in enumerate(((0.12, 0.62), (0.86, 0.62), (1.6, 0.32))):
            for j in (-1, 1):
                box('door_panel_%d%d' % (i, j), (0.012, pw, ph), (x + 0.004, cx + j * (pw / 2 + 0.05), z0 + ph / 2), md, 'doors', 0.01)
        cyl('door_knob', 0.028, 0.06, (x - 0.02, cx - dw / 2 + 0.09, 0.95), knob, rot=(0, math.pi / 2, 0))
        # dark hallway behind the door gap is not visible (door closed)
    elif wall == 'left':
        x = 0
        cut(wall_obj, (0.6, dw, dh), (x, cx, dh / 2))
        cw, dp = 0.085, 0.02
        box('door_cas_l', (dp, cw, dh + cw), (x + dp / 2, cx - dw / 2 - cw / 2, (dh + cw) / 2), mt, 'trim', 0.004)
        box('door_cas_r', (dp, cw, dh + cw), (x + dp / 2, cx + dw / 2 + cw / 2, (dh + cw) / 2), mt, 'trim', 0.004)
        box('door_cas_t', (dp + 0.01, dw + 2 * cw + 0.03, cw + 0.015), (x + dp / 2, cx, dh + cw / 2 + 0.008), mt, 'trim', 0.004)
        box('door_jamb_l', (T, 0.02, dh), (x - T / 2, cx - dw / 2 + 0.01, dh / 2), mt, 'trim')
        box('door_jamb_r', (T, 0.02, dh), (x - T / 2, cx + dw / 2 - 0.01, dh / 2), mt, 'trim')
        box('door_jamb_t', (T, dw, 0.02), (x - T / 2, cx, dh - 0.01), mt, 'trim')
        box('door_slab', (0.04, dw - 0.04, dh - 0.02), (x - 0.03, cx, (dh - 0.02) / 2), md, 'doors', 0.003)
        pw = (dw - 0.04 - 0.3) / 2
        for i, (z0, ph) in enumerate(((0.12, 0.62), (0.86, 0.62), (1.6, 0.32))):
            for j in (-1, 1):
                box('door_panel_%d%d' % (i, j), (0.012, pw, ph), (x - 0.004, cx + j * (pw / 2 + 0.05), z0 + ph / 2), md, 'doors', 0.01)
        cyl('door_knob', 0.028, 0.06, (x + 0.02, cx + dw / 2 - 0.09, 0.95), knob, rot=(0, math.pi / 2, 0))

def outside_ground():
    g = mat('grass', (0.12, 0.25, 0.06), rough=0.9, tex=tex_noise_color((0.08, 0.18, 0.04), (0.2, 0.35, 0.1), 3))
    box('outside_ground', (80, 80, 0.1), (0, 0, -0.6), g)
    trees = mat('trees', (0.08, 0.2, 0.05), rough=0.9, tex=tex_noise_color((0.04, 0.12, 0.03), (0.16, 0.3, 0.08), 2.5))
    random.seed(4)
    for i in range(0):
        a = random.uniform(0, 2 * math.pi); r = random.uniform(25, 40)
        sphere('tree%d' % i, random.uniform(4.0, 6.0), (5 + r * math.cos(a), 5 + r * math.sin(a), random.uniform(1.0, 3.0)), trees, scale=(1, 1, 1.2))

def world_sky(strength=1.0, sun_elev=35, sun_rot=120):
    w = bpy.data.worlds.new('sky'); bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    sky = nt.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'NISHITA'
    except Exception:
        pass
    try:
        sky.sun_elevation = math.radians(sun_elev); sky.sun_rotation = math.radians(sun_rot)
        sky.sun_disc = False
    except Exception:
        pass
    bg = nt.nodes['Background']; bg.inputs['Strength'].default_value = strength
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])

def sun(rot, energy=3.5, angle=1.5):
    bpy.ops.object.light_add(type='SUN', rotation=rot)
    l = bpy.context.object; l.data.energy = energy; l.data.angle = math.radians(angle)
    return l

def area(loc, size, energy, rot=(0, 0, 0), color=(1, 0.96, 0.9), hidden=True):
    bpy.ops.object.light_add(type='AREA', location=loc, rotation=rot)
    l = bpy.context.object; l.data.energy = energy; l.data.size = size; l.data.color = color
    if hidden:
        l.visible_camera = False
        l.visible_glossy = False
    return l

def point(loc, energy, radius=0.05, color=(1, 0.85, 0.65)):
    bpy.ops.object.light_add(type='POINT', location=loc)
    l = bpy.context.object; l.data.energy = energy; l.data.shadow_soft_size = radius; l.data.color = color
    return l

def camera(loc, look_at, lens=20):
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.object
    d = Vector(look_at) - Vector(loc)
    c.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    c.data.lens = lens
    c.data.sensor_width = 36
    bpy.context.scene.camera = c
    return c

# --------------------------------------------------------------- furniture

def sofa(x, y, w=2.3, d=0.95, color=(0.45, 0.38, 0.3), facing='+y', name='sofa'):
    fab = mat('fabric_%s' % name, color, rough=0.95, spec=0.2, bump=bump_noise(0.25, 220))
    leg = mat('leg_dark', (0.08, 0.06, 0.05), rough=0.4)
    sgn = 1 if facing == '+y' else -1
    box(name + '_base', (w, d, 0.28), (x, y, 0.28), fab, bevel=0.04)
    box(name + '_back', (w, 0.22, 0.48), (x, y - sgn * (d / 2 - 0.11), 0.62), fab, bevel=0.06)
    box(name + '_armL', (0.2, d, 0.32), (x - w / 2 + 0.1, y, 0.56), fab, bevel=0.06)
    box(name + '_armR', (0.2, d, 0.32), (x + w / 2 - 0.1, y, 0.56), fab, bevel=0.06)
    for i in range(2):
        box(name + '_cush%d' % i, ((w - 0.44) / 2 - 0.01, d - 0.26, 0.16), (x - (w - 0.44) / 4 + i * (w - 0.44) / 2, y + sgn * 0.08, 0.5), fab, bevel=0.06)
    pil = mat('pillow_%s' % name, (0.82, 0.78, 0.7), rough=0.95, bump=bump_noise(0.3, 160))
    pil2 = mat('pillow2_%s' % name, (0.36, 0.42, 0.4), rough=0.95, bump=bump_noise(0.3, 160))
    for i, (px, pm) in enumerate(((-w / 2 + 0.42, pil), (-w / 2 + 0.8, pil2), (w / 2 - 0.42, pil))):
        o = box(name + '_pillow%d' % i, (0.42, 0.14, 0.4), (x + px, y - sgn * (d / 2 - 0.3), 0.72), pm, bevel=0.06)
        o.rotation_euler = (math.radians(-12 * sgn), 0, math.radians(random.uniform(-8, 8)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(name + '_leg%d%d' % (sx, sy), (0.05, 0.05, 0.14), (x + sx * (w / 2 - 0.08), y + sy * (d / 2 - 0.08), 0.07), leg)

def armchair(x, y, rotz, color=(0.75, 0.72, 0.66)):
    fab = mat('fabric_chair', color, rough=0.95, bump=bump_noise(0.25, 220))
    bpy.ops.object.empty_add(location=(x, y, 0)); e = bpy.context.object; e.rotation_euler = (0, 0, rotz)
    parts = []
    parts.append(box('ac_base', (0.8, 0.8, 0.3), (0, 0, 0.3), fab, bevel=0.05))
    parts.append(box('ac_back', (0.8, 0.18, 0.5), (0, -0.31, 0.68), fab, bevel=0.06))
    parts.append(box('ac_armL', (0.16, 0.8, 0.28), (-0.32, 0, 0.58), fab, bevel=0.06))
    parts.append(box('ac_armR', (0.16, 0.8, 0.28), (0.32, 0, 0.58), fab, bevel=0.06))
    parts.append(box('ac_cush', (0.48, 0.6, 0.14), (0, 0.05, 0.5), fab, bevel=0.05))
    leg = mat('leg_wood', (0.35, 0.22, 0.12), rough=0.4)
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box('ac_leg', (0.04, 0.04, 0.16), (sx * 0.34, sy * 0.34, 0.08), leg))
    for p in parts:
        p.parent = e

def rug(x, y, w, d, colors):
    m = mat('rug_%d' % int(colors[0][0] * 100), colors[0], rough=1.0, tex=tex_rug(*colors))
    box('rug', (w, d, 0.012), (x, y, 0.006), m, bevel=0.004)

def coffee_table(x, y, r=0.5):
    wood = mat('table_wood', (0.45, 0.32, 0.2), rough=0.45, tex=tex_noise_color((0.38, 0.26, 0.15), (0.52, 0.38, 0.24), 6, 8))
    cyl('ct_top', r, 0.05, (x, y, 0.42), wood, bevel=0.01)
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        box('ct_leg%d' % a, (0.05, 0.05, 0.4), (x + 0.3 * r * 1.4 * math.cos(ang), y + 0.3 * r * 1.4 * math.sin(ang), 0.2), wood)
    tray = mat('tray', (0.5, 0.38, 0.22), rough=0.8)
    box('ct_tray', (0.42, 0.3, 0.06), (x + 0.05, y, 0.475), tray, bevel=0.01)
    plant_pot(x + 0.05, y, 0.5, 0.1, 0.12)

def plant_pot(x, y, z, r, h, leaf_r=None):
    """Small decor: a ceramic bowl and two stacked books."""
    pot = mat('pot', (0.85, 0.83, 0.78), rough=0.5)
    cyl('bowl', r * 1.2, h * 0.5, (x, y, z + h * 0.25), pot, bevel=0.01)
    b1 = mat('book1', (0.55, 0.45, 0.35), rough=0.8); b2 = mat('book2', (0.25, 0.3, 0.33), rough=0.8)
    box('book1', (0.22, 0.16, 0.03), (x - r * 2.4, y, z + 0.015), b1, bevel=0.003)
    box('book2', (0.2, 0.15, 0.025), (x - r * 2.4, y, z + 0.043), b2, bevel=0.003)

def floor_plant(x, y):
    """Tall ceramic vase with dry branches."""
    vase = mat('vase', (0.62, 0.55, 0.47), rough=0.6, bump=bump_noise(0.2, 40))
    stem = mat('stem', (0.35, 0.25, 0.15), rough=0.8)
    sphere('vase', 0.2, (x, y, 0.32), vase, scale=(1, 1, 1.7))
    cyl('vase_neck', 0.07, 0.18, (x, y, 0.66), vase)
    random.seed(int(x * 31 + y * 17))
    for i in range(9):
        ax, ay = random.uniform(-0.35, 0.35), random.uniform(-0.35, 0.35)
        L = random.uniform(0.7, 1.1)
        o = cyl('branch', 0.007, L, (x + ax * L / 2, y + ay * L / 2, 0.7 + L / 2), stem, verts=6)
        o.rotation_euler = (ay, -ax, 0)

def floor_lamp(x, y, h=1.6):
    metal = mat('black_metal', (0.03, 0.03, 0.03), rough=0.35, metal=0.8)
    shade = mat('shade', (0.92, 0.9, 0.84), rough=0.9, transmission=0.3)
    cyl('fl_base', 0.16, 0.03, (x, y, 0.015), metal)
    cyl('fl_pole', 0.012, h, (x, y, h / 2), metal)
    bpy.ops.mesh.primitive_cone_add(radius1=0.24, radius2=0.17, depth=0.3, location=(x, y, h + 0.05), vertices=48)
    o = bpy.context.object; obj_set(o, shade, 'none', smooth=True)
    point((x, y, h), 25, 0.08)

def table_lamp(x, y, z):
    base = mat('lamp_base', (0.7, 0.62, 0.5), rough=0.6)
    shade = mat('shade', (0.92, 0.9, 0.84), rough=0.9, transmission=0.3)
    sphere('tl_base', 0.11, (x, y, z + 0.13), base, scale=(1, 1, 1.2))
    bpy.ops.mesh.primitive_cone_add(radius1=0.18, radius2=0.13, depth=0.22, location=(x, y, z + 0.42), vertices=48)
    obj_set(bpy.context.object, shade, 'none', smooth=True)
    point((x, y, z + 0.38), 12, 0.06)

def art(wall, W, D, c, z, w, h, colors=((0.75, 0.62, 0.45), (0.35, 0.42, 0.45))):
    frame = mat('frame', (0.12, 0.1, 0.08), rough=0.5)
    canvas = mat('canvas_%d' % int(colors[0][0] * 100), colors[0], rough=0.9, tex=tex_noise_color(colors[0], colors[1], 2.2, 3))
    mat_white = mat('passepartout', (0.9, 0.89, 0.86), rough=0.9)
    if wall == 'back':
        box('art_frame', (w, 0.03, h), (c, D - 0.02, z), frame, bevel=0.005)
        box('art_mat', (w - 0.06, 0.03, h - 0.06), (c, D - 0.025, z), mat_white)
        box('art_canvas', (w - 0.22, 0.03, h - 0.22), (c, D - 0.03, z), canvas)
    elif wall == 'left':
        box('art_frame', (0.03, w, h), (0.02, c, z), frame, bevel=0.005)
        box('art_mat', (0.03, w - 0.06, h - 0.06), (0.025, c, z), mat_white)
        box('art_canvas', (0.03, w - 0.22, h - 0.22), (0.03, c, z), canvas)
    elif wall == 'right':
        box('art_frame', (0.03, w, h), (W - 0.02, c, z), frame, bevel=0.005)
        box('art_mat', (0.03, w - 0.06, h - 0.06), (W - 0.025, c, z), mat_white)
        box('art_canvas', (0.03, w - 0.22, h - 0.22), (W - 0.03, c, z), canvas)

def curtains(W, D, cx, ww, top, color=(0.88, 0.86, 0.8)):
    fab = mat('curtain', color, rough=0.95, transmission=0.15)
    rod = mat('black_metal', (0.03, 0.03, 0.03), rough=0.35, metal=0.8)
    cyl('rod', 0.012, ww + 0.9, (cx, D - 0.1, top), rod, rot=(0, math.pi / 2, 0))
    for side in (-1, 1):
        for k in range(5):
            cyl('curt', 0.05, top - 0.05, (cx + side * (ww / 2 + 0.12 + k * 0.07), D - 0.1, (top - 0.05) / 2 + 0.02), fab, verts=16)

# ------------------------------------------------------------------- rooms

def room_living():
    W, D, H = 5.6, 5.2, 2.65
    world_sky(0.8, 30, 200); outside_ground()
    p = shell(W, D, H)
    floor_wood(W, D)
    window('back', p['back'], W, D, 3.6, 0.75, 1.5, 1.55)
    curtains(W, D, 3.6, 1.5, 2.45)
    door('right', p['right'], W, D, 4.2)
    baseboards(W, D); crown(W, D, H)
    sofa(1.55, D - 0.6, facing='-y', color=(0.42, 0.34, 0.27))
    art('back', W, D, 1.55, 1.65, 1.1, 0.75)
    art('left', W, D, 2.4, 1.5, 0.6, 0.8, ((0.6, 0.4, 0.3), (0.85, 0.8, 0.7)))
    rug(2.0, D - 1.9, 3.0, 2.2, ((0.62, 0.58, 0.52), (0.4, 0.38, 0.36), (0.75, 0.72, 0.66)))
    coffee_table(2.0, D - 1.85)
    armchair(0.75, D - 2.6, math.radians(-70))
    floor_lamp(0.35, D - 0.4)
    floor_plant(5.05, D - 0.4)
    sun((math.radians(50), 0, math.radians(205)), 3.6)
    area((W / 2, D / 2, H - 0.05), 2.5, 70, color=(1, 0.97, 0.92))
    camera((5.0, 0.5, 1.4), (2.0, D, 1.0), lens=20)

def room_bedroom():
    W, D, H = 4.8, 4.6, 2.6
    world_sky(0.8, 40, 120); outside_ground()
    p = shell(W, D, H, {'back': 'accent'})
    floor_wood(W, D, (0.45, 0.32, 0.2), (0.62, 0.46, 0.3))
    window('left', p['left'], W, D, 2.0, 0.8, 1.2, 1.45)
    door('right', p['right'], W, D, 1.4)
    baseboards(W, D); crown(W, D, H)
    # bed
    wood = mat('bed_fabric', (0.5, 0.47, 0.43), rough=0.95, bump=bump_noise(0.25, 200))
    linen = mat('linen', (0.9, 0.88, 0.84), rough=0.95, bump=bump_noise(0.35, 90))
    throw = mat('throw', (0.42, 0.48, 0.5), rough=0.95, bump=bump_noise(0.35, 160))
    bx, by = W / 2 + 0.2, D - 1.1
    box('headboard', (1.75, 0.08, 1.15), (bx, D - 0.06, 0.58), wood, bevel=0.02)
    box('bed_frame', (1.7, 2.1, 0.32), (bx, by, 0.18), wood, bevel=0.02)
    box('mattress', (1.6, 2.0, 0.26), (bx, by, 0.47), linen, bevel=0.06)
    box('throw', (1.66, 0.7, 0.05), (bx, by - 0.55, 0.62), throw, bevel=0.02)
    for i, xx in enumerate((-0.42, 0.42)):
        o = box('pillow%d' % i, (0.68, 0.18, 0.42), (bx + xx, D - 0.3, 0.75), linen, bevel=0.07)
        o.rotation_euler = (math.radians(-15), 0, 0)
    nt = mat('nightstand', (0.85, 0.84, 0.8), rough=0.4)
    for s in (-1, 1):
        nx = bx + s * 1.2
        box('nightstand', (0.5, 0.42, 0.55), (nx, D - 0.25, 0.275), nt, bevel=0.01)
        table_lamp(nx, D - 0.25, 0.55)
    rug(bx, by - 0.4, 2.6, 2.2, ((0.7, 0.68, 0.64), (0.55, 0.52, 0.5), (0.8, 0.78, 0.74)))
    art('back', W, D, bx, 1.75, 0.9, 0.55, ((0.55, 0.6, 0.6), (0.85, 0.8, 0.72)))
    floor_plant(0.45, 0.6)
    sun((math.radians(50), 0, math.radians(-80)), 3.0)
    area((W / 2, D / 2, H - 0.05), 2.2, 60)
    camera((4.3, 0.4, 1.45), (1.9, D, 0.95), lens=19)

def room_kitchen():
    W, D, H = 4.6, 4.2, 2.6
    world_sky(0.9, 35, 160); outside_ground()
    p = shell(W, D, H)
    tile = mat('floor_tile', (0.7, 0.69, 0.66), rough=0.3, bump=bump_tiles(1.0, 0.45, 0.45))
    box('floor', (W + 2 * T, D + 2 * T, 0.1), (W / 2, D / 2, -0.05), tile)
    window('back', p['back'], W, D, 2.0, 1.15, 1.1, 1.0)
    baseboards(W, D, skip=('back',)); crown(W, D, H)
    cab = mat('cabinet', (0.8, 0.8, 0.79), rough=0.35, spec=0.5)
    counter = mat('counter', (0.15, 0.15, 0.16), rough=0.25, tex=tex_noise_color((0.08, 0.08, 0.09), (0.3, 0.3, 0.32), 80, 2))
    splash = mat('backsplash', (0.92, 0.92, 0.9), rough=0.15, bump=bump_tiles(1.0, 0.15, 0.075))
    steel = mat('steel', (0.7, 0.7, 0.72), rough=0.25, metal=1.0)
    brass = mat('brass', (0.75, 0.6, 0.35), rough=0.25, metal=1.0)
    # lower run along back wall
    x0, x1 = 0.0, 2.9
    box('lower_cab', (x1 - x0, 0.6, 0.82), ((x0 + x1) / 2, D - 0.3, 0.41 + 0.08), cab, 'cabinets', 0.004)
    box('toe_kick', (x1 - x0, 0.55, 0.08), ((x0 + x1) / 2, D - 0.33, 0.04), mat('toe', (0.1, 0.1, 0.1), rough=0.8))
    box('countertop', (x1 - x0 + 0.02, 0.64, 0.04), ((x0 + x1) / 2, D - 0.32, 0.92), counter, bevel=0.005)
    box('backsplash', (x1 - x0, 0.01, 0.52), ((x0 + x1) / 2, D - 0.005, 0.94 + 0.26), splash)
    # door/drawer fronts (shaker look)
    n = 5; cw = (x1 - x0) / n
    for i in range(n):
        cx = x0 + cw * (i + 0.5)
        box('cab_door%d' % i, (cw - 0.02, 0.02, 0.6), (cx, D - 0.61, 0.42), cab, 'cabinets', 0.004)
        box('cab_draw%d' % i, (cw - 0.02, 0.02, 0.16), (cx, D - 0.61, 0.82), cab, 'cabinets', 0.004)
        box('cab_pull%d' % i, (0.12, 0.02, 0.012), (cx, D - 0.63, 0.82), brass)
        box('cab_knob%d' % i, (0.012, 0.02, 0.1), (cx + cw / 2 - 0.06, D - 0.63, 0.6), brass)
    # uppers, interrupted by the window
    for (ua, ub) in ((x0, 2.0 - 0.8),):
        box('upper_cab', (ub - ua, 0.35, 0.78), ((ua + ub) / 2, D - 0.175, 1.85), cab, 'cabinets', 0.004)
        k = max(1, int(round((ub - ua) / 0.45)))
        for i in range(k):
            ux = ua + (ub - ua) * (i + 0.5) / k
            box('upper_door', ((ub - ua) / k - 0.02, 0.02, 0.74), (ux, D - 0.36, 1.85), cab, 'cabinets', 0.004)
            box('upper_knob', (0.012, 0.02, 0.1), (ux + ((ub - ua) / k) / 2 - 0.06, D - 0.38, 1.55), brass)
        box('upper_crown', (ub - ua + 0.04, 0.39, 0.05), ((ua + ub) / 2, D - 0.19, 2.265), cab, 'cabinets', 0.006)
    box('filler_cab', (0.26, 0.6, 0.82), (3.82, D - 0.3, 0.49), cab, 'cabinets', 0.004)
    box('filler_top', (0.27, 0.64, 0.04), (3.82, D - 0.32, 0.92), counter, bevel=0.005)
    box('filler_door', (0.22, 0.02, 0.76), (3.82, D - 0.61, 0.5), cab, 'cabinets', 0.004)
    box('backsplash2', (1.05, 0.01, 0.52), (3.42, D - 0.005, 1.2), splash)
    # tall pantry on the right
    box('pantry', (0.65, 0.6, 2.25), (W - 0.33, D - 0.3, 1.125), cab, 'cabinets', 0.004)
    box('pantry_door1', (0.6, 0.02, 1.3), (W - 0.33, D - 0.61, 0.72), cab, 'cabinets', 0.004)
    box('pantry_door2', (0.6, 0.02, 0.82), (W - 0.33, D - 0.61, 1.8), cab, 'cabinets', 0.004)
    # sink, faucet, range
    box('sink', (0.6, 0.42, 0.02), (2.0, D - 0.34, 0.935), steel)
    cyl('faucet', 0.015, 0.32, (2.0, D - 0.12, 1.1), steel)
    box('faucet_spout', (0.02, 0.2, 0.02), (2.0, D - 0.2, 1.25), steel)
    box('range', (0.76, 0.62, 0.9), (3.3, D - 0.31, 0.45), steel, bevel=0.005)
    box('cooktop', (0.74, 0.58, 0.012), (3.3, D - 0.31, 0.906), mat('glass_black', (0.02, 0.02, 0.02), rough=0.05))
    box('hood', (0.76, 0.48, 0.25), (3.3, D - 0.24, 1.6), steel, bevel=0.01)
    box('hood_chimney', (0.3, 0.25, 0.75), (3.3, D - 0.13, 2.1), steel, bevel=0.005)
    plant_pot(0.6, D - 0.3, 0.94, 0.08, 0.12)
    sun((math.radians(55), 0, math.radians(160)), 3.0)
    area((W / 2, D / 2, H - 0.05), 2.0, 80)
    camera((0.6, 0.35, 1.5), (2.6, D, 1.15), lens=20)

def room_dining():
    W, D, H = 4.8, 5.0, 2.7
    world_sky(0.8, 30, 230); outside_ground()
    p = shell(W, D, H)
    floor_wood(W, D, (0.25, 0.16, 0.1), (0.4, 0.26, 0.16))
    window('back', p['back'], W, D, 2.4, 0.7, 1.4, 1.6)
    curtains(W, D, 2.4, 1.4, 2.5, (0.75, 0.73, 0.68))
    baseboards(W, D); crown(W, D, H)
    m = M_TRIM()
    # chair rail on left and back walls
    box('chair_rail_left', (0.03, D, 0.06), (0.015, D / 2, 0.9), m, 'trim', 0.008)
    box('chair_rail_back', (W, 0.03, 0.06), (W / 2, D - 0.015, 0.9), m, 'trim', 0.008)
    box('chair_rail_right', (0.03, D, 0.06), (W - 0.015, D / 2, 0.9), m, 'trim', 0.008)
    # open doorway with casing on the right wall
    cut(p['right'], (0.6, 1.1, 2.1), (W, 1.2, 1.05))
    dark = mat('hall', (0.5, 0.48, 0.45), rough=0.9)
    box('hall_back', (0.1, 3, 3), (W + 1.5, 1.2, 1.5), dark)
    for nm, s_, c in (('dw_cas_l', (0.02, 0.085, 2.15), (W - 0.01, 1.2 - 0.55 - 0.0425, 1.075)),
                      ('dw_cas_r', (0.02, 0.085, 2.15), (W - 0.01, 1.2 + 0.55 + 0.0425, 1.075)),
                      ('dw_cas_t', (0.03, 1.3, 0.1), (W - 0.01, 1.2, 2.15)),
                      ('dw_jamb_l', (T, 0.02, 2.1), (W + T / 2, 1.2 - 0.54, 1.05)),
                      ('dw_jamb_r', (T, 0.02, 2.1), (W + T / 2, 1.2 + 0.54, 1.05)),
                      ('dw_jamb_t', (T, 1.1, 0.02), (W + T / 2, 1.2, 2.09))):
        box(nm, s_, c, m, 'trim', 0.004)
    # table and chairs
    wood = mat('dining_wood', (0.3, 0.2, 0.12), rough=0.4, tex=tex_noise_color((0.24, 0.15, 0.09), (0.36, 0.24, 0.14), 6, 8))
    tx, ty = 2.3, 2.7
    box('table_top', (2.0, 1.0, 0.05), (tx, ty, 0.75), wood, bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('table_leg', (0.07, 0.07, 0.73), (tx + sx * 0.9, ty + sy * 0.42, 0.365), wood)
    seat = mat('chair_seat', (0.82, 0.8, 0.75), rough=0.95, bump=bump_noise(0.2, 200))
    chair_wood = mat('chair_wood', (0.1, 0.08, 0.06), rough=0.4)
    for (cx, cy, rot) in ((tx - 0.5, ty - 0.75, 0), (tx + 0.5, ty - 0.75, 0), (tx - 0.5, ty + 0.75, math.pi), (tx + 0.5, ty + 0.75, math.pi), (tx - 1.3, ty, -math.pi / 2)):
        bpy.ops.object.empty_add(location=(cx, cy, 0)); e = bpy.context.object; e.rotation_euler = (0, 0, rot)
        parts = [box('ch_seat', (0.46, 0.44, 0.08), (0, 0, 0.47), seat, bevel=0.02),
                 box('ch_back', (0.46, 0.04, 0.5), (0, -0.21, 0.76), chair_wood, bevel=0.01)]
        for sx in (-1, 1):
            for sy in (-1, 1):
                parts.append(box('ch_leg', (0.035, 0.035, 0.45), (sx * 0.2, sy * 0.19, 0.225), chair_wood))
        for pp in parts:
            pp.parent = e
    # pendant
    shade = mat('pendant', (0.05, 0.05, 0.05), rough=0.4, metal=0.6)
    cyl('pend_cord', 0.005, 0.9, (tx, ty, H - 0.45), shade)
    bpy.ops.mesh.primitive_cone_add(radius1=0.28, radius2=0.06, depth=0.25, location=(tx, ty, H - 1.0), vertices=48)
    obj_set(bpy.context.object, shade, 'none', smooth=True)
    point((tx, ty, H - 1.08), 30, 0.08)
    # centerpiece + sideboard + art
    plant_pot(tx, ty, 0.775, 0.1, 0.15)
    sb = mat('sideboard', (0.2, 0.15, 0.11), rough=0.4)
    box('sideboard', (1.6, 0.45, 0.8), (0.24, 2.5, 0.4), sb, bevel=0.01, rot=None)
    bpy.context.object.scale = (1, 1, 1)
    art('left', W, D, 2.5, 1.65, 1.2, 0.8, ((0.3, 0.38, 0.42), (0.8, 0.72, 0.58)))
    rug(tx, ty, 2.9, 2.2, ((0.55, 0.2, 0.15), (0.2, 0.22, 0.3), (0.75, 0.68, 0.55)))
    sun((math.radians(58), 0, math.radians(230)), 3.0)
    area((W / 2, D / 2, H - 0.05), 2.2, 70)
    camera((4.25, 0.35, 1.45), (1.6, D, 0.95), lens=19)

def room_exterior():
    """Two-story colonial facade: siding = walls (body), trim, front door + shutters = accent."""
    world_sky(0.45, 40, 140)
    grass = mat('lawn', (0.12, 0.28, 0.06), rough=0.9, tex=tex_noise_color((0.08, 0.2, 0.04), (0.2, 0.38, 0.1), 9))
    box('lawn', (80, 80, 0.1), (0, 0, -0.05), grass)
    HW, HD, H1 = 11.0, 8.0, 5.8
    siding = mat('siding', (0.8, 0.8, 0.79), rough=0.8, spec=0.3)
    trim = M_TRIM()
    accent = mat('front_door', (0.8, 0.8, 0.79), rough=0.3)
    found = mat('foundation', (0.55, 0.53, 0.5), rough=0.9, bump=bump_noise(0.3, 30))
    roofm = mat('roof', (0.12, 0.12, 0.13), rough=0.85, bump=bump_tiles(3.0, 0.33, 0.2))
    box('foundation', (HW + 0.1, HD + 0.1, 0.5), (0, 0, 0.25), found)
    # body made of clapboards on the front face, a plain box behind
    core = box('house_core', (HW, HD, H1), (0, 0, 0.5 + H1 / 2), siding, 'walls')
    rows = int(H1 / 0.16)
    for i in range(rows):
        z = 0.5 + i * 0.16 + 0.08
        o = box('clap%d' % i, (HW, 0.03, 0.17), (0, -HD / 2 - 0.012, z), siding, 'walls')
        o.rotation_euler = (math.radians(-6), 0, 0)
    # roof (gable along x)
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=1, depth=1, location=(0, 0, 0))
    roof = bpy.context.object; bpy.data.objects.remove(roof, do_unlink=True)
    verts = [(-HW / 2 - 0.4, -HD / 2 - 0.6, 0.5 + H1), (HW / 2 + 0.4, -HD / 2 - 0.6, 0.5 + H1),
             (HW / 2 + 0.4, HD / 2 + 0.6, 0.5 + H1), (-HW / 2 - 0.4, HD / 2 + 0.6, 0.5 + H1),
             (-HW / 2 - 0.4, 0, 0.5 + H1 + 2.8), (HW / 2 + 0.4, 0, 0.5 + H1 + 2.8)]
    faces = [(0, 1, 5, 4), (3, 4, 5, 2), (0, 4, 3), (1, 2, 5)]
    me = bpy.data.meshes.new('roof'); me.from_pydata(verts, [], faces); me.update()
    ro = bpy.data.objects.new('roof', me); bpy.context.collection.objects.link(ro)
    sol = ro.modifiers.new('solid', 'SOLIDIFY'); sol.thickness = 0.15
    obj_set(ro, roofm, 'none')
    # fascia + corner boards + frieze
    fy = -HD / 2 - 0.05
    box('fascia', (HW + 0.8, 0.06, 0.22), (0, -HD / 2 - 0.62, 0.5 + H1 - 0.05), trim, 'trim', 0.01)
    box('frieze', (HW, 0.05, 0.25), (0, fy, 0.5 + H1 - 0.15), trim, 'trim', 0.005)
    box('corner_l', (0.16, 0.06, H1), (-HW / 2 + 0.08, fy, 0.5 + H1 / 2), trim, 'trim', 0.005)
    box('corner_r', (0.16, 0.06, H1), (HW / 2 - 0.08, fy, 0.5 + H1 / 2), trim, 'trim', 0.005)
    gl = mat('ext_glass', (0.12, 0.14, 0.16), rough=0.05, spec=0.8)
    shut = mat('shutter', (0.8, 0.8, 0.79), rough=0.45)
    def ewin(cx, z0, w=0.95, h=1.45):
        box('ew_glass', (w, 0.02, h), (cx, fy - 0.01, z0 + h / 2), gl)
        for nm, s_, c in (('ew_l', (0.11, 0.05, h + 0.22), (cx - w / 2 - 0.055, fy - 0.03, z0 + h / 2)),
                          ('ew_r', (0.11, 0.05, h + 0.22), (cx + w / 2 + 0.055, fy - 0.03, z0 + h / 2)),
                          ('ew_t', (w + 0.36, 0.07, 0.16), (cx, fy - 0.04, z0 + h + 0.1)),
                          ('ew_b', (w + 0.3, 0.08, 0.07), (cx, fy - 0.04, z0 - 0.04)),
                          ('ew_mid', (w, 0.05, 0.05), (cx, fy - 0.025, z0 + h / 2)),
                          ('ew_mv', (0.03, 0.04, h), (cx, fy - 0.02, z0 + h / 2)),
                          ('ew_mh1', (w, 0.04, 0.025), (cx, fy - 0.02, z0 + h / 4)),
                          ('ew_mh2', (w, 0.04, 0.025), (cx, fy - 0.02, z0 + 3 * h / 4))):
            box(nm, s_, c, trim, 'trim', 0.004)
        for sd in (-1, 1):
            sx = cx + sd * (w / 2 + 0.11 + 0.24)
            box('shutter', (0.45, 0.04, h + 0.1), (sx, fy - 0.03, z0 + h / 2), shut, 'accent', 0.005)
            for k in range(9):
                box('louver', (0.38, 0.02, 0.03), (sx, fy - 0.055, z0 + 0.12 + k * (h - 0.15) / 9), shut, 'accent')
    for cx in (-3.9, -1.75, 1.75, 3.9):
        ewin(cx, 3.7, 0.9, 1.4)
    for cx in (-3.9, -1.75, 1.75, 3.9):
        ewin(cx, 1.15, 0.9, 1.4)
    # front door with surround (pilasters + pediment)
    dw, dh = 1.0, 2.15
    box('fdoor', (dw, 0.06, dh), (0, fy - 0.02, 0.5 + dh / 2), accent, 'accent', 0.005)
    for i, (z0, ph) in enumerate(((0.2, 0.75), (1.05, 0.95))):
        for j in (-1, 1):
            box('fdoor_panel', (0.36, 0.015, ph), (j * 0.22, fy - 0.055, 0.5 + z0 + ph / 2), accent, 'accent', 0.01)
    brass = mat('brass', (0.75, 0.6, 0.35), rough=0.25, metal=1.0)
    sphere('fknob', 0.035, (0.38, fy - 0.08, 0.5 + 1.0), brass)
    for sd in (-1, 1):
        box('pilaster', (0.2, 0.1, dh + 0.1), (sd * (dw / 2 + 0.12), fy - 0.05, 0.5 + (dh + 0.1) / 2), trim, 'trim', 0.008)
    box('entablature', (dw + 0.7, 0.16, 0.25), (0, fy - 0.08, 0.5 + dh + 0.22), trim, 'trim', 0.01)
    box('cornice', (dw + 0.85, 0.24, 0.07), (0, fy - 0.12, 0.5 + dh + 0.38), trim, 'trim', 0.01)
    # steps + path
    stone = mat('stone', (0.58, 0.56, 0.52), rough=0.85, bump=bump_noise(0.3, 20))
    box('step1', (2.0, 0.8, 0.17), (0, fy - 0.5, 0.085), stone, bevel=0.01)
    box('step2', (1.8, 0.45, 0.34), (0, fy - 0.3, 0.17), stone, bevel=0.01)
    path = mat('path', (0.55, 0.52, 0.47), rough=0.9, bump=bump_tiles(1.2, 0.5, 0.5))
    box('path', (1.3, 7, 0.02), (0, fy - 4.4, 0.01), path)
    # shrubs
    shrub = mat('shrub', (0.07, 0.2, 0.05), rough=0.9, tex=tex_noise_color((0.03, 0.09, 0.02), (0.1, 0.22, 0.05), 18), bump=bump_noise(0.6, 25))
    random.seed(7)
    for sxn in list(range(-5, -1)) + list(range(2, 6)):
        for k in range(4):
            sphere('shrub', random.uniform(0.25, 0.38), (sxn * 1.0 + random.uniform(-0.35, 0.35), fy - 0.55 + random.uniform(-0.15, 0.15), random.uniform(0.3, 0.6)), shrub, scale=(1.1, 0.9, 0.85))
    # trees in the back / sides
    trees = mat('trees', (0.08, 0.2, 0.05), rough=0.9, tex=tex_noise_color((0.04, 0.12, 0.03), (0.16, 0.3, 0.08), 2.5))
    for (tx, ty, r) in ():
        sphere('tree', r, (tx, ty + 6, r + 1.5), trees, scale=(1, 1, 1.25))
        cyl('trunk', 0.18, 2.5, (tx, ty, 1.25), mat('bark', (0.2, 0.14, 0.09), rough=0.9))
    sun((math.radians(50), 0, math.radians(-35)), 2.6)
    camera((-3.2, -16.5, 2.0), (0.2, 0, 3.6), lens=28)

ROOMS = {
    'living': room_living, 'bedroom': room_bedroom, 'kitchen': room_kitchen,
    'dining': room_dining, 'exterior': room_exterior,
}

# ---------------------------------------------------------------- rendering

def render(out_png, samples, width, height):
    s = bpy.context.scene
    s.render.resolution_x = width; s.render.resolution_y = height; s.render.resolution_percentage = 100
    s.cycles.samples = samples
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGB'
    s.render.filepath = out_png
    bpy.ops.render.render(write_still=True)

def render_labels(out_png, width, height):
    """Flat emission per label, 1 sample, no AA: every pixel is exactly one label."""
    s = bpy.context.scene
    lm = {}
    for lv in range(7):
        m = bpy.data.materials.new('label%d' % lv); m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
        v = lv * 40 / 255.0
        em.inputs['Color'].default_value = (v, v, v, 1); em.inputs['Strength'].default_value = 1.0
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        lm[lv] = m
    for o in s.objects:
        if o.type != 'MESH':
            continue
        lv = int(o.get('label', 0))
        o.data.materials.clear(); o.data.materials.append(lm[lv])
        o.visible_shadow = False
    for o in list(s.objects):
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o, do_unlink=True)
    if s.world:
        s.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    s.view_settings.view_transform = 'Raw'; s.view_settings.look = 'None'
    s.cycles.samples = 1; s.cycles.use_denoising = False
    s.cycles.max_bounces = 0
    s.cycles.filter_width = 0.01
    s.render.dither_intensity = 0
    s.cycles.seed = 0
    s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_mode = 'BW'
    s.render.image_settings.color_depth = '8'
    s.render.filepath = out_png
    bpy.ops.render.render(write_still=True)

def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    out = args[0]; os.makedirs(out, exist_ok=True)
    samples, width = 160, 1600
    names = []
    i = 1
    while i < len(args):
        if args[i] == '--samples': samples = int(args[i + 1]); i += 2
        elif args[i] == '--size': width = int(args[i + 1]); i += 2
        else: names.append(args[i]); i += 1
    names = names or list(ROOMS)
    height = int(width * 2 / 3)
    for name in names:
        t = time.time()
        reset(); _mats.clear(); random.seed(1)
        ROOMS[name]()
        render(os.path.join(out, name + '.png'), samples, width, height)
        render_labels(os.path.join(out, name + '-labels.png'), width, height)
        print('ROOM', name, 'done in', round(time.time() - t), 's', flush=True)

main()
