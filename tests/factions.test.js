import test from 'node:test';
import assert from 'node:assert/strict';
import {demoBoard,exportBoard,validateImport} from '../dist/js/model.js';
import {factionPositions,factionRelations,factionLine,arrangeFactions} from '../dist/js/factions.js';

test('legacy graphs get separated faction positions independent of member coordinates',()=>{
  const b=demoBoard(),before=JSON.stringify(b),positions=factionPositions(b);
  assert.equal(JSON.stringify(b),before);
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
    assert(Math.abs(positions[i].x-positions[j].x)>=320||Math.abs(positions[i].y-positions[j].y)>=260);
  }
  b.characters.forEach(p=>{p.x=0;p.y=0;});
  assert.deepEqual(factionPositions(b),positions);
});

test('v1 round-trip preserves saved faction coordinates and rejects malformed positions',()=>{
  const b=demoBoard();b.factions[0].x=-840;b.factions[0].y=915;
  assert.deepEqual(validateImport(exportBoard(b)),b);
  for(const position of [{x:1},{x:NaN,y:0},{x:0,y:Infinity},{x:100001,y:0},{x:'10',y:20}]){
    const corrupted=demoBoard();Object.assign(corrupted.factions[0],position);
    assert.throws(()=>validateImport(exportBoard(corrupted)),/阵营坐标/);
  }
});

test('cross-faction counts count each relationship once even with overlapping memberships',()=>{
  const b={factions:[{id:'a',members:['p','q']},{id:'b',members:['p','q']},{id:'c',members:['r']}],relations:[{source:'p',target:'q'},{source:'q',target:'p'},{source:'p',target:'r'}]};
  assert.deepEqual(factionRelations(b),[{source:'a',target:'b',count:2},{source:'a',target:'c',count:1},{source:'b',target:'c',count:1}]);
});

test('faction links start and end on the hexagon boundaries',()=>{
  assert.deepEqual(factionLine({x:0,y:0},{x:400,y:0}),{start:{x:125,y:0},end:{x:275,y:0},x:200,y:0});
  const vertical=factionLine({x:0,y:0},{x:0,y:400});
  assert.deepEqual(vertical.start,{x:0,y:100});assert.deepEqual(vertical.end,{x:0,y:300});
  const diagonal=factionLine({x:0,y:0},{x:400,y:400});
  assert(Math.abs(diagonal.start.x+.39*diagonal.start.y-125)<.001);
});

test('faction arrangement respects larger shapes and leaves all graph records unchanged',async()=>{
  const b=demoBoard();b.factions.forEach(f=>{f.x=0;f.y=0;});
  const before=JSON.stringify(b),positions=await arrangeFactions(b,{yieldControl:async()=>{}});
  assert.equal(JSON.stringify(b),before);
  assert.deepEqual(positions.map(p=>p.id).sort(),b.factions.map(f=>f.id).sort());
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
    assert(Math.abs(positions[i].x-positions[j].x)>=290||Math.abs(positions[i].y-positions[j].y)>=240);
  }
});
