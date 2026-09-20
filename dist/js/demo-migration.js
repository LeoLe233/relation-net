import {demoBoard,clone} from './model.js';

// Retain the old seed only to recognize saved, unedited English examples.
function legacyEnglishDemo() {
  const board=demoBoard();
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
  return board;
}

// Never translate arbitrary graphs or user-edited story text. Layout, colors,
// custom attributes and IDs survive restoration of an otherwise unchanged seed.
export function restoreChineseDemo(board) {
  const legacy=legacyEnglishDemo();
  if(!['name','kind','description'].every(key=>board[key]===legacy[key]))return board;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const match=(key,fields)=>board[key].length===legacy[key].length&&legacy[key].every(seed=>{
    const item=board[key].find(item=>item.id===seed.id);
    return item&&fields.every(field=>same(item[field],seed[field]));
  });
  if(!match('characters',['name','alias','role','notes'])||
     !match('relations',['source','target','label','kind','directed','notes'])||
     !match('factions',['name','description','members']))return board;
  const chinese=demoBoard(),restored=clone(board);
  restored.name=chinese.name;restored.description=chinese.description;
  for(const [key,fields] of [['characters',['name','role','notes']],['relations',['label']],['factions',['name','description']]]){
    for(const item of restored[key]){
      const seed=chinese[key].find(seed=>seed.id===item.id);
      for(const field of fields)item[field]=seed[field];
    }
  }
  return restored;
}
