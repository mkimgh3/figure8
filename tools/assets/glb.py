import json, struct, numpy as np
def load(path):
    b=open(path,'rb').read(); jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl]); off=20+jl; bl=struct.unpack('<I',b[off:off+4])[0]; bin_=b[off+8:off+8+bl]
    def acc(i):
        a=j['accessors'][i]; v=j['bufferViews'][a['bufferView']]; n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        dt={5126:np.float32,5123:np.uint16,5121:np.uint8,5125:np.uint32}[a['componentType']]
        st=v.get('byteStride'); o=v.get('byteOffset',0)+a.get('byteOffset',0)
        if st and st!=n*np.dtype(dt).itemsize:
            raw=np.frombuffer(bin_,np.uint8,count=st*a['count'],offset=o).reshape(a['count'],st)[:,:n*np.dtype(dt).itemsize].copy(); return raw.view(dt).reshape(a['count'],n)
        return np.frombuffer(bin_,dt,count=a['count']*n,offset=o).reshape(a['count'],n)
    return j,acc
