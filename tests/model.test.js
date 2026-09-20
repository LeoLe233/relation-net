import test from 'node:test';
import assert from 'node:assert/strict';
import {demoBoard,exportBoard,validateImport,removeCharacter,neighborhood,factionHull,escapeHtml} from '../dist/js/model.js';

test('export/import round-trip preserves every character, relationship, faction, and layout',()=>{
  const b=demoBoard();b.characters[0].notes='中文、emoji ☔、引号 " 和换行\n均应保留';
  assert.deepEqual(validateImport(JSON.parse(JSON.stringify(exportBoard(b)))),b);
});
test('deleting a character removes every dangling relationship and faction membership',()=>{
  const b=demoBoard();b.factions[1].members.push('p1');removeCharacter(b,'p1');
  assert(!b.characters.some(p=>p.id==='p1'));
  assert(!b.relations.some(r=>r.source==='p1'||r.target==='p1'));
  assert(b.factions.every(f=>!f.members.includes('p1')));
  assert.doesNotThrow(()=>validateImport(exportBoard(b)));
});
test('focus finds incoming and outgoing direct relationships but not second-degree ones',()=>{
  const b={relations:[{source:'a',target:'b'},{source:'c',target:'a'},{source:'b',target:'d'}]};
  assert.deepEqual([...neighborhood(b,'a')].sort(),['a','b','c']);
});
test('import rejects dangling IDs, duplicate IDs, invalid data, and oversized graphs',()=>{
  const cases=[
    b=>{b.relations[0].target='missing';},
    b=>{b.characters[1].id=b.characters[0].id;},
    b=>{b.factions[0].members.push('missing');},
    b=>{b.characters[0].x=Infinity;},
    b=>{b.characters[0].color='red; background: url(x)';},
    b=>{b.relations[0].kind='__proto__';},
    b=>{b.relations[0].directed='yes';},
    b=>{b.characters[0].name=' ';},
    b=>{b.characters=Array.from({length:501},(_,i)=>({...b.characters[0],id:'x'+i}));}
  ];
  for(const corrupt of cases){const input=exportBoard(demoBoard());corrupt(input.board);assert.throws(()=>validateImport(input));}
  assert.throws(()=>validateImport({format:'relation-net',version:99}));
});
test('user-entered text is escaped before HTML interpolation',()=>{
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">&\''),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
});
test('faction hull encloses card corners, including a one-member faction',()=>{
  assert.deepEqual(factionHull([]),[]);
  const single=factionHull([{x:0,y:0}]);assert.equal(single.length,4);
  assert.equal(Math.min(...single.map(p=>p.x)),-90);assert.equal(Math.max(...single.map(p=>p.y)),87);
  const hull=factionHull([{x:0,y:0},{x:120,y:90},{x:240,y:0}]);assert(hull.length>=4);assert.equal(Math.max(...hull.map(p=>p.x)),330);
});
