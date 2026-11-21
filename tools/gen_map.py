"""Generate the bird's-eye town map for home.html (scenery, trail, checkpoints).

Usage (from the repo root; needs shapely):
  python3 tools/gen_map.py /tmp/map.frag && python3 tools/splice_map.py home.html /tmp/map.frag
The fragment replaces everything between the <svg id="map"> tag and the pets layer.

The view is a top-down "RPG overworld" angle: you see roofs from above and each building's front wall.
The street climbs from the bottom-left to the top-right like a staircase: a flat stretch at each shop,
then a smooth climb up and to the right, so Right/Up always means forward and Left/Down means back.

Layout knobs: SEGS (the walkable route), SHOPS (which stop gets which shop), STREAM, CASTLE_AT, MILL_AT.
Houses, trees and lamps are scattered randomly (fixed seed) where they hide neither road nor shops.
"""
import math, random, sys
from shapely.geometry import Point, box, LineString, Polygon
from shapely.ops import unary_union

random.seed(11)
W, H = 1000, 530            # the town itself; stops, shops and the castle all sit inside this
# The drawn world is bigger than the town, so the map can fill any screen shape without cropping the
# town: forest and meadow carry on all round. Must match the <svg viewBox> in home.html and WORLD in home.js.
WX0, WY0, WX1, WY1 = -300, -200, 1300, 730
CORE = None                 # set below, once shapely is imported (box of the town)
ROAD_HALF = 22

def f(v):
    return ('%.1f' % v).rstrip('0').rstrip('.')

# ── The route: one list of cubic beziers per hop (seg-0 .. seg-3) ──
def line(a, b):
    return (a, (a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3),
            (a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3), b)

def climb(a, b):  # S-curve up and to the right, flat at both ends
    dx = b[0] - a[0]
    return (a, (a[0] + dx * .55, a[1]), (b[0] - dx * .55, b[1]), b)

ROWS = [480, 370, 260, 150]
STOPS = [(60, 480), (230, 480), (430, 370), (630, 260), (830, 150)]
SEGS = [
    [line((60, 480), (230, 480))],
    [line((230, 480), (300, 480)), climb((300, 480), (400, 370)), line((400, 370), (430, 370))],
    [line((430, 370), (500, 370)), climb((500, 370), (600, 260)), line((600, 260), (630, 260))],
    [line((630, 260), (700, 260)), climb((700, 260), (800, 150)), line((800, 150), (830, 150))],
]
LEAD_IN = [line((WX0 - 40, 480), (60, 480))]
ONWARD = [line((830, 150), (900, 150)), climb((900, 150), (1000, 70)), line((1000, 70), (WX1 + 40, 70))]

def bez(c, t):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = c
    u = 1 - t
    return (u**3*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t**3*x3,
            u**3*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t**3*y3)

def sample(curves, n=80):
    pts = []
    for c in curves:
        for i in range(n + 1):
            p = bez(c, i / n)
            if not pts or math.dist(p, pts[-1]) > 0.5:
                pts.append(p)
    return pts

def seg_d(curves):
    d = 'M%s %s' % (f(curves[0][0][0]), f(curves[0][0][1]))
    for c in curves:
        d += ' C%s %s, %s %s, %s %s' % tuple(f(v) for v in (c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1]))
    return d

all_curves = LEAD_IN + [c for s in SEGS for c in s] + ONWARD
center = LineString(sample(all_curves))
road = center.buffer(ROAD_HALF, 24)
frame = box(WX0 - 40, WY0 - 40, WX1 + 40, WY1 + 40)
CORE = box(0, 0, W, H)
road = road.intersection(frame)

def ring_d(coords):
    c = list(coords)
    return 'M' + ' L'.join('%s %s' % (f(x), f(y)) for x, y in c[:-1]) + ' Z'

def poly_d(poly):
    if poly.is_empty:
        return ''
    if poly.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return ' '.join(poly_d(g) for g in poly.geoms if g.geom_type in ('Polygon', 'MultiPolygon'))
    return ring_d(poly.exterior.coords) + ''.join(' ' + ring_d(r.coords) for r in poly.interiors)

def lines_d(geom):
    if geom.is_empty:
        return ''
    if geom.geom_type in ('MultiLineString', 'GeometryCollection'):
        return ' '.join(lines_d(g) for g in geom.geoms)
    if geom.geom_type == 'LineString':
        c = list(geom.coords)
        return 'M' + ' L'.join('%s %s' % (f(x), f(y)) for x, y in c)
    return ''

# ── Stream (with a bridge where the street crosses it) and pond ──
def smooth(points, n=12):
    """Catmull-Rom through points."""
    out = []
    p = [points[0]] + points + [points[-1]]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in (0, 1)))
    out.append(points[-1])
    return out

STREAM = [(700, WY0 - 40), (760, -150), (735, -20), (742, 60), (728, 130), (752, 205), (790, 280), (775, 350), (820, 420), (880, 470), (930, 545), (960, 650), (1010, WY1 + 40)]
stream_line = LineString(smooth(STREAM))
stream = unary_union([stream_line.buffer(15, 16)])
POND = Point(905, 330).buffer(40, 32)
POND = Polygon([(905 + 46 * math.cos(a) + 6 * math.sin(3 * a), 330 + 30 * math.sin(a)) for a in [i * math.pi / 30 for i in range(60)]])
water = unary_union([stream, POND])
bridge = road.intersection(stream.buffer(7))
water_vis = water.difference(road)

# ── Castle path: a dirt track from the castle gate down to the street ──
CASTLE_AT = (175, 214)   # front-centre of the castle wall (gate)
castle_path_line = LineString(sample([((175, 232), (175, 290), (120, 336), (125, 460))], 40))
castle_path = castle_path_line.buffer(8, 12).difference(road)

# ── Paint helpers ──
INK = '#3b2c22'
TIMBER = '#5b3a26'
ROOFS = ['#b4553d', '#9c4a3a', '#5c6b86', '#7a5a45', '#c06a45', '#6f5a7a', '#8a6a4a']
WALLS = ['#f1e4c8', '#efe0c4', '#e9dcc0', '#f4ead6', '#e6d4b4', '#dcd3c4']

def shade(hexc, k):
    r, g, b = int(hexc[1:3], 16), int(hexc[3:5], 16), int(hexc[5:7], 16)
    return '#%02x%02x%02x' % (min(255, int(r * k)), min(255, int(g * k)), min(255, int(b * k)))

def at(x, y, inner, cls=''):
    c = ' class="%s"' % cls if cls else ''
    return '<g%s transform="translate(%s %s)">%s</g>' % (c, f(x), f(y), inner)

def window(x, y, w, h, lit=True, cls=''):
    fill = '#ffd47a' if lit else '#6d7f93'
    c = ' class="%s"' % cls if cls else ''
    return ('<rect%s x="%s" y="%s" width="%s" height="%s" fill="%s" stroke="%s" stroke-width="1.5"/>'
            '<path d="M%s %s V%s M%s %s H%s" stroke="%s" stroke-width="1.1" fill="none"/>') % (
        c, f(x), f(y), f(w), f(h), fill, TIMBER, f(x + w / 2), f(y), f(y + h), f(x), f(y + h / 2), f(x + w), TIMBER)

def roof_block(x0, x1, top, bottom, color, back=7):
    """A roof seen from above at an angle: big front slope with tiles, thin back slope behind the ridge."""
    o = []
    o.append('<path d="M%s %s H%s V%s H%s Z" fill="%s" stroke="%s" stroke-width="1.2"/>'
             % (f(x0), f(top - back), f(x1), f(top), f(x0), shade(color, .7), INK))
    o.append('<path d="M%s %s H%s V%s H%s Z" fill="%s" stroke="%s" stroke-width="1.2"/>'
             % (f(x0), f(top), f(x1), f(bottom), f(x0), color, INK))
    o.append('<path d="M%s %s H%s V%s H%s Z" fill="url(#tiles)"/>' % (f(x0), f(top), f(x1), f(bottom), f(x0)))
    o.append('<path d="M%s %s H%s" stroke="%s" stroke-width="2" stroke-opacity=".35"/>' % (f(x0 + 1), f(bottom - 1.5), f(x1 - 1), INK))
    o.append('<path d="M%s %s H%s" stroke="#fff" stroke-width="1.4" stroke-opacity=".35"/>' % (f(x0 + 2), f(top + 1.5), f(x1 - 2)))
    return ''.join(o)

def shadow_rect(x0, y0, x1, y1):
    return '<path d="M%s %s H%s V%s H%s Z" fill="#1f2a14" opacity=".2"/>' % (f(x0 + 7), f(y0 + 5), f(x1 + 7), f(y1 + 4), f(x0 + 7))

def house(w, fh, rh, roof, wall, lit, chimney, dormer):
    hw = w / 2
    o = [shadow_rect(-hw - 4, -fh - rh - 7, hw + 4, 0)]
    # front wall
    o.append('<rect x="%s" y="%s" width="%s" height="%s" fill="%s" stroke="%s" stroke-width="1.2"/>' % (f(-hw), f(-fh), f(w), f(fh), wall, INK))
    o.append('<path d="M%s 0 V%s M%s 0 V%s M%s %s H%s" stroke="%s" stroke-width="2.2" fill="none"/>'
             % (f(-hw + 1.5), f(-fh), f(hw - 1.5), f(-fh), f(-hw), f(-fh + 1), f(hw), TIMBER))
    ww = 9
    o.append(window(-hw + 6, -fh + 5, ww, fh - 11, lit[0]))
    if w > 50:
        o.append(window(hw - 6 - ww, -fh + 5, ww, fh - 11, lit[1]))
        door_x = -5
    else:
        door_x = hw - 16
    o.append('<path d="M%s 0 V%s a5 5 0 0 1 10 0 V0 Z" fill="#6b4a33" stroke="%s" stroke-width="1.1"/>' % (f(door_x), f(-fh + 9), INK))
    # roof
    o.append(roof_block(-hw - 4, hw + 4, -fh - rh, -fh, roof))
    if dormer:
        o.append('<path d="M-8 %s V%s L0 %s L8 %s V%s Z" fill="%s" stroke="%s" stroke-width="1.1"/>'
                 % (f(-fh - 2), f(-fh - 12), f(-fh - 19), f(-fh - 12), f(-fh - 2), wall, INK))
        o.append(window(-4, -fh - 12, 8, 8, lit[-1]))
    if chimney:
        cx = hw * .45
        o.append('<path d="M%s %s v-12 h8 v12 Z" fill="#8c6b5a" stroke="%s" stroke-width="1.1"/><path d="M%s %s h8" stroke="%s" stroke-width="2"/>'
                 % (f(cx), f(-fh - rh + 4), INK, f(cx), f(-fh - rh - 8), INK))
    return ''.join(o)

def tree(r, kind):
    if kind == 'pine':
        return ('<ellipse cx="7" cy="2" rx="%s" ry="%s" fill="#1f2a14" opacity=".2"/>' % (f(r * .9), f(r * .45)) +
                '<path d="M0 %s L%s -%s L%s -%s L%s -%s L%s -%s L%s -%s L%s -%s Z" fill="#3f6b3d" stroke="%s" stroke-width="1" stroke-opacity=".5"/>'
                % (f(-r * 3), f(r * .7), f(r * 1.4), f(r * .45), f(r * 1.5), f(r), f(r * .2), f(-r), f(r * .2), f(-r * .45), f(r * 1.5),
                   f(-r * .7), f(r * 1.4), INK) +
                '<path d="M0 %s L%s -%s" stroke="#6f9a55" stroke-width="2" stroke-linecap="round"/>' % (f(-r * 2.6), f(-r * .35), f(r * 1.6)))
    return ('<ellipse cx="6" cy="1" rx="%s" ry="%s" fill="#1f2a14" opacity=".2"/>' % (f(r * 1.2), f(r * .55)) +
            '<path d="M-2 0 V-%s H2 V0 Z" fill="#5b3a26"/>' % f(r * .6) +
            '<circle cx="%s" cy="-%s" r="%s" fill="#557d44"/>' % (f(r * .35), f(r * 1.1), f(r * .95)) +
            '<circle cx="-%s" cy="-%s" r="%s" fill="#6f9a55"/>' % (f(r * .4), f(r * 1.3), f(r * .85)) +
            '<circle cx="0" cy="-%s" r="%s" fill="#87b066" stroke="%s" stroke-width="1" stroke-opacity=".3"/>' % (f(r * 1.6), f(r * .8), INK) +
            '<circle cx="-%s" cy="-%s" r="%s" fill="#a6c97c"/>' % (f(r * .3), f(r * 1.85), f(r * .35)))

def bush(r):
    return ('<ellipse cx="4" cy="1" rx="%s" ry="%s" fill="#1f2a14" opacity=".18"/>' % (f(r * 1.1), f(r * .5)) +
            '<circle cx="-%s" cy="-%s" r="%s" fill="#6f9a55"/><circle cx="%s" cy="-%s" r="%s" fill="#7fa866"/>'
            % (f(r * .4), f(r * .5), f(r * .7), f(r * .4), f(r * .6), f(r * .75)) +
            '<circle cx="0" cy="-%s" r="%s" fill="#e86f5a"/><circle cx="%s" cy="-%s" r="1.6" fill="#ffd47a"/>' % (f(r * .9), f(1.6), f(r * .5), f(r * .5)))

def lamp():
    return ('<ellipse cx="5" cy="1" rx="5" ry="2" fill="#1f2a14" opacity=".2"/>'
            '<path d="M0 0 V-30" stroke="#3b3530" stroke-width="2.4"/>'
            '<circle cx="0" cy="-34" r="11" fill="url(#lampGlow)"/>'
            '<path d="M-4 -30 h8 l-1.5 -8 h-5 Z" fill="#ffe08a" stroke="#3b3530" stroke-width="1.4"/>'
            '<path d="M-5 -38 h10 l-5 -4 Z" fill="#3b3530"/>')

# ── Shops ──
ICONS = {
    'about': '<circle cx="0" cy="-3.5" r="3.2"/><path d="M-6.5 5 q6.5 -8 13 0"/>',
    'projects': '<path d="M-5 5 L4 -4 M1.5 -6.5 l5 5 l-2.2 2.2 l-5 -5 Z"/>',
    'experience': '<path d="M-3 -6 l-2 6 l3 -2 l2 3 l1 -6 M3 -6 l2 6 l-3 -2 l-2 3"/><circle cx="0" cy="-1" r="4" fill="#ffc21a"/>',
    'contact': '<path d="M-7 -4.5 h14 v9 h-14 Z M-7 -4.5 l7 5 l7 -5"/>',
}
NAMES = {1: 'About', 2: 'Projects', 3: 'Experience', 4: 'Contact'}
SHOPS = [  # node, section, wall, roof, awning
    (1, 'about', '#f1e4c8', '#b4553d', '#b4553d'),
    (2, 'projects', '#e3dccd', '#5c6b86', '#4f6fa3'),
    (3, 'experience', '#eadbb4', '#5f8a6e', '#4c8a5e'),
    (4, 'contact', '#f3e9d8', '#7d4f6a', '#7d4f6a'),
]
SHOP_W, SHOP_FH, SHOP_RH = 110, 42, 44
SHOP_TOP = SHOP_FH + SHOP_RH + 7

def shop(section, wall, roof, awning):
    hw, fh, rh = SHOP_W / 2, SHOP_FH, SHOP_RH
    p = [shadow_rect(-hw - 5, -fh - rh - 7, hw + 5, 0)]
    p.append('<rect x="%s" y="%s" width="%s" height="%s" fill="%s" stroke="%s" stroke-width="1.3"/>' % (f(-hw), f(-fh), f(SHOP_W), f(fh), wall, INK))
    p.append('<path d="M%s 0 V%s M%s 0 V%s M-16 0 V%s M16 0 V%s M%s %s H%s" stroke="%s" stroke-width="2.6" fill="none"/>'
             % (f(-hw + 2), f(-fh), f(hw - 2), f(-fh), f(-fh), f(-fh), f(-hw), f(-fh + 1.5), f(hw), TIMBER))
    # shop windows (the first rect.window is where the pet waits)
    p.append('<rect class="window" x="-49" y="-29" width="28" height="21" fill="#ffe2a0" stroke="%s" stroke-width="1.8"/>' % TIMBER)
    p.append('<path d="M-35 -29 V-8" stroke="%s" stroke-width="1.2"/>' % TIMBER)
    p.append('<rect x="21" y="-29" width="28" height="21" fill="#ffe2a0" stroke="%s" stroke-width="1.8"/>' % TIMBER)
    p.append('<path d="M35 -29 V-8" stroke="%s" stroke-width="1.2"/>' % TIMBER)
    p.append('<path d="M-52 -8 h34 v4 h-34 Z M18 -8 h34 v4 h-34 Z" fill="#7a5230" stroke="%s" stroke-width="1"/>' % INK)
    p.append('<path d="M-48 -8 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 M22 -8 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0" fill="#e86f5a" stroke="#4f7a45" stroke-width="1"/>')
    for x0 in (-53, 17):
        stripes = []
        for k in range(6):
            col = awning if k % 2 == 0 else '#f6efe2'
            stripes.append('<path d="M%s -38 h6 l.6 7 a3.3 3.3 0 0 1 -6.6 0 Z" fill="%s"/>' % (f(x0 + k * 6), col))
        p.append('<g stroke="%s" stroke-width=".9">%s</g>' % (INK, ''.join(stripes)))
    # doorway: open and lit, so zooming through it lands in the shop
    p.append('<path d="M-12 0 V-27 a12 12 0 0 1 24 0 V0 Z" fill="#5b3a26" stroke="%s" stroke-width="1.2"/>' % INK)
    p.append('<path class="door" d="M-9 0 V-26 a9 9 0 0 1 18 0 V0 Z"/>')
    p.append('<path d="M-15 0 h30 v4 h-30 Z" fill="#9c8f80" stroke="%s" stroke-width="1"/>' % INK)
    # roof, with a dormer and a chimney
    p.append(roof_block(-hw - 6, hw + 6, -fh - rh, -fh, roof))
    p.append('<path d="M-13 %s V%s L0 %s L13 %s V%s Z" fill="%s" stroke="%s" stroke-width="1.2"/>'
             % (f(-fh - 3), f(-fh - 20), f(-fh - 30), f(-fh - 20), f(-fh - 3), wall, INK))
    p.append(window(-6, -fh - 21, 12, 14, True))
    p.append('<path d="M%s %s v-14 h10 v14 Z" fill="#8c6b5a" stroke="%s" stroke-width="1.2"/><path d="M%s %s h10" stroke="%s" stroke-width="2.4"/>'
             % (f(hw - 26), f(-fh - rh + 6), INK, f(hw - 26), f(-fh - rh - 8), INK))
    # hanging sign on an iron bracket
    p.append('<path d="M%s -40 h20 M%s -40 l7 -7" stroke="#3b3530" stroke-width="2" fill="none"/>' % (f(hw), f(hw + 2)))
    p.append('<path d="M%s -40 v4 M%s -40 v4" stroke="#3b3530" stroke-width="1.2"/>' % (f(hw + 7), f(hw + 18)))
    p.append('<rect x="%s" y="-36" width="22" height="20" rx="2" fill="#f6efe2" stroke="%s" stroke-width="2"/>' % (f(hw + 2), awning))
    p.append('<g transform="translate(%s -26)" fill="none" stroke="%s" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">%s</g>'
             % (f(hw + 13), INK, ICONS[section]))
    return ''.join(p)

def shop_origin(node):
    x, y = STOPS[node]
    return x, y - ROAD_HALF + 1      # doorstep on the street's upper edge

shop_rects, label_rects = [], []
for node, *_ in SHOPS:
    x, y = shop_origin(node)
    shop_rects.append(box(x - SHOP_W / 2 - 8, y - SHOP_TOP - 2, x + SHOP_W / 2 + 28, y + 6))
    label_rects.append(box(x - 60, y - SHOP_TOP - 28, x + 60, y - SHOP_TOP))

# ── Castle on the hill (top-left), windmill and fields (top-middle) ──
def castle():
    """A fortress seen from the front and a little above: high walls and a keep hide the yard."""
    x, y = CASTLE_AT
    o = ['<g transform="translate(%s %s)">' % (f(x), f(y))]

    def merlons(x0, x1, top, h=7, w=7, gap=6, fill='#d8cfc1'):
        d, k = [], x0
        while k + w <= x1 + 0.1:
            d.append('M%s %s h%s v%s h-%s Z' % (f(k), f(top - h), f(w), f(h), f(w)))
            k += w + gap
        return '<path d="%s" fill="%s" stroke="%s" stroke-width="1"/>' % (' '.join(d), fill, INK)

    def round_tower(cx, base, top, r, roof, flag=True, lit=True):
        t = []
        t.append('<path d="M%s %s V%s H%s V%s Z" fill="url(#towerShade)" stroke="%s" stroke-width="1.3"/>'
                 % (f(cx - r), f(base), f(top), f(cx + r), f(base), INK))
        t.append('<path d="M%s %s V%s H%s V%s Z" fill="url(#bricks)" opacity=".7"/>' % (f(cx - r), f(base), f(top), f(cx + r), f(base)))
        if lit:
            t.append('<path d="M%s %s v-12 a3 3 0 0 1 6 0 v12 Z" fill="#ffd98a" stroke="%s" stroke-width="1"/>' % (f(cx - 3), f(top + 26), INK))
        t.append('<path d="M%s %s v10 M%s %s v10" stroke="%s" stroke-width="2.2" stroke-linecap="round"/>'
                 % (f(cx - r * .45), f(base - 34), f(cx + r * .45), f(base - 34), '#3d3230'))
        # conical roof with its shaded side
        t.append('<path d="M%s %s L%s %s L%s %s Z" fill="%s" stroke="%s" stroke-width="1.3"/>'
                 % (f(cx - r - 5), f(top), f(cx), f(top - r * 2.3), f(cx + r + 5), f(top), roof, INK))
        t.append('<path d="M%s %s L%s %s L%s %s Z" fill="%s"/>' % (f(cx), f(top - r * 2.3), f(cx + r + 5), f(top), f(cx + r * .25), f(top), shade(roof, .72)))
        t.append('<path d="M%s %s L%s %s L%s %s Z" fill="url(#tiles)" opacity=".7"/>' % (f(cx - r - 5), f(top), f(cx), f(top - r * 2.3), f(cx + r + 5), f(top)))
        if flag:
            ft = top - r * 2.3
            t.append('<path d="M%s %s V%s" stroke="%s" stroke-width="1.4"/><path d="M%s %s q7 -3 13 1 q-6 3 -13 7 Z" fill="#c0504a" stroke="%s" stroke-width="1"/>'
                     % (f(cx), f(ft), f(ft - 16), INK, f(cx), f(ft - 16), INK))
        return ''.join(t)

    # the moat: a ring of water all the way round (the castle is drawn over its inner edge)
    def rrect(x0, y0, x1, y1, r):
        return ('M%s %s H%s A%s %s 0 0 1 %s %s V%s A%s %s 0 0 1 %s %s H%s A%s %s 0 0 1 %s %s V%s A%s %s 0 0 1 %s %s Z'
                % (f(x0 + r), f(y0), f(x1 - r), r, r, f(x1), f(y0 + r), f(y1 - r), r, r, f(x1 - r), f(y1),
                   f(x0 + r), r, r, f(x0), f(y1 - r), f(y0 + r), r, r, f(x0 + r), f(y0)))
    # its far side runs behind the keep, so only the corners show, curving in round the back
    ring = rrect(-142, -104, 142, 19, 38) + ' ' + rrect(-125, -88, 125, 4, 24)
    o.append('<path d="%s" fill="#7fb6d6" fill-rule="evenodd" stroke="#5f8fae" stroke-width="2"/>' % ring)
    o.append('<path d="M-104 12 h14 M-60 11 h12 M40 12 h14 M86 11 h12 M-134 -20 v12 M134 -30 v12 M-134 -62 v10 M134 -66 v10"'
             ' stroke="#d6ecf7" stroke-width="1.5" stroke-linecap="round"/>')
    o.append('<ellipse cx="10" cy="2" rx="128" ry="10" fill="#1f2a14" opacity=".18"/>')
    # back towers and the keep, rising above the front wall (they hide the yard)
    o.append(round_tower(-74, -60, -128, 13, '#5c4a6e', lit=False))
    o.append(round_tower(74, -60, -128, 13, '#5c4a6e', lit=False))
    # side halls along the inner walls
    for hx0, hx1 in ((-98, -50), (50, 98)):
        o.append('<rect x="%s" y="-86" width="%s" height="26" fill="#cbc1b1" stroke="%s" stroke-width="1.2"/>' % (f(hx0), f(hx1 - hx0), INK))
        o.append(roof_block(hx0 - 3, hx1 + 3, -112, -86, '#7d4f6a', back=5))
    # the keep
    o.append('<rect x="-50" y="-112" width="100" height="52" fill="url(#keepShade)" stroke="%s" stroke-width="1.3"/>' % INK)
    o.append('<rect x="-50" y="-112" width="100" height="52" fill="url(#bricks)" opacity=".6"/>')
    for wx in (-38, -20, 14, 32):
        o.append('<path d="M%s -82 v-12 a3.5 3.5 0 0 1 7 0 v12 Z" fill="#ffd98a" stroke="%s" stroke-width="1"/>' % (f(wx), INK))
    o.append(merlons(-50, 50, -112))
    # the great tower in the middle of the keep
    o.append('<rect x="-20" y="-150" width="40" height="40" fill="url(#towerShade)" stroke="%s" stroke-width="1.3"/>' % INK)
    o.append('<rect x="-20" y="-150" width="40" height="40" fill="url(#bricks)" opacity=".6"/>')
    o.append('<path d="M-5 -122 v-14 a5 5 0 0 1 10 0 v14 Z" fill="#ffd98a" stroke="%s" stroke-width="1.1"/>' % INK)
    o.append('<path d="M-25 -150 L0 -192 L25 -150 Z" fill="#6f4a78" stroke="%s" stroke-width="1.3"/>'
             '<path d="M0 -192 L25 -150 H4 Z" fill="#553760"/>'
             '<path d="M-25 -150 L0 -192 L25 -150 Z" fill="url(#tiles)" opacity=".7"/>' % INK)
    o.append('<path d="M0 -192 V-210" stroke="%s" stroke-width="1.5"/><path d="M0 -210 q9 -4 17 1 q-8 4 -17 9 Z" fill="#ffc21a" stroke="%s" stroke-width="1"/>' % (INK, INK))
    # the front curtain wall, with arrow slits and hanging banners
    o.append('<rect x="-104" y="-60" width="208" height="60" fill="#cfc6b8" stroke="%s" stroke-width="1.4"/>' % INK)
    o.append('<rect x="-104" y="-60" width="208" height="60" fill="url(#bricks)" opacity=".8"/>')
    o.append('<path d="M-104 -60 H104 V-56 H-104 Z" fill="#e2dbcf"/>')
    o.append(merlons(-104, 104, -60))
    o.append('<path d="M-84 -36 v12 M-62 -36 v12 M62 -36 v12 M84 -36 v12" stroke="#3d3230" stroke-width="2.4" stroke-linecap="round"/>')
    for bx in (-50, 50):
        o.append('<path d="M%s -58 h18 v32 l-9 -6 l-9 6 Z" fill="#8f2a1c" stroke="%s" stroke-width="1.2"/>' % (f(bx - 9), INK) +
                 '<path d="M%s -50 l2.4 5 l5.4 .7 l-4 3.8 l1 5.3 l-4.8 -2.6 l-4.8 2.6 l1 -5.3 l-4 -3.8 l5.4 -.7 Z" fill="#ffc21a"/>' % f(bx))
    # gatehouse: two towers either side of the gate, with a portcullis
    for gx in (-26, 26):
        o.append('<path d="M%s 0 V-78 H%s V0 Z" fill="url(#towerShade)" stroke="%s" stroke-width="1.3"/>' % (f(gx - 12), f(gx + 12), INK))
        o.append('<path d="M%s 0 V-78 H%s V0 Z" fill="url(#bricks)" opacity=".7"/>' % (f(gx - 12), f(gx + 12)))
        o.append(merlons(gx - 12, gx + 12, -78, h=6, w=5, gap=4.5))
        o.append('<path d="M%s -58 v10" stroke="#3d3230" stroke-width="2.4" stroke-linecap="round"/>' % f(gx))
    o.append('<path d="M-14 0 V-30 a14 14 0 0 1 28 0 V0 Z" fill="#2b2220" stroke="%s" stroke-width="1.4"/>' % INK)
    o.append('<path d="M-9 0 V-36 M-4.5 0 V-41 M0 0 V-43 M4.5 0 V-41 M9 0 V-36 M-14 -9 H14 M-14 -19 H14 M-13 -29 H13" stroke="#8a8078" stroke-width="1.4"/>')
    o.append('<path d="M-18 -30 a18 18 0 0 1 36 0" fill="none" stroke="#a89e8e" stroke-width="3"/>')
    # torches by the gate
    for tx in (-19, 19):
        o.append('<circle cx="%s" cy="-40" r="10" fill="url(#lampGlow)"/><path d="M%s -34 v-6" stroke="#5b3a26" stroke-width="2"/>'
                 '<path d="M%s -40 q-3 -4 0 -9 q3 5 0 9 Z" fill="#ffb03a"/>' % (f(tx), f(tx), f(tx)))
    # front corner towers, tallest of all
    o.append(round_tower(-104, 2, -92, 17, '#6f4a78'))
    o.append(round_tower(104, 2, -92, 17, '#6f4a78'))
    # an alligator patrolling the moat (swims via CSS: .gator)
    o.append('<g transform="translate(56 12)"><g class="gator">'
             '<path d="M-20 0 q-8 -1 -12 2 q5 1 12 1 Z" fill="#4f7a45" stroke="%s" stroke-width=".8"/>'
             '<ellipse cx="-4" cy="0" rx="17" ry="4.2" fill="#5f8f4e" stroke="%s" stroke-width="1"/>'
             '<path d="M-14 -3 l2 -2 l2 2 M-8 -4 l2 -2 l2 2 M-2 -4 l2 -2 l2 2 M4 -3.5 l2 -2 l2 2" fill="none" stroke="#3f6b3d" stroke-width="1"/>'
             '<path d="M12 -1.5 q10 -1 15 1 q-5 2.5 -15 1.5 Z" fill="#6f9a55" stroke="%s" stroke-width="1"/>'
             '<circle cx="12" cy="-3.6" r="1.9" fill="#6f9a55" stroke="%s" stroke-width=".8"/><circle cx="12.4" cy="-3.9" r=".8" fill="#ffd24a"/>'
             '<path d="M-22 4.5 q4 -1.5 8 0 M18 3.5 q5 -1.5 9 .5" fill="none" stroke="#d6ecf7" stroke-width="1.1" stroke-linecap="round"/>'
             '</g></g>' % (INK, INK, INK, INK))
    # drawbridge across the front of the moat
    o.append('<path d="M-14 0 h28 v21 h-28 Z" fill="#a8743d" stroke="#5b3a26" stroke-width="1.4"/>'
             '<path d="M-14 5 h28 M-14 10 h28 M-14 15 h28" stroke="#6b4a2c" stroke-width="1"/>'
             '<path d="M-14 0 L-20 -26 M14 0 L20 -26" stroke="#3d3230" stroke-width="1.2"/>')
    o.append('</g>')
    return ''.join(o)

MILL_AT = (520, 158)
def windmill():
    x, y = MILL_AT
    return ('<g transform="translate(%s %s)">' % (f(x), f(y)) +
            '<ellipse cx="10" cy="2" rx="26" ry="7" fill="#1f2a14" opacity=".2"/>'
            '<path d="M-18 0 L-12 -58 H12 L18 0 Z" fill="#efe4cf" stroke="%s" stroke-width="1.3"/>' % INK +
            '<path d="M12 -58 L18 0 H8 L5 -58 Z" fill="#d7c8ab"/>'
            '<path d="M-6 0 V-14 a6 6 0 0 1 12 0 V0 Z" fill="#6b4a33" stroke="%s" stroke-width="1.1"/>' % INK +
            window(-4, -40, 8, 10, True) +
            '<path d="M-16 -58 L0 -76 L16 -58 Z" fill="#9c4a3a" stroke="%s" stroke-width="1.2"/>' % INK +
            '<g transform="translate(0 -64)"><g class="sails">'
            '<g fill="#f6efe2" stroke="%s" stroke-width="1.2">' % INK +
            ''.join('<g transform="rotate(%d)"><path d="M0 0 V-44" stroke="%s" stroke-width="2"/><path d="M2 -12 h9 v-30 h-9 Z"/>'
                    '<path d="M2 -22 h9 M2 -32 h9 M6.5 -12 v-30" stroke-width=".8"/></g>' % (a, TIMBER) for a in (0, 90, 180, 270)) +
            '</g><circle r="4" fill="%s"/></g></g></g>' % TIMBER)

FIELDS = [  # x, y, w, h, crop colour, row colour
    (330, 40, 120, 60, '#d9c46a', '#b89c45'),
    (330, 106, 120, 56, '#9cbf6a', '#7da152'),
    (585, 18, 120, 44, '#c9b46a', '#a8924c'),
    # out in the countryside beyond the town
    (-270, -170, 150, 70, '#d9c46a', '#b89c45'),
    (-270, -94, 150, 60, '#a9c46a', '#8aa552'),
    (1100, 230, 160, 80, '#c9b46a', '#a8924c'),
    (1100, 316, 160, 64, '#9cbf6a', '#7da152'),
    (-270, 590, 150, 80, '#d9c46a', '#b89c45'),
    (180, -170, 170, 60, '#c9b46a', '#a8924c'),
]
def fields():
    o = []
    for x, y, w, h, c, r in FIELDS:
        o.append('<rect x="%s" y="%s" width="%s" height="%s" fill="%s" stroke="#8a6a3a" stroke-width="1.2" stroke-opacity=".6"/>' % (x, y, w, h, c))
        o.append('<path d="%s" stroke="%s" stroke-width="2" stroke-linecap="round"/>'
                 % (' '.join('M%s %s V%s' % (f(x + 6 + k * 8), f(y + 4), f(y + h - 4)) for k in range(int((w - 6) / 8))), r))
    # fence around the near fields
    o.append('<path d="M326 36 H454 V166 H326 Z" fill="none" stroke="#7a5230" stroke-width="1.6"/>')
    o.append('<path d="%s" stroke="#5b3a26" stroke-width="2.4" stroke-linecap="round"/>'
             % ' '.join('M%s 166 v-6' % f(326 + k * 16) for k in range(9)))
    # haystacks
    for hx, hy in ((470, 60), (466, 92)):
        o.append('<ellipse cx="%s" cy="%s" rx="10" ry="4" fill="#1f2a14" opacity=".2"/><path d="M%s %s a10 11 0 0 1 20 0 Z" fill="#e0c060" stroke="#a8863a" stroke-width="1.2"/>'
                 % (hx + 4, hy + 1, hx - 10, hy))
    return ''.join(o)

fields_area = unary_union([box(x - 6, y - 6, x + w + 6, y + h + 8) for x, y, w, h, _, _ in FIELDS] + [box(320, 30, 490, 172)])
castle_area = box(CASTLE_AT[0] - 146, CASTLE_AT[1] - 230, CASTLE_AT[0] + 146, CASTLE_AT[1] + 24)
mill_area = box(MILL_AT[0] - 50, MILL_AT[1] - 112, MILL_AT[0] + 50, MILL_AT[1] + 10)
start_zone = box(-10, 440, 160, 540)

blocked = unary_union([road.buffer(6), water.buffer(6), castle_path.buffer(4), fields_area, castle_area, mill_area]
                      + shop_rects + label_rects)

# ── Scatter houses, trees, bushes and lamps ──
items = []
taken = []

def try_place(rect, svg, y, max_overlap=0.2, avoid_start=True):
    if rect.intersects(blocked):
        return False
    if avoid_start and rect.intersects(start_zone):
        return False
    if any(rect.intersection(t).area > max_overlap * rect.area for t in taken):
        return False
    taken.append(rect)
    items.append((y, svg))
    return True

for _ in range(2600):
    x, y = random.uniform(WX0 + 10, WX1 - 10), random.uniform(WY0 + 60, WY1 + 15)
    if not CORE.contains(Point(x, y)) and random.random() < 0.96:
        continue       # the border is mostly forest, with the odd cottage
    w = random.choice([44, 50, 56, 62, 70])
    fh = random.uniform(20, 26)
    rh = random.uniform(26, 34)
    rect = box(x - w / 2 - 5, y - fh - rh - 8, x + w / 2 + 12, y + 5)
    lit = [random.random() < .65 for _ in range(3)]
    try_place(rect, at(x, y, house(w, fh, rh, random.choice(ROOFS), random.choice(WALLS), lit,
                                   random.random() < .6, random.random() < .3)), y, 0.08)

TREE_SIZES, BUSH_SIZES = (9, 11, 13), (6, 7.5, 9)
SHAPES = ''.join('<g id="tree-%s-%d">%s</g>' % (k, i, tree(r, k)) for k in ('round', 'pine') for i, r in enumerate(TREE_SIZES))
SHAPES += ''.join('<g id="bush-%d">%s</g>' % (i, bush(r)) for i, r in enumerate(BUSH_SIZES))

def use(ref, x, y):
    return '<use href="#%s" x="%s" y="%s"/>' % (ref, f(x), f(y))

for _ in range(9000):
    x, y = random.uniform(WX0 - 10, WX1 + 10), random.uniform(WY0 + 10, WY1 + 30)
    inside = CORE.contains(Point(x, y))
    if inside and random.random() < 0.82:
        continue           # the town itself keeps roughly its old density; the countryside is forest
    i = random.randrange(3)
    r = TREE_SIZES[i]
    kind = 'pine' if random.random() < (.3 if inside else .45) else 'round'
    rect = box(x - r * 1.2, y - r * 3, x + r * 1.4, y + 3)
    try_place(rect, use('tree-%s-%d' % (kind, i), x, y), y, 0.35 if inside else 0.5,
              avoid_start=Point(x, y).distance(Point(60, 480)) < 70)

for _ in range(1400):
    x, y = random.uniform(WX0, WX1), random.uniform(WY0 + 20, WY1 + 20)
    i = random.randrange(3)
    r = BUSH_SIZES[i]
    rect = box(x - r, y - r * 1.6, x + r, y + 2)
    try_place(rect, use('bush-%d' % i, x, y), y, 0.2, avoid_start=Point(x, y).distance(Point(60, 480)) < 50)

# lamps along the street's lower edge, evenly spaced
route_line = LineString(sample([c for s in SEGS for c in s]))
for k in range(1, 9):
    d = route_line.length * k / 9
    p, q = route_line.interpolate(d), route_line.interpolate(d + 2)
    tx, ty = (q.x - p.x), (q.y - p.y)
    n = math.hypot(tx, ty) or 1
    nx, ny = -ty / n, tx / n
    if nx + ny < 0:
        nx, ny = -nx, -ny          # the side facing down/right, away from the shops
    lx, ly = p.x + nx * (ROAD_HALF + 6), p.y + ny * (ROAD_HALF + 6)
    if Point(lx, ly).buffer(6).intersects(water.buffer(4)) or Point(lx, ly).distance(Point(60, 480)) < 40:
        continue
    items.append((ly, at(lx, ly, lamp())))

items.sort(key=lambda it: it[0])

# ── Cobbles and bridge planks ──
def cobble_pattern():
    return ('<pattern id="cobbles" width="16" height="12" patternUnits="userSpaceOnUse">'
            '<rect width="16" height="12" fill="#d8cbb2"/>'
            '<g fill="#e4d9c4" stroke="#a89878" stroke-width=".9">'
            '<rect x=".8" y=".8" width="6.6" height="4.6" rx="2"/><rect x="8.6" y=".8" width="6.6" height="4.6" rx="2"/>'
            '<rect x="-3.2" y="6.6" width="6.6" height="4.6" rx="2"/><rect x="4.6" y="6.6" width="6.6" height="4.6" rx="2"/>'
            '<rect x="12.6" y="6.6" width="6.6" height="4.6" rx="2"/></g></pattern>')

def planks():
    out = []
    pts = list(center.coords)
    acc = 0
    for i in range(1, len(pts)):
        (x0, y0), (x1, y1) = pts[i - 1], pts[i]
        seg = math.dist(pts[i - 1], pts[i])
        acc += seg
        if acc < 5:
            continue
        acc = 0
        if not bridge.buffer(2).contains(Point(x1, y1)):
            continue
        tx, ty = (x1 - x0) / seg, (y1 - y0) / seg
        nx, ny = -ty, tx
        a = (x1 + nx * ROAD_HALF, y1 + ny * ROAD_HALF)
        b = (x1 - nx * ROAD_HALF, y1 - ny * ROAD_HALF)
        out.append('M%s %s L%s %s' % (f(a[0]), f(a[1]), f(b[0]), f(b[1])))
    return ' '.join(out)

rails = road.boundary.intersection(stream.buffer(10))

DEFS_HEAD = '''<defs>
  <pattern id="grass" width="40" height="34" patternUnits="userSpaceOnUse">
    <path d="M6 10 l2 -5 l2 5 M24 26 l2 -5 l2 5 M30 8 l1.5 -4 l1.5 4 M12 28 l1.5 -4 l1.5 4" fill="none" stroke="#6f9a55" stroke-width="1.2" stroke-opacity=".55" stroke-linecap="round"/>
    <circle cx="20" cy="14" r="1.1" fill="#fff6c8" opacity=".7"/><circle cx="36" cy="22" r="1" fill="#f6b6c8" opacity=".7"/>
  </pattern>
  <pattern id="tiles" width="8" height="6" patternUnits="userSpaceOnUse">
    <path d="M0 6 a4 4 0 0 1 8 0 M-4 3 a4 4 0 0 1 8 0 M4 3 a4 4 0 0 1 8 0" fill="none" stroke="#3b2c22" stroke-opacity=".4" stroke-width=".9"/>
  </pattern>
  %s
  <linearGradient id="towerShade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#e6ded2"/><stop offset=".45" stop-color="#d3cabd"/><stop offset="1" stop-color="#a99f90"/>
  </linearGradient>
  <linearGradient id="keepShade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#d9d0c3"/><stop offset="1" stop-color="#b9af9f"/>
  </linearGradient>
  <pattern id="bricks" width="16" height="8" patternUnits="userSpaceOnUse">
    <path d="M0 0 H16 M0 4 H16 M4 0 V4 M12 4 V8" fill="none" stroke="#7d7264" stroke-opacity=".35" stroke-width=".8"/>
  </pattern>
  <radialGradient id="lampGlow"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".85"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>
  <radialGradient id="vignette" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#1f2a14" stop-opacity="0"/><stop offset="1" stop-color="#1f2a14" stop-opacity=".22"/></radialGradient>
</defs>''' % cobble_pattern()
DEFS = DEFS_HEAD.replace('</defs>', '  <!-- trees and bushes, drawn once and reused -->\n  ' + SHAPES + '\n</defs>')

def checkpoints():
    o = ['<!-- ── Stops: shops on the street\'s upper edge (the wizard stops on the road out front) ── -->',
         '<g class="checkpoint" data-node="0" transform="translate(%s %s)"><title>Start</title>'
         '<circle class="hit" r="34" cy="-20"/></g>' % STOPS[0]]
    for node, section, wall, roof, awning in SHOPS:
        x, y = shop_origin(node)
        o.append('<g class="checkpoint" data-node="%d" transform="translate(%s %s)"><title>%s</title>'
                 '<g class="scenery shop">%s</g>'
                 '<text class="label" y="%s">%s</text></g>'
                 % (node, f(x), f(y), NAMES[node], shop(section, wall, roof, awning), f(-SHOP_TOP - 8), NAMES[node]))
    return '\n'.join(o)

out = [DEFS]
out.append('<!-- ── Scenery: a town seen from above, the street climbing bottom-left to top-right (generated by tools/gen_map.py) ── -->')
out.append('<g class="scenery" aria-hidden="true">')
out.append('<rect x="%s" y="%s" width="%s" height="%s" fill="#9cc47f"/><rect x="%s" y="%s" width="%s" height="%s" fill="url(#grass)"/>'
           % ((WX0, WY0, WX1 - WX0, WY1 - WY0) * 2))
for (x, y, rx, ry, c) in ((140, 90, 160, 70, '#a9cc8a'), (700, 440, 220, 80, '#93bb76'), (300, 300, 140, 50, '#a4c985'), (900, 120, 120, 60, '#94bb78'),
                         (-250, 300, 200, 120, '#93bb76'), (1250, 600, 220, 110, '#a4c985'), (500, -180, 260, 70, '#a9cc8a'), (300, 700, 260, 70, '#93bb76')):
    out.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity=".6"/>' % (x, y, rx, ry, c))
out.append(fields())
# water: banks, then water, then sparkles
out.append('<path d="%s" fill="#7fa866" stroke="#6a8f55" stroke-width="6" stroke-linejoin="round"/>' % poly_d(water_vis))
out.append('<path d="%s" fill="#7fb6d6"/>' % poly_d(water_vis.buffer(-3)))
out.append('<path d="%s" fill="none" stroke="#b9dcef" stroke-width="2" stroke-linecap="round" stroke-dasharray="8 22" opacity=".9"/>'
           % lines_d(stream_line.difference(road.buffer(4))))
out.append('<path d="M880 320 q6 -4 12 0 M905 345 q6 -4 12 0 M925 318 q5 -3 10 0" fill="none" stroke="#d6ecf7" stroke-width="1.6" stroke-linecap="round"/>')
out.append('<path d="M868 300 v-10 M872 302 v-13 M876 300 v-9 M938 352 v-11 M942 354 v-14" stroke="#4f7a45" stroke-width="2" stroke-linecap="round"/>')
# castle track, then the street
out.append('<path d="%s" fill="#c9b48e" stroke="#a8936c" stroke-width="1.5"/>' % poly_d(castle_path))
out.append('<path d="%s" fill="#1f2a14" opacity=".12" transform="translate(3 4)"/>' % poly_d(road))
out.append('<path class="road" d="%s" fill="url(#cobbles)" stroke="#8f7f63" stroke-width="3" stroke-linejoin="round"/>' % poly_d(road))
# bridge over the stream
out.append('<path d="%s" fill="#a8743d" stroke="#5b3a26" stroke-width="1.4"/>' % poly_d(bridge))
out.append('<path d="%s" stroke="#6b4a2c" stroke-width="1.2" fill="none" clip-path="url(#bridgeClip)"/>' % planks())
out.append('<clipPath id="bridgeClip"><path d="%s"/></clipPath>' % poly_d(bridge))
out.append('<path d="%s" stroke="#5b3a26" stroke-width="4" fill="none" stroke-linecap="round"/>' % lines_d(rails))
out.append(castle())
out.append(windmill())
for _, svg in items:
    out.append(svg)
out.append('</g>')
out.append('<!-- ── Path along the street (one segment per hop) ── -->')
out.append('<g class="trail" aria-hidden="true">' + ''.join('<path id="seg-%d" d="%s"/>' % (i, seg_d(s)) for i, s in enumerate(SEGS)) + '</g>')
out.append(checkpoints())
open(sys.argv[1], 'w').write('\n'.join(out) + '\n')
print('items:', len(items))
