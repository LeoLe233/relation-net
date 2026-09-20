import {escapeHtml as e} from './model.js';

// Keep every canvas label in SVG's coordinate system, including on mobile Safari.
export function graphText(text,x,y,width,height,style) {
  const centered=style==='edge-copy'||style==='faction-name';
  return `<g class="graph-text-box" transform="translate(${x},${y})"><title>${e(text)}</title><text class="graph-text ${style}" x="${centered?width/2:0}" y="${height/2}" dominant-baseline="central" text-anchor="${centered?'middle':'start'}" data-label-width="${width}" data-full-label="${e(text)}">${e(text)}</text></g>`;
}

const fitted=new Map();
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
export function fitGraphLabels(root,clearCache=false) {
  if(clearCache||fitted.size>3000)fitted.clear();
  for(const node of root.querySelectorAll('text[data-label-width]')){
    const full=node.dataset.fullLabel,width=Number(node.dataset.labelWidth);
    const key=JSON.stringify([node.getAttribute('class'),full,width,!!node.closest('.recent-relation')]);
    if(fitted.has(key)){node.textContent=fitted.get(key);continue;}
    node.textContent=full;
    if(node.getComputedTextLength()>width){
      const chars=segmenter?[...segmenter.segment(full)].map(s=>s.segment):[...full];
      let low=0,high=chars.length;
      while(low<high){
        const mid=Math.ceil((low+high)/2);node.textContent=chars.slice(0,mid).join('')+'…';
        if(node.getComputedTextLength()<=width)low=mid;else high=mid-1;
      }
      node.textContent=chars.slice(0,low).join('')+'…';
      if(node.getComputedTextLength()>width)node.textContent='';
    }
    fitted.set(key,node.textContent);
  }
}
