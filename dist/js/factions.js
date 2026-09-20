import {arrangeGraph} from './layout.js';

// Faction positions are independent of member positions; old v1 files need no migration.
export function factionPositions(board) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(board.factions.length)));
  const placed = board.factions.filter(f => Number.isFinite(f.x) && Number.isFinite(f.y));
  return board.factions.map(f => {
    if (Number.isFinite(f.x) && Number.isFinite(f.y)) return {...f};
    let x, y, slot = 0;
    do {x = 180 + (slot % columns) * 360; y = 160 + Math.floor(slot / columns) * 300; slot++;}
    while (placed.some(p => Math.abs(p.x-x) < 320 && Math.abs(p.y-y) < 260));
    const node = {...f, x, y}; placed.push(node); return node;
  });
}

export function factionRelations(board) {
  const memberships = new Map(), pairs = new Map();
  board.factions.forEach((f, i) => f.members.forEach(id => {
    if (!memberships.has(id)) memberships.set(id, []);
    memberships.get(id).push(i);
  }));
  for (const r of board.relations) {
    const counted = new Set();
    for (const a of memberships.get(r.source) || []) for (const b of memberships.get(r.target) || []) {
      if (a === b) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (counted.has(key)) continue;
      counted.add(key);
      if (!pairs.has(key)) pairs.set(key, {source:board.factions[Math.min(a,b)].id, target:board.factions[Math.max(a,b)].id, count:0});
      pairs.get(key).count++;
    }
  }
  return [...pairs.values()];
}

export const FACTION_SHAPE = 'M-125 0-86-100H86L125 0 86 100H-86Z';
const corners = [[-125,0],[-86,-100],[86,-100],[125,0],[86,100],[-86,100]];
function boundary(a, b) {
  const dx = b.x-a.x, dy = b.y-a.y;
  for (let i=0; i<corners.length; i++) {
    const [px,py] = corners[i], [qx,qy] = corners[(i+1)%corners.length];
    const ex=qx-px, ey=qy-py, cross=dx*ey-dy*ex;
    if (Math.abs(cross)<1e-8) continue;
    const t=(px*ey-py*ex)/cross, u=(px*dy-py*dx)/cross;
    if (t>=0 && u>=0 && u<=1) return {x:a.x+dx*t, y:a.y+dy*t};
  }
  return a;
}
export function factionLine(a, b) {
  const start=boundary(a,b), end=boundary(b,a);
  return {start,end,x:(start.x+end.x)/2,y:(start.y+end.y)/2};
}

export async function arrangeFactions(board, options={}) {
  // Reuse card layout at a larger scale to leave space for 250 × 200 faction nodes.
  const scale=1.8;
  const graph={characters:factionPositions(board).map(p=>({id:p.id,x:p.x/scale,y:p.y/scale})),relations:factionRelations(board),factions:[]};
  return (await arrangeGraph(graph,options)).map(p=>({id:p.id,x:Math.round(p.x*scale),y:Math.round(p.y*scale)}));
}
