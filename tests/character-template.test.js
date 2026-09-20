import test from 'node:test';
import assert from 'node:assert/strict';
import {demoBoard,createBoard,exportBoard,validateImport,prepareCharacterTemplate,setCharacterTemplate} from '../dist/js/model.js';

test('templates and multiline character values round-trip while old v1 graphs stay unchanged',()=>{
  const legacy=demoBoard();assert.deepEqual(validateImport(exportBoard(legacy)),legacy);
  const b=demoBoard();
  setCharacterTemplate(b,[{id:'ability',name:'特殊能力'},{id:'weakness',name:'弱点'}]);
  b.characters[0].attributes={ability:'操纵雾气\n在雨天增强',weakness:''};
  assert.deepEqual(validateImport(JSON.parse(JSON.stringify(exportBoard(b)))),b);
  assert.equal(Object.hasOwn(b.characters[1],'attributes'),false);
});

test('renaming retains each character’s values; deleting removes only that field in that atlas',()=>{
  const b=demoBoard(),other=createBoard({name:'另一个世界'}),otherBefore=JSON.stringify(other);
  setCharacterTemplate(b,[{id:'ability',name:'特殊能力'},{id:'weakness',name:'弱点'}]);
  b.characters[0].attributes={ability:'控制雾气',weakness:'晴天'};
  b.characters[1].attributes={ability:'读心',weakness:'噪音'};
  setCharacterTemplate(b,[{id:'ability',name:'天赋'},{id:'weakness',name:'弱点'}]);
  assert.equal(b.characters[0].attributes.ability,'控制雾气');
  assert.equal(b.characters[1].attributes.ability,'读心');
  setCharacterTemplate(b,[{id:'ability',name:'天赋'}]);
  assert.deepEqual(b.characters[0].attributes,{ability:'控制雾气'});
  assert.equal(JSON.stringify(other),otherBefore);
  assert.deepEqual(validateImport(exportBoard(b)),b);
});

test('invalid template changes do not mutate characters; malformed imports fail without dropping values',()=>{
  const b=demoBoard();setCharacterTemplate(b,[{id:'ability',name:'Ability'}]);
  b.characters[0].attributes={ability:'Fog'};
  const before=JSON.stringify(b);
  assert.throws(()=>setCharacterTemplate(b,[{id:'a',name:'Ability'},{id:'b',name:' ability '}]));
  assert.equal(JSON.stringify(b),before);
  const invalid=[
    x=>{x.characterTemplate=null;},
    x=>{x.characterTemplate.push({...x.characterTemplate[0]});},
    x=>{x.characterTemplate[0].name=' ';},
    x=>{x.characterTemplate[0].name='x'.repeat(61);},
    x=>{x.characterTemplate=Array.from({length:31},(_,i)=>({id:'f'+i,name:'Field '+i}));},
    x=>{x.characters[0].attributes={unknown:'Do not lose this'};},
    x=>{x.characters[0].attributes={ability:42};},
    x=>{x.characters[0].attributes={ability:'x'.repeat(10001)};},
    x=>{x.characters[0].attributes=[];},
    x=>{x.characters[0].attributes=null;}
  ];
  for(const corrupt of invalid){const file=exportBoard(b);corrupt(file.board);assert.throws(()=>validateImport(file));}
  assert.deepEqual(prepareCharacterTemplate([{id:'a',name:'  天赋  '}]),[{id:'a',name:'天赋'}]);
});
