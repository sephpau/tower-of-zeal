import fs from 'fs';

const b = fs.readFileSync('D:/Claude files/monster-3d/ego.glb');
const len = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + len).toString());
console.log('nodes:', (j.nodes || []).map(n => n.name + (n.mesh !== undefined ? ` (mesh ${n.mesh})` : '')).join(', '));
console.log('meshes:');
for (const m of j.meshes || []) {
  console.log(' ', m.name, '-', m.primitives.map(p => 'attrs[' + Object.keys(p.attributes).join(',') + '] mat=' + p.material).join(' | '));
}
console.log('materials:', JSON.stringify((j.materials || []).map(m => ({ name: m.name, baseTex: m.pbrMetallicRoughness?.baseColorTexture !== undefined, baseColor: m.pbrMetallicRoughness?.baseColorFactor }))));
console.log('images:', (j.images || []).map(i => i.mimeType + ' ' + (i.name || '')).join(', '));
console.log('textures:', (j.textures || []).length);
// bbox
const accs = j.accessors || [];
let min=[1/0,1/0,1/0], max=[-1/0,-1/0,-1/0];
for (const m of j.meshes) for (const p of m.primitives) {
  const a = accs[p.attributes.POSITION];
  if (a?.min) for (let i=0;i<3;i++){ min[i]=Math.min(min[i],a.min[i]); max[i]=Math.max(max[i],a.max[i]); }
}
console.log('bbox size:', max.map((x,i)=>(x-min[i]).toFixed(3)).join(' x '));
