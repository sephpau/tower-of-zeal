import fs from 'fs';

const b = fs.readFileSync('D:/Claude files/monster-3d/ego.glb');
const len = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + len).toString());
const accs = j.accessors;
// per-node mesh bounds (raw, unrotated)
for (const n of j.nodes) {
  if (n.mesh === undefined) continue;
  const m = j.meshes[n.mesh];
  const a = accs[m.primitives[0].attributes.POSITION];
  const c = a.min.map((lo, i) => ((lo + a.max[i]) / 2).toFixed(3));
  const s = a.min.map((lo, i) => (a.max[i] - lo).toFixed(2));
  console.log(`${n.name.padEnd(15)} | center(${c.join(', ')}) | size(${s.join(' x ')}) | ${a.count} verts`);
}
