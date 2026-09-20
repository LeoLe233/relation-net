import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {restoreChineseDemo} from '../dist/js/demo-migration.js';
import {demoBoard,exportBoard,validateImport} from '../dist/js/model.js';

const legacy=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-english-demo.json',import.meta.url),'utf8'));
test('old English seed restores Chinese text while retaining layout and custom fields',()=>{
  const original=legacy();
  original.characters[0].x=1200;original.characters[0].color='#123456';
  original.factions[0].x=345;original.factions[0].y=-456;
  original.characterTemplate=[{id:'ability',name:'Power'}];
  original.characters[0].attributes={ability:'User-written English'};
  const before=JSON.stringify(original),restored=restoreChineseDemo(original),chinese=demoBoard();
  assert.equal(JSON.stringify(original),before);
  assert.equal(restored.id,original.id);assert.equal(restored.name,chinese.name);
  assert.equal(restored.description,chinese.description);
  for(const [key,fields] of [['characters',['name','role','notes']],['relations',['label']],['factions',['name','description']]]){
    for(const item of restored[key])for(const field of fields)assert.equal(item[field],chinese[key].find(seed=>seed.id===item.id)[field]);
  }
  assert.equal(restored.characters[0].x,1200);assert.equal(restored.characters[0].color,'#123456');
  assert.equal(restored.factions[0].x,345);assert.equal(restored.factions[0].y,-456);
  assert.deepEqual(restored.characterTemplate,original.characterTemplate);
  assert.deepEqual(restored.characters[0].attributes,original.characters[0].attributes);
  assert.deepEqual(validateImport(exportBoard(restored)),restored);
  assert.equal(restoreChineseDemo(restored),restored);
});
test('user text, changed relationships and unrelated English graphs are preserved',()=>{
  for(const change of [
    b=>b.characters[0].name='My character',
    b=>b.characters[0].notes+=' New story',
    b=>b.relations[0].directed=true,
    b=>b.relations.pop(),
    b=>b.factions[0].members.pop(),
    b=>b.name='My world',
    b=>b.characters[0].id='another-person'
  ]){
    const board=legacy();change(board);const before=JSON.stringify(board);
    assert.equal(restoreChineseDemo(board),board);assert.equal(JSON.stringify(board),before);
  }
});
