// Application-state / generated-markup regression tests, not a browser renderer.
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as i18n from '../dist/js/i18n.js';
import * as tutorial from '../dist/js/tutorial.js';
import * as model from '../dist/js/model.js';
import * as demoMigration from '../dist/js/demo-migration.js';
import * as icons from '../dist/js/icons.js';
import * as layout from '../dist/js/layout.js';
import * as factions from '../dist/js/factions.js';
import * as svgText from '../dist/js/svg-text.js';
import * as cameraMath from '../dist/js/camera.js';
function app({locale='en',seen=true,savedBoard}={}){
class Element {
  constructor(){this.dataset={};this.hidden=false;this.value='';this.open=false;this.innerHTML='';this.clientWidth=1200;this.clientHeight=800;this.listeners={};this.attrs={};this.classes=new Set();this.style={values:{},setProperty(k,v){this.values[k]=v;},removeProperty(k){delete this.values[k];}};this.classList={contains:k=>this.classes.has(k),toggle:(k,on)=>{on??=!this.classes.has(k);on?this.classes.add(k):this.classes.delete(k);},add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)};}
  addEventListener(type,fn){this.listeners[type]=fn;}
  setAttribute(k,v){this.attrs[k]=v;}
  getAttribute(k){return this.attrs[k];}
  contains(){return false;}
  setPointerCapture(id){this.captures??=new Set();this.captures.add(id);} hasPointerCapture(id){return this.captures?.has(id);} releasePointerCapture(id){this.captures?.delete(id);}
  querySelector(q){this.children??=new Map();if(!this.children.has(q))this.children.set(q,new Element());return this.children.get(q);}
  querySelectorAll(){return [];}
  getBoundingClientRect(){return this===elements.get('#detail')?{left:890,top:16,width:295,height:650}:{left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  scrollIntoView(){} focus(){} showModal(){this.open=true;} close(){this.open=false;this.listeners.close?.();}
}
const elements=new Map();
const documentListeners={};
const document={documentElement:new Element(),querySelector:q=>{if(!elements.has(q))elements.set(q,new Element());return elements.get(q);},querySelectorAll:()=>[],addEventListener(type,fn){documentListeners[type]=fn;}};
const stored=new Map();stored.set(i18n.LANGUAGE_KEY,locale);if(savedBoard)stored.set(model.STORAGE_KEY,JSON.stringify({version:1,activeId:savedBoard.id,boards:[savedBoard]}));
const storage={getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)};
if(seen)storage.setItem(tutorial.TUTORIAL_KEY,'done');
const spotlight={visible:false,show(step,html){this.step=step;this.html=html;this.visible=true;},hide(){this.visible=false;},schedule(){}};
const context={Spotlight:class{constructor(){return spotlight;}},...i18n,...tutorial,initializeLanguage:(_,language)=>i18n.initializeLanguage(storage,language??'zh-CN'),setLanguage:lang=>i18n.setLanguage(lang,storage),hasSeenTutorial:()=>tutorial.hasSeenTutorial(storage),markTutorialSeen:()=>tutorial.markTutorialSeen(storage),...model,...demoMigration,...icons,...layout,...cameraMath,...svgText,...factions,getFactionPositions:factions.factionPositions,hydrateIcons:()=>icons.hydrateIcons(document),e:model.escapeHtml,document,localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},window:{innerWidth:1500,innerHeight:900,addEventListener(){}},ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>{fn();return 1;},setTimeout:()=>1,clearTimeout(){},FormData:class{constructor(form){this.fields=form.fields??{};}get(k){return this.fields[k]??null;}has(k){return Object.hasOwn(this.fields,k);}getAll(k){return this.fields[k]??[];}},console};
const source=fs.readFileSync(new URL('../dist/js/app.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'');
vm.createContext(context);
vm.runInContext(source+`\nthis.api={changeLanguage,showTutorial,finishTutorial,personModal,boardModal,factionModal,help,tour:()=>({tutorialOpen,tutorialStep}),relationModal,cameraArea,toggleDetail,openMenu,closeMenu,resetSelection,view:()=>view,factionFilter:()=>factionFilter,factionPositions,fit,zoom,clearFocus,resetZoom,resizeViewport,camera:()=>({...camera}),tidyLayout,board,selectPerson,beginConnection,chooseConnectionTarget,cancelConnection,saveConnection,handleAction,undo,render,peek:()=>({connectionDraft,selectedId,recentRelationId,history:history.length}),draft:fields=>Object.assign(connectionDraft,fields)};`,context);
return {a:context.api,document,storage,context,documentListeners,spotlight};
}
const visibleText=html=>html.replace(/<button\b[^>]*lang="zh-CN"[^>]*>.*?<\/button>/g,'').replace(/<[^>]*>/g,'');
const assertEnglish=html=>{assert.doesNotMatch(html,/\$\{t\(/);assert.doesNotMatch(visibleText(html),/[\u4e00-\u9fff]/);};
test('reopening an unchanged English seed restores Chinese and saves without changing UI language',()=>{
  const saved=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-english-demo.json',import.meta.url),'utf8'));
  const {a,storage}=app({locale:'en',savedBoard:saved});
  assert.equal(a.board().characters[0].name,'林雾');
  const persisted=JSON.parse(storage.getItem(model.STORAGE_KEY)).boards[0];
  assert.equal(persisted.name,'雾港档案');
  assert.equal(storage.getItem(i18n.LANGUAGE_KEY),'en');
  const reopened=app({locale:'en',savedBoard:persisted});
  assert.deepEqual(JSON.parse(JSON.stringify(reopened.a.board())),persisted);
  saved.characters[0].notes='My edited notes';
  const edited=app({locale:'en',savedBoard:saved});
  assert.deepEqual(JSON.parse(JSON.stringify(edited.a.board())),saved);
});
test('English UI keeps Chinese demo content in graph, details and editors',()=>{
  const {a,document}=app();
  const content=[];
  const collect=value=>{if(typeof value==='string'&&/[\u4e00-\u9fff]/.test(value))content.push(value);else if(value&&typeof value==='object')Object.values(value).forEach(collect);};
  collect(a.board());
  const assertDemoUI=html=>{html=html.replace(/(<[^>]*class="(?:monogram|detail-avatar|relation-mini)"[^>]*>)[^<]*/g,'$1');for(const text of content.sort((a,b)=>b.length-a.length))html=html.replaceAll(model.escapeHtml(text),'');assertEnglish(html);};
  assert.equal(a.board().name,'雾港档案');
  assert.equal(a.board().characters[0].name,'林雾');
  assert.match(document.querySelector('#scene').innerHTML,/林雾/);
  const html=selector=>document.querySelector(selector).innerHTML;
  assertDemoUI(html('#scene'));assertDemoUI(html('#graph-stats'));
  a.selectPerson('p1');assertDemoUI(html('#detail'));assert.match(html('#detail'),/Edit profile/);
  a.beginConnection();assertDemoUI(html('#connection-bar'));
  a.chooseConnectionTarget('p2');assertDemoUI(html('#detail'));assertDemoUI(html('#connection-bar'));
  assert.match(html('#detail'),/Save relation/);a.cancelConnection();
  for(const open of [()=>a.personModal(),()=>a.personModal('p1'),()=>a.relationModal(),()=>a.relationModal('r3'),()=>a.boardModal(),()=>a.boardModal(true),()=>a.factionModal('f1'),()=>a.help()]){
    open();assertDemoUI(html('#modal-content'));document.querySelector('#modal').close();
  }
  a.board().relations=[];a.selectPerson('p1');assertDemoUI(html('#detail'));assert.match(html('#detail'),/No relations yet/);
  a.resetSelection();a.board().characters=[];a.board().factions=[];a.render();assertDemoUI(html('#empty-state'));
});
test('language changes preserve user content, graph state, draft, camera, and history',()=>{
  const saved=model.demoBoard();saved.relationTypes=[{id:'family',name:'亲情',color:'#8874a6'}];
  const {a,document,storage}=app({locale:'zh',savedBoard:saved});
  a.selectPerson('p1');a.beginConnection();a.chooseConnectionTarget('p2');
  a.draft({label:'师徒',kind:model.CUSTOM_KIND,customKind:'教学关系',notes:'保留这段笔记'});
  a.zoom(1.2);const data=JSON.stringify(a.board()),draft=JSON.stringify(a.peek()),camera=JSON.stringify(a.camera());
  const persisted=storage.getItem(model.STORAGE_KEY);
  a.changeLanguage('en');
  assert.equal(JSON.stringify(a.board()),data);assert.equal(JSON.stringify(a.peek()),draft);assert.equal(JSON.stringify(a.camera()),camera);
  assert.equal(storage.getItem(model.STORAGE_KEY),persisted);assert.equal(storage.getItem(i18n.LANGUAGE_KEY),'en');
  const html=document.querySelector('#detail').innerHTML;
  assert.match(html,/value="师徒"/);assert.match(html,/value="教学关系"/);assert.match(html,/保留这段笔记/);assert.match(html,/亲情/);assert.match(html,/Save relation/);
  a.changeLanguage('zh');assert.match(document.querySelector('#detail').innerHTML,/保存关系/);assert.equal(JSON.stringify(a.board()),data);
});
test('template editor adds fields, preserves names and values, and safely cancels or undoes removal',()=>{
  const {a,document,storage}=app();
  const form=()=>document.querySelector('#editor');
  const submit=fields=>{form().fields=fields;form().listeners.submit({preventDefault(){},currentTarget:form()});};
  const click=(selector,element={})=>form().listeners.click({preventDefault(){},target:{closest:q=>q===selector?element:null}});
  a.handleAction('edit-template');
  assertEnglish(document.querySelector('#modal-content').innerHTML);
  click('[data-template-add]');form().fields={'template-0':'特殊能力 <em>'};
  click('[data-template-add]');submit({'template-0':'特殊能力 <em>','template-1':'弱点'});
  const [ability,weakness]=a.board().characterTemplate;
  assert.equal(ability.name,'特殊能力 <em>');
  a.personModal('p1');
  assert.match(document.querySelector('#modal-content').innerHTML,/特殊能力 &lt;em&gt;/);
  submit({name:'Lin',alias:'LIN',role:'Keeper',color:'#708f87',notes:'Notes',['attribute-'+ability.id]:'雾气 <script>\n第二行',['attribute-'+weakness.id]:'阳光'});
  assert.match(document.querySelector('#detail').innerHTML,/雾气 &lt;script&gt;\n第二行/);
  assert.doesNotMatch(document.querySelector('#detail').innerHTML,/<script>/);
  const saved=JSON.parse(storage.getItem(model.STORAGE_KEY)).boards[0];
  const reloaded=app({savedBoard:model.validateImport(model.exportBoard(saved))});
  assert.equal(reloaded.a.board().characters[0].attributes[ability.id],'雾气 <script>\n第二行');
  a.handleAction('edit-template');submit({'template-0':'天赋','template-1':'弱点'});
  assert.equal(a.board().characterTemplate[0].id,ability.id);
  assert.equal(a.board().characters[0].attributes[ability.id],'雾气 <script>\n第二行');
  const before=JSON.stringify(a.board());
  a.handleAction('edit-template');form().fields={'template-0':'天赋','template-1':'弱点'};
  click('[data-template-remove]',{dataset:{templateRemove:'0'}});
  assert.equal(document.querySelector('#template-warning').hidden,false);
  assert.match(document.querySelector('#template-warning').textContent,/1 characters/);
  a.handleAction('close-modal');assert.equal(JSON.stringify(a.board()),before);
  a.handleAction('edit-template');form().fields={'template-0':'天赋','template-1':'弱点'};
  click('[data-template-remove]',{dataset:{templateRemove:'0'}});submit({'template-0':'弱点'});
  assert.equal(Object.hasOwn(a.board().characters[0].attributes,ability.id),false);
  assert.equal(a.board().characters[0].attributes[weakness.id],'阳光');
  a.undo();assert.equal(JSON.stringify(a.board()),before);
});
test('new characters inherit optional template fields; empty values and user text survive language switching',()=>{
  const b=model.demoBoard('en');
  model.setCharacterTemplate(b,[{id:'ability',name:'特殊能力'},{id:'weakness',name:'Weakness'}]);
  const {a,document}=app({savedBoard:b});
  a.selectPerson('p1');assert.match(document.querySelector('#detail').innerHTML,/Not filled in/);
  a.personModal();const form=document.querySelector('#editor');
  assert.match(document.querySelector('#modal-content').innerHTML,/name="attribute-ability"/);
  form.fields={name:'New character',alias:'NEW',role:'Mage',color:'#708f87',notes:'','attribute-ability':'控制雾气','attribute-weakness':''};
  form.listeners.submit({preventDefault(){},currentTarget:form});
  const person=a.board().characters.at(-1);
  assert.equal(person.attributes.ability,'控制雾气');assert.equal(person.attributes.weakness,'');
  const before=JSON.stringify(a.board());a.changeLanguage('zh');a.changeLanguage('en');
  assert.equal(JSON.stringify(a.board()),before);
  assert.match(document.querySelector('#detail').innerHTML,/特殊能力/);
  assert.match(document.querySelector('#detail').innerHTML,/控制雾气/);
});
test('interactive tutorial advances on real actions and discards practice edits',async()=>{
  const saved=model.demoBoard();
  const {a,document,storage,documentListeners,spotlight}=app({seen:false,savedBoard:saved});
  const persisted=storage.getItem(model.STORAGE_KEY);
  const step=(id,index)=>{assert.equal(a.tour().tutorialStep,index);assert.equal(spotlight.step.id,id);assertEnglish(spotlight.html);};
  assert.equal(a.tour().tutorialOpen,true);assert.equal(document.querySelector('#modal').open,false);
  assert.equal(a.board().id,'guide-board');step('character',0);
  a.selectPerson('guide-b');step('character',0); // A different action must not advance.
  a.selectPerson('guide-a');step('edit',1);
  a.handleAction('edit-person');step('profile',2);
  assert.equal(document.querySelector('#modal').open,true);
  const editor=document.querySelector('#editor');editor.fields={name:'New name',alias:'LIN',role:'A new role',color:'#708f87',notes:'Practice only'};
  editor.listeners.submit({preventDefault(){},currentTarget:editor});
  step('connect',3);assert.equal(a.board().characters[0].name,'New name');
  a.handleAction('start-connection');step('target',4);
  a.chooseConnectionTarget('guide-a');step('target',4);
  a.chooseConnectionTarget('guide-b');step('relation',5);
  a.saveConnection();step('relation',5); // Required fields must still be validated.
  a.draft({label:'Mentors',kind:model.CUSTOM_KIND,customKind:'Mentorship',directed:true});a.saveConnection();step('arrange',6);
  assert.equal(a.board().relations.length,2);assert.equal(a.board().relationTypes[0].name,'Mentorship');
  assert.equal(storage.getItem(model.STORAGE_KEY),persisted);
  await a.tidyLayout();step('factions',7);
  documentListeners.click({target:{closest:()=>({dataset:{view:'factions'}})}});step('members',8);
  documentListeners.click({target:{closest:()=>({dataset:{faction:'guide-f1'}})}});step('done',9);
  a.changeLanguage('zh');assert.equal(a.tour().tutorialStep,9);assert.match(spotlight.html,/现在可以开始自己的故事了/);
  a.finishTutorial();assert.equal(a.tour().tutorialOpen,false);assert.equal(spotlight.visible,false);
  assert.deepEqual(JSON.parse(JSON.stringify(a.board())),saved);assert.equal(storage.getItem(model.STORAGE_KEY),persisted);assert.equal(a.peek().history,0);
  assert.equal(tutorial.hasSeenTutorial(storage),true);
});
test('skip, replay, and early exit restore existing drafts, selections, and camera',()=>{
  const {a,document,storage}=app({locale:'zh'});
  a.selectPerson('p1');a.beginConnection();a.chooseConnectionTarget('p2');a.draft({label:'已经保存的关系'});a.saveConnection();
  a.beginConnection();a.chooseConnectionTarget('p2');a.draft({label:'待保存关系',notes:'请保留',kind:model.CUSTOM_KIND,customKind:'自定义草稿'});a.zoom(1.2);
  const saved=JSON.stringify(a.board()),state=JSON.stringify(a.peek()),camera=JSON.stringify(a.camera()),persisted=storage.getItem(model.STORAGE_KEY);
  for(const steps of [0,2,5,9]){
    a.showTutorial();
    for(let i=0;i<steps;i++)a.handleAction('tutorial-next');
    assert.equal(a.tour().tutorialStep,steps);
    if(steps>0){a.handleAction('tutorial-prev');assert.equal(a.tour().tutorialStep,steps-1);}
    a.finishTutorial();
    assert.equal(JSON.stringify(a.board()),saved);assert.equal(JSON.stringify(a.peek()),state);assert.equal(JSON.stringify(a.camera()),camera);assert.equal(storage.getItem(model.STORAGE_KEY),persisted);
  }
  a.showTutorial();a.handleAction('tutorial-next');a.handleAction('tutorial-next');
  let prevented=false;document.querySelector('#modal').listeners.cancel({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(a.tour().tutorialOpen,false);assert.equal(JSON.stringify(a.peek()),state);
});
test('changing tutorial language preserves an unfinished profile edit',()=>{
  const {a,document}=app({seen:false});a.selectPerson('guide-a');a.handleAction('edit-person');
  const form=document.querySelector('#editor');form.fields={name:'未提交名字',alias:'ALIAS',role:'edited role',notes:'unsaved notes',color:'#708f87'};
  a.changeLanguage('zh');
  for(const field of ['name','alias','role','notes'])assert.equal(document.querySelector('#editor [name="'+field+'"]').value,form.fields[field]);
  assert.equal(a.tour().tutorialStep,2);assert.equal(a.board().characters[0].name,'小林');
  a.finishTutorial();
});
test('finishing during an asynchronous practice layout cannot overwrite the restored atlas',async()=>{
  const {a,storage}=app();const snapshot=JSON.stringify(a.board()),persisted=storage.getItem(model.STORAGE_KEY);
  a.showTutorial();for(let i=0;i<6;i++)a.handleAction('tutorial-next');
  const pending=a.tidyLayout();a.finishTutorial();await pending;
  assert.equal(JSON.stringify(a.board()),snapshot);assert.equal(storage.getItem(model.STORAGE_KEY),persisted);assert.equal(a.peek().history,0);
});
test('returning users do not see the automatic guide',()=>{
  const {a,document}=app({seen:true});assert.equal(a.tour().tutorialOpen,false);assert.equal(document.querySelector('#modal').open,false);
});
