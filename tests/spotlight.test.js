import test from 'node:test';
import assert from 'node:assert/strict';
import {spotlightGeometry} from '../dist/js/spotlight.js';
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const overlaps=(a,b)=>a.left<b.left+b.width&&a.left+a.width>b.left&&a.top<b.top+b.height&&a.top+a.height>b.top;
test('desktop coach stays outside the highlighted control and the four shades leave a clickable hole',()=>{
  const viewport=rect(0,0,1440,900);
  for(const target of [rect(400,250,140,124),rect(1220,140,180,600),rect(270,90,160,44),rect(900,750,80,44),rect(0,0,260,900)]){
    const {hole,coach,shades,docked}=spotlightGeometry(target,viewport,{width:360,height:225});
    assert.equal(docked,false);assert.equal(overlaps(hole,coach),false);
    for(const shade of shades)assert.equal(overlaps(hole,shade),false);
    const area=shades.reduce((sum,s)=>sum+s.width*s.height,0)+hole.width*hole.height;
    assert.equal(area,viewport.width*viewport.height);
    assert(coach.left>=12&&coach.top>=12&&coach.left+coach.width<=1428&&coach.top+coach.height<=888);
  }
});
test('mobile and keyboard viewport offsets keep coach on screen and clip offscreen targets',()=>{
  for(const viewport of [rect(0,0,320,640),rect(0,50,390,320),rect(0,0,740,360)]){
    const card={width:viewport.width-24,height:120};
    for(const target of [rect(80,80,140,124),rect(-200,-200,50,50),rect(2000,2000,140,124)]){
      const {hole,coach,shades}=spotlightGeometry(target,viewport,card,{docked:true});
      assert(coach.left>=viewport.left&&coach.top>=viewport.top);
      assert(coach.left+coach.width<=viewport.right&&coach.top+coach.height<=viewport.bottom);
      for(const box of [hole,...shades])assert(box.width>=0&&box.height>=0);
      if(target.left===2000||target.left===-200)assert.equal(hole.width*hole.height,0);
    }
  }
});
test('crowded viewports use docked mode instead of laying the coach over its target',()=>{
  const result=spotlightGeometry(rect(12,12,570,550),rect(0,0,600,600),{width:360,height:220});
  assert.equal(result.docked,true);
  // The caller reserves docked space and measures the target again on the next frame.
});

// Browser DOMRect coordinates live on the prototype, not in own enumerable keys.
// Object spread therefore loses them; plain object fixtures cannot catch this.
class BrowserRect {
  #bounds;
  constructor(left,top,width,height){this.#bounds={left,top,width,height};}
  get left(){return this.#bounds.left;} get top(){return this.#bounds.top;}
  get width(){return this.#bounds.width;} get height(){return this.#bounds.height;}
  get right(){return this.left+this.width;} get bottom(){return this.top+this.height;}
}
test('real positioning moves the hole to the editor using browser-style DOMRect accessors',async()=>{
  const {Spotlight}=await import('../dist/js/spotlight.js');
  const scenarios=[
    {width:2048,height:921,top:0,modal:true,docked:false,reserve:false,bounds:new BrowserRect(688,25,672,625),card:new BrowserRect(0,0,430,244)},
    {width:390,height:800,top:0,modal:false,docked:true,reserve:true,bounds:new BrowserRect(0,12,390,535),card:new BrowserRect(0,0,366,215)},
    {width:390,height:380,top:70,modal:true,docked:true,reserve:false,bounds:new BrowserRect(0,70,390,252),card:new BrowserRect(0,0,366,90)}
  ];
  for(const scenario of scenarios){
    assert.deepEqual({...scenario.bounds},{});
    const root={dataset:{}},coach={dataset:{},style:{},getBoundingClientRect:()=>scenario.card};
    const ring={style:{left:'1644px',top:'210px',width:'390px',height:'530px'}},shades=Array.from({length:4},()=>({style:{}}));
    const input={},saveButton={},target={getBoundingClientRect:()=>scenario.bounds,closest:()=>null,contains:node=>node===input||node===saveButton};
    const classes=new Map();
    const doc={activeElement:input,body:{classList:{toggle(name,value){classes.set(name,value);}}},documentElement:{style:{setProperty(){}}},querySelector:selector=>selector==='#modal'?{open:scenario.modal}:target,querySelectorAll:()=>[target]};
    root.contains=()=>false;
    const layer=Object.assign(Object.create(Spotlight.prototype),{doc,win:{innerWidth:scenario.width,innerHeight:800,visualViewport:{offsetLeft:0,offsetTop:scenario.top,width:scenario.width,height:scenario.height}},root,coach,ring,shades,step:{target:'#editor'},forcedDock:false});
    layer.position();
    assert.equal(classes.get('tour-docked'),scenario.docked);
    assert.equal(classes.get('tour-reserve-canvas'),scenario.reserve);
    if(!scenario.docked){assert.equal(root.dataset.side,'right');assert(parseFloat(coach.style.left)>scenario.bounds.right);}
    for(const el of [ring,...shades])for(const key of ['left','top','width','height'])assert(Number.isFinite(parseFloat(el.style[key])),`Invalid ${key}: ${el.style[key]}`);
    assert.equal(parseFloat(ring.style.left),Math.max(0,scenario.bounds.left-7));
    assert.equal(parseFloat(ring.style.top),Math.max(scenario.top,scenario.bounds.top-7));
    // Both typing and Save must be inside the clear window, not under a shade.
    const points=[{x:scenario.bounds.left+30,y:scenario.bounds.top+60},{x:scenario.bounds.right-55,y:scenario.bounds.bottom-30}];
    const boxes=shades.map(({style})=>Object.fromEntries(Object.entries(style).map(([key,value])=>[key,parseFloat(value)])));
    for(const point of points){for(const box of boxes)assert(!(point.x>=box.left&&point.x<box.left+box.width&&point.y>=box.top&&point.y<box.top+box.height),'A shade blocks a form control');}
    assert.equal(layer.allows(input),true);assert.equal(layer.allows(saveButton),true);assert.equal(layer.allows({}),false);
  }
});
