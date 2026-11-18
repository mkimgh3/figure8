# Rook, the ice-hockey player. He reuses Ivor's mesh (Rocketbox Male_Adult_06), so only new textures are painted here,
# from the 3D position of every texel (as in ivor_viking.py):
#   body: a loose navy jersey with a white shoulder yoke, ice-blue piping, striped sleeves and hem, a big 17 on the
#         back, small 17s on the sleeves and a snowflake crest on the chest; glossy navy hockey pants with a side
#         stripe; striped socks; black glossy skate boots with a white trim and laces. Hands and neck stay bare skin.
#   head: Ivor's strawberry-blond hair (and his cord necklace) replaced by short dark-brown hair, and his beard
#         repainted a short brown (v3-look38; v3-look37 had him clean-shaven). The beard volume baked into the GLB stays.
#   mask: R 0 (no sequins), G the nylon pants (roughness 0.42), B the boots (roughness 0.22).
# Run from anywhere: python tools/assets/rook_paint.py [scratch_dir]   (previews go to scratch_dir, default a temp dir)
# Needs numpy and PIL only. All designs are original: no real team's name, logo or crest.
import os, re, sys, base64, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from glb import load

ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets')
SCR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'rook_paint')
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

# ---------------------------------------------------------------- the mesh: Ivor's GLB (base64 in max_model.js)
glb_path = os.path.join(SCR, 'max.glb')
src = open(os.path.join(ASSETS, 'max_model.js'), encoding='utf8').read()
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
base = img(os.path.join(ASSETS, 'max_body.jpg'))        # Ivor: his skin is kept on the hands and neck
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
fw1, fb, fw2 = [forearm * s for s in stripes(m_fore - 0.04)]          # from 4 cm below the elbow
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

# hockey pants, with the shading of Ivor's trousers (the original jeans' folds, which the normal map also has)
wool = np.array([0.15, 0.115, 0.085]) @ np.array([0.299, 0.587, 0.114])
psh = np.clip(blur(lum0, 1.0) / wool, 0.6, 1.45)
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

# the hands and neck keep Ivor's bare skin; his hands are plain skin with a few dark specks left at the wrists
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

# ---- normal map: Ivor's (whose torso and arms are smooth skin, legs the original jeans' folds) with soft folds
# and a fine knit on the jersey, and a rib on the socks in place of most of the jeans' folds. Tangent space as
# three.js builds it for this material (no vertex tangents, normalScale 1): x along +u, y along +v (down the image).
def slopes(h, cov_, target):
    """height map -> (dh/dx, dh/dy) per pixel, scaled so the steep end (99th percentile) has slope `target`"""
    h = pad(np.repeat(h[..., None], 3, -1), cov_)[..., 0]
    gy, gx = np.gradient(h)
    k = target / max(np.percentile(np.hypot(gx, gy)[cov_], 99), 1e-9)
    return gx * k, gy * k
nb = img(os.path.join(ASSETS, 'max_body_n.jpg')) * 2 - 1
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
ph = prim('head')
P = acc(ph['attributes']['POSITION'])
UV = acc(ph['attributes']['TEXCOORD_0'])
IDX = acc(ph['indices']).reshape(-1, 3)
NH_ = acc(ph['attributes']['NORMAL'])
HAIR = acc(ph['attributes']['_HAIR'])          # x: where Ivor's beard grows, y: his scalp
# the UV islands (vertices are split at UV seams): the face and scalp are the biggest; teeth, tongue and eyes are
# small islands of their own, left untouched
par = np.arange(len(P))
def find(i):
    while par[i] != i:
        par[i] = par[par[i]]
        i = par[i]
    return i
for a_, b_, c_ in IDX:
    for u_, v_ in ((a_, b_), (b_, c_)):
        ru_, rv_ = find(u_), find(v_)
        if ru_ != rv_:
            par[ru_] = rv_
root = np.array([find(i) for i in range(len(P))])
ids, cnt = np.unique(root[IDX[:, 0]], return_counts=True)
inner_v = ((root != ids[cnt.argmax()]) & (P[:, 1] < -0.04)).astype(np.float32)   # not a 2-triangle piece in the ear
(HX, HY, HZ, HNX, HNY, HNZ, BEARD, INNER), HC = raster(
    P, UV, IDX, [P[:, 0], P[:, 1], P[:, 2], NH_[:, 0], NH_[:, 1], NH_[:, 2], HAIR[:, 0], inner_v])
inner = HC & (INNER > 0.5)
face = HC & ~inner
hax = np.abs(HX)
head1k = np.asarray(Image.open(os.path.join(ASSETS, 'max_head.jpg')).convert('RGB')).astype(np.float32) / 255
head = img(os.path.join(ASSETS, 'max_head.jpg'))
hl = head @ LUMW

def tri_raster(val, blur_px):
    """ivor_head.py's raster(): each triangle filled with its corners' mean value, then blurred"""
    m = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(m)
    for t in IDX:
        v = float(val[t].mean())
        if v >= 0.02:
            d.polygon([(float(UV[k, 0] * S), float(UV[k, 1] * S)) for k in t], fill=int(v * 255))
    return blur(np.asarray(m).astype(np.float32) / 255, blur_px)

# where Ivor's beard was painted (ivor_head.py: raster(beard, 5) * 1.3), grown a little to catch its soft edge
old_beard = np.clip(blur(np.clip(tri_raster(HAIR[:, 0], 5) * 1.3, 0, 1), 3) * 3, 0, 1) * face
# where his strawberry blond was painted: pixels that sit on the blond ramp, near the old scalp
d0, d1 = np.array([0.46, 0.26, 0.13]), np.array([0.96, 0.76, 0.52])
dd = d1 - d0
nramp = np.clip(((head - d0) @ dd) / (dd @ dd), 0, 1)
ramp_dist = np.linalg.norm(head - (d0 + nramp[..., None] * dd), axis=-1)
y_, z_ = P[:, 1], P[:, 2]
hl_old = np.interp(y_, [-0.15, -0.09, -0.05, -0.01, 0.03, 0.06, 0.09, 0.12],
                   [1.762, 1.752, 1.738, 1.736, 1.712, 1.66, 1.628, 1.62])
margin = np.interp(y_, [-0.15, -0.05, 0.0, 0.03, 0.12], [0.0, 0.0, 0.03, 0.09, 0.1])
near_old = np.clip(tri_raster(ss(-0.01, 0.004, z_ - (hl_old - margin)), 8) * 1.3, 0, 1)
near_old = np.clip(blur(near_old, 4) * 2, 0, 1) * face
hsat = (head.max(-1) - head.min(-1)) / np.maximum(head.max(-1), 1e-3)
blondish = ss(0.06, 0.025, ramp_dist) * ss(0.39, 0.45, hsat)          # skin is less saturated than the blond
old_blond = blondish * near_old
# the cord necklace round the base of his neck
cord = face & (HZ < 1.55) & (hl < 0.42)
cord = np.clip(blur(cord.astype(np.float32), 2.0) * 4, 0, 1) * face
# the lips keep their colour (told from the pale, stubbly skin round them by how red they are)
lipbox = face & (hax < 0.036) & (np.abs(HZ - 1.606) < 0.0135) & (HY < -0.1)
lip_score = (head[..., 0] - head[..., 1]) - 0.5 * (head[..., 1] - head[..., 2])
lips = lipbox & (lip_score > 0.235)
lips_soft = np.clip(blur(lips.astype(np.float32), 1.0) * 1.6, 0, 1)

# ---- new short dark-brown hair: on the scalp, sideburns, cut round the ears and tapering at the nape
# the ear, seen from the side: a slightly tilted ellipse (Y -0.034..0.007, Z 1.615..1.695)
ey, ez = HY + 0.013 - 0.2 * (HZ - 1.655), HZ - 1.655
ear_d = np.sqrt((ey / 0.0215) ** 2 + (ez / 0.041) ** 2)          # < 1 on the ear
ear_side = face & (hax > 0.06)
ear = ear_side & (ear_d < 1.0)
ear_f = ear.astype(np.float32)
ear_gap = ear_side * ss(1.25, 1.05, ear_d)                       # hair stops a few mm short of the ear
zh = np.interp(HY, [-0.16, -0.11, -0.08, -0.065, -0.055, -0.05, -0.034, -0.02, 0.01, 0.03, 0.06, 0.09, 0.12],
               [1.772, 1.765, 1.752, 1.735, 1.70, 1.665, 1.655, 1.65, 1.64, 1.625, 1.61, 1.60, 1.60])
noise_h = vnoise(HX, HY, HZ, 0.012, 21, HC)
zh = zh + (noise_h - 0.5) * 0.005
fade_w = np.interp(HY, [-0.16, -0.06, -0.03, 0.03, 0.12], [0.005, 0.007, 0.01, 0.018, 0.02])
hair_a = ss(-fade_w, 0.003, HZ - zh) * face * (1 - ear_gap)
rng = np.random.default_rng(5)
def streaks(n, k, s_):
    r = rng.random((S // k, n)).astype(np.float32)
    r = Image.fromarray((r * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)
    return blur(np.asarray(r).astype(np.float32) / 255, s_)
st1 = streaks(S, 10, 0.6)
st2 = streaks(S // 2, 6, 0.8)
strand = np.clip((st1 - 0.5) * 2.2 + (st2 - 0.5) * 1.2 + 0.5, 0, 1)
hair_dark = np.array([0.045, 0.03, 0.022])
hair_mid = np.array([0.13, 0.085, 0.055])
hair_light = np.array([0.30, 0.205, 0.13])
t_ = strand[..., None]
hcol = np.where(t_ < 0.5, hair_dark + (hair_mid - hair_dark) * t_ * 2,
                hair_mid + (hair_light - hair_mid) * (t_ - 0.5) * 2)
hcol = hcol * (0.85 + 0.3 * vnoise(HX, HY, HZ, 0.03, 22, HC))[..., None]
# at the hairline the hair thins out, the dark strands last
fleck = blur(rng.random((S, S)).astype(np.float32), 0.7)
hair_alpha = np.clip(hair_a * (1 + (1 - hair_a) * ((1 - strand) * 0.6 + (fleck - 0.5) * 0.8 - 0.3)), 0, 1) * face

# ---- clean-shaven skin, grown in from the skin around (a membrane fill, solved coarse to fine)
def inpaint(img_, known):
    k = known.astype(np.float32)
    pyr = [(img_ * k[..., None], k)]
    while pyr[-1][1].shape[0] > 16:
        a, k = pyr[-1]
        h2 = a.shape[0] // 2
        pyr.append((a.reshape(h2, 2, h2, 2, 3).sum((1, 3)), k.reshape(h2, 2, h2, 2).sum((1, 3))))
    x = None
    for a, k in reversed(pyr):
        val = a / np.maximum(k, 1e-6)[..., None]
        kn = k > 0
        if x is None:
            x = np.where(kn[..., None], val, val[kn].mean(0))
        else:
            x = blur(np.repeat(np.repeat(x, 2, 0), 2, 1), 0.8)
        for _ in range(60 if a.shape[0] <= 512 else 25):
            p = np.pad(x, ((1, 1), (1, 1), (0, 0)), mode='edge')
            x = 0.25 * (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:])
            x[kn] = val[kn]
    return x

orig_hair = (ramp_dist > 0.12) & (hl < 0.5)                   # the original model's own dark hair, round the ears
# stray hair left under the new hair's thinning edge and below it (behind the ears, down the nape) goes too
below = face & ~ear & (HY > -0.06) & (HZ > 1.53) & ((HZ < zh + 0.002) | (ear_side & (ear_d < 1.35)))
stray = np.clip(blur((below & ((hl < 0.45) | (blondish > 0.5))).astype(np.float32), 2) * 2.5, 0, 1) * below
# the ears: only their clean pink skin is kept; the beard's speckle and the hair behind them become skin, shaded
# by how hollow the ear is there (a cavity term from the mesh: how much of the surface round a point lies in front)
ear_soft = np.clip(blur(ear_f, 1.5) * 1.5, 0, 1) * face
good_ear = np.clip(blur((ear & (ramp_dist > 0.08) & (hl > 0.5) & (hsat < 0.42)).astype(np.float32), 1.0), 0, 1)
ear_fix = ear_soft * (1 - good_ear)
nrm = NH_ / np.linalg.norm(NH_, axis=1, keepdims=True)
cav = np.zeros(len(P), np.float32)
for i in np.where((np.abs(P[:, 0]) > 0.06) & (np.abs(P[:, 2] - 1.655) < 0.06))[0]:
    dv = P - P[i]
    dl = np.linalg.norm(dv, axis=1)
    k = (dl > 1e-5) & (dl < 0.012)
    if k.any():
        cav[i] = np.clip((dv[k] @ nrm[i]) / dl[k], 0, 1).mean()
(CAV,), _ = raster(P, UV, IDX, [cav])
ear_hollow = ss(0.03, 0.3, blur(CAV, 1.5))
remove = np.maximum.reduce([old_beard * (1 - ear_soft), old_blond * (1 - ear_soft), cord, stray, ear_fix])
lip_rim = np.clip(blur(lipbox.astype(np.float32), 1.5) * 1.5, 0, 1)       # the pale rim round the lips goes too
remove = np.clip(np.maximum(remove, lip_rim) * (1 - lips_soft), 0, 1) * face
known = face & (remove < 0.02) & ~lips & ~orig_hair & (hl > 0.3) & (hair_a < 0.5)
fill = inpaint(head, known)
pores = 1 + 0.035 * (blur(rng.random((S, S)).astype(np.float32), 0.9) - 0.5) * 2
blotch = 1 + 0.05 * (vnoise(HX, HY, HZ, 0.025, 23, HC) - 0.5)
under_jaw = 1 - 0.12 * np.clip(-HNZ, 0, 1) * ss(1.6, 1.55, HZ)    # a soft shadow under the chin
skin_new = fill * (pores * blotch * under_jaw)[..., None]
skin_new = skin_new * (1 - (ear_soft * ear_hollow)[..., None] * np.array([0.42, 0.47, 0.48]))
comp = head * (1 - remove[..., None]) + skin_new * remove[..., None]
# a short brown beard where Ivor's grew (the game keeps the beard volume that is baked into the head), painted the
# way ivor_head.py painted his: hairs streaked down the face, shaded by the face's own light and dark
bmask = np.clip(tri_raster(HAIR[:, 0], 5) * 1.3, 0, 1) * face * (1 - lips_soft) * (1 - ear_soft)
brng = np.random.default_rng(3)
bn1 = blur(brng.random((S, S)).astype(np.float32), 0.8)
bstreak = np.asarray(
    Image.fromarray((brng.random((S, S // 6)) * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)
).astype(np.float32) / 255
bstreak = blur(bstreak, 0.6)
bn2 = np.asarray(
    Image.fromarray((brng.random((S // 10, S // 10)) * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)
).astype(np.float32) / 255
bshade = np.clip(hl / max(np.percentile(hl[bmask > 0.5], 60), 1e-3), 0.6, 1.2) if (bmask > 0.5).any() else 1
bcol = np.array([0.27, 0.17, 0.1])[None, None, :] * (0.55 + 0.55 * bstreak[..., None] + 0.2 * bn1[..., None])
bcol = np.clip(bcol * (0.85 + 0.3 * bn2[..., None]) * np.asarray(bshade)[..., None], 0, 1)
stub = np.clip(bmask * 1.1, 0, 1) * (0.8 + 0.2 * bstreak)
comp = comp * (1 - stub[..., None]) + bcol * stub[..., None]
# the hair, with the skin under its thinning edge a little shadowed
shadow = 0.18 * ss(-fade_w - 0.006, 0.0, HZ - zh) * face * (1 - ear_gap)
comp = comp * (1 - shadow[..., None] * np.array([0.45, 0.5, 0.5]))
comp = comp * (1 - hair_alpha[..., None]) + hcol * hair_alpha[..., None]
change = np.clip(np.maximum.reduce([remove, stub * 3, hair_alpha, shadow * 5, ear_fix]), 0, 1)
change = np.clip(blur(change, 2) * 2, 0, 1) * face
comp = head * (1 - change[..., None]) + comp * change[..., None]
comp = pad(comp, HC, (2, 6, 16, 40))
# the empty space just round every piece takes its nearest piece's colour (the old padding had dark streaks)
pad_w = np.clip(blur((~HC).astype(np.float32), 1.5) * 2, 0, 1) * np.clip(blur(HC.astype(np.float32), 10) * 4, 0, 1)
# untouched texels (eyes, teeth, brows, nose...) are copied from the 1024 original, not resampled
w1k = Image.fromarray((np.maximum(change, pad_w) * 255).astype(np.uint8)).resize((1024, 1024), Image.BILINEAR)
w1k = np.asarray(w1k).astype(np.float32)[..., None] / 255
c1k = Image.fromarray((np.clip(comp, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS)
c1k = np.asarray(c1k).astype(np.float32) / 255
save(head1k * (1 - w1k) + c1k * w1k, os.path.join(ASSETS, 'rook_head.jpg'), 1024)
np.savez_compressed(os.path.join(SCR, 'head_maps.npz'), X=HX, Y=HY, Z=HZ, NX=HNX, NY=HNY, NZ=HNZ, COV=HC)
dbg = head.copy()
dbg[..., 0] = np.maximum(dbg[..., 0], remove)
dbg[..., 1] = np.maximum(dbg[..., 1], hair_alpha)
dbg[..., 2] = np.maximum(dbg[..., 2], known * 0.5)
save(dbg, os.path.join(SCR, 'head_debug.png'), 1024)
print('head: done')

