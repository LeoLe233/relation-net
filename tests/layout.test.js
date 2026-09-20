import test from 'node:test';
import assert from 'node:assert/strict';
import {arrangeGraph} from '../dist/js/layout.js';
import {demoBoard,exportBoard,validateImport} from '../dist/js/model.js';

const options = {yieldControl:async()=>{}};
const graph = (positions, links, factions=[]) => ({
  characters:positions.map(([x,y],i)=>({id:`p${i}`,x,y})),
  relations:links.map(([a,b],i)=>({id:`r${i}`,source:`p${a}`,target:`p${b}`})), factions
});
function crossings(board,positions=board.characters) {
  const byId=new Map(positions.map(p=>[p.id,p]));
  const orientation=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  let count=0;
  for(let i=0;i<board.relations.length;i++)for(let j=i+1;j<board.relations.length;j++){
    const first=board.relations[i],second=board.relations[j];
    const ids=[first.source,first.target,second.source,second.target];
    if(new Set(ids).size<4)continue;
    const [a,b,c,d]=ids.map(id=>byId.get(id));
    if(orientation(a,b,c)*orientation(a,b,d)<0&&orientation(c,d,a)*orientation(c,d,b)<0)count++;
  }
  return count;
}
function assertNoOverlaps(points){
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    assert(Math.abs(points[i].x-points[j].x)>=204||Math.abs(points[i].y-points[j].y)>=184,
      `${points[i].id} overlaps ${points[j].id}`);
  }
}

test('untangles a crossed cycle without deleting or changing any relationship',async()=>{
  const b=graph([[0,0],[400,400],[0,400],[400,0]],[[0,1],[1,2],[2,3],[3,0]]);
  const before=structuredClone(b),positions=await arrangeGraph(b,options);
  assert.equal(crossings(b),1);assert.equal(crossings(b,positions),0);
  assertNoOverlaps(positions);assert.deepEqual(b,before);
});
test('spreads coincident cards, including multiple labels on the same pair',async()=>{
  const b=graph(Array.from({length:24},()=>[0,0]),Array.from({length:23},(_,i)=>[0,i+1]));
  b.relations.push({...b.relations[0],id:'duplicate-pair'});
  const positions=await arrangeGraph(b,options);
  assert.equal(positions.length,24);assertNoOverlaps(positions);
  assert(positions.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});
test('packs disconnected clusters and isolated people without overlapping cards',async()=>{
  const b=graph(Array.from({length:15},()=>[10,10]),[[0,1],[1,2],[3,4],[4,5]],[
    {id:'f1',members:['p0','p2','p6']},{id:'f2',members:['p3','p4']}
  ]);
  const positions=await arrangeGraph(b,options);assertNoOverlaps(positions);
  assert.equal(new Set(positions.map(p=>p.id)).size,15);
});
test('generated positions remain import-compatible and leave text, IDs and memberships unchanged',async()=>{
  const b=demoBoard(),before=structuredClone(b),positions=await arrangeGraph(b,options);
  assert.deepEqual(b,before);
  const byId=new Map(positions.map(p=>[p.id,p]));
  b.characters.forEach(p=>Object.assign(p,byId.get(p.id)));
  assert.deepEqual(validateImport(exportBoard(b)),b);
  assert.deepEqual(b.relations,before.relations);assert.deepEqual(b.factions,before.factions);
});
test('handles empty and single-person graphs and deterministic repeat runs',async()=>{
  assert.deepEqual(await arrangeGraph(graph([],[]),options),[]);
  const b=graph([[0,0]],[]);const p=await arrangeGraph(b,options);
  assert.deepEqual(p,[{id:'p0',x:160,y:160}]);
  const chain=graph(Array.from({length:8},()=>[0,0]),[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7]]);
  assert.deepEqual(await arrangeGraph(chain,options),await arrangeGraph(chain,options));
});
