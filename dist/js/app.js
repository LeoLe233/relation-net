import {SCHEMA_VERSION,STORAGE_KEY,colors,CUSTOM_KIND,relationKind,prepareRelationKind,MAX_CHARACTER_FIELDS,prepareCharacterTemplate,validateCharacterAttributes,setCharacterTemplate,uid,clone,escapeHtml as e,demoBoard,createBoard,neighborhood,removeCharacter,exportBoard,validateImport,factionHull} from './model.js';
import {restoreChineseDemo} from './demo-migration.js';
import {icon,hydrateIcons} from './icons.js';
import {t,getLanguage,setLanguage,initializeLanguage,applyTranslations} from './i18n.js';
import {tutorialSteps,practiceBoard,hasSeenTutorial,markTutorialSeen} from './tutorial.js';
import {Spotlight} from './spotlight.js';
initializeLanguage(undefined,globalThis.navigator?.language);
import {arrangeGraph} from './layout.js';
import {graphText,fitGraphLabels} from './svg-text.js';
import {factionPositions as getFactionPositions,factionRelations,factionLine,FACTION_SHAPE,arrangeFactions} from './factions.js';
import {MIN_ZOOM,MAX_ZOOM,FOCUS_MIN_ZOOM,viewportCenter,centeredCamera,fittedCamera,zoomedCamera,resizedCamera,pinchedCamera} from './camera.js';

const $=selector=>document.querySelector(selector);
const graph=$('#graph'),scene=$('#scene'),canvas=$('#canvas-area'),modal=$('#modal');
let data,storageBlocked=false,loadWarning='';
try {
  const raw=localStorage.getItem(STORAGE_KEY);
  if(raw){const parsed=JSON.parse(raw);if(parsed.version!==SCHEMA_VERSION||!Array.isArray(parsed.boards)||!parsed.boards.length)throw Error('invalid');data={version:SCHEMA_VERSION,boards:parsed.boards.map(board=>validateImport({format:'relation-net',version:SCHEMA_VERSION,board})),activeId:parsed.activeId};}
} catch {storageBlocked=true;loadWarning='无法读取已保存的数据。原始数据已保留；本次修改请使用导出保存。';}
if(data)data.boards=data.boards.map(restoreChineseDemo);
if(!data){const demo=demoBoard();data={version:SCHEMA_VERSION,activeId:demo.id,boards:[demo]};}
if(!data.boards.some(b=>b.id===data.activeId))data.activeId=data.boards[0].id;
let selectedId=null,selected=new Set(),multi=false,factionFilter=null,query='',view='people',history=[],toastTimer;
let camera={x:0,y:0,k:1},gesture=null,dragged=false,frame=null;
let preFocusCamera=null,lastCameraArea=null,detailsExpanded=false,touchMove=false,connectionEditing=false;
const touchPoints=new Map();let pinch=null,suppressTouch=false;
const isCompact=()=>window.innerWidth<=900;
const usesBottomSheet=()=>isCompact()&&!(window.innerWidth>window.innerHeight&&window.innerHeight<=500);
// Connection drafts stay outside saved data until the user confirms them.
let connectionDraft=null,recentRelationId=null,recentRelationTimer;
let layoutBusy=false,tutorialOpen=false,tutorialStep=0;
let tourSession=null,spotlight=null,preparingTutorial=false;
function setSaveStatus(key){const status=$('#save-status');status.dataset.i18n=key;status.textContent=t(key);}
const board=()=>data.boards.find(b=>b.id===data.activeId);
const character=id=>board().characters.find(p=>p.id===id);
const short=(text,n=11)=>[...String(text)].length>n?[...String(text)].slice(0,n).join('')+'…':text;
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=t(message);$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function save(){
  if(tourSession){setSaveStatus('练习模式 · 不会保存');return;}
  if(storageBlocked){setSaveStatus('请导出保存本次修改');return;}
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));setSaveStatus('已保存到此浏览器');}
  catch{setSaveStatus('保存失败 · 请导出');toast(t('浏览器存储空间不足或不可用。请导出 JSON 保存，避免丢失修改。'));}
}
function checkpoint(){history.push(clone(data));if(history.length>40)history.shift();$('#undo').disabled=false;}
function mutate(action){checkpoint();action();save();render();}
function resetSelection(){detailsExpanded=false;connectionDraft=null;clearRecentRelation();preFocusCamera=null;selectedId=null;selected.clear();multi=false;factionFilter=null;query='';$('#search').value='';view='people';}
function undo(){if(!history.length)return;const previousView=view;data=history.pop();resetSelection();view=previousView;save();render();fit();toast(t('已撤销上一步'));}
function visibleIds(){
  let ids=new Set(board().characters.map(p=>p.id));
  if(connectionDraft)return ids;
  if(selectedId)ids=neighborhood(board(),selectedId);
  if(factionFilter){const f=board().factions.find(f=>f.id===factionFilter);if(f)ids=new Set([...ids].filter(id=>f.members.includes(id)));}
  if(query){const q=query.toLocaleLowerCase();ids=new Set([...ids].filter(id=>{const p=character(id);return [p.name,p.alias,p.role].some(s=>s.toLocaleLowerCase().includes(q));}));}
  return ids;
}
function localizedKind(b,id){const kind=relationKind(b,id);return ['cooperation','conflict','other'].includes(id)?{...kind,name:t(kind.name)}:kind;}
function renderSidebar(){
  const b=board();
  $('#board-list').innerHTML=data.boards.map(x=>`<button class="board-item ${x.id===b.id?'active':''}" data-board="${e(x.id)}" ${x.id===b.id?'aria-current="page"':''}>${icon('book')}<span class="board-name">${e(x.name)}</span>${x.id===b.id?'<span class="board-tag">OPEN</span>':''}</button>`).join('');
  $('#faction-count').textContent=String(b.factions.length).padStart(2,'0');$('#all-count').textContent=b.characters.length;
  $('.all-factions').classList.toggle('active',!factionFilter);
  $('#faction-list').innerHTML=b.factions.map(f=>`<button class="faction-row ${f.id===factionFilter?'active':''}" data-faction="${e(f.id)}"><span class="color-dot" style="--dot:${f.color}"></span><span>${e(short(f.name,11))}</span><span class="count">${f.members.length}</span></button>`).join('');
  const q=query.toLocaleLowerCase();let people=b.characters.filter(p=>[p.name,p.alias,p.role].some(s=>s.toLocaleLowerCase().includes(q)));
  if(factionFilter)people=people.filter(p=>b.factions.find(f=>f.id===factionFilter)?.members.includes(p.id));
  $('#people-list').innerHTML=people.length?people.map(p=>`<button class="person-row ${p.id===selectedId||selected.has(p.id)?'active':''}" data-person="${e(p.id)}"><span class="initial" style="border-color:${p.color}">${e([...p.name][0])}</span><span>${e(short(p.name,7))}</span><span class="person-role">${e(p.role)}</span></button>`).join(''):`<div class="small-empty">${t("没有匹配的人物")}</div>`;
  const shownTypes=['cooperation','conflict',...(b.relations.some(r=>r.kind==='other')?['other']:[]),...(b.relationTypes??[]).filter(t=>b.relations.some(r=>r.kind===t.id)).map(t=>t.id)];
  $('.legend').innerHTML=shownTypes.map(id=>{const t=localizedKind(b,id);return `<span title="${e(t.name)}"><i style="--legend:${t.color}"></i>${e(t.name)}</span>`;}).join('');
  $('#board-title').textContent=b.name;$('#project-kind').textContent=t(b.kind);
  $('#graph-stats').innerHTML=`<span><b>${b.characters.length}</b><span class="stat-label">${t("人物")}</span></span><span><b>${b.relations.length}</b><span class="stat-label">${t("关系")}</span></span><span><b>${b.factions.length}</b><span class="stat-label">${t("阵营")}</span></span>`;
  $('#undo').disabled=!history.length;$('#multi-toggle').setAttribute('aria-pressed',String(multi));$('#multi-toggle').disabled=view==='factions';
  $('#touch-move-toggle').setAttribute('aria-pressed',String(touchMove));
  $('#touch-move-toggle').disabled=multi||!!connectionDraft;
  $('#touch-hint').textContent=multi?t('点按人物多选 · 双指缩放'):touchMove?t('拖动节点调整位置 · 双指缩放'):t('单指平移 · 双指缩放 · 点按查看');
  $('#auto-layout').disabled=layoutBusy||!!connectionDraft||(view==='factions'?b.factions:b.characters).length<2;
  $('#auto-layout').title=view==='factions'?t('整理阵营位置，可撤销'):t('整理人物位置，可撤销');
  $('#auto-layout').setAttribute('aria-busy',String(layoutBusy));
  $('#auto-layout-label').textContent=layoutBusy?t('整理中…'):t('一键整理');
  document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.view===view)));
}
function edgePath(a,b,index=0){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
  const offset=(p,q)=>{const xx=q.x-p.x,yy=q.y-p.y;const t=Math.min(70/(Math.abs(xx)||.001),61/(Math.abs(yy)||.001));return {x:p.x+xx*t,y:p.y+yy*t};};
  const start=offset(a,b),end=offset(b,a),bend=index*34;
  const mx=(start.x+end.x)/2-dy/len*bend,my=(start.y+end.y)/2+dx/len*bend;
  return {d:`M${start.x},${start.y} Q${mx},${my} ${end.x},${end.y}`,mx:(start.x+2*mx+end.x)/4,my:(start.y+2*my+end.y)/4};
}
function renderGraph(){
  const b=board(),visible=visibleIds();
  if(view==='factions'){renderFactionGraph();fitGraphLabels(scene);updateCamera();return;}
  let regions='',edges='',labels='',nodes='';
  for(const f of b.factions){const members=b.characters.filter(p=>f.members.includes(p.id));if(!members.length)continue;const hull=factionHull(members);const left=Math.min(...members.map(p=>p.x)),top=Math.min(...members.map(p=>p.y));regions+=`<g opacity="${selectedId ? 0.3 : 1}"><polygon class="faction-region" points="${hull.map(p=>`${p.x},${p.y}`).join(' ')}" fill="${f.color}" stroke="${f.color}"/><g style="color:${f.color}">${graphText(f.name+' / '+String(members.length).padStart(2,'0'),left-69,top-112,Math.min(320,Math.max(...members.map(p=>p.x))-left+140),22,'faction-region-copy')}</g></g>`;}
  const pairCounts=new Map();
  for(const r of b.relations){const a=character(r.source),z=character(r.target);if(!a||!z)continue;const key=[r.source,r.target].sort().join('|');const count=pairCounts.get(key)||0;pairCounts.set(key,count+1);const curve=count===0?0:Math.ceil(count/2)*(count%2?1:-1);const p=edgePath(a,z,curve);const active=visible.has(a.id)&&visible.has(z.id)&&(!selectedId||r.source===selectedId||r.target===selectedId);const col=localizedKind(b,r.kind).color;const w=Math.min(155,[...r.label].length*11+17);
    edges+=`<path class="edge ${active?'':'dimmed'} ${r.id===recentRelationId?'recent-relation':''}" d="${p.d}" stroke="${col}" ${r.kind==='conflict'?'stroke-dasharray="5 5"':''} ${r.directed?'marker-end="url(#arrow)"':''}/>`;
    labels+=`<g class="edge-label ${active?'':'dimmed'} ${r.id===recentRelationId?'recent-relation':''}" data-relation="${e(r.id)}" tabindex="${active?'0':'-1'}" role="button" aria-label="${e(t('编辑关系：{source} {direction} {target}，{label}；类型：{kind}',{source:a.name,direction:t(r.directed?'到':'与'),target:z.name,label:r.label,kind:localizedKind(b,r.kind).name}))}" transform="translate(${p.mx},${p.my})"><rect class="touch-hit" x="${-Math.max(44,w)/2}" y="-22" width="${Math.max(44,w)}" height="44"/><rect x="${-w/2}" y="-10" width="${w}" height="20" rx="3"/>${graphText(r.label,-w/2+6,-10,w-12,20,'edge-copy')}</g>`;
  }
  for(const [i,p] of b.characters.entries()){const isSelected=selectedId===p.id||selected.has(p.id);const recent=recentRelationId&&b.relations.some(r=>r.id===recentRelationId&&(r.source===p.id||r.target===p.id));nodes+=`<g class="node ${visible.has(p.id)?'':'dimmed'} ${isSelected?'selected':''} ${recent?'recent-endpoint':''}" data-node="${e(p.id)}" transform="translate(${p.x},${p.y})" tabindex="0" role="button" aria-label="${e(p.name)} · ${e(p.role)}${isSelected?t('，已选中'):''}" aria-pressed="${isSelected}"><rect class="card-body" x="-70" y="-61" width="140" height="124" rx="2"/><path fill="${p.color}" d="M-69 -60H69V-44H-69Z"/><text class="node-id" x="-60" y="-49">${String(i+1).padStart(3,'0')} / ARCHIVE</text><path d="M54 -57h10m-5-3v6" stroke="#ffffff80" stroke-width=".8"/><rect x="-61" y="-37" width="47" height="52" fill="${p.color}" opacity=".86"/><text class="monogram" x="-37" y="0" text-anchor="middle">${e([...p.name][0])}</text>${graphText(p.name,-4,-28,66,25,'node-name')}${graphText(p.alias,-4,-5,66,17,'node-alias')}<path d="M-60 26H60" stroke="#e2e7dc"/>${graphText(p.role||t('未填写身份'),-60,31,multi?104:120,20,'node-role')}<path class="selection-corner" d="M55 49H65V59Z"/>${multi?`<rect x="50" y="30" width="12" height="12" rx="2" fill="${selected.has(p.id)?'#cce47b':'#f0f3e9'}" stroke="#a2af88"/>${selected.has(p.id)?'<path d="m52 36 2 2 5-5" stroke="#516030" fill="none" stroke-width="1.5"/>':''}`:''}</g>`;}
  scene.innerHTML=regions+edges+labels+'<g id="connection-preview" pointer-events="none"></g>'+nodes;fitGraphLabels(scene);updateCamera();updateConnectionPreview();
}
function factionPositions(){return getFactionPositions(board());}
function renderFactionGraph(){
  const groups=factionPositions(),byId=new Map(groups.map(f=>[f.id,f]));let lines='',labels='',nodes='';
  for(const r of factionRelations(board())){
    const a=byId.get(r.source),b=byId.get(r.target),p=factionLine(a,b),labelWidth=getLanguage()==='en'?164:136;
    lines+=`<line x1="${p.start.x}" y1="${p.start.y}" x2="${p.end.x}" y2="${p.end.y}" class="faction-link"/>`;
    labels+=`<g class="faction-link-label" transform="translate(${p.x},${p.y})"><title>${e(a.name)} ↔ ${e(b.name)}：${t('{count} 条跨阵营关系',{count:r.count})}</title><rect x="${-labelWidth/2}" y="-12" width="${labelWidth}" height="24" rx="4"/><text class="faction-network-label" text-anchor="middle" y="4">${t('{count} 条跨阵营关系',{count:r.count})}</text></g>`;
  }
  for(const [i,f] of groups.entries()){
    nodes+=`<g class="faction-node" data-group-node="${e(f.id)}" transform="translate(${f.x},${f.y})" tabindex="0" role="button" aria-label="${e(t('{name}，{count} 位成员；拖动调整位置，点击查看成员',{name:f.name,count:f.members.length}))}"><title>${e(f.name)} · ${t('拖动调整位置，点击查看成员')}</title><path class="faction-backdrop" d="${FACTION_SHAPE}"/><path class="faction-shape" d="${FACTION_SHAPE}" fill="${f.color}" stroke="${f.color}"/><text class="faction-code" fill="${f.color}" y="-64" text-anchor="middle">FACTION / ${String(i+1).padStart(2,'0')}</text><text class="faction-number" fill="${f.color}" y="-8" text-anchor="middle">${String(f.members.length).padStart(2,'0')}</text>${graphText(f.name,-104,9,208,29,'faction-name')}<text class="faction-caption" y="62" text-anchor="middle">${t("拖动调整 · 点击查看")}</text></g>`;
  }
  scene.innerHTML=lines+labels+nodes;
}
function detailHeader(title,closeAction){
  return `<div class="detail-top"><span class="detail-header-title">${e(title)}</span><div class="detail-top-actions"><button class="sheet-toggle" data-action="toggle-detail" aria-expanded="${detailsExpanded}" aria-label="${t(detailsExpanded?'收起详情':'展开详情')}">${detailsExpanded?t('收起'):t('展开')}</button><button class="icon-btn" data-action="${closeAction}" title="${t("关闭详情")}" aria-label="${t("关闭详情")}">${icon('close')}</button></div></div>`;
}
function renderDetail(){
  if(connectionDraft){renderConnectionEditor();return;}
  const p=character(selectedId);const detail=$('#detail');detail.hidden=!p;canvas.classList.toggle('detail-open',!!p);if(!p)return;
  const b=board(),rels=b.relations.filter(r=>r.source===p.id||r.target===p.id),groups=b.factions.filter(f=>f.members.includes(p.id));
  detail.innerHTML=`${detailHeader(t('{name} · 人物档案',{name:p.name}),'clear-selection')}<div class="detail-scroll"><div class="detail-identity"><div class="detail-avatar" style="background:${p.color}">${e([...p.name][0])}</div><div><h2>${e(p.name)}</h2><div class="alias">${e(p.alias)}</div><div class="detail-role">${e(p.role||t('暂无身份'))}</div></div></div><div class="detail-section"><div class="detail-heading">${t("所属阵营")}</div><div class="faction-badges">${groups.length?groups.map(f=>`<button class="badge" style="--badge:${f.color}" data-edit-faction="${e(f.id)}">${e(f.name)}</button>`).join(''):`<span class="detail-text">${t("暂未加入阵营")}</span>`}</div></div>${characterAttributeDetails(b,p)}<div class="detail-section"><div class="detail-heading">${t("人物笔记")}</div><p class="detail-text">${e(p.notes||t('暂无笔记。点击编辑档案，补充你对这个人物的观察。'))}</p></div><div class="detail-section"><div class="detail-heading">${t("直接关系 ")}<span>${String(rels.length).padStart(2,'0')} CONNECTIONS</span></div>${rels.length?rels.map(r=>{const other=character(r.source===p.id?r.target:r.source);return `<div class="relation-entry"><button data-person="${e(other.id)}"><span class="relation-mini" style="background:${other.color}">${e([...other.name][0])}</span><span class="relation-copy"><strong>${e(other.name)}</strong><small>${r.directed?(r.source===p.id?'→ ':'← '):'↔ '}${e(r.label)} <span class="relation-type" style="color:${localizedKind(b,r.kind).color}">${e(localizedKind(b,r.kind).name)}</span></small></span></button><button class="icon-btn" data-relation="${e(r.id)}" aria-label="${e(t('编辑与{name}的关系',{name:other.name}))}" title="${t("编辑关系")}">${icon('edit')}</button></div>`;}).join(''):`<p class="detail-text">${t("还没有关系，添加一条连接吧。")}</p>`}</div></div><div class="detail-bottom"><button class="button secondary" data-action="edit-person">${icon('edit')}${t('编辑档案')}</button><button class="button secondary" data-action="start-connection">${icon('plus')}${t('添加关系')}</button><button class="icon-btn danger-icon" data-action="delete-person" title="${t("删除人物")}" aria-label="${t("删除人物")}">${icon('trash')}</button></div>`;
}
function renderOverlays(){
  const b=board();$('#empty-state').hidden=view==='people'?!!b.characters.length:!!b.factions.length;
  if(view==='factions'&&!b.factions.length)$('#empty-state').innerHTML=`<span class="empty-symbol">◈</span><h2>${t("让人物形成阵营")}</h2><p>${t("在关系图谱中多选人物，为他们创建共同的阵营。")}</p><button class="button primary" data-action="start-group">${t("选择人物")}</button>`;
  else if(view==='people'&&!b.characters.length)$('#empty-state').innerHTML=`<span class="empty-symbol">◈</span><h2>${t("故事，从一个人物开始")}</h2><p>${t("添加人物，再用关系将他们连接起来。")}</p><button class="button primary" data-action="add-person">${t("＋ 添加第一个人物")}</button>`;
  $('#selection-bar').hidden=!multi;$('#selection-bar').innerHTML=`<span>${t('已选择 {count} 人',{count:selected.size})}</span><button class="button primary" data-action="create-faction" ${!selected.size?'disabled':''}>${icon('layers')}${t('组建阵营')}</button><button class="icon-btn" data-action="end-multi" aria-label="${t("退出多选")}" title="${t("退出多选")}">${icon('close')}</button>`;
  const focus=character(selectedId);$('#focus-bar').hidden=!focus;$('#focus-bar').innerHTML=focus?`<span>${e(t('聚焦 {name} · {count} 位相关人物',{name:focus.name,count:neighborhood(b,focus.id).size-1}))}</span><button class="icon-btn" data-action="clear-selection" title="${t("退出聚焦")}" aria-label="${t("退出聚焦")}">${icon('close')}</button>`:'';
  const f=b.factions.find(f=>f.id===factionFilter);$('#filter-chip').hidden=!f||multi||!!connectionDraft;$('#filter-chip').innerHTML=f?`<span>${e(f.name)}</span><button data-edit-faction="${e(f.id)}" aria-label="${t("编辑阵营")}">${icon('edit')}</button><button data-action="all-factions" aria-label="${t("显示全部人物")}">${icon('close')}</button>`:'';
  renderConnectionBar();
}
function syncCompactUI(){
  const detail=$('#detail');canvas.classList.toggle('connection-editing',isCompact()&&connectionEditing&&!!connectionDraft?.target);detail.classList.toggle('expanded',detailsExpanded);canvas.classList.toggle('detail-expanded',detailsExpanded&&!detail.hidden);
  const panel=detail.getBoundingClientRect(),bounds=canvas.getBoundingClientRect();
  canvas.style.setProperty('--sheet-space',usesBottomSheet()&&!detail.hidden?Math.max(0,canvas.clientHeight-(panel.top-bounds.top))+'px':'0px');
  const sidebar=$('#sidebar'),opened=isCompact()&&sidebar.classList.contains('open');
  sidebar.inert=isCompact()&&!opened;$('.workspace').inert=opened;
  $('#sidebar-scrim').hidden=!opened;
  $('.mobile-menu').setAttribute('aria-expanded',String(opened));
}
function render(){renderSidebar();renderDetail();renderOverlays();syncCompactUI();renderGraph();}
function toggleDetail(){
  const before=cameraArea();
  if(connectionEditing){document.activeElement?.blur();connectionEditing=false;}
  detailsExpanded=!detailsExpanded;syncCompactUI();
  const button=$('[data-action="toggle-detail"]');button.textContent=detailsExpanded?t('收起'):t('展开');
  button.setAttribute('aria-expanded',String(detailsExpanded));button.setAttribute('aria-label',t(detailsExpanded?'收起详情':'展开详情'));
  camera=resizedCamera(camera,before,cameraArea());updateCamera();
}
function cameraArea(){
  const mobile=isCompact(),margin=mobile?12:25;
  let right=canvas.clientWidth-margin,bottom=canvas.clientHeight-84;
  const detail=$('#detail');
  if(!detail.hidden){
    const panel=detail.getBoundingClientRect(),bounds=canvas.getBoundingClientRect();
    if(usesBottomSheet())bottom=panel.top-bounds.top-72;
    else right=panel.left-bounds.left-16;
  }
  const top=mobile?(usesBottomSheet()&&detailsExpanded&&!detail.hidden?16:selectedId||multi||factionFilter||connectionDraft?64:16):72;
  return {left:margin,top,width:Math.max(1,right-margin),height:Math.max(1,bottom-top)};
}
function updateCamera(){
  scene.setAttribute('transform',`translate(${camera.x},${camera.y}) scale(${camera.k})`);
  $('#zoom-level').textContent=Math.round(camera.k*100)+'%';
  $('[data-action="zoom-out"]').disabled=camera.k<=MIN_ZOOM;
  $('[data-action="zoom-in"]').disabled=camera.k>=MAX_ZOOM;
  const fitting=$('[data-action="fit"]');
  fitting.title=selectedId&&!connectionDraft?t('适应当前关系（最低 85%）'):isCompact()?t('定位图谱（最低 75%，双指缩小查看全图）'):t('适应当前图谱');
  fitting.setAttribute('aria-label',fitting.title);
  lastCameraArea=cameraArea();spotlight?.schedule();
}
function fit(){
  const b=board(),focus=view==='people'?character(connectionDraft?(isCompact()?(connectionDraft.target||connectionDraft.source):null):selectedId):null;
  let items=view==='factions'?factionPositions():b.characters;
  if(focus){const related=connectionDraft?new Set([connectionDraft.source,connectionDraft.target]):neighborhood(b,focus.id);items=items.filter(p=>related.has(p.id));}
  else if(factionFilter&&!connectionDraft)items=items.filter(p=>visibleIds().has(p.id));
  camera=fittedCamera(items,cameraArea(),{focus:focus||(isCompact()?items[0]:null),minZoom:focus?FOCUS_MIN_ZOOM:isCompact()?0.75:MIN_ZOOM});
  updateCamera();
}
function zoom(factor,cx,cy){
  const point=cx===undefined?viewportCenter(cameraArea()):{x:cx,y:cy};
  camera=zoomedCamera(camera,factor,point);updateCamera();
}
function resetZoom(){
  const area=cameraArea(),center=viewportCenter(area);
  const focus=character(connectionDraft?.source||selectedId);
  const point=focus||{x:(center.x-camera.x)/camera.k,y:(center.y-camera.y)/camera.k};
  camera=centeredCamera(point,area,1);updateCamera();
}
function clearFocus(){
  const previous=selectedId?preFocusCamera:null;
  selectedId=null;selected.clear();preFocusCamera=null;
  render();
  if(previous){camera={...previous.camera};camera=resizedCamera(camera,previous.area,cameraArea());updateCamera();}
}
function resizeViewport(){
  syncCompactUI();const area=cameraArea();
  if(lastCameraArea)camera=resizedCamera(camera,lastCameraArea,area);
  updateCamera();
}
async function tidyLayout(){
  const layoutView=view,collection=layoutView==='factions'?'factions':'characters';
  if(layoutBusy||connectionDraft||gesture||board()[collection].length<2)return;
  const target=board(),snapshot=JSON.stringify(target),session=tourSession;let applied=false;
  layoutBusy=true;renderSidebar();
  try{
    const arrange=layoutView==='factions'?arrangeFactions:arrangeGraph;
    const positions=await arrange(clone(target),{aspectRatio:canvas.clientWidth/Math.max(1,canvas.clientHeight)});
    if(session!==tourSession)return;
    if(board()!==target||view!==layoutView||JSON.stringify(target)!==snapshot||gesture||connectionDraft){toast(t('图谱已发生变化，本次整理未应用；可再次点击整理。'));return;}
    const byId=new Map(positions.map(p=>[p.id,p]));
    if(positions.length!==target[collection].length||positions.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000))throw Error('Invalid layout');
    resetSelection();view=layoutView;
    mutate(()=>target[collection].forEach(p=>{const next=byId.get(p.id);p.x=next.x;p.y=next.y;}));
    applied=true;fit();toast(layoutView==='factions'?t('已整理阵营，可点击“撤销”恢复原布局'):t('已整理整张图谱，可点击“撤销”恢复原布局'));
  }catch{toast(t('本次未能完成整理，原布局已保留。'));}
  finally{layoutBusy=false;renderSidebar();if(applied)tutorialEvent('layout-finished');}
}
function selectPerson(id,additive=false){
  if(tutorialOpen)additive=false;
  if(connectionDraft){chooseConnectionTarget(id);closeMenu();return;}
  clearRecentRelation();
  if(!character(id))return;view='people';
  if(multi||additive){multi=true;selectedId=null;preFocusCamera=null;if(selected.has(id))selected.delete(id);else selected.add(id);}
  else {const was=selectedId;if(was!==id)detailsExpanded=false;if(!was)preFocusCamera={camera:{...camera},area:cameraArea()};selectedId=id;selected.clear();factionFilter=null;query='';$('#search').value='';render();if(was!==id)fit();}
  render();closeMenu();tutorialEvent('person-selected',id);
}
function selectFaction(id){connectionDraft=null;clearRecentRelation();view='people';factionFilter=id;selectedId=null;selected.clear();multi=false;query='';$('#search').value='';render();fit();closeMenu();tutorialEvent('faction-selected',id);}
function openMenu(){
  $('#sidebar').classList.add('open');syncCompactUI();$('.mobile-nav-close').focus({preventScroll:true});
}
function closeMenu(restoreFocus=false){
  $('#sidebar').classList.remove('open');syncCompactUI();
  if(restoreFocus&&isCompact())$('.mobile-menu').focus({preventScroll:true});
}

function clearRecentRelation(){
  clearTimeout(recentRelationTimer);
  recentRelationId=null;
}
function beginConnection(){
  connectionEditing=false;
  if(!character(selectedId))return;
  if(board().characters.length<2){toast(t('先添加另一位人物，再建立关系。'));return;}
  if(board().relations.length>=3000){toast(t('此图谱已达到 3,000 关系上限。'));return;}
  clearRecentRelation();
  connectionDraft={source:selectedId,target:null,hover:null,label:'',kind:'cooperation',customKind:'',directed:false,notes:''};
  multi=false;selected.clear();factionFilter=null;query='';view='people';$('#search').value='';
  render();fit();graph.focus({preventScroll:true});tutorialEvent('start-connection');
}
function cancelConnection(){
  if(!connectionDraft)return;
  selectedId=character(connectionDraft.source)?.id??null;
  connectionDraft=null;
  render();fit();
}
function chooseConnectionTarget(id){
  if(!connectionDraft||!character(id))return;
  if(id===connectionDraft.source){toast(t('起点已选定，请点击另一位人物。'));return;}
  const firstChoice=!connectionDraft.target;
  connectionDraft.target=id;connectionDraft.hover=null;
  if(firstChoice&&isCompact())detailsExpanded=true;
  render();
  if(firstChoice)fit();
  if(!isCompact())$('#connection-form [name="label"]').focus({preventScroll:true});
  tutorialEvent('target-selected',id);
}
function renderConnectionBar(){
  const bar=$('#connection-bar');
  bar.hidden=!connectionDraft;
  canvas.classList.toggle('connecting',!!connectionDraft);
  if(!connectionDraft)return;
  $('#focus-bar').hidden=true;
  const source=character(connectionDraft.source),target=character(connectionDraft.target);
  bar.innerHTML=`${icon('link')}<span>${target?e(t('已选择 {source} 与 {target}',{source:source.name,target:target.name})):e(t('从 {name} 出发，点击另一位人物',{name:source.name}))}</span><button class="icon-btn" data-action="cancel-connection" title="${t("取消添加 · Esc")}" aria-label="${t("取消添加关系")}">${icon('close')}</button>`;
}
function updateConnectionPreview(){
  const draft=connectionDraft;
  const preview=$('#connection-preview');
  if(!preview)return;
  const targetId=draft?.target||draft?.hover;
  scene.querySelectorAll('[data-node]').forEach(node=>{
    node.classList.toggle('connection-source',!!draft&&node.dataset.node===draft.source);
    node.classList.toggle('connection-target',!!draft&&node.dataset.node===targetId);
    node.classList.toggle('connection-muted',!!draft&&!!draft.target&&node.dataset.node!==draft.source&&node.dataset.node!==targetId);
  });
  preview.innerHTML='';
  if(!draft||!targetId)return;
  const source=character(draft.source),target=character(targetId);
  if(!source||!target)return;
  const existing=board().relations.filter(r=>(r.source===source.id&&r.target===target.id)||(r.target===source.id&&r.source===target.id)).length;
  const curve=existing?Math.ceil(existing/2)*(existing%2?1:-1):0;
  const path=edgePath(source,target,curve);
  preview.innerHTML=`<path class="connection-line-halo" d="${path.d}"/><path class="connection-line ${draft.target?'confirmed':''}" d="${path.d}" ${draft.directed?'marker-end="url(#arrow)"':''}/><g class="connection-line-label" transform="translate(${path.mx},${path.my})"><rect x="-35" y="-12" width="70" height="24" rx="4"/><text text-anchor="middle" y="4">${draft.target?t('待保存'):t('新关系')}</text></g>`;
}
function renderConnectionEditor(){
  const detail=$('#detail'),draft=connectionDraft;
  const source=character(draft.source),target=character(draft.target);
  detail.hidden=!target;canvas.classList.toggle('detail-open',!!target);
  if(!target)return;
  const existing=board().relations.filter(r=>(r.source===source.id&&r.target===target.id)||(r.source===target.id&&r.target===source.id)).length;
  const endpoint=p=>`<span class="connection-endpoint"><span class="relation-mini" style="background:${p.color}">${e([...p.name][0])}</span><strong>${e(p.name)}</strong></span>`;
  detail.innerHTML=`${detailHeader(t('添加人物关系'),'cancel-connection')}<form id="connection-form" class="connection-form"><div class="detail-scroll"><h2>${t("添加关系")}</h2><div class="connection-pair">${endpoint(source)}<span class="connection-direction" aria-hidden="true">${draft.directed?'→':'↔'}</span>${endpoint(target)}</div><p class="connection-hint">${t("可点击画布上的其他人物更换终点。")}</p>${existing?`<p class="connection-existing">${t('两人已有 {count} 条关系；这次将新增一条。',{count:existing})}</p>`:''}${textField(t('关系名称 *'),'label',draft.label,true)}${relationTypeFields(draft.kind,draft.customKind)}<label class="form-check"><input type="checkbox" name="directed" ${draft.directed?'checked':''}>${t('有方向')} (${e(source.name)} → ${e(target.name)})</label><details class="connection-notes" ${draft.notes?'open':''}><summary>${t("添加关系笔记（可选）")}</summary>${textArea(t('关系笔记'),'notes',draft.notes)}</details><p id="connection-error" class="connection-error" role="alert" hidden></p></div><div class="detail-bottom"><button type="button" class="button secondary" data-action="cancel-connection">${t("取消")}</button><button type="submit" class="button primary">${icon('check')}${t('保存关系')}</button></div></form>`;
  const form=$('#connection-form');
  const sync=()=>{
    if(!connectionDraft)return;
    const fields=new FormData(form);
    Object.assign(connectionDraft,{label:String(fields.get('label')||''),kind:String(fields.get('kind')),customKind:String(fields.get('customKind')||''),directed:fields.has('directed'),notes:String(fields.get('notes')||'')});
    $('.connection-direction').textContent=connectionDraft.directed?'→':'↔';
    updateConnectionPreview();
  };
  form.addEventListener('input',sync);
  form.addEventListener('change',sync);
  form.addEventListener('submit',event=>{event.preventDefault();sync();saveConnection();});
  wireRelationTypeForm(form);
}
function saveConnection(){
  const draft=connectionDraft;
  if(!draft)return;
  const fail=message=>{$('#connection-error').textContent=t(message);$('#connection-error').hidden=false;};
  const label=draft.label.trim();
  if(!label)return fail(t('请填写关系名称。'));
  if(!character(draft.source)||!character(draft.target)||draft.source===draft.target)return fail(t('请选择两位不同的人物。'));
  if(board().relations.length>=3000)return fail(t('此图谱已达到 3,000 关系上限。'));
  let chosen;try{chosen=prepareRelationKind(board(),draft.kind,draft.customKind);}catch(error){return fail(error.message);}
  const relation={id:uid(),source:draft.source,target:draft.target,label,kind:chosen.kind,directed:draft.directed,notes:draft.notes.trim()};
  selectedId=draft.source;connectionDraft=null;
  clearRecentRelation();recentRelationId=relation.id;
  mutate(()=>{commitRelationType(chosen);board().relations.push(relation);});
  recentRelationTimer=setTimeout(()=>{recentRelationId=null;renderGraph();},4500);
  toast(t('关系已添加'));tutorialEvent('relation-saved');
}

function modalShell(title,body,footer,submit){
  $('#modal-content').innerHTML=`<form id="editor"><div class="modal-header"><div><div class="eyebrow">RELATION NET / EDITOR</div><h2 id="modal-title">${e(title)}</h2></div><button type="button" class="icon-btn" data-action="close-modal" aria-label="${t("关闭")}">${icon('close')}</button></div><div class="modal-body">${body}</div><p id="form-error" class="form-error" hidden></p><div class="modal-footer">${footer??''}<button type="button" class="button secondary" data-action="close-modal">${t("取消")}</button><button type="submit" class="button primary">${t("保存")}</button></div></form>`;
  $('#editor').addEventListener('submit',event=>{event.preventDefault();try{submit(new FormData(event.currentTarget));}catch(error){$('#form-error').textContent=t(error.message);$('#form-error').hidden=false;}});
  if(!modal.open)modal.showModal();
}
const textField=(label,name,value='',required=false,max=60)=>`<label class="field">${label}<input name="${name}" value="${e(value)}" ${required?'required':''} maxlength="${max}" autocomplete="off"></label>`;
const textArea=(label,name,value='')=>`<label class="field">${label}<textarea name="${name}" maxlength="10000" rows="3">${e(value)}</textarea></label>`;
const colorField=color=>`<fieldset class="field" style="border:0;padding:0"><legend style="margin-bottom:8px">${t("标记颜色")}</legend><div class="colors">${[...new Set([...colors,color])].map(c=>`<label class="color-choice"><input type="radio" name="color" value="${c}" ${c===color?'checked':''} aria-label="${t('颜色')} ${c}"><span style="--swatch:${c}"></span></label>`).join('')}</div></fieldset>`;
const get=(f,name)=>String(f.get(name)||'').trim();
function required(f,name,label){const v=get(f,name);if(!v)throw Error(t('请填写{field}。',{field:label}));return v;}
const attributeValue=(person,id)=>Object.hasOwn(person?.attributes??{},id)?person.attributes[id]:'';
function characterAttributeDetails(b,p){
  return (b.characterTemplate??[]).map(field=>`<div class="detail-section character-attribute"><div class="detail-heading">${e(field.name)}</div><p class="detail-text ${attributeValue(p,field.id)?'':'attribute-empty'}">${e(attributeValue(p,field.id)||t('未填写'))}</p></div>`).join('');
}
function characterTemplateModal(){
  const b=board();let draft=clone(b.characterTemplate??[]);
  modalShell(t('编辑角色模板'),`<p class="template-intro">${t('为当前图谱的所有角色添加文本属性，例如“特殊能力”。')}</p><div id="template-fields"></div><button type="button" class="button secondary template-add" data-template-add>${icon('plus')}${t('添加属性')}</button><p id="template-limit" class="template-hint" hidden>${t('每张图谱最多支持 30 个角色属性。')}</p><p id="template-warning" class="help-note" role="status" hidden></p>`,null,f=>{
    const fields=prepareCharacterTemplate(draft.map((field,i)=>({...field,name:get(f,'template-'+i)})));
    mutate(()=>setCharacterTemplate(b,fields));modal.close();toast(t('角色模板已更新'));
  });
  const form=$('#editor');
  const capture=()=>{const f=new FormData(form);draft=draft.map((field,i)=>({...field,name:String(f.get('template-'+i)??'')}));};
  const renderFields=(focusIndex)=>{
    $('#template-fields').innerHTML=draft.length?draft.map((field,i)=>`<div class="template-field-row">${textField(t('属性名称 {index}',{index:i+1}),'template-'+i,field.name,true)}<button type="button" class="icon-btn danger-icon" data-template-remove="${i}" title="${t('删除属性')}" aria-label="${e(t('删除第 {index} 项属性',{index:i+1}))}">${icon('trash')}</button></div>`).join(''):`<p class="template-empty">${t('尚未添加属性。姓名、身份和人物笔记会保留。')}</p>`;
    $('[data-template-add]').disabled=draft.length>=MAX_CHARACTER_FIELDS;
    $('#template-limit').hidden=draft.length<MAX_CHARACTER_FIELDS;
    const removed=(b.characterTemplate??[]).filter(field=>!draft.some(next=>next.id===field.id));
    const count=b.characters.filter(p=>removed.some(field=>attributeValue(p,field.id))).length;
    $('#template-warning').hidden=!count;
    $('#template-warning').textContent=t('保存后，将删除 {count} 位角色在已移除属性中填写的内容；可通过撤销恢复。',{count});
    if(focusIndex!==undefined){const target=focusIndex<0?$('[data-template-add]'):form.querySelector('[name="template-'+focusIndex+'"]');target.focus();}
  };
  form.addEventListener('click',event=>{
    const add=event.target.closest('[data-template-add]'),remove=event.target.closest('[data-template-remove]');
    if(!add&&!remove)return;
    event.preventDefault();capture();$('#form-error').hidden=true;
    if(add){if(draft.length>=MAX_CHARACTER_FIELDS)return;draft.push({id:'field-'+uid(),name:''});renderFields(draft.length-1);}
    else{const index=Number(remove.dataset.templateRemove);if(!Number.isInteger(index)||index<0||index>=draft.length)return;draft.splice(index,1);renderFields(Math.min(index,draft.length-1));}
  });
  renderFields();
}
function personModal(id){
  const p=character(id);if(!p&&board().characters.length>=500){toast(t('此图谱已达到 500 人物上限。'));return;}
  const template=board().characterTemplate??[];
  modalShell(p?t('编辑人物档案'):t('新增人物'),`<div class="fields-row">${textField(t('人物名称 *'),'name',p?.name,true)}${textField(t('别名 / 英文名'),'alias',p?.alias)}</div>${textField(t('身份 / 角色'),'role',p?.role,false,100)}${colorField(p?.color||colors[0])}${template.map(field=>textArea(e(field.name),e('attribute-'+field.id),attributeValue(p,field.id))).join('')}${textArea(t('人物笔记'),'notes',p?.notes)}`,null,f=>{
    const next={name:required(f,'name',t('人物名称')),alias:get(f,'alias'),role:get(f,'role'),notes:get(f,'notes'),color:get(f,'color')};let newId=id;
    if(template.length||p?.attributes)next.attributes=validateCharacterAttributes(template,Object.fromEntries(template.map(field=>[field.id,get(f,'attribute-'+field.id)])));
    mutate(()=>{if(p)Object.assign(p,next);else{const {x,y,k}=camera;newId=uid();board().characters.push({...next,id:newId,x:(canvas.clientWidth/2-x)/k+(Math.random()-.5)*60,y:(canvas.clientHeight/2-y)/k+(Math.random()-.5)*60});}});
    modal.close();selectPerson(newId);toast(p?t('人物档案已更新'):t('已添加人物'));tutorialEvent('person-saved',newId);
  });
  if(p)tutorialEvent('edit-person');
}
function relationTypeFields(kind='cooperation',name=''){
  const options=[['cooperation',t('合作')],['conflict',t('冲突')],...(board().relationTypes??[]).map(t=>[t.id,t.name]),...(kind==='other'?[['other',t('其他（未分类）')]]:[]),[CUSTOM_KIND,t('其他…添加自定义类型')]];
  return `<label class="field">${t("关系类型")}<select name="kind">${options.map(([id,label])=>`<option value="${e(id)}" ${kind===id?'selected':''}>${e(label)}</option>`).join('')}</select></label><label class="field" data-custom-kind ${kind===CUSTOM_KIND?'':'hidden'}>${t("自定义关系类型 *")}<input name="customKind" value="${e(name)}" maxlength="60" placeholder="${t("例如：亲情、师徒、竞争")}" autocomplete="off" ${kind===CUSTOM_KIND?'required':''}><small>${t("保存后可在本图谱中继续选用。")}</small></label>`;
}
function wireRelationTypeForm(form){
  const select=form.querySelector('[name="kind"]'),field=form.querySelector('[data-custom-kind]'),input=form.querySelector('[name="customKind"]');
  const update=()=>{const custom=select.value===CUSTOM_KIND;field.hidden=!custom;input.required=custom;return custom;};
  update();form.addEventListener('change',event=>{if(event.target===select&&update())input.focus({preventScroll:true});});
}
function commitRelationType(chosen){if(chosen.type)(board().relationTypes??=[]).push(chosen.type);}
function relationModal(id){
  if(connectionDraft){connectionDraft=null;render();}
  const b=board(),r=b.relations.find(r=>r.id===id);
  if(b.characters.length<2){toast(t('先添加至少两位人物，再建立关系。'));return;}
  if(!r&&b.relations.length>=3000){toast(t('此图谱已达到 3,000 关系上限。'));return;}
  const opts=(sel)=>b.characters.map(p=>`<option value="${e(p.id)}" ${p.id===sel?'selected':''}>${e(p.name)}</option>`).join('');
  const source=r?.source||selectedId||[...selected][0]||b.characters[0].id;
  const target=r?.target||[...selected].find(id=>id!==source)||b.characters.find(p=>p.id!==source).id;
  modalShell(r?t('编辑人物关系'):t('添加人物关系'),`<div class="fields-row"><label class="field">${t("起点人物")}<select name="source">${opts(source)}</select></label><label class="field">${t("终点人物")}<select name="target">${opts(target)}</select></label></div>${textField(t('关系名称 *'),'label',r?.label,true)}${relationTypeFields(r?.kind||'cooperation')}<label class="form-check"><input type="checkbox" name="directed" ${r?.directed?'checked':''}>${t("有方向的关系（起点 → 终点）")}</label>${textArea(t('关系笔记'),'notes',r?.notes)}`,r?`<button type="button" class="left-action" data-delete-relation="${e(id)}">${t("删除关系")}</button>`:null,f=>{
    const chosen=prepareRelationKind(b,get(f,'kind'),get(f,'customKind'));
    const next={source:get(f,'source'),target:get(f,'target'),label:required(f,'label',t('关系名称')),kind:chosen.kind,directed:f.has('directed'),notes:get(f,'notes')};
    if(next.source===next.target)throw Error(t('请选择两位不同的人物。'));
    if(!character(next.source)||!character(next.target))throw Error(t('选择的人物已不存在。'));
    mutate(()=>{commitRelationType(chosen);if(r)Object.assign(r,next);else b.relations.push({id:uid(),...next});});modal.close();toast(r?t('关系已更新'):t('关系已添加'));
  });
  wireRelationTypeForm($('#editor'));
}
function factionModal(id){
  const b=board(),faction=b.factions.find(f=>f.id===id);const members=new Set(faction?.members??selected);
  if(!faction&&b.factions.length>=100){toast(t('此图谱已达到 100 阵营上限。'));return;}
  modalShell(faction?t('编辑阵营'):t('组建阵营'),`${textField(t('阵营名称 *'),'name',faction?.name,true)}${colorField(faction?.color||colors[b.factions.length%colors.length])}${textArea(t('阵营说明'),'description',faction?.description)}<fieldset class="field" style="border:0;padding:0"><legend style="margin-bottom:10px">${t("阵营成员")}</legend><div class="member-checks">${b.characters.map(p=>`<label class="member-check"><input type="checkbox" name="members" value="${e(p.id)}" ${members.has(p.id)?'checked':''}>${e(p.name)}</label>`).join('')}</div><small>${t("人物可以同时属于多个阵营。")}</small></fieldset>`,faction?`<button type="button" class="left-action" data-delete-faction="${e(id)}">${t("解散阵营")}</button>`:null,f=>{
    const next={name:required(f,'name',t('阵营名称')),color:get(f,'color'),description:get(f,'description'),members:f.getAll('members')};if(!next.members.length)throw Error(t('请至少选择一位阵营成员。'));
    mutate(()=>{if(faction)Object.assign(faction,next);else b.factions.push({id:uid(),...next});});selected.clear();multi=false;modal.close();render();toast(faction?t('阵营已更新'):t('阵营已创建'));
  });
}
function boardModal(edit=false){
  const b=edit?board():null;
  modalShell(edit?t('编辑图谱'):t('新建图谱'),`${textField(t('图谱名称 *'),'name',b?.name,true)}<label class="field">${t("图谱类型")}<select name="kind">${['书籍','游戏','现实','其他'].map(k=>`<option value="${k}" ${b?.kind===k?'selected':''}>${t(k)}</option>`).join('')}</select></label>${textArea(t('图谱说明'),'description',b?.description)}`,edit?`<button type="button" class="left-action" data-action="delete-board">${t("删除图谱")}</button>`:null,f=>{
    const next={name:required(f,'name',t('图谱名称')),kind:get(f,'kind'),description:get(f,'description')};
    mutate(()=>{if(b)Object.assign(b,next);else{const x=createBoard(next);data.boards.push(x);data.activeId=x.id;}});resetSelection();modal.close();render();fit();toast(edit?t('图谱信息已更新'):t('新图谱已创建'));
  });
}
function confirmDelete(title,message,action){modalShell(title,`<p class="confirm-copy">${e(message)}</p>`,null,()=>{mutate(action);selectedId=null;selected.clear();if(factionFilter&&!board().factions.some(f=>f.id===factionFilter))factionFilter=null;modal.close();render();fit();toast(t('已删除，可通过撤销恢复'));});const submit=$('#editor button[type=submit]');submit.textContent=t('确认删除');submit.className='button danger';}
function exportCurrent(){const blob=new Blob([JSON.stringify(exportBoard(board()),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=board().name.replace(/[\\/:*?"<>|]/g,'-')+'.relation-net.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast(t('已导出当前图谱，包含人物、关系、阵营和布局'));}
async function importFile(file){if(!file)return;if(file.size>10*1024*1024){toast(t('文件超过 10 MB，请选择较小的图谱文件。'));return;}try{const imported=validateImport(JSON.parse(await file.text()));imported.id=uid();mutate(()=>{data.boards.push(imported);data.activeId=imported.id;});resetSelection();render();fit();toast(t('已导入为独立图谱，原有数据已保留'));}catch(error){toast(error instanceof SyntaxError?t('JSON 格式有误，请检查文件。'):error.message);}}
function help(){
  $('#modal-content').innerHTML=`<div class="modal-header"><div><div class="eyebrow">FIELD MANUAL / 01</div><h2 id="modal-title">${t("使用关系档案")}</h2></div><button class="icon-btn" data-action="close-modal" aria-label="${t("关闭")}">${icon('close')}</button></div><div class="modal-body help-body"><p>${t("为书籍、游戏或现实中的人物，各建一张关系图谱。")}</p><div class="help-grid"><strong>${t("关系类型")}</strong><span>${t("选择“其他…添加自定义类型”，填写类型名称并保存，之后可在同一图谱中直接选用。已有“其他”关系可逐条重新分类。")}</span><strong>${t("手机操作")}</strong><span>${t("单指平移画布、双指缩放、点按查看人物。开启“移动节点”后可拖动人物或阵营；详情右上角可展开或收起。")}</span><strong>${t("侧栏分区")}</strong><span>${t("点击工作空间、阵营或人物档案标题旁的小箭头，可独立折叠或展开列表，默认全部展开。")}</span><strong>${t("查看关系")}</strong><span>${t("点击人物，聚焦本人和直接关系，自动缩放最低 85%；点击空白退出并恢复之前的视角。")}</span><strong>${t("快速连线")}</strong><span>${t("点击人物详情中的“添加关系”，再点击画布上的另一位人物。填写关系名称后保存；Esc 取消。")}</span><strong>${t("调整布局")}</strong><span>${t("点击“一键整理”自动排列整张图谱，减少重叠与连线交叉；可撤销。也可拖动人物微调，拖动空白平移，滚轮缩放。")}</span><strong>${t("阵营布局")}</strong><span>${t("阵营视图中可直接拖动阵营，或点击“一键整理”。位置会自动保存，支持撤销；点击阵营查看成员。")}</span><strong>${t("缩放视角")}</strong><span>${t("点击右下角百分比恢复 100%；手动缩放范围为 25%–300%。关系范围过大时，拖动画布查看其余人物。")}</span><strong>${t("组建阵营")}</strong><span>${t("点击“多选”后逐个选择人物，或按住 Shift 点击，再点“组建阵营”。")}</span><strong>${t("修改内容")}</strong><span>${t("在详情中编辑人物；点击连线文字编辑关系；选择阵营后点击编辑按钮。")}</span><strong>${t("撤销")}</strong><span>${t("Ctrl / ⌘ + Z 恢复最近 40 步数据修改；Esc 关闭详情或退出多选。")}</span></div><div class="help-note">${t("图谱仅保存在当前浏览器，不会跨设备同步。清理浏览器数据可能导致丢失；请定期导出 JSON 备份。导入时会新增图谱，保留原有内容。")}</div><p style="margin-top:16px;font-size:12px">${t("“雾港档案”为原创虚构示例，与真实人物或游戏设定无关。")}</p><a class="button secondary" href="./relation-net-source.zip" download>${t("下载源代码 · MIT License")}</a></div><div class="modal-footer"><button class="button secondary" data-action="tutorial">${t("新手教程")}</button><button class="button primary" data-action="close-modal">${t("开始探索")}</button></div>`;if(!modal.open)modal.showModal();
}
function applyLanguage(){
  document.documentElement.lang=getLanguage()==='zh'?'zh-CN':'en';
  document.title=t('Relation Net · 关系档案');
  applyTranslations(document);
  const toggle=$('#language-toggle');toggle.textContent=getLanguage()==='zh'?'ENG':'中文';
  toggle.lang=getLanguage()==='zh'?'en':'zh-CN';
  document.querySelectorAll('[data-sidebar-toggle]').forEach(button=>{
    const section={boards:t('工作空间'),factions:t('阵营'),people:t('人物档案')}[button.dataset.sidebarToggle];
    button.title=t(button.getAttribute('aria-expanded')==='true'?'折叠{section}':'展开{section}',{section});
  });
  render();
}
function changeLanguage(language){
  const form=tutorialOpen&&tutorialSteps[tutorialStep].id==='profile'?new FormData($('#editor')):null;
  setLanguage(language);applyLanguage();
  if(tutorialOpen){
    if(form){
      preparingTutorial=true;personModal('guide-a');preparingTutorial=false;
      for(const name of ['name','alias','role','notes'])$('#editor [name="'+name+'"]').value=form.get(name)||'';
      $('#editor [name="color"][value="'+form.get('color')+'"]').checked=true;
    }
    renderTutorial();
  }
}
function showTutorial(){
  if(tutorialOpen)return;
  if(layoutBusy||gesture){toast(t('请等当前操作完成，再开始教程。'));return;}
  tourSession={data,history,selectedId,selected:new Set(selected),multi,factionFilter,query,view,camera:{...camera},area:cameraArea(),preFocusCamera,detailsExpanded,touchMove,connectionEditing,connectionDraft,menuOpen:$('#sidebar').classList.contains('open'),sections:[...document.querySelectorAll('[data-sidebar-toggle]')].map(button=>({button,expanded:button.getAttribute('aria-expanded')})),saveKey:$('#save-status').dataset.i18n};
  if(modal.open)modal.close();
  tutorialOpen=true;history=[];const practice=practiceBoard();
  data={version:SCHEMA_VERSION,activeId:practice.id,boards:[practice]};
  clearTimeout(toastTimer);$('#toast').hidden=true;
  spotlight??=new Spotlight({onAction:action=>{
    if(action==='exit'||action==='finish')finishTutorial();
    else if(action==='back'&&tutorialStep>0)enterTutorialStep(tutorialStep-1);
    else if(action==='skip')enterTutorialStep(tutorialStep+1);
    else if(action==='locate')locateTutorialTarget();
    else if(action==='language')changeLanguage(getLanguage()==='zh'?'en':'zh');
  },onEscape:finishTutorial});
  enterTutorialStep(0);
}
function enterTutorialStep(index){
  if(!tutorialOpen)return;
  if(index>=tutorialSteps.length){finishTutorial();return;}
  tutorialStep=Math.max(0,index);preparingTutorial=true;
  if(modal.open)modal.close();
  document.activeElement?.blur();closeMenu();resetSelection();connectionEditing=false;touchMove=false;
  const id=tutorialSteps[tutorialStep].id;
  render();
  if(['edit','profile','connect','target','relation'].includes(id))selectPerson('guide-a');
  if(id==='profile')personModal('guide-a');
  if(['target','relation'].includes(id))beginConnection();
  if(id==='relation'){chooseConnectionTarget('guide-b');connectionEditing=isCompact();detailsExpanded=true;render();}
  if(id==='members'){view='factions';render();}
  if(id==='done'){selectFaction('guide-f1');openMenu();}
  setSaveStatus('练习模式 · 不会保存');preparingTutorial=false;
  renderTutorial();locateTutorialTarget();
}
function renderTutorial(){
  const step=tutorialSteps[tutorialStep],last=tutorialStep===tutorialSteps.length-1;
  spotlight.show(step,`<div class="tour-top"><span>${t('练习')}</span><button data-tour-action="exit" aria-label="${t('退出教程')}" title="${t('退出教程')}">${icon('close')}</button></div>
    <div class="tour-heading"><span class="tour-number">${String(tutorialStep+1).padStart(2,'0')} / ${tutorialSteps.length}</span><h2 id="tour-title" tabindex="-1">${t(step.title)}</h2></div><p>${t(step.body)}</p>
    <div class="tour-footer"><button data-tour-action="back" ${tutorialStep===0?'disabled':''}>${t('上一步')}</button><button data-tour-action="language" lang="${getLanguage()==='zh'?'en':'zh-CN'}">${getLanguage()==='zh'?'English':'中文'}</button><button class="tour-locate" data-tour-action="locate" title="${t('重新定位高亮区域')}" aria-label="${t('重新定位高亮区域')}">${icon('fit')}</button><button class="${last?'button primary':'tour-skip-step'}" data-tour-action="${last?'finish':'skip'}">${t(last?'完成练习':'跳过这步')}${icon(last?'check':'arrow')}</button></div>`);
}
function locateTutorialTarget(){
  if(!tutorialOpen)return;
  const step=tutorialSteps[tutorialStep];
  if(step.id==='done')openMenu();
  const person=step.id==='character'?character('guide-a'):step.id==='target'?character('guide-b'):null;
  const group=step.id==='members'?factionPositions().find(f=>f.id==='guide-f1'):null;
  if(person||group){camera=centeredCamera(person||group,cameraArea(),person?1:.85);updateCamera();}
  else if(!modal.open&&step.id!=='done')fit();
  if(step.form)$(step.id==='profile'?'#editor [name="name"]':'#connection-form [name="label"]')?.scrollIntoView({block:'nearest'});
  spotlight.schedule();
}
function tutorialEvent(event,id){
  if(!tutorialOpen||preparingTutorial||tutorialSteps[tutorialStep].event!==event)return;
  if(event==='person-selected'&&(id!=='guide-a'||selectedId!==id))return;
  if(event==='target-selected'&&id!=='guide-b')return;
  if(event==='faction-selected'&&id!=='guide-f1')return;
  enterTutorialStep(tutorialStep+1);
}
function finishTutorial(){
  if(!tutorialOpen)return;
  const previous=tourSession;tutorialOpen=false;tourSession=null;markTutorialSeen();
  document.activeElement?.blur();if(modal.open)modal.close();spotlight.hide();
  clearRecentRelation();clearTimeout(toastTimer);$('#toast').hidden=true;
  gesture=null;pinch=null;touchPoints.clear();suppressTouch=false;graph.classList.remove('dragging');
  ({data,history,selectedId,selected,multi,factionFilter,query,view,camera,preFocusCamera,detailsExpanded,touchMove,connectionEditing,connectionDraft}=previous);
  $('#search').value=query;$('#sidebar').classList.toggle('open',previous.menuOpen);
  for(const {button,expanded} of previous.sections){if(button.getAttribute('aria-expanded')!==expanded)toggleSidebarSection(button);}
  render();camera=resizedCamera(camera,previous.area,cameraArea());updateCamera();
  setSaveStatus(previous.saveKey||'已保存到此浏览器');
  if(previous.menuOpen&&isCompact())$('.mobile-nav-close').focus({preventScroll:true});else graph.focus({preventScroll:true});
}
modal.addEventListener('cancel',event=>{if(tutorialOpen){event.preventDefault();finishTutorial();}});
function toggleSidebarSection(button){
  const panel=$('#'+button.getAttribute('aria-controls')),expanded=button.getAttribute('aria-expanded')==='true';
  panel.hidden=expanded;
  button.setAttribute('aria-expanded',String(!expanded));
  button.title=t(expanded?'展开{section}':'折叠{section}',{section:({boards:t('工作空间'),factions:t('阵营'),people:t('人物档案')}[button.dataset.sidebarToggle])});
  button.closest('.side-section').classList.toggle('is-collapsed',expanded);
}
function handleAction(action){
  if(['new-board','edit-board','add-person','edit-template','add-relation','all-factions','import','help'].includes(action))closeMenu();
  if(connectionDraft&&['new-board','edit-board','add-person','edit-person','multi','start-group','clear-selection','all-factions','import','help'].includes(action)){connectionDraft=null;render();}
  switch(action){
    case 'language':changeLanguage(getLanguage()==='zh'?'en':'zh');break;
    case 'language-zh':changeLanguage('zh');break;case 'language-en':changeLanguage('en');break;
    case 'tutorial':showTutorial();break;
    case 'tutorial-next':if(tutorialOpen)enterTutorialStep(tutorialStep+1);break;
    case 'tutorial-prev':if(tutorialOpen&&tutorialStep>0)enterTutorialStep(tutorialStep-1);break;
    case 'tutorial-finish':finishTutorial();break;
    case 'auto-layout':void tidyLayout();break;
    case 'toggle-detail':toggleDetail();break;
    case 'touch-move':touchMove=!touchMove;renderSidebar();break;
    case 'start-connection':beginConnection();break;
    case 'cancel-connection':if(tutorialOpen)enterTutorialStep(3);else cancelConnection();break;
    case 'new-board':boardModal();break;case 'edit-board':boardModal(true);break;
    case 'edit-template':characterTemplateModal();break;
    case 'add-person':personModal();break;case 'edit-person':personModal(selectedId);break;case 'add-relation':relationModal();break;
    case 'multi':multi=!multi;selected.clear();selectedId=null;render();fit();break;
    case 'start-group':view='people';multi=true;selectedId=null;render();fit();break;
    case 'end-multi':multi=false;selected.clear();render();break;
    case 'create-faction':if(selected.size)factionModal();break;
    case 'clear-selection':clearFocus();break;
    case 'all-factions':factionFilter=null;selectedId=null;query='';$('#search').value='';render();fit();break;
    case 'undo':undo();break;case 'zoom-in':zoom(1.2);break;case 'zoom-out':zoom(1/1.2);break;case 'zoom-reset':resetZoom();break;case 'fit':fit();break;
    case 'export':exportCurrent();break;case 'import':$('#import-file').click();break;case 'help':help();break;
    case 'close-modal':if(tutorialOpen)enterTutorialStep(tutorialStep-1);else modal.close();break;case 'menu':openMenu();break;case 'close-menu':closeMenu(true);break;
    case 'delete-person':{const p=character(selectedId);if(p)confirmDelete(t('删除人物'),t('确定删除“{name}”吗？相关连线与阵营成员记录也将删除。',{name:p.name}),()=>removeCharacter(board(),p.id));break;}
    case 'delete-board':{const b=board();confirmDelete(t('删除图谱'),t('确定删除“{name}”及其中全部人物、关系和阵营吗？建议先导出备份。',{name:b.name}),()=>{data.boards=data.boards.filter(x=>x.id!==b.id);if(!data.boards.length)data.boards.push(createBoard({name:t('未命名图谱')}));data.activeId=data.boards[0].id;resetSelection();});break;}
  }
}
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-sidebar-toggle],[data-action],[data-person],[data-faction],[data-board],[data-view],[data-relation],[data-edit-faction],[data-delete-relation],[data-delete-faction]');if(!el||graph.contains(el))return;
  if(el.dataset.sidebarToggle){toggleSidebarSection(el);return;}
  if(el.dataset.action)handleAction(el.dataset.action);
  else if(el.dataset.person)selectPerson(el.dataset.person,event.shiftKey);
  else if(el.dataset.faction)selectFaction(el.dataset.faction);
  else if(el.dataset.board){data.activeId=el.dataset.board;resetSelection();save();render();fit();closeMenu();}
  else if(el.dataset.view){connectionDraft=null;clearRecentRelation();view=el.dataset.view;selectedId=null;selected.clear();multi=false;factionFilter=null;query='';$('#search').value='';render();fit();if(view==='factions')tutorialEvent('view-factions');}
  else if(el.dataset.relation)relationModal(el.dataset.relation);
  else if(el.dataset.editFaction)factionModal(el.dataset.editFaction);
  else if(el.dataset.deleteRelation){const id=el.dataset.deleteRelation;confirmDelete(t('删除关系'),t('确定删除这条关系吗？人物档案会保留。'),()=>{board().relations=board().relations.filter(r=>r.id!==id);});}
  else if(el.dataset.deleteFaction){const id=el.dataset.deleteFaction;confirmDelete(t('解散阵营'),t('确定解散这个阵营吗？成员人物与关系会保留。'),()=>{board().factions=board().factions.filter(f=>f.id!==id);});}
});
$('#search').addEventListener('input',event=>{query=event.target.value;if(!connectionDraft)selectedId=null;render();});
$('#import-file').addEventListener('change',async event=>{await importFile(event.target.files[0]);event.target.value='';});
document.addEventListener('focusin',event=>{
  if(isCompact()&&!connectionEditing&&event.target.closest('#connection-form input, #connection-form textarea, #connection-form select')){
    const before=cameraArea();connectionEditing=true;syncCompactUI();camera=resizedCamera(camera,before,cameraArea());updateCamera();
  }
});
document.addEventListener('keydown',event=>{
  if(tutorialOpen||modal.open)return;
  if(event.key==='Escape'&&isCompact()&&$('#sidebar').classList.contains('open')){closeMenu(true);return;}
  const typing=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable;
  if(!typing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo();}
  if(event.key==='Escape'&&connectionDraft){event.preventDefault();cancelConnection();return;}
  if(event.key==='Escape'){clearRecentRelation();multi=false;factionFilter=null;closeMenu();clearFocus();}
});
graph.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const n=event.target.closest('[data-node],[data-relation],[data-group-node]');if(n){event.preventDefault();if(n.dataset.node)selectPerson(n.dataset.node,event.shiftKey);else if(n.dataset.relation&&!connectionDraft)relationModal(n.dataset.relation);else if(n.dataset.groupNode)selectFaction(n.dataset.groupNode);}}});
graph.addEventListener('wheel',event=>{event.preventDefault();const rect=graph.getBoundingClientRect();zoom(Math.exp(-event.deltaY*.0015),event.clientX-rect.left,event.clientY-rect.top);},{passive:false});
function hoverConnectionTarget(event){
  if(!connectionDraft||connectionDraft.target||gesture)return;
  const node=event.target.closest('[data-node]');
  const id=node?.dataset.node;
  const next=id&&id!==connectionDraft.source?id:null;
  if(connectionDraft.hover!==next){connectionDraft.hover=next;updateConnectionPreview();}
}
graph.addEventListener('pointerover',hoverConnectionTarget);
graph.addEventListener('focusin',hoverConnectionTarget);
graph.addEventListener('pointerleave',()=>{
  if(connectionDraft?.hover){connectionDraft.hover=null;updateConnectionPreview();}
});
function touchPoint(event){const rect=graph.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
function rollbackDrag(g){
  if(g?.checkpoint&&history.at(-1)===g.undoSnapshot){data=history.pop();save();render();}
}
function startPinch(){
  rollbackDrag(gesture);gesture=null;dragged=false;graph.classList.remove('dragging');
  pinch={camera:{...camera},points:[...touchPoints.values()].slice(0,2)};suppressTouch=true;
}
graph.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  if(event.pointerType==='touch'){
    touchPoints.set(event.pointerId,touchPoint(event));graph.setPointerCapture(event.pointerId);
    if(touchPoints.size>=2){startPinch();return;}
    if(suppressTouch)return;
  }
  if(gesture)return;
  const node=event.target.closest('[data-node]'),relation=event.target.closest('[data-relation]'),group=event.target.closest('[data-group-node]');
  const p=node?character(node.dataset.node):null,f=group?factionPositions().find(f=>f.id===group.dataset.groupNode):null;
  gesture={pointerId:event.pointerId,touch:event.pointerType==='touch',startX:event.clientX,startY:event.clientY,camera:{...camera},person:p?{id:p.id,x:p.x,y:p.y}:null,relation:relation?.dataset.relation,group:f?{id:f.id,x:f.x,y:f.y}:null,shift:event.shiftKey,checkpoint:false};
  dragged=false;graph.setPointerCapture(event.pointerId);
});
graph.addEventListener('pointermove',event=>{
  if(touchPoints.has(event.pointerId)){
    touchPoints.set(event.pointerId,touchPoint(event));
    if(pinch&&touchPoints.size>=2){camera=pinchedCamera(pinch.camera,pinch.points,[...touchPoints.values()].slice(0,2));updateCamera();return;}
    if(suppressTouch)return;
  }
  if(!gesture||gesture.pointerId!==event.pointerId)return;
  const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
  if(Math.hypot(dx,dy)<(gesture.touch?10:4)&&!dragged)return;
  dragged=true;graph.classList.add('dragging');
  const moveNode=!gesture.touch||touchMove;
  if(moveNode&&gesture.person&&!multi&&!gesture.shift&&!connectionDraft){
    if(!gesture.checkpoint){checkpoint();gesture.checkpoint=true;gesture.undoSnapshot=history.at(-1);}
    const p=character(gesture.person.id);
    p.x=Math.round(Math.max(-99900,Math.min(99900,gesture.person.x+dx/camera.k)));p.y=Math.round(Math.max(-99900,Math.min(99900,gesture.person.y+dy/camera.k)));
    if(!frame)frame=requestAnimationFrame(()=>{renderGraph();frame=null;});
  }else if(moveNode&&gesture.group&&view==='factions'){
    if(!gesture.checkpoint){
      const positions=factionPositions();checkpoint();gesture.checkpoint=true;gesture.undoSnapshot=history.at(-1);
      for(const p of positions){const f=board().factions.find(f=>f.id===p.id);f.x=p.x;f.y=p.y;}
    }
    const f=board().factions.find(f=>f.id===gesture.group.id);
    if(f){f.x=Math.round(Math.max(-99900,Math.min(99900,gesture.group.x+dx/camera.k)));f.y=Math.round(Math.max(-99900,Math.min(99900,gesture.group.y+dy/camera.k)));}
    if(!frame)frame=requestAnimationFrame(()=>{renderGraph();frame=null;});
  }else{camera.x=gesture.camera.x+dx;camera.y=gesture.camera.y+dy;updateCamera();}
});
function finishPointer(event,canceled=false){
  if(touchPoints.has(event.pointerId)){
    touchPoints.delete(event.pointerId);
    if(pinch||suppressTouch){
      if(graph.hasPointerCapture(event.pointerId))graph.releasePointerCapture(event.pointerId);
      pinch=touchPoints.size>=2?{camera:{...camera},points:[...touchPoints.values()].slice(0,2)}:null;
      if(!touchPoints.size)suppressTouch=false;
      gesture=null;graph.classList.remove('dragging');return;
    }
  }
  if(!gesture||gesture.pointerId!==event.pointerId)return;
  const g=gesture;gesture=null;graph.classList.remove('dragging');
  if(graph.hasPointerCapture(event.pointerId))graph.releasePointerCapture(event.pointerId);
  if(canceled){rollbackDrag(g);return;}
  if(dragged){if(g.checkpoint){save();render();}return;}
  if(g.person)selectPerson(g.person.id,g.shift);else if(g.relation&&!connectionDraft)relationModal(g.relation);else if(g.group)selectFaction(g.group.id);else if(selectedId&&!connectionDraft)clearFocus();
}
graph.addEventListener('pointerup',event=>finishPointer(event));graph.addEventListener('pointercancel',event=>finishPointer(event,true));
graph.addEventListener('lostpointercapture',event=>finishPointer(event,true));
function syncViewportHeight(){
  const viewport=window.visualViewport;
  if(isCompact()&&viewport&&Math.abs(viewport.scale-1)<.01){
    document.documentElement.style.setProperty('--visible-height',viewport.height+'px');
    document.documentElement.style.setProperty('--viewport-top',viewport.offsetTop+'px');
  }else{document.documentElement.style.removeProperty('--visible-height');document.documentElement.style.removeProperty('--viewport-top');}
}
syncViewportHeight();window.visualViewport?.addEventListener('resize',syncViewportHeight);window.visualViewport?.addEventListener('scroll',syncViewportHeight);
window.addEventListener('resize',syncViewportHeight);
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resizeViewport,70);}).observe(canvas);

// Optional browser standard. Tools use the same state and UI actions.
function registerAgentTools(){
  const context=document.modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();
  const definitions=[
    {name:'read_relation_graph',title:t('读取当前关系图谱'),description:'Read the current board, characters, relations, and factions. Does not change data.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>exportBoard(board())},
    {name:'focus_relation_character',title:t('聚焦人物'),description:'Focus an existing character and their direct relationships in the visible graph. Does not edit records.',inputSchema:{type:'object',properties:{characterId:{type:'string'}},required:['characterId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(!input||typeof input.characterId!=='string'||!character(input.characterId))throw Error('Unknown characterId');connectionDraft=null;multi=false;selected.clear();selectPerson(input.characterId);return {focusedCharacterId:selectedId,relatedCharacterIds:[...neighborhood(board(),selectedId)].filter(id=>id!==selectedId)};}}
  ];for(const definition of definitions){try{Promise.resolve(context.registerTool(definition,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
document.fonts?.ready.then(()=>fitGraphLabels(scene,true));
hydrateIcons();applyLanguage();requestAnimationFrame(fit);registerAgentTools();
if(loadWarning){setSaveStatus('读取失败 · 请导出备份');setTimeout(()=>toast(loadWarning),400);}else save();
if(!hasSeenTutorial()&&!storageBlocked)requestAnimationFrame(showTutorial);
