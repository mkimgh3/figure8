# Rook, the ice-hockey player, on his own body since v3-look44: Rocketbox Male_Adult_08 (assets/rook_model.js). Until
# v3-look43 he wore Ivor's mesh (Male_Adult_06) with Ivor's face. The two share the same skeleton in the same bind pose,
# so the heights below (hem, pants, boots, numbers) hold for both. Painted from the 3D position of every texel:
#   body: a loose navy jersey with a white shoulder yoke, ice-blue piping, striped sleeves and hem, a big 17 on the
#         back, small 17s on the sleeves and a snowflake crest on the chest; glossy navy hockey pants with a side
#         stripe; striped socks; black glossy skate boots with a white trim and laces. Hands and neck stay bare skin.
#   head: the model's own face and short brown hair, clean-shaven, as Rocketbox painted it (only resized).
#   mask: R 0 (no sequins), G the nylon pants (roughness 0.42), B the boots (roughness 0.22).
# Run from anywhere: python tools/assets/rook_paint.py SRC [scratch_dir], where SRC holds Male_Adult_08's textures
# (m014_body_color.tga, m014_body_normal.tga, m014_head_color.tga, m014_head_normal.tga, from
# Assets/Avatars/Adults/Male_Adult_08/Textures in github.com/microsoft/Microsoft-Rocketbox); previews go to scratch_dir.
# Needs numpy and PIL only. All designs are original: no real team's name, logo or crest.
import os, re, sys, base64, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from glb import load

ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets')
SRC = sys.argv[1]
SCR = sys.argv[2] if len(sys.argv) > 2 else os.path.join(tempfile.gettempdir(), 'rook_paint')
os.makedirs(SCR, exist_ok=True)
S = 2048

# ---------------------------------------------------------------- helpers
def blur(a, s):
    """Gaussian blur (sigma in pixels) through the FFT, edges reflected; works on 2D or HxWxC arrays."""
    a = np.asarray(a, np.float32)
    if s <= 0:
        return a
    if a.ndim == 3:
        return np.stack([blur(a[..., c], s) for c in range(a.shape[2])], -1)
    p = min(int(3 * s) + 1, min(a.shape) - 1)
    b = np.pad(a, p, mode='reflect')
    for ax in (0, 1):
        n = b.shape[ax]
        g = np.exp(-2 * (np.pi * s * np.fft.rfftfreq(n)) ** 2).astype(np.float32)
        b = np.fft.irfft(np.fft.rfft(b, axis=ax) * (g[:, None] if ax == 0 else g[None, :]), n=n, axis=ax)
    return b[p:-p, p:-p].astype(np.float32)

ss = lambda e0, e1, v: (lambda t: t * t * (3 - 2 * t))(np.clip((v - e0) / (e1 - e0), 0, 1))
band = lambda v, a, b, e=0.0012: ss(a - e, a + e, v) * ss(b + e, b - e, v)   # soft-edged a < v < b

def raster(P, UV, IDX, vals):
    """Interpolate per-vertex values across each triangle's texels; returns the maps and the coverage."""
    outs = [np.zeros((S, S), np.float32) for _ in vals]
    cov = np.zeros((S, S), bool)
    for t in IDX:
        uv = UV[t] * S
        x0, y0 = np.floor(uv.min(0)).astype(int)
        x1, y1 = np.ceil(uv.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, S - 1), min(y1, S - 1)
        if x1 < x0 or y1 < y0:
            continue
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1] + 0.5
        (ax, ay), (bx, by), (cx, cy) = uv
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-9:
            continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        l3 = 1 - l1 - l2
        m = (l1 >= -0.03) & (l2 >= -0.03) & (l3 >= -0.03)
        for o, v in zip(outs, vals):
            o[y0:y1 + 1, x0:x1 + 1][m] = (l1 * v[t[0]] + l2 * v[t[1]] + l3 * v[t[2]])[m]
        cov[y0:y1 + 1, x0:x1 + 1][m] = True
    return outs, cov

def vnoise(X, Y, Z, cell, seed, mask):
    """Smooth value noise sampled at each texel's 3D position, so it runs on unbroken across UV seams."""
    out = np.zeros(X.shape, np.float32)
    x, y, z = (X[mask] + 1) / cell, (Y[mask] + 1) / cell, (Z[mask] + 1) / cell
    n = int(4 / cell) + 3
    g = np.random.default_rng(seed).random((n, n, n)).astype(np.float32)
    ix, iy, iz = np.floor(x).astype(int), np.floor(y).astype(int), np.floor(z).astype(int)
    fx, fy, fz = [(lambda t: t * t * (3 - 2 * t))(a - b) for a, b in ((x, ix), (y, iy), (z, iz))]
    r = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * (fz if dz else 1 - fz)
                r = r + w * g[ix + dx, iy + dy, iz + dz]
    out[mask] = r
    return out

def pad(img, cov, radii=(3, 8, 20, 50)):
    """Fill the empty space between texture pieces with the nearest piece's colour, so seams stay clean."""
    w = cov.astype(np.float32)
    fill = img.copy()
    for r in radii:
        num = blur(fill * w[..., None], r)
        den = blur(w, r)[..., None]
        m = (w < 0.5) & (den[..., 0] > 0.02)
        fill[m] = (num / np.maximum(den, 1e-4))[m]
        w = np.where(m, 1.0, w).astype(np.float32)
    return np.where(cov[..., None], img, fill)

def stencil(draw_fn, w, h, k=4):
    """Draw a shape at k times the size with PIL and shrink it: an anti-aliased mask in 0..1."""
    im = Image.new('L', (w * k, h * k), 0)
    draw_fn(ImageDraw.Draw(im), k)
    return np.asarray(im.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255

def sample(st, u, v):
    """Bilinear lookup of stencil st at (u, v) in 0..1 (outside reads 0)."""
    h, w = st.shape
    x = u * (w - 1)
    y = v * (h - 1)
    x0 = np.clip(np.floor(x).astype(int), 0, w - 2)
    y0 = np.clip(np.floor(y).astype(int), 0, h - 2)
    fx = np.clip(x - x0, 0, 1)
    fy = np.clip(y - y0, 0, 1)
    r = (st[y0, x0] * (1 - fx) * (1 - fy) + st[y0, x0 + 1] * fx * (1 - fy) + st[y0 + 1, x0] * (1 - fx) * fy
         + st[y0 + 1, x0 + 1] * fx * fy)
    return np.where((u >= 0) & (u <= 1) & (v >= 0) & (v <= 1), r, 0).astype(np.float32)

def img(path, size=S):
    return np.asarray(Image.open(path).convert('RGB').resize((size, size), Image.LANCZOS)).astype(np.float32) / 255

def save(a, path, size, q=88):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    if size != im.size[0]:
        im = im.resize((size, size), Image.LANCZOS)
    if path.endswith('.jpg'):
        im.save(path, quality=q)
    else:
        im.save(path)

# ---------------------------------------------------------------- the mesh: his GLB (base64 in rook_model.js)
glb_path = os.path.join(SCR, 'rook.glb')
src = open(os.path.join(ASSETS, 'rook_model.js'), encoding='utf8').read()
open(glb_path, 'wb').write(base64.b64decode(re.search(r'export default\s*"([^"]+)"', src).group(1)))
j, acc = load(glb_path)
joints = [j['nodes'][i]['name'] for i in j['skins'][0]['joints']]
def prim(name):
    return [p for p in j['meshes'][0]['primitives'] if name in j['materials'][p['material']]['name']][0]
IBM = acc(j['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4)
JP = {n: np.linalg.inv(IBM[k].T)[:3, 3] for k, n in enumerate(joints)}   # joint positions in the bind pose

NAVY = np.array([0.114, 0.169, 0.325])        # #1d2b53
NAVY_D = np.array([0.072, 0.103, 0.205])      # the pants: a darker navy
WHITE = np.array([0.93, 0.935, 0.94])
ICE = np.array([0.50, 0.82, 1.0])             # #7fd1ff
BLACK = np.array([0.035, 0.036, 0.042])

# ================================================================ body
pb = prim('body')
P = acc(pb['attributes']['POSITION'])
UV = acc(pb['attributes']['TEXCOORD_0'])
IDX = acc(pb['indices']).reshape(-1, 3)
NB = acc(pb['attributes']['NORMAL'])
JI = acc(pb['attributes']['JOINTS_0'])
JW = acc(pb['attributes']['WEIGHTS_0'])
def group(pat):
    ks = [i for i, n in enumerate(joints) if any(p in n for p in pat)]
    return np.where(np.isin(JI, ks), JW, 0).sum(1)
(X, Y, Z, NX, NY, NZ, HAND, FOOT, ARM), COV = raster(
    P, UV, IDX, [P[:, 0], P[:, 1], P[:, 2], NB[:, 0], NB[:, 1], NB[:, 2], group(['Hand', 'Finger']),
                 group(['Foot', 'Toe']), group(['UpperArm', 'Forearm'])])
SG = np.where(X >= 0, 1.0, -1.0)
base = img(os.path.join(SRC, 'm014_body_color.tga'))     # the model's own: his skin is kept on the hands and neck
lum0 = base @ np.array([0.299, 0.587, 0.114])
rng = np.random.default_rng(17)

def along(a, b):
    """For each texel: position along a->b (0..1) and distance from that line; a and b mirrored to the texel's side."""
    a = a[None, None, :] * np.stack([SG, np.ones_like(SG), np.ones_like(SG)], -1)
    b = b[None, None, :] * np.stack([SG, np.ones_like(SG), np.ones_like(SG)], -1)
    ax = b - a
    L = np.linalg.norm(ax, axis=-1, keepdims=True)
    e = ax / L
    r = np.stack([X, Y, Z], -1) - a
    s = (r * e).sum(-1)
    d = np.sqrt(np.maximum((r * r).sum(-1) - s * s, 0))
    return s / L[..., 0], d, e, r

SH, EL, WR = JP['Bip01 L UpperArm'], JP['Bip01 L Forearm'], JP['Bip01 L Hand']
LU, LF = np.linalg.norm(EL - SH), np.linalg.norm(WR - EL)
su, ru, eu, rvu = along(SH, EL)          # upper arm: 0 at the shoulder joint, 1 at the elbow
sf, rf, ef, rvf = along(EL, WR)          # forearm: 0 at the elbow, 1 at the wrist
arm_side = COV & (np.abs(X) > 0.19)

# ---- regions (all heights in metres; Z up, Y < 0 the front)
HEM = 0.875                              # jersey hem, a little below the hip
PANTS_BOT = 0.555                        # hockey pants end just above the knee (knee joint 0.497)
SLEEVE_END = 0.96                        # the sleeve ends at the wrist (forearm fraction)
hand = COV & (np.abs(X) > 0.45) & (sf > SLEEVE_END)
hand_soft = np.clip(hand.astype(np.float32) * ss(SLEEVE_END, SLEEVE_END + 0.01, sf), 0, 1)
# neckline: a shallow V at the front, higher at the sides and the back
phi = np.arctan2(X, -(Y - 0.012))
# (v3-look38: raised by about 4 cm, so the jersey covers the tops of his bulked-up shoulders up to the neck)
collar = np.interp(np.abs(phi), [0, 0.6, 1.4, 2.2, np.pi], [1.5, 1.507, 1.532, 1.548, 1.552])
collar = collar - 0.02 * np.clip(1 - np.abs(X) / 0.04, 0, 1) * (Y < 0)
d_collar = collar - Z                     # > 0 below the neckline
jersey = COV * ss(-0.0012, 0.0012, d_collar) * ss(HEM - 0.0015, HEM + 0.0015, Z) * (1 - hand_soft)

# yoke: level across the chest and back, and round the top of each sleeve (where the texel lies on the arm itself)
zy = 1.372 + 0.036 * ss(-0.05, 0.05, Y)
on_arm = arm_side & (su > 0.0) & (ru < 0.072)
d_yoke = np.maximum(Z - zy, np.where(on_arm, (0.34 - su) * LU, -1.0))   # > 0 inside the yoke
yoke = ss(-0.0012, 0.0012, d_yoke)
piping = band(d_yoke, -0.009, 0.0)
collar_band = band(d_collar, 0.0, 0.021)

# stripe set white / ice-blue / white, each 2.5 cm
def stripes(m):
    return band(m, 0.0, 0.025), band(m, 0.025, 0.05), band(m, 0.05, 0.075)
forearm = arm_side & (np.abs(X) > 0.3) & (sf > 0) & (ARM > 0.3)
m_fore = sf * LF
# the sleeve stripes end just past the elbow (the model's rolled shirt cuff bulges 7 to 12 cm below it, and stripes
# across it came out ragged): measured along the arm from the elbow, negative above it
elbow_arm = arm_side & (np.abs(X) > 0.25) & (ARM > 0.3)
m_elb = np.where(sf > 0, m_fore, (su - 1) * LU)
fw1, fb, fw2 = [elbow_arm * s for s in stripes(m_elb + 0.062)]        # from 6.2 cm above the elbow
hw1, hb, hw2 = stripes(Z - (HEM + 0.028))                             # 2.8 cm above the hem
cuff = forearm * band(m_fore, SLEEVE_END * LF - 0.022, SLEEVE_END * LF + 0.01)

# ---- numbers and crest, drawn as stencils
def digits17(k, x0, y0, h):
    """Block-style athletic 1 and 7 (no font needed), height h pixels, top-left at (x0, y0)."""
    one = [(0.02, 0.15), (0.17, 0.0), (0.43, 0.0), (0.43, 1.0), (0.17, 1.0), (0.17, 0.29), (0.02, 0.29)]
    seven = [(0.0, 0.0), (0.64, 0.0), (0.64, 0.21), (0.41, 1.0), (0.14, 1.0), (0.37, 0.235), (0.0, 0.235)]
    polys = [[(x0 + px * h, y0 + py * h) for px, py in one],
             [(x0 + (0.53 + px) * h, y0 + py * h) for px, py in seven]]
    return [[(x * k, y * k) for x, y in p] for p in polys]
NUM_W = 1.17                               # "17" is 1.17 times as wide as it is tall
def number_stencils(outline):
    """fill and outline masks of '17' in a box (NUM_W + 2*outline) x (1 + 2*outline) units, 400 px per unit"""
    u = 400
    w, h = int((NUM_W + 2 * outline) * u), int((1 + 2 * outline) * u)
    polys = lambda k: digits17(k, outline * u, outline * u, u)
    def fill(d, k):
        for p in polys(k):
            d.polygon(p, fill=255)
    def line(d, k):
        for p in polys(k):
            d.polygon(p, fill=255)
            d.line(p + [p[0]], fill=255, width=int(2 * outline * u * k), joint='curve')
            for x, y in p:
                r = outline * u * k
                d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return stencil(fill, w, h), stencil(line, w, h)
OUT_N = 0.075
num_fill, num_line = number_stencils(OUT_N)
# back: a planar projection from behind (viewer's right is -X), 22 cm tall, between the shoulder blades
NH = 0.22
NTOP = 1.372
nw, nh = (NUM_W + 2 * OUT_N) * NH, (1 + 2 * OUT_N) * NH
back = COV & (Y > 0) & (NY > 0.1) & (ARM < 0.5)
ub = (-X + nw / 2) / nw
vb = (NTOP + OUT_N * NH - Z) / nh
back_line = sample(num_line, ub, vb) * back
back_fill = sample(num_fill, ub, vb) * back
# sleeves: wrapped round the outer side of each upper arm (viewer outside the arm: up is the shoulder, right is
# the front on the right arm and the back on the left arm), 8 cm tall
SNH = 0.082
lat = np.stack([SG, np.zeros_like(SG), np.zeros_like(SG)], -1)
lat = lat - (lat * eu).sum(-1, keepdims=True) * eu
lat /= np.linalg.norm(lat, axis=-1, keepdims=True)
hd = np.stack([np.zeros_like(SG), SG, np.zeros_like(SG)], -1)
hd = hd - (hd * eu).sum(-1, keepdims=True) * eu - (hd * lat).sum(-1, keepdims=True) * lat
hd /= np.linalg.norm(hd, axis=-1, keepdims=True)
perp = rvu - (rvu * eu).sum(-1, keepdims=True) * eu
theta = np.arctan2((perp * hd).sum(-1), (perp * lat).sum(-1))
upper = arm_side & (ARM > 0.5) & (su > 0.2) & (su < 0.95) & (np.abs(theta) < 1.7)
R_ARM = float(np.median(ru[upper & (np.abs(su - 0.6) < 0.05)]))
snw, snh = (NUM_W + 2 * OUT_N) * SNH, (1 + 2 * OUT_N) * SNH
us = (theta * R_ARM + snw / 2) / snw
vs = (su * LU - (0.45 * LU - OUT_N * SNH)) / snh
sl_line = sample(num_line, us, vs) * upper
sl_fill = sample(num_fill, us, vs) * upper
# crest on the chest: an ice-blue disc with a white rim, and a white six-armed snowflake outlined in navy
CR = 0.085
CZ = 1.212
def crest_draw(part):
    def f(d, k):
        c = 500 * k
        R = 480 * k
        if part == 'disc':
            d.ellipse([c - R, c - R, c + R, c + R], fill=255)
            return
        if part == 'rim':
            d.ellipse([c - R, c - R, c + R, c + R], fill=255)
            r2 = R * 0.9
            d.ellipse([c - r2, c - r2, c + r2, c + r2], fill=0)
            return
        grow = 0.05 * R if part == 'flake_line' else 0
        arms = []
        for i in range(6):
            a = np.pi / 2 + i * np.pi / 3
            ca, sa = np.cos(a), np.sin(a)
            p = lambda t: (c + ca * t * R, c - sa * t * R)
            arms.append((p(0.0), p(0.7), 0.075 * R))
            for t0, ln in ((0.36, 0.2), (0.55, 0.15)):
                for side in (-1, 1):
                    b = a + side * np.pi / 3
                    q = p(t0)
                    arms.append((q, (q[0] + np.cos(b) * ln * R, q[1] - np.sin(b) * ln * R), 0.06 * R))
        for p0, p1, wdt in arms:
            d.line([p0, p1], fill=255, width=int(wdt + 2 * grow))
            for (x, y), rr in ((p0, wdt / 2 + grow), (p1, wdt / 2 + grow)):
                d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=255)
        r6 = 0.16 * R + grow
        ang = np.pi / 6 + np.arange(6) * np.pi / 3
        d.polygon([(c + np.cos(t) * r6, c - np.sin(t) * r6) for t in ang], fill=255)
    return f
cst = {p: stencil(crest_draw(p), 1000, 1000) for p in ('disc', 'rim', 'flake', 'flake_line')}
front = COV & (Y < 0) & (NY < -0.1) & (ARM < 0.5)
uc = (X + CR) / (2 * CR)                       # viewer in front: their right is +X
vc = (CZ + CR - Z) / (2 * CR)
crest = {p: sample(cst[p], uc, vc) * front for p in cst}

# ---- cloth: folds and drape from 3D noise, a fine knit, and a little shade under the arms
fold = (vnoise(X, Y, Z, 0.11, 1, COV) - 0.5) * 1.0 + (vnoise(X, Y, Z, 0.045, 2, COV) - 0.5) * 0.6
fine = 1 + 0.07 * (blur(rng.random((S, S)).astype(np.float32), 0.7) - 0.5) * 2
yy, xx = np.mgrid[0:S, 0:S]
knit = 1 - 0.07 * ss(0.55, 0.9, np.cos(2 * np.pi * xx / 7) * np.cos(2 * np.pi * (yy + 3.5 * (xx // 7 % 2)) / 7))
under = 1 - 0.18 * np.clip(-NZ, 0, 1) * (Z > 1.0)
drape = (1 + 0.08 * fold) * under * fine * knit

out = base.copy()
G = np.zeros((S, S), np.float32)
B = np.zeros((S, S), np.float32)
def put(mask, colour):
    global out
    m = np.clip(mask, 0, 1)[..., None]
    out = out * (1 - m) + np.asarray(colour) * m

d3 = drape[..., None]
put(jersey, NAVY * d3)
put(jersey * yoke, WHITE * d3)
put(jersey * piping, ICE * d3)
put(jersey * collar_band, NAVY * 0.85 * d3)
# the model's shirt collar stands round his neck above the jersey's neckline (the body mesh has no bare neck: the head
# carries it): a navy neck guard, as hockey players wear
guard = COV * ss(0.0012, -0.0012, d_collar) * (np.abs(X) < 0.2) * (Z > 1.4)
put(guard, NAVY_D * 1.15 * (fine * knit * (1 + 0.06 * fold))[..., None])
for w1, bl, w2 in ((hw1, hb, hw2), (fw1, fb, fw2)):
    put(jersey * w1, WHITE * d3)
    put(jersey * bl, ICE * d3)
    put(jersey * w2, WHITE * d3)
put(jersey * cuff, NAVY * 0.8 * d3)
put(jersey * back_line, ICE * d3)
put(jersey * back_fill, WHITE * d3)
put(jersey * sl_line, ICE * d3)
put(jersey * sl_fill, WHITE * d3)
put(jersey * crest['disc'], ICE * d3)
put(jersey * crest['rim'], WHITE * d3)
put(jersey * crest['flake_line'], NAVY * d3)
put(jersey * crest['flake'], WHITE * d3)

# ---- legs: leg centre line per height (the middle of each half's cross-section)
zs = np.arange(0.0, 1.0, 0.01)
cxs, cys, lys = [], [], []
for z in zs:
    m = COV & (X > 0) & (np.abs(Z - z) < 0.006) & (ARM < 0.5) & (HAND < 0.5) & (X < 0.3)
    cxs.append((X[m].min() + X[m].max()) / 2 if m.any() else 0.11)
    cys.append((Y[m].min() + Y[m].max()) / 2 if m.any() else 0.0)
    far = m & (X > np.percentile(X[m], 97)) if m.any() else m
    lys.append(np.median(Y[far]) if far.any() else 0.0)
lys = np.convolve(np.pad(lys, 3, mode='edge'), np.ones(7) / 7, mode='valid')     # the outermost line, smoothed
CX = np.interp(Z, zs, cxs)
CY = np.interp(Z, zs, cys)
LY = np.interp(Z, zs, lys)
ax_ = np.abs(X)
legs = COV & ~hand & (ARM < 0.5) & (Z < HEM + 0.01)

# hockey pants, with the shading of the model's jeans (their folds, which the normal map also has), taken as light and
# dark round the jeans' typical brightness
thighs = COV & (Z > 0.6) & (Z < 0.85) & (ARM < 0.5) & (HAND < 0.5) & (np.abs(X) < 0.3)
psh = np.clip(blur(lum0, 1.0) / np.median(lum0[thighs]), 0.6, 1.45)
psh = np.where((Z > 0.5) & (Z < 0.885), psh, 1.0)
pants = legs * band(Z, PANTS_BOT, HEM + 0.01, 0.0015)
pcol = NAVY_D * (psh * fine)[..., None]
put(pants * (1 - jersey), pcol)
G = np.maximum(G, pants * (1 - jersey))
side = (SG * X > CX) & legs
dy = np.abs(Y - LY)
put(pants * (1 - jersey) * side * ss(0.0125, 0.0105, dy), ICE * (psh * fine)[..., None])
put(pants * (1 - jersey) * side * ss(0.0065, 0.0045, dy), WHITE * (psh * fine)[..., None])
put(pants * (1 - jersey) * band(Z, PANTS_BOT, PANTS_BOT + 0.016), NAVY_D * 0.7 * (psh * fine)[..., None])

# socks, knee to boot, striped round the calf
def boot_top_at():
    back_ = ss(0.03, 0.065, Y - 0.0145) * ss(0.035, 0.012, np.abs(ax_ - 0.117))
    return 0.19 + 0.045 * back_          # higher at the back: the tendon guard
BT = boot_top_at()
sock = legs * band(Z, BT, PANTS_BOT, 0.0015)
rib = 1 - 0.05 * ss(0.3, 0.8, np.cos(64 * np.arctan2(Y - CY, ax_ - CX)))
scol = (fine * rib * (1 + 0.05 * fold))[..., None]
put(sock, NAVY * scol)
sw1, sb, sw2 = stripes(Z - 0.35)
put(sock * sw1, WHITE * scol)
put(sock * sb, ICE * scol)
put(sock * sw2, WHITE * scol)

# skate boots: black and glossy, a white trim at the top, white laces down the front
feet = COV & ~hand & (ARM < 0.5) & ((FOOT > 0.5) | (Z < BT + 0.0015))
boot = feet * np.where(FOOT > 0.5, 1.0, ss(BT + 0.0015, BT - 0.0015, Z))
bsh = (0.85 + 0.3 * vnoise(X, Y, Z, 0.03, 7, COV)) * fine
put(boot, BLACK * bsh[..., None])
put(boot * band(Z, BT - 0.012, BT + 0.01), WHITE * 0.95)
lx = X - SG * 0.122
front_ = (Y < -0.02) & (NY < -0.35)
lace_col = boot * front_ * band(Z, 0.055, BT - 0.02, 0.002) * ss(0.024, 0.02, np.abs(lx))
l1 = np.abs(((Z + lx) / 0.022) % 1 - 0.5)
l2 = np.abs(((Z - lx) / 0.022) % 1 - 0.5)
lace = np.maximum(ss(0.13, 0.07, np.abs(l1 - 0.5)), ss(0.13, 0.07, np.abs(l2 - 0.5)))
put(lace_col * 0.35, np.array([0.18, 0.18, 0.19]))       # the tongue, a little lighter
put(lace_col * lace, np.array([0.86, 0.86, 0.84]))
B = np.maximum(B, boot)

# the hands and neck keep the model's bare skin, with any dark specks left at the wrists smoothed away
LUMW = np.array([0.299, 0.587, 0.114])
skin_m = COV & (jersey < 0.02) & (np.abs(X) > 0.45)
def smooth_in(m, r):
    return blur(out * m[..., None], r) / np.maximum(blur(m.astype(np.float32), r), 1e-4)[..., None]
sm = smooth_in(skin_m, 6)
dark = skin_m & ((out @ LUMW) < (sm @ LUMW) * 0.92)
dark_w = np.clip(blur(dark.astype(np.float32), 1.5) * 3, 0, 1)
sm = smooth_in(skin_m & (dark_w < 0.05), 6)
put(dark_w * skin_m, sm)

out = pad(out, COV)
save(out, os.path.join(ASSETS, 'rook_body.jpg'), 1024)
mk = np.stack([np.zeros_like(G), G, B], -1)
save(blur(mk, 1.2), os.path.join(ASSETS, 'rook_mask.png'), 512)
np.savez_compressed(os.path.join(SCR, 'body_maps.npz'), X=X, Y=Y, Z=Z, NX=NX, NY=NY, NZ=NZ, COV=COV)
print('body: hem %.3f, pants bottom %.3f, boot top 0.19 (0.235 at the back), arm radius %.3f' % (HEM, PANTS_BOT, R_ARM))

# ---- normal map: the model's own (his shirt's and jeans' folds) with soft folds and a fine knit on the jersey, and a
# rib on the socks in place of most of the jeans' folds. Tangent space as three.js builds it for this material (no
# vertex tangents, normalScale 1): x along +u, y along +v (down the image).
def slopes(h, cov_, target):
    """height map -> (dh/dx, dh/dy) per pixel, scaled so the steep end (99th percentile) has slope `target`"""
    h = pad(np.repeat(h[..., None], 3, -1), cov_)[..., 0]
    gy, gx = np.gradient(h)
    k = target / max(np.percentile(np.hypot(gx, gy)[cov_], 99), 1e-9)
    return gx * k, gy * k
nb = img(os.path.join(SRC, 'm014_body_normal.tga')) * 2 - 1
jm = blur(jersey, 1.0)
fx, fy = slopes(fold, COV & (jersey > 0.5), 0.2)
kx, ky = slopes(np.cos(2 * np.pi * xx / 7) * np.cos(2 * np.pi * (yy + 3.5 * (xx // 7 % 2)) / 7), COV, 0.12)
rx, ry = slopes(np.cos(64 * np.arctan2(Y - CY, ax_ - CX)), COV & (sock > 0.5), 0.15)
sm_ = blur(sock * (1 - boot), 1.0)
dx = jm * (fx + kx) + sm_ * rx
dy = jm * (fy + ky) + sm_ * ry
nxy = nb[..., :2] * (1 - 0.6 * sm_)[..., None]
nn = np.stack([nxy[..., 0] - dx, nxy[..., 1] - dy, np.maximum(nb[..., 2], 0.2)], -1)
nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
nn = np.where(COV[..., None], nn, np.array([0.0, 0.0, 1.0]))
save(nn * 0.5 + 0.5, os.path.join(ASSETS, 'rook_body_n.jpg'), 1024)

# ================================================================ head
# his own face and hair, clean-shaven, as Rocketbox painted them: only resized (the game's head textures are 1024 and
# 512)
save(img(os.path.join(SRC, 'm014_head_color.tga')), os.path.join(ASSETS, 'rook_head.jpg'), 1024)
save(img(os.path.join(SRC, 'm014_head_normal.tga')), os.path.join(ASSETS, 'rook_head_n.jpg'), 512)
print('head: done')
