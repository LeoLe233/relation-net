// Dependency-free, click-through spotlight. SVG and HTML targets share viewport coordinates.
const focusable='button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary,[tabindex]:not([tabindex="-1"])';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function spotlightGeometry(rect,viewport,card,{docked=false,padding=7}={}){
  const {left=0,top=0,width,height}=viewport,right=left+width,bottom=top+height,gap=14;
  const x=clamp(rect.left-padding,left,right),y=clamp(rect.top-padding,top,bottom);
  const r=clamp(rect.right+padding,x,right),b=clamp(rect.bottom+padding,y,bottom);
  const hole={left:x,top:y,width:r-x,height:b-y};
  const w=Math.min(card.width,width-24),h=Math.min(card.height,height-24);
  const safe=(cx,cy)=>({left:clamp(cx,left+12,right-w-12),top:clamp(cy,top+12,bottom-h-12),width:w,height:h});
  let coach=safe(right-w-16,bottom-h-12),side='bottom';
  if(!docked){
    const alignedY=clamp(y,top+12,bottom-h-12),alignedX=clamp(x,left+12,right-w-12);
    const candidates=[['right',r+gap,alignedY],['left',x-gap-w,alignedY],['bottom',alignedX,b+gap],['top',alignedX,y-gap-h]];
    const found=candidates.find(([,cx,cy])=>cx>=left+12&&cx+w<=right-12&&cy>=top+12&&cy+h<=bottom-12);
    if(found){side=found[0];coach=safe(found[1],found[2]);}
    else return spotlightGeometry(rect,viewport,card,{docked:true,padding});
  }
  return {hole,coach,side,docked,shades:[
    {left,top,width,height:y-top},
    {left,top:y,width:x-left,height:b-y},
    {left:r,top:y,width:right-r,height:b-y},
    {left,top:b,width,height:bottom-b}
  ]};
}
export class Spotlight {
  constructor({document:doc=document,window:win=window,onAction,onEscape,onLocate}){
    this.doc=doc;this.win=win;this.onLocate=onLocate;this.root=doc.createElement('div');this.root.className='spotlight';this.root.hidden=true;
    this.root.innerHTML='<div class="tour-shade"></div><div class="tour-shade"></div><div class="tour-shade"></div><div class="tour-shade"></div><div class="tour-ring" aria-hidden="true"></div><section class="tour-coach" role="region" aria-labelledby="tour-title"></section>';
    this.coach=this.root.querySelector('.tour-coach');this.ring=this.root.querySelector('.tour-ring');this.shades=[...this.root.querySelectorAll('.tour-shade')];
    this.root.addEventListener('click',event=>{const action=event.target.closest('[data-tour-action]');if(action){event.stopPropagation();onAction(action.dataset.tourAction);}});
    this.events=new AbortController();const signal=this.events.signal;
    const guard=event=>{if(!this.root.hidden&&!this.allows(event.target)){event.preventDefault();event.stopImmediatePropagation();}};
    doc.addEventListener('pointerdown',guard,{capture:true,signal});doc.addEventListener('click',guard,{capture:true,signal});
    doc.addEventListener('keydown',event=>{
      if(this.root.hidden)return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onEscape();return;}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!/INPUT|TEXTAREA/.test(event.target.tagName)){event.preventDefault();event.stopImmediatePropagation();return;}
      if(event.key!=='Tab')return;
      const targets=[...doc.querySelectorAll(this.step.interactive||this.step.target)];
      const candidates=[...targets.flatMap(target=>[...(target.matches(focusable)?[target]:[]),...target.querySelectorAll(focusable)]),...this.coach.querySelectorAll(focusable)];
      const items=[...new Set(candidates)].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert]'));
      if(!items.length)return;
      const index=items.indexOf(doc.activeElement),next=index<0?(event.shiftKey?items.length-1:0):(index+(event.shiftKey?-1:1)+items.length)%items.length;
      event.preventDefault();event.stopImmediatePropagation();items[next].focus();
    },{capture:true,signal});
    doc.addEventListener('scroll',()=>this.schedule(),{capture:true,passive:true,signal});
    win.addEventListener('resize',()=>this.schedule(),{signal});
    win.visualViewport?.addEventListener('resize',()=>this.schedule(),{signal});win.visualViewport?.addEventListener('scroll',()=>this.schedule(),{signal});
    this.observer=new ResizeObserver(()=>this.schedule());this.observer.observe(this.coach);
  }
  allows(target){return this.root.contains(target)||[...this.doc.querySelectorAll(this.step?.interactive||this.step?.target||':not(*)')].some(el=>el===target||el.contains(target));}
  show(step,html){
    this.step=step;this.forcedDock=false;
    const parent=this.doc.querySelector('#modal').open?this.doc.querySelector('#modal'):this.doc.body;
    parent.append(this.root);this.root.hidden=false;this.coach.innerHTML=html;
    this.doc.body.classList.add('tour-active');this.position();
    this.coach.querySelector('#tour-title')?.focus({preventScroll:true});this.schedule();
  }
  schedule(){
    if(this.root.hidden||this.pending)return;
    this.pending=true;this.win.requestAnimationFrame(()=>{this.pending=false;if(!this.root.hidden)this.position();});
  }
  position(){
    const win=this.win,v=win.visualViewport;
    const viewport={left:v?.offsetLeft??0,top:v?.offsetTop??0,width:v?.width??win.innerWidth,height:v?.height??win.innerHeight};
    const target=this.doc.querySelector(this.step.target),modal=this.doc.querySelector('#modal');
    const docked=win.innerWidth<=900||viewport.height<600||this.forcedDock;
    this.doc.body.classList.toggle('tour-docked',docked);
    // A modal only needs space within its own form. Its background stays full-height.
    this.doc.body.classList.toggle('tour-reserve-canvas',docked&&!modal.open);
    this.coach.dataset.keyboard=String(!!v&&v.height<win.innerHeight*.72&&/INPUT|TEXTAREA|SELECT/.test(this.doc.activeElement?.tagName));
    const card=this.coach.getBoundingClientRect();
    this.doc.documentElement.style.setProperty('--tour-space',Math.min(card.height+20,viewport.height*.48)+'px');
    // Changing docked mode can resize the canvas or form; measure the target afterward.
    const bounds=target?.getBoundingClientRect()??{left:viewport.left,top:viewport.top,right:viewport.left,bottom:viewport.top};
    // DOMRect exposes coordinates through prototype getters. Copy each coordinate
    // explicitly before clipping: spreading a DOMRect produces an empty object.
    let rect={left:bounds.left,top:bounds.top,right:bounds.right,bottom:bounds.bottom};
    const clip=target?.closest('#graph,.modal-body,.detail-scroll');
    if(clip){const bounds=clip.getBoundingClientRect();rect={left:Math.max(rect.left,bounds.left),top:Math.max(rect.top,bounds.top),right:Math.min(rect.right,bounds.right),bottom:Math.min(rect.bottom,bounds.bottom)};}
    if(docked)rect={...rect,bottom:Math.min(rect.bottom,viewport.top+viewport.height-card.height-20)};
    const geometry=spotlightGeometry(rect,viewport,card,{docked});
    if(geometry.docked&&!docked){this.forcedDock=true;this.schedule();}
    const place=(el,box)=>{for(const key of ['left','top','width','height'])el.style[key]=Math.max(key==='width'||key==='height'?0:-Infinity,box[key])+'px';};
    place(this.ring,geometry.hole);this.shades.forEach((el,i)=>place(el,geometry.shades[i]));
    this.coach.style.left=geometry.coach.left+'px';this.coach.style.top=geometry.coach.top+'px';
    this.coach.style.maxHeight=Math.max(110,Math.min(viewport.height-24,docked?viewport.height*.46:360))+'px';
    this.root.dataset.side=geometry.side;
    this.ring.hidden=geometry.hole.width<4||geometry.hole.height<4;
  }
  hide(){
    this.root.hidden=true;this.doc.body.classList.remove('tour-active','tour-docked','tour-reserve-canvas');this.doc.documentElement.style.removeProperty('--tour-space');this.doc.body.append(this.root);
  }
}
