import test from 'node:test';
import assert from 'node:assert/strict';
import {demoBoard,exportBoard,validateImport,CUSTOM_KIND,prepareRelationKind,relationKind} from '../dist/js/model.js';

test('custom types are independent, prepared without writes, and survive JSON round-trip',()=>{
  const b=demoBoard(),before=JSON.stringify(b),chosen=prepareRelationKind(b,CUSTOM_KIND,'  亲情  ');
  assert.equal(JSON.stringify(b),before);
  assert.notEqual(chosen.kind,'other');assert.equal(chosen.type.name,'亲情');
  b.relationTypes=[chosen.type];b.relations[0].kind=chosen.kind;
  const loaded=validateImport(JSON.parse(JSON.stringify(exportBoard(b))));
  assert.deepEqual(loaded,b);assert.equal(relationKind(loaded,chosen.kind).name,'亲情');
});

test('named types are reused and built-in names do not create duplicate options',()=>{
  const b=demoBoard(),chosen=prepareRelationKind(b,CUSTOM_KIND,'Family');b.relationTypes=[chosen.type];
  assert.deepEqual(prepareRelationKind(b,CUSTOM_KIND,' family '),{kind:chosen.kind,type:null});
  assert.deepEqual(prepareRelationKind(b,chosen.kind),{kind:chosen.kind,type:null});
  assert.deepEqual(prepareRelationKind(b,CUSTOM_KIND,'合作'),{kind:'cooperation',type:null});
  assert.throws(()=>prepareRelationKind(b,CUSTOM_KIND,' '));
  assert.throws(()=>prepareRelationKind(b,CUSTOM_KIND,'字'.repeat(61)));
  assert.throws(()=>prepareRelationKind(b,'missing'));
});

test('imports reject missing type references, duplicate types, reserved IDs and invalid colors',()=>{
  const cases=[
    b=>{b.relations[0].kind='missing';},
    b=>{b.relationTypes.push({...b.relationTypes[0]});},
    b=>{b.relationTypes.push({id:'other-id',name:'亲情',color:'#8874a6'});},
    b=>{b.relationTypes[0].id='conflict';},
    b=>{b.relationTypes[0].id=CUSTOM_KIND;},
    b=>{b.relationTypes[0].color='red;opacity:0';},
    b=>{b.relationTypes={};}
  ];
  for(const corrupt of cases){
    const b=demoBoard(),chosen=prepareRelationKind(b,CUSTOM_KIND,'亲情');
    b.relationTypes=[chosen.type];b.relations[0].kind=chosen.kind;corrupt(b);
    assert.throws(()=>validateImport(exportBoard(b)));
  }
});

test('legacy other relationships remain unchanged and continue to render',()=>{
  const b=demoBoard(),loaded=validateImport(exportBoard(b));assert.deepEqual(loaded,b);
  assert(!Object.hasOwn(loaded,'relationTypes'));assert.equal(relationKind(loaded,'other').name,'其他');
  assert.deepEqual(prepareRelationKind(loaded,'other'),{kind:'other',type:null});
});
