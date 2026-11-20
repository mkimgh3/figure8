# Seolhwa's hanbok top, and the head mask that lets each skater on Tesa's body have her own hair colour (v3-look71).
#
# Tesa, Lumi and Seolhwa share one body (Rocketbox Female_Adult_17, assets/ava_model.js). This paints, from the 3D
# position of every texel, onto copies of Tesa's shipped textures (no other sources needed):
#   assets/seol_body.jpg   a jeogori: an ivory jacket to just under the bust with full sleeves, a crimson collar (git)
#                          crossing left over right with a white inner strip (dongjeong), white below it
#   assets/seol_mask.png   red 0.4 the jacket (cloth, no sequins), green the legs, blue the skates
#   assets/ava_head_mask.png  red her hair (scalp and bun), green her eyebrows, blue her lips: avatar.js recolours them
# Run from the project folder: python tools/assets/seol_paint.py
# Model space: x across (her left is +x), -y forward, z up, metres.
import os, re, sys, base64, tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from glb import load

A = os.path.join(ROOT, 'assets')
src = open(os.path.join(A, 'ava_model.js'), encoding='utf-8').read()
tmp = os.path.join(tempfile.mkdtemp(), 'ava.glb')
open(tmp, 'wb').write(base64.b64decode(re.search(r'["\'`]([A-Za-z0-9+/=]{1000,})["\'`]', src).group(1)))
j, acc = load(tmp)
joints = [j['nodes'][i]['name'] for i in j['skins'][0]['joints']]
S = 1024


def prim(name):
    return [p for p in j['meshes'][0]['primitives'] if name in j['materials'][p['material']]['name']][0]


def raster(UV, IDX, vals, slack=0.03):
    """each per-vertex value interpolated across its triangles' texels; returns the maps and which texels are covered"""
    outs = [np.zeros((S, S), np.float32) for _ in vals]
    cov = np.zeros((S, S), bool)
    for t in IDX:
        uv = UV[t] * S
        x0, y0 = np.floor(uv.min(0)).astype(int)
        x1, y1 = np.ceil(uv.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, S - 1), min(y1, S - 1)
        if x1 < x0 or y1 < y0:
            continue
        ys, xs = np.mgrid[y0 : y1 + 1, x0 : x1 + 1] + 0.5
        (ax, ay), (bx, by), (cx, cy) = uv
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-9:
            continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        l3 = 1 - l1 - l2
        m = (l1 >= -slack) & (l2 >= -slack) & (l3 >= -slack)
        for o, v in zip(outs, vals):
            o[y0 : y1 + 1, x0 : x1 + 1][m] = (l1 * v[t[0]] + l2 * v[t[1]] + l3 * v[t[2]])[m]
        cov[y0 : y1 + 1, x0 : x1 + 1][m] = True
    return outs, cov


def box(a, r, axis):
    c = np.cumsum(np.concatenate([np.zeros_like(np.take(a, [0], axis)), a], axis), axis, dtype=np.float64)
    n = a.shape[axis]
    i = np.arange(n)
    hi = np.clip(i + r + 1, 0, n)
    lo = np.clip(i - r, 0, n)
    return ((np.take(c, hi, axis) - np.take(c, lo, axis)) / np.expand_dims(hi - lo, tuple(k for k in range(a.ndim) if k != axis))).astype(np.float32)


def blur(a, r):
    """close to a Gaussian of radius r: three box blurs each way"""
    k = max(1, int(round(r * 0.9)))
    for _ in range(3):
        a = box(box(a, k, 0), k, 1)
    return a


def ss(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def group(J, W, pat):
    ks = [i for i, n in enumerate(joints) if any(p in n for p in pat)]
    return np.where(np.isin(J, ks), W, 0).sum(1)


def pad(img, cov, radii=(2, 6, 16, 40)):
    """fill the gaps between the texture's pieces with the nearest colour, so the seams stay clean"""
    w = cov.astype(np.float32)
    fill = img.copy()
    for r in radii:
        num = np.stack([blur(fill[..., c] * w, r) for c in range(3)], -1)
        den = blur(w, r)[..., None]
        m = (w < 0.5) & (den[..., 0] > 0.02)
        fill[m] = (num / np.maximum(den, 1e-4))[m]
        w = np.where(m, 1.0, w).astype(np.float32)
    return np.where(cov[..., None], img, fill)


rng = np.random.default_rng(71)

# ---------------- the body: a jeogori ----------------
pb = prim('body')
P = acc(pb['attributes']['POSITION'])
UV = acc(pb['attributes']['TEXCOORD_0'])
IDX = acc(pb['indices']).reshape(-1, 3)
J = acc(pb['attributes']['JOINTS_0'])
W = acc(pb['attributes']['WEIGHTS_0'])
wHand = group(J, W, ['Hand', 'Finger'])
wFoot = group(J, W, ['Foot', 'Toe'])
wLeg = group(J, W, ['Thigh', 'Calf'])
wArm = group(J, W, ['UpperArm', 'Forearm'])
(X, Y, Z, HAND, FOOT, LEG, ARM), COV = raster(UV, IDX, [P[:, 0], P[:, 1], P[:, 2], wHand, wFoot, wLeg, wArm])
base = np.asarray(Image.open(os.path.join(A, 'ava_body.jpg')).convert('RGB').resize((S, S), Image.LANCZOS)).astype(np.float32) / 255
out = base.copy()
fine = 1 + 0.05 * (blur(rng.random((S, S)).astype(np.float32), 0.8) - 0.5) * 2
body = COV & (HAND < 0.5)
torso = body & (LEG < 0.5) & (FOOT < 0.5)


def put(mask, col):
    global out
    m = np.clip(mask, 0, 1)[..., None]
    out = out * (1 - m) + col * m


IVORY = np.array([0.965, 0.945, 0.9])
CRIMSON = np.array([0.66, 0.07, 0.16])
WHITE = np.array([0.985, 0.985, 0.98])
HEM = 1.19
# the opening at the neck, seen from the front: above both collar edges. The left panel's edge (L) runs from the left
# of her neck down across to her right chest, over the right panel's (R), which runs from the right of her neck.
Lz = 1.432 + (X - 0.062) * 1.67
Rz = 1.432 - (X + 0.062) * 2.13
front = ss(0.1, 0.07, Y)
edge = np.where(front > 0.5, np.maximum(Lz, Rz), 1.447)
opening = Z > edge
jacket = torso & (Z > HEM) & ~opening
arms = body & (ARM >= 0.5)
cloth = (jacket | arms).astype(np.float32)
# a soft shade under the bust and toward the hem, so the jacket has some form by itself
form = 0.93 + 0.07 * ss(HEM, HEM + 0.07, Z)
put(cloth, IVORY * (fine * form)[..., None])
# the collar: a crimson band along each edge, the left one on top and carried on past the crossing to her right chest
bandL = 0.05
bandR = 0.062
left = torso & (front > 0.5) & (Z < Lz) & (Z > Lz - bandL) & (Z > 1.235) & (X > -0.075)
right = torso & (front > 0.5) & (Z < Rz) & (Z > Rz - bandR) & (Z > Lz)
back = torso & (front <= 0.5) & (Z <= 1.447) & (Z > 1.447 - 0.03)
collar = (left | right | back).astype(np.float32)
put(collar, CRIMSON * fine[..., None])
# the white strip along the collar's inner edge
dj = (
    (torso & (front > 0.5) & (Z < Lz) & (Z > Lz - bandL * 0.3) & (Z > 1.27) & (X > -0.06))
    | (torso & (front > 0.5) & (Z < Rz) & (Z > Rz - bandR * 0.3) & (Z > Lz))
    | (torso & (front <= 0.5) & (Z <= 1.447) & (Z > 1.447 - 0.01))
)
put(dj.astype(np.float32), WHITE)
# white under the skirt: the band of the underskirt at the waist, white trousers and stockings
under = torso & (Z <= HEM)
put(under.astype(np.float32), WHITE * (fine * 0.97)[..., None])
legs = body & (LEG >= 0.5) & (FOOT < 0.5)
lum = base @ np.array([0.299, 0.587, 0.114])
put(legs.astype(np.float32), WHITE * (0.86 + 0.14 * np.clip((lum - 0.6) / 0.35, 0, 1))[..., None])
out = pad(np.clip(out, 0, 1), COV)
Image.fromarray((out * 255).astype(np.uint8)).save(os.path.join(A, 'seol_body.jpg'), quality=88)
mk = np.asarray(Image.open(os.path.join(A, 'ava_mask.png')).convert('RGB').resize((S, S), Image.BILINEAR)).astype(np.float32) / 255
R = np.where(cloth > 0.5, 0.4, 0.0) * (1 - collar)
G = np.maximum(mk[..., 1] * (LEG >= 0.5), legs.astype(np.float32))
B = mk[..., 2] * (FOOT > 0.3)
m3 = np.stack([blur(R.astype(np.float32), 1.2), blur(G.astype(np.float32), 1.2), blur(B.astype(np.float32), 1.2)], -1)
Image.fromarray((np.clip(m3, 0, 1) * 255).astype(np.uint8)).resize((512, 512), Image.BILINEAR).save(os.path.join(A, 'seol_mask.png'), optimize=True)

# ---------------- the head: where her hair, eyebrows and lips are ----------------
ph = prim('head')
P = acc(ph['attributes']['POSITION'])
UV = acc(ph['attributes']['TEXCOORD_0'])
IDX = acc(ph['indices']).reshape(-1, 3)
y, z, ax = P[:, 1], P[:, 2], np.abs(P[:, 0])
# the hairline, as tesa_paint.py drew it
hl = np.interp(y, [-0.08, -0.04, 0.0, 0.05, 0.1, 0.2], [1.69, 1.675, 1.64, 1.6, 1.56, 1.5])
scalp = ss(-0.03, 0.0, z - hl)
bunv = ((y > 0.09) & (z > 1.6)).astype(np.float32)
face = ((y < -0.02) & (z > 1.52) & (z < 1.7)).astype(np.float32)
(SC, BUN, FACE, HX, HY, HZ), HC = raster(UV, IDX, [scalp, bunv, face, P[:, 0], P[:, 1], P[:, 2]])
head = np.asarray(Image.open(os.path.join(A, 'ava_head.jpg')).convert('RGB').resize((S, S), Image.LANCZOS)).astype(np.float32) / 255
mx, mn = head.max(-1), head.min(-1)
sat = (mx - mn) / np.maximum(mx, 1e-3)
# white hair: pale and nearly colourless, on the scalp or the bun
whiteish = ss(0.3, 0.16, sat) * ss(0.35, 0.5, mx)
hair = np.clip(np.maximum(SC, BUN), 0, 1) * whiteish * HC
hair = np.clip(blur(hair.astype(np.float32), 1.0) * 1.15, 0, 1)
# eyebrows: darker than the skin round them, on the brow ridge
hl_ = head @ np.array([0.299, 0.587, 0.114])
local = blur(hl_, 14)
brow = HC * (FACE > 0.5) * (HZ > 1.619) * (HZ < 1.646) * (np.abs(HX) > 0.008) * (np.abs(HX) < 0.062) * (HY < -0.03)
brow = brow * ss(0.015, 0.07, local - hl_)
brow = np.clip(blur(brow.astype(np.float32), 0.8) * 1.3, 0, 1)
# lips: pinker than the skin (more blue than green), round the mouth
pink = head[..., 2] - head[..., 1]
lips = HC * (FACE > 0.5) * (HZ > 1.53) * (HZ < 1.568) * (np.abs(HX) < 0.032) * (HY < -0.035) * ss(-0.06, -0.01, pink)
lips = np.clip(blur(lips.astype(np.float32), 0.8) * 1.2, 0, 1)
# the face only: the eyes and the inside of the mouth have their own pieces lower down the picture
topHalf = (np.mgrid[0:S, 0:S][0] < 0.55 * S).astype(np.float32)
hm = np.stack([hair, brow * topHalf, lips * topHalf], -1)
# The head's piece reaches down over the top of the chest, on top of the body's: the jacket and its collar are painted
# on it too, by the same rule, or bare skin would show from shoulder to shoulder.
hfront = ss(0.1, 0.07, HY)
hLz = 1.432 + (HX - 0.062) * 1.67
hRz = 1.432 - (HX + 0.062) * 2.13
hedge = np.where(hfront > 0.5, np.maximum(hLz, hRz), 1.447)
chest = HC & (HZ < 1.5) & (topHalf < 0.5)
hjacket = chest & (HZ <= hedge)
hfine = 1 + 0.05 * (blur(rng.random((S, S)).astype(np.float32), 0.8) - 0.5) * 2
hout = head.copy()
def hput(mask, col):
    global hout
    m = mask.astype(np.float32)[..., None]
    hout = hout * (1 - m) + col * m
hput(hjacket, IVORY * hfine[..., None])
hleft = chest & (hfront > 0.5) & (HZ < hLz) & (HZ > hLz - bandL) & (HZ > 1.235) & (HX > -0.075)
hright = chest & (hfront > 0.5) & (HZ < hRz) & (HZ > hRz - bandR) & (HZ > hLz)
hback = chest & (hfront <= 0.5) & (HZ <= 1.447) & (HZ > 1.447 - 0.03)
hput(hleft | hright | hback, CRIMSON * hfine[..., None])
hdj = (
    (chest & (hfront > 0.5) & (HZ < hLz) & (HZ > hLz - bandL * 0.3) & (HZ > 1.27) & (HX > -0.06))
    | (chest & (hfront > 0.5) & (HZ < hRz) & (HZ > hRz - bandR * 0.3) & (HZ > hLz))
    | (chest & (hfront <= 0.5) & (HZ <= 1.447) & (HZ > 1.447 - 0.01))
)
hput(hdj, WHITE)
Image.fromarray((np.clip(hout, 0, 1) * 255).astype(np.uint8)).save(os.path.join(A, 'seol_head.jpg'), quality=88)
Image.fromarray((np.clip(hm, 0, 1) * 255).astype(np.uint8)).resize((512, 512), Image.BILINEAR).save(os.path.join(A, 'ava_head_mask.png'), optimize=True)
print('done', [os.path.getsize(os.path.join(A, f)) for f in ('seol_body.jpg', 'seol_mask.png', 'ava_head_mask.png')])
if '--probe' in sys.argv:
    for name, (u, v) in {'browL': (452, 255), 'browR': (585, 255), 'eye': (440, 290), 'nose': (512, 355), 'lips': (512, 415), 'chin': (512, 480), 'hairline': (512, 150)}.items():
        print(name, HX[v, u].round(3), HY[v, u].round(3), HZ[v, u].round(3), 'cov', HC[v, u])
