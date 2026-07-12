import fs from 'fs';
import path from 'path';

const dir = 'D:/Claude files/ego-run/assets/models';
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.glb'))) {
  const b = fs.readFileSync(path.join(dir, f));
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + len).toString());
  console.log(f);
  console.log('  nodes:', (j.nodes || []).map(n => n.name).join(', '));
  console.log('  materials:', (j.materials || []).map(m => m.name + (m.pbrMetallicRoughness?.baseColorFactor ? ' rgba=' + m.pbrMetallicRoughness.baseColorFactor.map(x => x.toFixed(2)).join(',') : '')).join(' | '));
  for (const m of j.meshes || []) {
    console.log('  mesh', m.name, '- primitives:', m.primitives.length, '- attrs:', m.primitives.map(p => Object.keys(p.attributes).join('/')).join(' ; '));
  }
}
