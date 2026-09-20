// The guide uses real controls on a temporary board, never on saved archives.
export const TUTORIAL_KEY='relation-net:tutorial:v1';
export const tutorialSteps=[
  {id:'character',title:'先点一下这个角色',body:'这是角色卡片。点击高亮的角色，看看他的档案和直接关系。',target:'[data-node="guide-a"]',event:'person-selected'},
  {id:'edit',title:'这里是角色档案',body:'身份、所属阵营、笔记和关系都在这里。现在点“编辑档案”试一下。',target:'#detail',interactive:'#detail [data-action="edit-person"]',event:'edit-person'},
  {id:'profile',title:'试着修改角色资料',body:'你可以改名字、身份、颜色和笔记。试改一项，再点表单底部的“保存”。',target:'#editor',event:'person-saved',form:true},
  {id:'connect',title:'从这个角色发起连线',body:'点击高亮的“添加关系”。起点已经选好，接下来直接去画布选终点。',target:'#detail [data-action="start-connection"]',event:'start-connection'},
  {id:'target',title:'选择另一个角色',body:'点一下高亮的角色，两个角色之间就会出现待保存的连线。',target:'[data-node="guide-b"]',event:'target-selected'},
  {id:'relation',title:'给这段关系起个名字',body:'输入关系名称，选择类型和方向，再点“保存关系”。“其他”可以添加自定义类型。',target:'#detail',interactive:'#connection-form',event:'relation-saved',form:true},
  {id:'arrange',title:'让画面自动整理',body:'连线已经保存。点击“一键整理”，看看人物如何重新排列；平时也可以撤销。',target:'#auto-layout',event:'layout-finished'},
  {id:'factions',title:'换个角度看关系',body:'点击“阵营视图”，看看群体之间的联系。平时可以用“多选”选中人物，再组建阵营。',target:'[data-view="factions"]',event:'view-factions'},
  {id:'members',title:'点开一个阵营',body:'高亮的是一个阵营。点击它可以查看成员；阵营也支持拖动和一键整理。',target:'[data-group-node="guide-f1"]',event:'faction-selected'},
  {id:'done',title:'现在可以开始自己的故事了',body:'从这里新建或导入自己的图谱。侧栏的“导出”可以保存 JSON 备份。点击完成，回到原来的工作区。',target:'#sidebar',interactive:'.section-toggle',event:null}
];
export function practiceBoard(locale='zh'){
  const en=locale==='en';
  return {id:'guide-board',name:en?'Practice atlas':'练习图谱',kind:'其他',description:'',characters:[
    {id:'guide-a',name:en?'Lin':'小林',alias:'LIN',role:en?'Explorer':'探索者',notes:'',x:0,y:0,color:'#708f87'},
    {id:'guide-b',name:en?'Yao':'小遥',alias:'YAO',role:en?'Archivist':'记录员',notes:'',x:240,y:80,color:'#7b86a4'},
    {id:'guide-c',name:en?'Lan':'小岚',alias:'LAN',role:en?'Navigator':'领航员',notes:'',x:-130,y:210,color:'#708f87'}
  ],relations:[{id:'guide-r1',source:'guide-a',target:'guide-c',label:en?'Travel companions':'旅伴',kind:'cooperation',directed:false,notes:''}],factions:[
    {id:'guide-f1',name:en?'Explorers':'探索小队',description:'',color:'#708f87',members:['guide-a','guide-c'],x:0,y:0},
    {id:'guide-f2',name:en?'Archives':'档案馆',description:'',color:'#7b86a4',members:['guide-b'],x:330,y:100}
  ]};
}
function browserStorage(){try{return globalThis.localStorage;}catch{return undefined;}}
export function hasSeenTutorial(storage=browserStorage()){try{return storage?.getItem(TUTORIAL_KEY)==='done';}catch{return false;}}
export function markTutorialSeen(storage=browserStorage()){try{storage?.setItem(TUTORIAL_KEY,'done');}catch{/* The guide still works without storage. */}}
