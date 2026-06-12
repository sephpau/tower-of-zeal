import fs from 'fs';

const b = fs.readFileSync('D:/Claude files/ego-run/assets/models/ego.glb');
const jlen = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jlen).toString());
const accs = j.accessors;
// node name -> mesh index
for (const n of j.nodes) {
  if (n.mesh === undefined) continue;
  const m = j.meshes[n.mesh];
  const a = accs[m.primitives[0].attributes.POSITION];
  const sz = a.max.map((x, i) => (x - a.min[i]).toFixed(2));
  console.log(n.name.padEnd(16), '| mesh', m.name,
    '| yRange', a.min[1].toFixed(2), '→', a.max[1].toFixed(2),
    '| size', sz.join(' x '),
    '| verts', a.count);
}
