import sys, json, struct; sys.path.insert(0,'/tmp/hair'); from glb import load
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
SRC='/tmp/avm2/m011.glb'; OUT='/tmp/hair/max.glb'
j,acc=load(SRC)
raw=open(SRC,'rb').read(); jl=struct.unpack('<I',raw[12:16])[0]; off=20+jl; bl=struct.unpack('<I',raw[off:off+4])[0]; BIN=bytearray(raw[off+8:off+8+bl])
prim=[p for p in j['meshes'][0]['primitives'] if 'head' in j['materials'][p['material']]['name']][0]
P=acc(prim['attributes']['POSITION']).copy(); N=acc(prim['attributes']['NORMAL']).copy(); UV=acc(prim['attributes']['TEXCOORD_0']); IDX=acc(prim['indices']).reshape(-1,3)
x,y,z=P[:,0],P[:,1],P[:,2]; ax=np.abs(x)
ss=lambda e0,e1,v: np.clip((v-e0)/(e1-e0),0,1)**2*(3-2*np.clip((v-e0)/(e1-e0),0,1))
# ---- beard: below a cheek line running from the sideburns down to the mouth corners, over the chin and under the jaw
ztop=np.interp(y,[-0.15,-0.11,-0.08,-0.04,0.0,0.02],[1.632,1.636,1.648,1.672,1.712,1.715])
ztop=np.where(ax<0.03,1.631,ztop)                                  # moustache up to just under the nose
beard=ss(0.0,0.006,ztop-z)
beard*=ss(0.035,0.0,y)                                               # nothing behind the ears
zbot=np.interp(y,[-0.15,-0.06,-0.03,0.0],[1.515,1.525,1.55,1.585])
beard*=ss(0.0,0.012,z-zbot)
lips=(ax<0.034)&(np.abs(z-1.606)<0.0115)&(y<-0.105); beard[lips]=0
ears=(ax>0.083)&(z>1.655)&(y>-0.03); beard[ears]=0
inner=(UV[:,0]<0.37)&(UV[:,1]>0.6); beard[inner]=0               # teeth, tongue and eyes have their own islands
# ---- scalp: above a hairline that is high on the forehead and low at the nape
hl=np.interp(y,[-0.15,-0.09,-0.05,-0.01,0.03,0.06,0.09,0.12],[1.762,1.752,1.738,1.736,1.712,1.66,1.628,1.62])
scalp=ss(0.0,0.008,z-hl); scalp[ears]=0; scalp[inner]=0
print('beard verts',(beard>0.5).sum(),'scalp verts',(scalp>0.5).sum())
# ---- beard volume, baked into the head
P2=P+N*(beard**2*0.012)[:,None]
# ---- write the new glb: new POSITION accessor and a _HAIR attribute (beard, scalp)
def add(arr, typ):
    global BIN
    while len(BIN)%4: BIN.append(0)
    o=len(BIN); data=arr.astype(np.float32).tobytes(); BIN+=data
    j['bufferViews'].append({'buffer':0,'byteOffset':o,'byteLength':len(data)})
    a={'bufferView':len(j['bufferViews'])-1,'componentType':5126,'count':len(arr),'type':typ}
    if typ=='VEC3': a['min']=arr.min(0).tolist(); a['max']=arr.max(0).tolist()
    j['accessors'].append(a); return len(j['accessors'])-1
prim['attributes']['POSITION']=add(P2,'VEC3'); prim['attributes']['_HAIR']=add(np.stack([beard,scalp],1),'VEC2')
for p in j['meshes'][0]['primitives']:
    if 'opacity' in j['materials'][p['material']]['name']: pass
while len(BIN)%4: BIN.append(0)
j['buffers'][0]['byteLength']=len(BIN)
js=json.dumps(j,separators=(',',':')).encode();
while len(js)%4: js+=b' '
out=b'glTF'+struct.pack('<II',2,12+8+len(js)+8+len(BIN))+struct.pack('<I',len(js))+b'JSON'+js+struct.pack('<I',len(BIN))+b'BIN\x00'+bytes(BIN)
open(OUT,'wb').write(out); print('glb',len(out))
# ---- paint the head: blond scalp (only inside the scalp zone, so the eyes and brows are left alone), then the beard
S=2048
def raster(val_per_vertex, blur):
    m=Image.new('L',(S,S),0); d=ImageDraw.Draw(m)
    for t in IDX:
        val=float(val_per_vertex[t].mean())
        if val<0.02: continue
        d.polygon([(float(UV[k,0]*S),float(UV[k,1]*S)) for k in t],fill=int(val*255))
    return np.asarray(m.filter(ImageFilter.GaussianBlur(blur))).astype(np.float32)/255
head=np.asarray(Image.open('/tmp/avm2/m011_head_color.tga').convert('RGB')).astype(np.float32)/255
lum=head@np.array([0.299,0.587,0.114])
margin=np.interp(y,[-0.15,-0.05,0.0,0.03,0.12],[0.0,0.0,0.03,0.09,0.1])
nearV=ss(-0.01,0.004,z-(hl-margin)); nearV[inner]=0
near=np.clip(raster(nearV,8)*1.3,0,1)
hm=np.clip((0.56-lum)/0.18,0,1)*near                     # only dark (hair) pixels: the forehead skin and the brows stay
a,b=np.percentile(lum[hm>0.6],5),np.percentile(lum[near>0.6],97); n=np.clip((lum-a)/max(b-a,1e-3),0,1)[...,None]
blond=np.clip(np.array([0.46,0.26,0.13])*(1-n)+np.array([0.96,0.76,0.52])*n,0,1)        # strawberry blond
out=head*(1-hm[...,None])+blond*hm[...,None]
mk=np.clip(raster(beard,5)*1.3,0,1)
rng=np.random.default_rng(3)
n1=np.asarray(Image.fromarray((rng.random((S,S))*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)/255
streak=np.asarray(Image.fromarray((rng.random((S,S//6))*255).astype(np.uint8)).resize((S,S),Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)/255   # stretched down the face: hairs that grow downward
n2=np.asarray(Image.fromarray((rng.random((S//10,S//10))*255).astype(np.uint8)).resize((S,S),Image.BICUBIC)).astype(np.float32)/255
shade=np.clip(lum/np.percentile(lum[mk>0.5],60),0.6,1.2)
col=np.array([0.74,0.48,0.27])[None,None,:]*(0.55+0.55*streak[...,None]+0.2*n1[...,None])*(0.85+0.3*n2[...,None])*shade[...,None]
col=np.clip(col,0,1)
a=(np.clip(mk*1.1,0,1)*(0.8+0.2*streak))[...,None]
out=out*(1-a)+col*a
Image.fromarray((out*255).astype(np.uint8)).resize((1024,1024),Image.LANCZOS).save('/home/claude/ice3/assets/max_head.jpg',quality=88)
Image.fromarray((out*255).astype(np.uint8)).resize((600,600)).save('/tmp/hair/headprev.jpg')
