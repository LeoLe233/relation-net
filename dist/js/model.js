export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'relation-net:v1';
export const colors = ['#708f87','#ad8269','#7b86a4','#a08da4','#8b9673','#729aaa'];
export const relationKinds = { cooperation: {name:'合作',color:'#748d86'}, conflict: {name:'冲突',color:'#b08371'}, other: {name:'其他',color:'#7e879b'} };
export const CUSTOM_KIND = '__custom__';
const customKindColors = ['#8874a6','#4d929d','#a58a47','#a36c88','#6586b4','#858d56'];
export function relationKind(board,id) {
  return Object.hasOwn(relationKinds,id)?relationKinds[id]:board.relationTypes?.find(t=>t.id===id)??relationKinds.other;
}
// Preparing a type never changes data; commit it together with the relationship.
export function prepareRelationKind(board,kind,name='') {
  if(kind!==CUSTOM_KIND){
    if(!Object.hasOwn(relationKinds,kind)&&!board.relationTypes?.some(t=>t.id===kind))throw Error('请选择有效的关系类型。');
    return {kind,type:null};
  }
  name=name.trim();
  if(!name||name.length>60)throw Error('请填写自定义关系类型（1–60 个字符）。');
  const existing=Object.entries(relationKinds).find(([id,t])=>id!=='other'&&t.name===name);
  if(existing)return {kind:existing[0],type:null};
  const match=board.relationTypes?.find(t=>t.name.toLocaleLowerCase()===name.toLocaleLowerCase());
  if(match)return {kind:match.id,type:null};
  if((board.relationTypes?.length??0)>=100)throw Error('每张图谱最多支持 100 个自定义关系类型。');
  const type={id:'type-'+uid(),name,color:customKindColors[(board.relationTypes?.length??0)%customKindColors.length]};
  return {kind:type.id,type};
}
export const uid = () => globalThis.crypto?.randomUUID?.() ?? 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
export const clone = x => JSON.parse(JSON.stringify(x));
export const MAX_CHARACTER_FIELDS = 30;
export function prepareCharacterTemplate(fields) {
  if(!Array.isArray(fields)||fields.length>MAX_CHARACTER_FIELDS)throw Error('每张图谱最多支持 30 个角色属性。');
  const ids=new Set(),names=new Set();
  return fields.map(field=>{
    if(!field||typeof field.id!=='string'||!field.id.trim()||field.id.length>100||field.id!==field.id.trim()||ids.has(field.id))throw Error('角色属性 ID 无效或重复。');
    if(typeof field.name!=='string'||!field.name.trim()||field.name.trim().length>60)throw Error('请填写属性名称（1–60 个字符）。');
    const name=field.name.trim(),key=name.toLocaleLowerCase();
    if(names.has(key))throw Error('角色属性名称不能重复。');
    ids.add(field.id);names.add(key);
    return {id:field.id,name};
  });
}
export function validateCharacterAttributes(fields,values) {
  if(!values||typeof values!=='object'||Array.isArray(values))throw Error('角色属性内容必须为文本。');
  const ids=new Set(fields.map(field=>field.id));
  return Object.fromEntries(Object.entries(values).map(([id,value])=>{
    if(!ids.has(id))throw Error('角色属性未在模板中定义。');
    if(typeof value!=='string'||value.length>10000)throw Error('每项角色属性须为不超过 10,000 字符的文本。');
    return [id,value.trim()];
  }));
}
// Stable field IDs keep values attached when labels change. Call within one undoable edit.
export function setCharacterTemplate(board,fields) {
  const template=prepareCharacterTemplate(fields),ids=new Set(template.map(field=>field.id));
  board.characterTemplate=template;
  for(const person of board.characters){
    if(person.attributes)person.attributes=Object.fromEntries(Object.entries(person.attributes).filter(([id])=>ids.has(id)));
  }
}
export const escapeHtml = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function demoBoard(locale='zh') {
  const board = {
    id:uid(), name:'雾港档案', kind:'游戏', description:'一座被浓雾包围的港城，三方势力与十二位人物。全部人物与关系均为原创演示，可自由编辑。',
    characters:[
      {id:'p1',name:'林雾',alias:'LIN WU',role:'灯塔守望者',notes:'负责记录港城的异常潮汐。在旧港长大，如今为灯塔议会工作，与不同阵营的人都有联系。',x:570,y:280,color:'#708f87'},
      {id:'p2',name:'沈砚',alias:'SHEN YAN',role:'议会档案官',notes:'保管灯塔里的旧档案，相信每一段关系都藏着理解这座城市的线索。',x:785,y:170,color:'#708f87'},
      {id:'p3',name:'白榆',alias:'BAI YU',role:'潮汐研究员',notes:'研究雾与潮汐的关系。与林雾一起调查灯塔熄灭的原因。',x:840,y:425,color:'#708f87'},
      {id:'p4',name:'时雨',alias:'SHI YU',role:'见习守望者',notes:'刚刚加入灯塔议会，跟随林雾学习港城的历史。',x:620,y:545,color:'#708f87'},
      {id:'p5',name:'陆川',alias:'LU CHUAN',role:'旧港领航员',notes:'熟悉每条水路，是林雾从小的朋友。始终站在旧港居民一边。',x:195,y:160,color:'#ad8269'},
      {id:'p6',name:'江屿',alias:'JIANG YU',role:'船坞机械师',notes:'修复废弃船只，偶尔替调查局维修设备。',x:270,y:365,color:'#ad8269'},
      {id:'p7',name:'温岚',alias:'WEN LAN',role:'街区医生',notes:'经营旧港唯一的诊所，也为不同阵营的伤者提供帮助。',x:160,y:580,color:'#ad8269'},
      {id:'p8',name:'阿澈',alias:'A CHE',role:'港口信使',notes:'穿梭于旧港与灯塔之间，知道许多未被记入档案的故事。',x:405,y:650,color:'#ad8269'},
      {id:'p9',name:'顾远',alias:'GU YUAN',role:'调查局负责人',notes:'认为港城的安全应由调查局统一负责，与议会理念不合。',x:1090,y:130,color:'#7b86a4'},
      {id:'p10',name:'程墨',alias:'CHENG MO',role:'外勤调查员',notes:'负责异常事件现场调查，在职责与个人信任之间寻找平衡。',x:1100,y:355,color:'#7b86a4'},
      {id:'p11',name:'许遥',alias:'XU YAO',role:'情报分析员',notes:'善于把零散的线索拼成完整的图景。',x:1110,y:580,color:'#7b86a4'},
      {id:'p12',name:'闻溪',alias:'WEN XI',role:'无线电联络员',notes:'监听港外的无线电信号，与旧港信使保持秘密联系。',x:895,y:685,color:'#7b86a4'}
    ],
    factions:[{id:'f1',name:'灯塔议会',description:'守护灯塔，研究港城的过去。',color:'#708f87',members:['p1','p2','p3','p4']},{id:'f2',name:'旧港同盟',description:'由港口居民组成的互助组织。',color:'#ad8269',members:['p5','p6','p7','p8']},{id:'f3',name:'灰线调查局',description:'调查雾港的异常事件。',color:'#7b86a4',members:['p9','p10','p11','p12']}],
    relations:[
      ['p1','p2','共同调查','cooperation',false],['p1','p3','研究搭档','cooperation',false],['p1','p4','指导','cooperation',true],['p1','p5','儿时好友','other',false],['p1','p10','交换线索','cooperation',false],['p2','p9','理念分歧','conflict',false],['p3','p6','技术协作','cooperation',false],['p5','p6','同盟','cooperation',false],['p6','p7','邻里互助','cooperation',false],['p7','p8','照顾','other',true],['p8','p12','秘密联络','other',false],['p9','p10','指挥','other',true],['p10','p11','行动搭档','cooperation',false],['p11','p12','情报协作','cooperation',false],['p5','p9','立场对立','conflict',false],['p4','p8','朋友','other',false]
    ].map(([source,target,label,kind,directed],i)=>({id:'r'+i,source,target,label,kind,directed,notes:''}))
  };
  // Translate only a newly created demo, never saved or imported user content.
  if(locale==='en'){
    board.name='Fog Harbor Archives';
    board.description='A fogbound port city, three factions, and twelve characters. This original fictional demo is yours to explore and edit.';
    const people=[
      ['Lin Wu','Lighthouse keeper','Records unusual tides in the harbor. Raised in the old port, Lin now works for the Lighthouse Council and keeps ties across factions.'],
      ['Shen Yan','Council archivist','Keeps the lighthouse archives and believes every relationship holds a clue to the city’s past.'],
      ['Bai Yu','Tidal researcher','Studies the connection between fog and tides. Investigates the lighthouse blackout with Lin Wu.'],
      ['Shi Yu','Apprentice keeper','A new Council member learning the history of the harbor from Lin Wu.'],
      ['Lu Chuan','Harbor navigator','Knows every waterway and has been Lin Wu’s friend since childhood. Always stands with the old port residents.'],
      ['Jiang Yu','Dockyard mechanic','Restores abandoned boats and sometimes repairs equipment for the Investigation Bureau.'],
      ['Wen Lan','Neighborhood doctor','Runs the old port’s only clinic and treats people from every faction.'],
      ['A Che','Harbor courier','Travels between the old port and the lighthouse, carrying stories that never reach the archives.'],
      ['Gu Yuan','Bureau director','Believes the Bureau should oversee harbor security, putting Gu at odds with the Council.'],
      ['Cheng Mo','Field investigator','Investigates unusual incidents while balancing duty with personal trust.'],
      ['Xu Yao','Intelligence analyst','Connects scattered clues to build a complete picture.'],
      ['Wen Xi','Radio operator','Monitors signals from beyond the harbor and keeps secret contact with the old port courier.']
    ];
    board.characters.forEach((p,i)=>{[p.name,p.role,p.notes]=people[i];});
    const groups=[['Lighthouse Council','Guards the lighthouse and studies the city’s past.'],['Old Port Alliance','A mutual aid group formed by harbor residents.'],['Grayline Bureau','Investigates unusual incidents in Fog Harbor.']];
    board.factions.forEach((f,i)=>{[f.name,f.description]=groups[i];});
    const labels=['Joint investigation','Research partners','Mentors','Childhood friends','Share clues','Ideological dispute','Technical support','Allies','Neighborly help','Cares for','Secret contact','Commands','Field partners','Share intelligence','Opposing sides','Friends'];
    board.relations.forEach((r,i)=>{r.label=labels[i];});
  }
  return board;
}
export const createBoard = ({name,kind='书籍',description=''}) => ({id:uid(),name,kind,description,characters:[],relations:[],factions:[]});
export function neighborhood(board,id) {return new Set([id,...board.relations.filter(r=>r.source===id||r.target===id).flatMap(r=>[r.source,r.target])]);}
export function removeCharacter(board,id) {
  board.characters=board.characters.filter(p=>p.id!==id);
  board.relations=board.relations.filter(r=>r.source!==id&&r.target!==id);
  board.factions.forEach(f=>f.members=f.members.filter(m=>m!==id));
}
export function exportBoard(board) {return {format:'relation-net',version:SCHEMA_VERSION,exportedAt:new Date().toISOString(),board:clone(board)};}
export function validateImport(input) {
  const fail = message => {throw new Error(message);};
  if(!input||input.format!=='relation-net'||input.version!==SCHEMA_VERSION)fail('请选择 Relation Net v1 格式的 JSON 文件。');
  const b=input.board;
  if(!b||typeof b!=='object'||!Array.isArray(b.characters)||!Array.isArray(b.relations)||!Array.isArray(b.factions))fail('文件缺少人物、关系或阵营数据。');
  if(b.characters.length>500||b.relations.length>3000||b.factions.length>100)fail('每个图谱最多支持 500 人物、3,000 关系和 100 阵营。');
  const string=(v,max=200,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail('文件包含空名称或过长的文本。');return v.trim();};
  const color=v=>{if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))fail('文件包含无效颜色。');return v;};
  const unique=arr=>{const ids=arr.map(x=>string(x.id,100,true));if(new Set(ids).size!==ids.length)fail('文件包含重复的 ID。');return new Set(ids);};
  const people=unique(b.characters);unique(b.relations);unique(b.factions);
  const characterTemplate=b.characterTemplate===undefined?undefined:prepareCharacterTemplate(b.characterTemplate);
  const characters=b.characters.map(p=>{if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000)fail('文件包含无效人物坐标。');return {id:p.id,name:string(p.name,60,true),alias:string(p.alias??'',60),role:string(p.role??'',100),notes:string(p.notes??'',10000),color:color(p.color),x:p.x,y:p.y,...(p.attributes===undefined?{}:{attributes:validateCharacterAttributes(characterTemplate??[],p.attributes)})};});
  let relationTypes;
  if(b.relationTypes!==undefined){
    if(!Array.isArray(b.relationTypes)||b.relationTypes.length>100)fail('自定义关系类型最多支持 100 项。');
    unique(b.relationTypes);
    const names=new Set();
    relationTypes=b.relationTypes.map(t=>{
      if(Object.hasOwn(relationKinds,t.id)||t.id===CUSTOM_KIND)fail('自定义关系类型 ID 与内置类型冲突。');
      const name=string(t.name,60,true),key=name.toLocaleLowerCase();
      if(names.has(key))fail('自定义关系类型名称重复。');names.add(key);
      return {id:string(t.id,100,true),name,color:color(t.color)};
    });
  }
  const kinds=new Set([...Object.keys(relationKinds),...(relationTypes??[]).map(t=>t.id)]);
  const relations=b.relations.map(r=>{if(!people.has(r.source)||!people.has(r.target)||r.source===r.target)fail('关系连接的人物无效。');if(!kinds.has(r.kind)||typeof r.directed!=='boolean')fail('关系类型或方向无效。');return {id:r.id,source:r.source,target:r.target,label:string(r.label,60,true),kind:r.kind,directed:r.directed,notes:string(r.notes??'',10000)};});
  const factions=b.factions.map(f=>{
    if(!Array.isArray(f.members)||f.members.some(m=>!people.has(m)))fail('阵营成员不存在。');
    const position={};
    if(f.x!==undefined||f.y!==undefined){
      if(!Number.isFinite(f.x)||!Number.isFinite(f.y)||Math.abs(f.x)>100000||Math.abs(f.y)>100000)fail('文件包含无效阵营坐标。');
      position.x=f.x;position.y=f.y;
    }
    return {id:f.id,name:string(f.name,60,true),description:string(f.description??'',10000),color:color(f.color),members:[...new Set(f.members)],...position};
  });
  return {id:string(b.id,100,true),name:string(b.name,60,true),kind:['书籍','游戏','现实','其他'].includes(b.kind)?b.kind:'其他',description:string(b.description??'',10000),characters,relations,factions,...(relationTypes?{relationTypes}:{}),...(characterTemplate?{characterTemplate}:{})};
}
// Expand each card to form a real convex region around faction members.
export function factionHull(points) {
  const pts=points.flatMap(p=>[[-90,-78],[90,-78],[-90,87],[90,87]].map(([x,y])=>({x:p.x+x,y:p.y+y}))).sort((a,b)=>a.x-b.x||a.y-b.y);
  if(pts.length<3)return pts;
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[],upper=[];
  for(const p of pts){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(const p of [...pts].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
