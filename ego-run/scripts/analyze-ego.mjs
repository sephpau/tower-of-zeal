import fs from 'fs';

// --- parse GLB ---
const buf = fs.readFileSync('D:/Claude files/ego-run/assets/models/ego.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8;
const bin = buf.slice(binStart);

function accessorFloats(accIndex) {
  const acc = json.accessors[accIndex];
  const view = json.bufferViews[acc.bufferView];
  const compCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const byteOffset = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float32Array(acc.count * compCount);
  for (let i = 0; i < out.length; i++) out[i] = bin.readFloatLE(byteOffset + i * 4);
  return { data: out, count: acc.count };
}

let all = [];
for (const m of json.meshes) {
  for (const p of m.primitives) {
    const { data, count } = accessorFloats(p.attributes.POSITION);
    for (let i = 0; i < count; i++) all.push([data[i*3], data[i*3+1], data[i*3+2]]);
  }
}

const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
for (const v of all) for (let k=0;k<3;k++){ min[k]=Math.min(min[k],v[k]); max[k]=Math.max(max[k],v[k]); }
const H = max[1]-min[1];
const c = [(min[0]+max[0])/2, 0, (min[2]+max[2])/2];
console.log('bbox x:[%s,%s] y:[%s,%s] z:[%s,%s]  H=%s',
  ...[min[0],max[0],min[1],max[1],min[2],max[2],H].map(n=>n.toFixed(3)));

// treat Z as the left-right axis (model faces ±X). For each y band:
// - split counts along Z (potential legs/arms gap)
// - quantiles of |z - cz| to find how far out arm mass sits
console.log('\nbands: y | n | Lz% Cz% Rz% (gap on TRUE left-right axis Z) | |z| p50 p90 | x mean (front-back lean)');
const bands = 16;
for (let b=0;b<bands;b++){
  const y0 = min[1] + H*b/bands, y1 = min[1] + H*(b+1)/bands;
  let L=0,C=0,R=0,n=0,xm=0; const dzs=[];
  for (const v of all){
    if (v[1]>=y0 && v[1]<y1){
      n++;
      const dz = v[2]-c[2];
      dzs.push(Math.abs(dz));
      if (dz < -0.05) L++; else if (dz > 0.05) R++; else C++;
      xm += v[0]-c[0];
    }
  }
  dzs.sort((a,b)=>a-b);
  const q=(p)=>dzs.length?dzs[Math.floor(p*(dzs.length-1))]:0;
  const yn=((y0+y1)/2-min[1])/H;
  console.log(`  ${yn.toFixed(2)} | n=${String(n).padStart(6)} | L=${(L/(n||1)*100|0)}% C=${(C/(n||1)*100|0)}% R=${(R/(n||1)*100|0)}% | ${q(0.5).toFixed(2)} ${q(0.9).toFixed(2)} | x=${(xm/(n||1)).toFixed(3)}`);
}
