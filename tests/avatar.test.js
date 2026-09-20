import test from 'node:test';
import assert from 'node:assert/strict';
import {demoBoard,exportBoard,validateImport,validateAvatar,MAX_AVATAR_LENGTH} from '../dist/js/model.js';
import {cropBounds,avatarContent,wireAvatarEditor} from '../dist/js/avatar.js';

const portrait='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lp8AAAAASUVORK5CYII=';
test('avatars round-trip without changing old v1 graphs; non-image URLs and oversized data are rejected',()=>{
  const legacy=demoBoard();assert.deepEqual(validateImport(exportBoard(legacy)),legacy);
  legacy.characters[0].avatar=portrait;
  assert.deepEqual(validateImport(JSON.parse(JSON.stringify(exportBoard(legacy)))),legacy);
  for(const invalid of [null,{},'',portrait.replace('png','svg+xml'),'https://example.com/a.png','javascript:alert(1)','data:image/png;base64,','data:image/png;base64,abcd" onerror="alert(1)',portrait+'A'.repeat(MAX_AVATAR_LENGTH)]){
    const file=exportBoard(legacy);file.board.characters[0].avatar=invalid;assert.throws(()=>validateImport(file));
  }
  assert.equal(validateAvatar(portrait),portrait);
  assert.equal(avatarContent({name:'林雾'}),'林');assert.equal(avatarContent({name:'Alice'}),'A');assert.equal(avatarContent({name:'𠮷田'}),'𠮷');
});
test('crop stays square inside landscape, portrait and tiny images at all zooms and drag extremes',()=>{
  assert.deepEqual(cropBounds(1200,800),{x:200,y:0,size:800});
  assert.deepEqual(cropBounds(800,1200),{x:0,y:200,size:800});
  for(const [w,h] of [[1200,800],[800,1200],[1,1],[4000,50]])for(const zoom of [1,1.01,2,4])for(const [cx,cy] of [[w/2,h/2],[-10000,-10000],[10000,10000]]){
    const r=cropBounds(w,h,zoom,cx,cy);assert(r.x>=0&&r.y>=0&&r.x+r.size<=w+1e-8&&r.y+r.size<=h+1e-8);assert.equal(r.size,Math.min(w,h)/zoom);
  }
});
test('upload drafts apply the displayed crop, handle replacement races, and preserve the saved portrait on cancel',async()=>{
  const old={Image:globalThis.Image,document:globalThis.document};
  const decoded=[],draws=[],urls=[];
  class Element{
    value='';hidden=false;disabled=false;style={};listeners={};isConnected=true;
    addEventListener(type,fn){this.listeners[type]=fn;}focus(){}click(){}setPointerCapture(){}hasPointerCapture(){return false;}
    getBoundingClientRect(){return {width:160};}
    getContext(){return {clearRect(){},drawImage(...args){draws.push(args);},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(){}};}
    toDataURL(){return portrait;}
  }
  const elements=new Map(),form=new Element();form.querySelector=q=>{if(!elements.has(q))elements.set(q,new Element());return elements.get(q);};
  const $=q=>form.querySelector(q);
  $('[name="name"]').value='林雾';$('[name="color"]:checked').value='#708f87';
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  URL.createObjectURL=()=>{const url='blob:test-'+urls.length;urls.push(url);return url;};
  const revoked=[];URL.revokeObjectURL=url=>revoked.push(url);
  globalThis.Image=class{naturalWidth=1200;naturalHeight=800;decode(){return new Promise((resolve,reject)=>decoded.push({resolve,reject}));}};
  globalThis.document={createElement:()=>new Element()};
  try{
    const editor=wireAvatarEditor(form,{name:'林雾',avatar:portrait});
    const choose=(type='image/png',size=100)=>{const file=$('[data-avatar-file]');file.files=[{type,size}];return file.listeners.change();};
    const first=choose();assert.equal(editor.pending,true);assert.equal($('[type="submit"]').disabled,true);
    decoded[0].resolve();await first;
    $('[data-avatar-zoom]').value='2';$('[data-avatar-zoom]').listeners.input();
    const canvas=$('[data-avatar-canvas]');
    canvas.listeners.pointerdown({pointerId:1,pointerType:'touch',clientX:0,clientY:0,preventDefault(){}});
    canvas.listeners.pointermove({pointerId:1,clientX:80,clientY:0});
    assert.deepEqual(draws.at(-1).slice(1,5),[200,200,400,400]);
    $('[data-avatar-apply]').listeners.click();
    assert.deepEqual(draws.at(-1).slice(1),[200,200,400,400,0,0,256,256]);
    assert.equal(editor.value,portrait);assert.equal(editor.pending,false);assert.equal($('[type="submit"]').disabled,false);
    const second=choose();$('[data-avatar-cancel]').listeners.click();decoded[1].resolve();await second;
    assert.equal(editor.value,portrait);assert.equal(editor.pending,false);assert.equal($('[data-avatar-crop]').hidden,true);
    const stale=choose(),latest=choose();decoded[2].resolve();await stale;assert.equal($('[data-avatar-canvas]').hidden,true);
    decoded[3].resolve();await latest;assert.equal($('[data-avatar-canvas]').hidden,false);
    $('[data-avatar-cancel]').listeners.click();await choose('image/svg+xml');assert.equal($('[data-avatar-error]').hidden,false);
    await choose('image/png',11*1024*1024);assert.equal(editor.pending,false);assert.equal(editor.value,portrait);
    const broken=choose();decoded[4].reject(Error('bad image'));await broken;assert.equal(editor.pending,false);assert.equal(editor.value,portrait);
    $('[data-avatar-remove]').listeners.click();assert.equal(editor.value,undefined);
    const closed=choose();editor.destroy();decoded[5].resolve();await closed;
    assert.deepEqual(new Set(revoked),new Set(urls));
  }finally{
    URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;
    for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  }
});
