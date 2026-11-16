import numpy as np
from PIL import Image, ImageFilter
N=2048; out='/home/claude/ice3/assets/'
body=np.asarray(Image.open('m011_body_color.tga').convert('RGB')).astype(np.float32)/255
hsv=np.asarray(Image.fromarray((body*255).astype(np.uint8)).convert('HSV')).astype(np.float32)/255
H,S,V=hsv[...,0],hsv[...,1],hsv[...,2]
vv,uu=np.mgrid[0:N,0:N]/N
lum=body@np.array([0.299,0.587,0.114])
def soft(m,r=2): return np.asarray(Image.fromarray((np.clip(m,0,1)*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)/255
red=((H<0.05)|(H>0.93))&(S>0.3)&(V>0.1)
hole=((uu-0.493)**2/0.045**2+(vv-0.471)**2/0.03**2)<1
shirt=red|hole|((((uu<0.31)|(uu>0.69))&(vv>0.445)&(vv<0.715)))          # the whole upper sleeve, seams and all
pants=((uu<0.31)|(uu>0.69))&(vv<0.445)&~red
shoes=(vv>0.69)&(((uu>0.2)&(uu<0.35))|((uu>0.58)&(uu<0.76)))&~red&((S<0.25))
skin=np.median(body[(vv>0.735)&(vv<0.795)&(uu>0.04)&(uu<0.2)].reshape(-1,3),axis=0)
neck=np.array([0.79,0.58,0.44])
near=np.clip(1-np.sqrt(((uu-0.493)/0.16)**2+((vv-0.471)/0.12)**2),0,1)[...,None]
skinmap=skin*0.4+neck*0.6

G=lambda x,y,cx,cy,rx,ry: np.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2))
band=lambda e,w: np.exp(-((e-1)/w)**2)
sh=np.zeros((N,N),np.float32)
px=(uu-0.495)/0.17; py=(vv-0.50)/0.33; F=(py>-0.05)&(py<1.05)&(np.abs(px)<1.05)
f=np.zeros_like(sh)
for s in (-1,1):
    e=np.sqrt(((px-s*0.37)/0.4)**2+((py-0.15)/0.16)**2)
    f+=0.13*np.clip(1-e,0,1)**0.6*(e<1)                               # rounded pecs
    f-=0.24*band(e,0.12)*(py>0.13)*(np.abs(px)>0.04)                   # their curved lower edge

    for r in (0.44,0.56,0.68):
        e2=np.sqrt(((px-s*0.17)/0.13)**2+((py-r)/0.05)**2); f+=0.10*np.clip(1-e2,0,1)**0.5; f-=0.06*band(e2,0.25)   # abdominals
    f-=0.12*G(np.abs(px)-0.66,py,0,0.62,0.16,0.25)                      # obliques
    f+=0.06*G(np.abs(px)-0.62,py,0,0.3,0.12,0.12)                      # serratus
    d=np.abs((np.abs(px)-0.55)*(0.98-0.78)-(py-0.78)*(0.15-0.55)) / np.hypot(0.2,0.4)
    f-=0.06*np.exp(-(d/0.05)**2)*(py>0.76)*(py<1.0)*(np.abs(px)<0.58)      # soft V lines
f-=0.12*G(px,py,0,0.55,0.03,0.38)                                   # the line down the middle

sh+=np.where(F,f,0)
qy=(0.44-vv)/0.38; B=(qy>-0.05)&(qy<1.05)&(np.abs(px)<1.05)
b=np.zeros_like(sh)
b-=0.14*G(px,qy,0,0.55,0.035,0.6)
for s in (-1,1):
    e=np.sqrt(((px-s*0.36)/0.28)**2+((qy-0.3)/0.17)**2); b+=0.06*np.clip(1-e,0,1)**0.8; b-=0.035*band(e,0.3)   # shoulder blades
    b+=0.07*G(px,qy,s*0.28,0.04,0.3,0.1)
    b+=0.06*G(px,qy,s*0.2,0.75,0.12,0.18)                              # spinal erectors
    b-=0.06*G(np.abs(px)-0.6,qy,0,0.6,0.18,0.3)
sh+=np.where(B,b,0)
for cu in (0.155,0.845):
    ax=(uu-cu)/0.14; ay=(vv-0.59)/0.13; Sl=(np.abs(ax)<1.1)&(np.abs(ay)<1.1)
    sh+=np.where(Sl, 0.13*G(ax,ay,0,-0.15,0.42,0.6), 0)
sh=np.asarray(Image.fromarray(((sh+0.5)*255).clip(0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)/255-0.5
rng=np.random.default_rng(5); noise=np.asarray(Image.fromarray((rng.random((N,N))*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32)/255-0.5
torso=np.clip(skinmap*(1+sh*1.35+noise*0.035)[...,None]*np.array([1.03,1.0,0.97]),0,1)
# grow the shirt a little and close it over its stitched seams, so no seam line is left on the skin
_im=Image.fromarray((shirt*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.MinFilter(15)).filter(ImageFilter.MaxFilter(9))
mS=soft(np.asarray(_im).astype(np.float32)/255,2)
def shade(mask,lo,hi):
    v=lum[mask]; a,b=np.percentile(v,6),np.percentile(v,94); return np.clip((lum-a)/max(b-a,1e-3),0,1)*(hi-lo)+lo
trou=np.clip(np.array([0.045,0.045,0.055])*shade(pants,0.8,1.6)[...,None],0,1)
boots=np.clip(np.array([0.05,0.05,0.055])*shade(shoes,0.7,2.4)[...,None],0,1)
o=body.copy()
for m,c in ((mS,torso),(soft(pants),trou),(soft(shoes),boots)): o=o*(1-m[...,None])+c*m[...,None]
# pad the empty space between pieces with the colour of the nearest piece, so no dark edge bleeds into a seam
bg=(V<0.03)&~shirt
w=(~bg).astype(np.float32); fill=o.copy()
from scipy.ndimage import gaussian_filter
def blur(a,r): return gaussian_filter(a,(r,r,0)) if a.ndim==3 else gaussian_filter(a,r)
for r in (3,8,20,50):
    num=blur((fill*w[...,None]).astype(np.float32),r); den=blur(w.astype(np.float32),r)[...,None]
    est=num/np.maximum(den,1e-4); m=(w<0.5)&(den[...,0]>0.02)
    fill[m]=est[m]; w=np.where(m,1.0,w).astype(np.float32)
o=np.where(bg[...,None],fill,o)
Image.fromarray((np.clip(o,0,1)*255).astype(np.uint8)).resize((1024,1024),Image.LANCZOS).save(out+'max_body.jpg',quality=88)

nm=np.asarray(Image.open('m011_body_normal.tga').convert('RGB')).astype(np.float32)/255
nm=nm*(1-mS[...,None])+np.array([0.5,0.5,1.0])*mS[...,None]
Image.fromarray((nm*255).astype(np.uint8)).resize((1024,1024),Image.LANCZOS).save(out+'max_body_n.jpg',quality=88)
