# Max's viking kit, painted onto his body texture from the 3D position of every texel:
# wool trousers up to the waist, a leather belt with a bronze buckle, a strap across the chest with studs,
# linen leg wraps bound with criss-crossed thongs, fur-topped leather boots, leather bracers and gold arm rings.
import sys; sys.path.insert(0,'/tmp/hair'); from glb import load
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter
S=2048; OUT='/home/claude/ice3/assets/'
j,acc=load('/tmp/hair/max.glb')
prim=[p for p in j['meshes'][0]['primitives'] if 'body' in j['materials'][p['material']]['name']][0]
P=acc(prim['attributes']['POSITION']); UV=acc(prim['attributes']['TEXCOORD_0']); IDX=acc(prim['indices']).reshape(-1,3)
# ---- texel positions: interpolate each triangle's corners across its pixels
X=np.zeros((S,S),np.float32); Y=np.zeros((S,S),np.float32); Z=np.zeros((S,S),np.float32); COV=np.zeros((S,S),bool)
for t in IDX:
    uv=UV[t]*S; x0,y0=np.floor(uv.min(0)).astype(int); x1,y1=np.ceil(uv.max(0)).astype(int)
    x0,y0=max(x0,0),max(y0,0); x1,y1=min(x1,S-1),min(y1,S-1)
    if x1<x0 or y1<y0: continue
    ys,xs=np.mgrid[y0:y1+1,x0:x1+1]+0.5
    (ax,ay),(bx,by),(cx,cy)=uv; den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
    if abs(den)<1e-9: continue
    l1=((by-cy)*(xs-cx)+(cx-bx)*(ys-cy))/den; l2=((cy-ay)*(xs-cx)+(ax-cx)*(ys-cy))/den; l3=1-l1-l2
    m=(l1>=-0.03)&(l2>=-0.03)&(l3>=-0.03)
    for A,k in ((X,0),(Y,1),(Z,2)):
        v=l1*P[t[0],k]+l2*P[t[1],k]+l3*P[t[2],k]; A[y0:y1+1,x0:x1+1][m]=v[m]
    COV[y0:y1+1,x0:x1+1][m]=True
orig=np.asarray(Image.open('/tmp/avm2/m011_body_color.tga').convert('RGB')).astype(np.float32)/255
hsv=np.asarray(Image.open('/tmp/avm2/m011_body_color.tga').convert('HSV')).astype(np.float32)/255
H,Sat,V=hsv[...,0],hsv[...,1],hsv[...,2]
vv,uu=np.mgrid[0:S,0:S]/S
lum=orig@np.array([0.299,0.587,0.114])
red=((H<0.05)|(H>0.93))&(Sat>0.3)&(V>0.1)
pants=((uu<0.31)|(uu>0.69))&(vv<0.445)&~red&COV
shoes=(vv>0.69)&(((uu>0.2)&(uu<0.35))|((uu>0.58)&(uu<0.76)))&~red&(Sat<0.25)&COV
base=np.asarray(Image.open(OUT+'max_body.jpg').convert('RGB').resize((S,S),Image.LANCZOS)).astype(np.float32)/255
rng=np.random.default_rng(11)
def noise(scale, amp, seed):
    r=np.random.default_rng(seed).random((S//scale+1,S//scale+1)).astype(np.float32)
    return 1+amp*(np.asarray(Image.fromarray((r*255).astype(np.uint8)).resize((S,S),Image.BICUBIC)).astype(np.float32)/255-0.5)*2
fine=1+0.12*(gaussian_filter(rng.random((S,S)).astype(np.float32),0.7)-0.5)*2
def shade(m,lo=0.75,hi=1.3):
    l=lum[m]; a,b=np.percentile(l,8),np.percentile(l,92); return np.clip((lum-a)/max(b-a,1e-3),0,1)*(hi-lo)+lo
ss=lambda e0,e1,v: (lambda t: t*t*(3-2*t))(np.clip((v-e0)/(e1-e0),0,1))
out=base.copy(); B=np.zeros((S,S),np.float32)           # B: leather and metal (a little glossier)
def put(mask, colour, gloss=0.0):
    global out, B
    m=np.clip(mask,0,1)[...,None]; out=out*(1-m)+colour*m; B=np.maximum(B,np.clip(mask,0,1)*gloss)
torso=COV&(np.abs(X)<0.27)&(Z>0.8)&(Z<1.6)&~pants&~shoes
ZW=0.955
# ---- wool trousers: the legs, and the torso below the waist
trousers=(pants|(torso&(Z<ZW)))&~shoes
sh=shade(pants)
wool=np.array([0.15,0.115,0.085])[None,None,:]*sh[...,None]*fine[...,None]*noise(64,0.08,3)[...,None]
put(trousers*ss(ZW+0.004,ZW-0.004,np.where(pants,0,Z)), wool)
# ---- leg wraps over the calves, bound with criss-crossed thongs
legs=pants&(Z>0.15)&(Z<0.5)
cxl=np.sign(X)*0.109; ang=np.arctan2(Y+0.01,X-cxl)/(2*np.pi)
wrapedge=np.abs(((Z/0.034+ang*0.6)%1)-0.5)
linen=np.array([0.47,0.38,0.26])[None,None,:]*sh[...,None]*fine[...,None]*(0.82+0.18*ss(0.5,0.38,wrapedge))[...,None]
fade=ss(0.15,0.17,Z)*ss(0.5,0.48,Z)
put(legs*fade, linen)
s1=np.abs(((Z/0.11+ang)%1)-0.5); s2=np.abs(((Z/0.11-ang)%1)-0.5)
thong=np.maximum(ss(0.075,0.045,np.abs(s1-0.5)),ss(0.075,0.045,np.abs(s2-0.5)))
put(legs*fade*thong, np.array([0.17,0.10,0.05])*sh[...,None], 0.6)
# ---- boots: brown leather with a fur cuff at the top
bz=Z[shoes]; btop=np.percentile(bz,97) if bz.size else 0.2
bsh=shade(shoes,0.6,1.5)
put(shoes.astype(np.float32), np.array([0.25,0.15,0.075])[None,None,:]*bsh[...,None]*fine[...,None], 0.7)
fur=np.array([0.52,0.46,0.38])[None,None,:]*(0.7+0.6*gaussian_filter(rng.random((S,S)).astype(np.float32),0.9)[...,None])*noise(32,0.2,5)[...,None]
put(pants*ss(0.09,0.1,Z)*ss(0.165,0.155,Z), fur)                 # a fur cuff between boot and leg wraps
# ---- belt, with a bronze buckle at the front
belt=torso&(Z>ZW-0.068)&(Z<ZW-0.004)
beltc=np.array([0.36,0.21,0.10])[None,None,:]*fine[...,None]*(0.75+0.25*ss(0.0,0.008,np.minimum(Z-(ZW-0.068),(ZW-0.004)-Z)))[...,None]
put(belt.astype(np.float32), beltc, 0.8)
stitch=belt&((np.abs(Z-(ZW-0.060))<0.0012)|(np.abs(Z-(ZW-0.012))<0.0012))&(((X*180)%1)<0.5)
put(stitch.astype(np.float32), np.array([0.62,0.52,0.36]))
bk=belt&(Y<-0.05)&(np.abs(X)<0.05)
d=np.hypot(X/1.2,Z-(ZW-0.036))
put((bk&(d<0.03)).astype(np.float32), np.array([0.74,0.53,0.22])*(0.75+0.35*ss(0.03,0.012,d))[...,None], 1.0)
put((bk&(np.abs(d-0.02)<0.0025)).astype(np.float32), np.array([0.35,0.24,0.10]), 1.0)
# ---- a strap across the chest and back, left shoulder to right hip, with bronze studs
x0,z0,x1,z1=0.15,1.47,-0.18,0.93; L=np.hypot(x1-x0,z1-z0); dx,dz=(x1-x0)/L,(z1-z0)/L
sp=(X-x0)*dx+(Z-z0)*dz; dd=np.abs((X-x0)*dz-(Z-z0)*dx)
strap=torso&(sp>0)&(sp<L)&(Z>ZW)
put((strap*ss(0.026,0.022,dd)).astype(np.float32), np.array([0.31,0.18,0.085])[None,None,:]*fine[...,None]*(0.8+0.2*ss(0.022,0.012,dd))[...,None], 0.8)
stud=np.hypot(((sp/0.07)%1-0.5)*0.07,dd)
put((strap&(stud<0.0075)).astype(np.float32), np.array([0.80,0.62,0.30])*(0.7+0.5*ss(0.0075,0.0,stud))[...,None], 1.0)
# ---- leather bracers on the forearms, three straps each; a gold ring round each upper arm
def along(a,b):
    a=np.array(a); b=np.array(b); ax=b-a; l=np.linalg.norm(ax); ax=ax/l
    rx,ry,rz=X-a[0],Y-a[1],Z-a[2]; s=(rx*ax[0]+ry*ax[1]+rz*ax[2]); r=np.sqrt(np.maximum(rx*rx+ry*ry+rz*rz-s*s,0)); return s/l,r
for sg in (1,-1):
    s,r=along((0.416*sg,0.019,1.23),(0.588*sg,-0.081,1.046)); arm=COV&(np.sign(X)==sg)&(np.abs(X)>0.3)&(r<0.075)
    br=arm&(s>0.2)&(s<0.9)
    put(br*ss(0.2,0.23,s)*ss(0.9,0.87,s), np.array([0.32,0.19,0.09])[None,None,:]*fine[...,None], 0.8)
    for c in (0.3,0.55,0.8): put((br&(np.abs(s-c)<0.035)).astype(np.float32), np.array([0.16,0.09,0.045])[None,None,:]*fine[...,None], 0.8)
    s,r=along((0.21*sg,0.025,1.428),(0.416*sg,0.019,1.23)); arm=COV&(np.sign(X)==sg)&(np.abs(X)>0.2)&(r<0.09)
    for c in (0.55,0.63):
        ring=arm&(np.abs(s-c)<0.022)
        put(ring.astype(np.float32), np.array([0.85,0.64,0.27])*(0.8+0.3*ss(0.022,0.0,np.abs(s-c)))[...,None], 1.0)
Image.fromarray((np.clip(out,0,1)*255).astype(np.uint8)).resize((1024,1024),Image.LANCZOS).save(OUT+'max_body.jpg',quality=88)
mk=np.zeros((S,S,3),np.float32); mk[...,2]=B
Image.fromarray((np.clip(gaussian_filter(mk,(1.5,1.5,0)),0,1)*255).astype(np.uint8)).resize((512,512),Image.BILINEAR).save(OUT+'max_mask.png')
Image.fromarray((np.clip(out,0,1)*255).astype(np.uint8)).resize((700,700)).save('/tmp/vk/prev.jpg',quality=85)
print('boot top',btop)
