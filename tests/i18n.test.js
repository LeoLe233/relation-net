import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {english,LANGUAGE_KEY,initializeLanguage,setLanguage,t,applyTranslations} from '../dist/js/i18n.js';
import {tutorialSteps,TUTORIAL_KEY,hasSeenTutorial,markTutorialSeen} from '../dist/js/tutorial.js';
import {demoBoard,exportBoard,validateImport} from '../dist/js/model.js';

const memory=()=>{const items=new Map();return {getItem:key=>items.get(key),setItem:(key,value)=>items.set(key,value)};};
test('language preference overrides browser language and works without storage',()=>{
  const storage=memory();
  assert.equal(initializeLanguage(storage,'zh-TW'),'zh');
  assert.equal(initializeLanguage(storage,'en-GB'),'en');
  setLanguage('zh',storage);assert.equal(storage.getItem(LANGUAGE_KEY),'zh');
  assert.equal(initializeLanguage(storage,'en-US'),'zh');
  setLanguage('en',storage);assert.equal(initializeLanguage(storage,'zh-CN'),'en');
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.equal(initializeLanguage(blocked,'zh-CN'),'zh');
  setLanguage('en',blocked);assert.equal(t('新增人物'),'Add character');
  assert.equal(t('已选择 {source} 与 {target}',{source:'林雾 {target}',target:'<Ada>'}),'Selected 林雾 {target} and <Ada>');
  assert.equal(setLanguage('unknown',storage),'en');
});
test('every explicit UI, tutorial, and validation message has an English translation',()=>{
  const app=fs.readFileSync(new URL('../dist/js/app.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const model=fs.readFileSync(new URL('../dist/js/model.js',import.meta.url),'utf8');
  const keys=[...app.matchAll(/\bt\(['"]([^'"\n]+)['"]/g)].map(m=>m[1]);
  keys.push(...[...html.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g)].map(m=>m[1]));
  keys.push(...[...model.matchAll(/(?:Error|fail)\('([^']+)'\)/g)].map(m=>m[1]));
  keys.push(...tutorialSteps.flatMap(s=>[s.title,s.body]));
  for(const key of new Set(keys))assert(Object.hasOwn(english,key),`Missing English copy: ${key}`);
  const variables=copy=>[...copy.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  for(const [key,value] of Object.entries(english))assert.deepEqual(variables(value),variables(key),key);
});
test('translation touches only marked UI text and attributes',()=>{
  setLanguage('en',memory());
  const label={dataset:{i18n:'新增人物'},textContent:'新增人物'};
  const search={attrs:{'data-i18n-placeholder':'查找人物…'},getAttribute(k){return this.attrs[k];},setAttribute(k,v){this.attrs[k]=v;}};
  const userText={textContent:'人物档案'};
  const root={querySelectorAll:selector=>selector==='[data-i18n]'?[label]:selector==='[data-i18n-placeholder]'?[search]:[]};
  applyTranslations(root);
  assert.equal(label.textContent,'Add character');assert.equal(search.attrs.placeholder,'Find a character…');
  assert.equal(userText.textContent,'人物档案');
});
test('English demo is valid v1 data and localization does not mutate other demos',()=>{
  const chinese=demoBoard(),snapshot=JSON.stringify(chinese),englishDemo=demoBoard('en');
  assert.equal(chinese.name,'雾港档案');assert.equal(englishDemo.name,'Fog Harbor Archives');
  assert.deepEqual(validateImport(exportBoard(englishDemo)),englishDemo);
  assert.equal(JSON.stringify(chinese),snapshot);
  assert.deepEqual(englishDemo.characters.map(p=>[p.id,p.x,p.y]),chinese.characters.map(p=>[p.id,p.x,p.y]));
  assert.deepEqual(englishDemo.relations.map(r=>[r.id,r.source,r.target,r.kind,r.directed]),chinese.relations.map(r=>[r.id,r.source,r.target,r.kind,r.directed]));
});
test('tutorial dismissal is persistent and independent of graph data',()=>{
  const storage=memory();storage.setItem('relation-net:v1','original');
  assert.equal(hasSeenTutorial(storage),false);markTutorialSeen(storage);
  assert.equal(hasSeenTutorial(storage),true);assert.equal(storage.getItem(TUTORIAL_KEY),'done');
  assert.equal(storage.getItem('relation-net:v1'),'original');
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.equal(hasSeenTutorial(blocked),false);assert.doesNotThrow(()=>markTutorialSeen(blocked));
});
