# Ava (Rocketbox Female_Adult_17): white hair in its bun, and a princess gown painted on from the 3D position of
# every texel: a pearl bodice with a sweetheart neckline fading to lilac at the hips, a silver sash at the waist,
# sheer sparkling sleeves, pearl tights and white skates. Bare skin above the neckline.
import sys; sys.path.insert(0,'/tmp/hair'); from glb import load
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
S=2048; OUT='/home/claude/ice3/assets/'; SRC='/tmp/av6/'
j,acc=load(SRC+'f006.glb')
joints=[j['nodes'][i]['name'] for i in j['skins'][0]['joints']]
def prim(name): return [p for p in j['meshes'][0]['primitives'] if name in j['materials'][p['material']]['name']][0]
def raster(P, UV, IDX, vals):
    """interpolate per-vertex values across each triangle's pixels; returns list of maps + coverage"""
    outs=[np.zeros((S,S),np.float32) for _ in vals]; cov=np.zeros((S,S),bool)
    for t in IDX:
        uv=UV[t]*S; x0,y0=np.floor(uv.min(0)).astype(int); x1,y1=np.ceil(uv.max(0)).astype(int)
        x0,y0=max(x0,0),max(y0,0); x1,y1=min(x1,S-1),min(y1,S-1)
        if x1<x0 or y1<y0: continue
        ys,xs=np.mgrid[y0:y1+1,x0:x1+1]+0.5
        (ax,ay),(bx,by),(cx,cy)=uv; den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(den)<1e-9: continue
        l1=((by-cy)*(xs-cx)+(cx-bx)*(ys-cy))/den; l2=((cy-ay)*(xs-cx)+(ax-cx)*(ys-cy))/den; l3=1-l1-l2
        m=(l1>=-0.03)&(l2>=-0.03)&(l3>=-0.03)
        for o,v in zip(outs,vals): o[y0:y1+1,x0:x1+1][m]=(l1*v[t[0]]+l2*v[t[1]]+l3*v[t[2]])[m]
        cov[y0:y1+1,x0:x1+1][m]=True
    return outs,cov
ss=lambda e0,e1,v: (lambda t: t*t*(3-2*t))(np.clip((v-e0)/(e1-e0),0,1))
rng=np.random.default_rng(6)
def group(J,W,pat):
    ks=[i for i,n in enumerate(joints) if any(p in n for p in pat)]; return np.where(np.isin(J,ks),W,0).sum(1)

# ---------------- body ----------------
pb=prim('body'); P=acc(pb['attributes']['POSITION']); UV=acc(pb['attributes']['TEXCOORD_0']); IDX=acc(pb['indices']).reshape(-1,3)
J=acc(pb['attributes']['JOINTS_0']); W=acc(pb['attributes']['WEIGHTS_0'])
wHand=group(J,W,['Hand','Finger']); wFoot=group(J,W,['Foot','Toe']); wLeg=group(J,W,['Thigh','Calf']); wArm=group(J,W,['UpperArm','Forearm'])
NB=acc(pb['attributes']['NORMAL'])
# the highest point of each texel's triangle: long thin triangles running up from the neckline (the rim of the old
# shirt's collar) must not take the gown's colour, or it shows along them as white lines
TOPZ=np.zeros((S,S),np.float32)
for t in IDX:
    uv=UV[t]*S; x0,y0=np.floor(uv.min(0)).astype(int)-2; x1,y1=np.ceil(uv.max(0)).astype(int)+2
    x0,y0=max(x0,0),max(y0,0); x1,y1=min(x1,S-1),min(y1,S-1)
    if x1<x0 or y1<y0: continue
    ys,xs=np.mgrid[y0:y1+1,x0:x1+1]+0.5
    (ax,ay),(bx,by),(cx,cy)=uv; den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
    if abs(den)<1e-9: continue
    l1=((by-cy)*(xs-cx)+(cx-bx)*(ys-cy))/den; l2=((cy-ay)*(xs-cx)+(ax-cx)*(ys-cy))/den; l3=1-l1-l2
    m=(l1>=-0.15)&(l2>=-0.15)&(l3>=-0.15)
    reg=TOPZ[y0:y1+1,x0:x1+1]; reg[m]=np.maximum(reg[m],P[t,2].max())
(X,Y,Z,HAND,FOOT,LEG,ARM,NX,NY),COV=raster(P,UV,IDX,[P[:,0],P[:,1],P[:,2],wHand,wFoot,wLeg,wArm,NB[:,0],NB[:,1]])
orig=np.asarray(Image.open(SRC+'f006_body_color.tga').convert('RGB')).astype(np.float32)/255
lum=orig@np.array([0.299,0.587,0.114])
ph_=prim('head'); Ph=acc(ph_['attributes']['POSITION']); UVh=acc(ph_['attributes']['TEXCOORD_0']); low=Ph[:,2]<1.43
htex=np.asarray(Image.open(SRC+'f006_head_color.tga').convert('RGB')).astype(np.float32)/255
px=np.clip((UVh[low]*S).astype(int),0,S-1); skin=np.median(htex[px[:,1],px[:,0]],axis=0)
out=orig.copy(); R=np.zeros((S,S),np.float32); G=np.zeros((S,S),np.float32); B=np.zeros((S,S),np.float32)
def put(mask,col):
    global out
    m=np.clip(mask,0,1)[...,None]; out=out*(1-m)+col*m
fine=1+0.06*(gaussian_filter(rng.random((S,S)).astype(np.float32),0.8)-0.5)*2
def shade(m,lo,hi):
    l=lum[m]; a,b=np.percentile(l,8),np.percentile(l,92); return np.clip((lum-a)/max(b-a,1e-3),0,1)*(hi-lo)+lo
body=COV&(HAND<0.5)
# bare skin everywhere first (the old T-shirt and jeans painted over), soft and even
put(body.astype(np.float32), skin*fine[...,None]*(0.93+0.07*ss(1.0,1.45,Z))[...,None])
WAIST=0.99
# neckline: a sweetheart at the front (dipping in the middle), straight across the back
neck=np.where(Y<0, 1.300+0.028*ss(0.0,0.075,np.abs(X)), 1.29)
outward=(NX*X+NY*(Y-0.02))>-0.02                 # faces turned in (the inside of the old shirt's collar) are not gown
torso=body&(ARM<0.5)&(LEG<0.5)&(FOOT<0.5)&outward
gl=np.clip((Z-0.8)/(1.3-0.8),0,1)
pearl=np.array([0.97,0.95,0.99]); lilac=np.array([0.62,0.55,0.86])
gown=(lilac*(1-gl[...,None])+pearl*gl[...,None])*shade(torso,0.88,1.06)[...,None]
bod=torso*ss(neck+0.002,neck-0.002,Z)*ss(neck+0.09,neck+0.07,TOPZ)
put(bod, gown); R=np.maximum(R,bod)
# a fine trim along the neckline
trim=torso*np.exp(-((Z-(neck-0.004))/0.0025)**2)*(Z<neck+0.003)
put(trim, np.array([0.86,0.88,0.95])); B=np.maximum(B,trim)
sash=torso*ss(WAIST-0.002,WAIST+0.002,Z)*ss(WAIST+0.037,WAIST+0.033,Z)
put(sash, np.array([0.84,0.86,0.92])*(0.85+0.2*ss(0,0.006,np.minimum(Z-WAIST,WAIST+0.035-Z)))[...,None]); B=np.maximum(B,sash); R=np.minimum(R,1-sash*0.5)
# sheer sleeves from shoulder to wrist: skin through a fine lilac tulle with a scatter of glints
arms=body*ss(0.3,0.6,ARM)
dots=np.clip(gaussian_filter((rng.random((S,S))>0.985).astype(np.float32),0.8)*6,0,1)
tulle=np.array([0.82,0.78,0.97])
sleeve=out*0.55+tulle*0.45; sleeve=sleeve*(1-dots[...,None]*0.6)+dots[...,None]*0.6
put(arms, sleeve); R=np.maximum(R,arms*0.62)
# pearl tights and white skates
legs=body&(LEG>0.5)&(FOOT<0.5)&(Z<WAIST)
put(legs.astype(np.float32), np.array([0.93,0.9,0.92])*shade(legs,0.85,1.05)[...,None]); G=np.maximum(G,legs)
feet=body&(FOOT>0.4)
put(feet.astype(np.float32), np.array([0.96,0.96,0.98])*shade(feet,0.7,1.08)[...,None]); B=np.maximum(B,feet)
# pad the gaps between texture pieces with the nearest colour, so seams stay clean
w=COV.astype(np.float32); fill=out.copy()
for r in (3,8,20,50):
    num=gaussian_filter(fill*w[...,None],(r,r,0)); den=gaussian_filter(w,r)[...,None]; m=(w<0.5)&(den[...,0]>0.02); fill[m]=(num/np.maximum(den,1e-4))[m]; w=np.where(m,1.0,w).astype(np.float32)
out=np.where(COV[...,None],out,fill)
Image.fromarray((np.clip(out,0,1)*255).astype(np.uint8)).resize((1024,1024),Image.LANCZOS).save(OUT+'ava_body.jpg',quality=88)
mk=np.stack([R,G,B],-1); mk=gaussian_filter(mk,(1.2,1.2,0))
Image.fromarray((np.clip(mk,0,1)*255).astype(np.uint8)).resize((512,512),Image.BILINEAR).save(OUT+'ava_mask.png')
nm=np.asarray(Image.open(SRC+'f006_body_normal.tga').convert('RGB')).astype(np.float32)/255
keep=gaussian_filter((COV&(HAND>0.5)).astype(np.float32),3)[...,None]
nm=nm*keep+np.array([0.5,0.5,1.0])*(1-keep)
Image.fromarray((nm*255).astype(np.uint8)).resize((1024,1024),Image.LANCZOS).save(OUT+'ava_body_n.jpg',quality=88)
Image.fromarray((np.clip(out,0,1)*255).astype(np.uint8)).resize((600,600)).save('/tmp/av6/body_prev.jpg',quality=85)

# ---------------- head: white hair ----------------
ph=prim('head'); P=acc(ph['attributes']['POSITION']); UV=acc(ph['attributes']['TEXCOORD_0']); IDX=acc(ph['indices']).reshape(-1,3)
y=P[:,1]; z=P[:,2]; ax=np.abs(P[:,0])
hl=np.interp(y,[-0.08,-0.04,0.0,0.05,0.1,0.2],[1.69,1.675,1.64,1.6,1.56,1.5])
scalp=ss(-0.01,0.004,z-hl); scalp[(ax>0.075)&(z>1.55)&(z<1.63)&(y>-0.03)&(y<0.045)]=0
bunv=((y>0.09)&(z>1.6)).astype(np.float32)
(SC,BUNR),HC=raster(P,UV,IDX,[scalp,bunv])
head=np.asarray(Image.open(SRC+'f006_head_color.tga').convert('RGB')).astype(np.float32)/255
hsv=np.asarray(Image.open(SRC+'f006_head_color.tga').convert('HSV')).astype(np.float32)/255
vv,uu=np.mgrid[0:S,0:S]/S
hairish0=(hsv[...,0]>0.06)&(hsv[...,0]<0.17)&(hsv[...,1]>0.22)
bun=(BUNR>0.5)&hairish0                      # the bun at the back of the head (found by where it is, not by colour alone)
hairish=(hsv[...,0]>0.06)&(hsv[...,0]<0.17)&(hsv[...,1]>0.22)
hm=np.clip(gaussian_filter(np.maximum(SC*hairish,bun.astype(np.float32)),1.2),0,1)
hl_=head@np.array([0.299,0.587,0.114]); a,b=np.percentile(hl_[hm>0.6],5),np.percentile(hl_[hm>0.6],97); n=np.clip((hl_-a)/max(b-a,1e-3),0,1)[...,None]
white=np.array([0.66,0.66,0.70])*(1-n)+np.array([0.995,0.985,0.97])*n
head=head*(1-hm[...,None])+white*hm[...,None]
# pad round the head's pieces with their own edge colour (the empty space is pale and bled into the seam at the chest)
w=HC.astype(np.float32); fill=head.copy()
for r in (2,6,16,40):
    num=gaussian_filter(fill*w[...,None],(r,r,0)); den=gaussian_filter(w,r)[...,None]; m=(w<0.5)&(den[...,0]>0.02); fill[m]=(num/np.maximum(den,1e-4))[m]; w=np.where(m,1.0,w).astype(np.float32)
head=np.where(HC[...,None],head,fill)
Image.fromarray((np.clip(head,0,1)*255).astype(np.uint8)).resize((1024,1024),Image.LANCZOS).save(OUT+'ava_head.jpg',quality=88)
Image.open(SRC+'f006_head_normal.tga').convert('RGB').resize((512,512),Image.LANCZOS).save(OUT+'ava_head_n.jpg',quality=85)
op=np.asarray(Image.open(SRC+'f006_opacity_color.tga').convert('RGBA')).astype(np.float32)/255
l=op[...,:3]@np.array([0.299,0.587,0.114]); m=op[...,3]>0.05; a,b=np.percentile(l[m],5),np.percentile(l[m],97); n=np.clip((l-a)/max(b-a,1e-3),0,1)[...,None]
op[...,:3]=np.array([0.70,0.70,0.74])*(1-n)+np.array([1.0,0.99,0.975])*n
Image.fromarray((op*255).astype(np.uint8)).save(OUT+'ava_hair.webp','WEBP',quality=85,method=6)
Image.fromarray((np.clip(head,0,1)*255).astype(np.uint8)).resize((500,500)).save('/tmp/av6/head_prev.jpg',quality=85)
print('skin',skin)
