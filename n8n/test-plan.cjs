const fs=require('fs');
const code=fs.readFileSync(__dirname+'/plan-sync.js','utf8');
const head=["Category 1","Category 2","Category 3","Item 1","Next photo 1","Manual photo 1","Item 2","Next photo 2","Manual photo 2","Item 3","Next photo 3","Manual photo 3","Company","Price before","Price after","Style","Details","Image link","Product image","Photo status","Feedback","Preview","Photo #","Post date","Post time","Scheduled for","Caption","Caption style","FB status","IG status","Cached from","FB photo id","FB post id","Scheduled price","Scheduled image","Auto reschedule","Reschedule slot","Poster price","Clear published ▶","FALSE","Clear all ▶","FALSE","status"];
const blank=()=>["","","","","FALSE","","","FALSE","","","FALSE","","","","","Static"];
const r1=["Acc","","","Pad A","FALSE","","","FALSE","","","FALSE","","Fantech","950","599","Static","","https://drive.google.com/file/d/X/view","","OK","Done","","1","2026-11-09","17:00","2026-11-09 17:00","cap\nline","black friday","Published"];
const r2=["MB","CPU","","Board B","FALSE","","Chip C","FALSE","http://x/y.png","","FALSE","","","1,500","1,499","Static","","","","","Ignore"];
const posts=[head,r1,r2,blank(),blank()];
const run=(over)=>{
  const st=over.sd||{};
  const nodes={
    'Settings':[{json:{projectId:'P',postsSheetId:0,dryRun:false}}],
    'Check memory':[{json:{full:!!over.full}}],
    'Read sheet':[{json:{valueRanges:[{values:posts},{values:[["MB Name","MB Price","MB Company","CPU Name","CPU Price","CPU Company"],["Board B","1500","Asus","Chip C","900","AMD"],[" ","5",""]]},{values:[["Static"],["Static BlackFriday"]]},{values:[["Template","Caption text","Notes"],["Default","🔵 {name}","n"]]}]}}],
    'Read row ids':[{json:over.md||{}}],
    'Get app changes':(over.docs||[{readTime:'x'}]).map(json=>({json})),
  };
  const $=n=>({first:()=>nodes[n][0],all:()=>nodes[n]});
  const out=new Function('$','$getWorkflowStaticData','$input',code)($,()=>st,null);
  return out[0].json;
};
const show=o=>console.log(JSON.stringify({stats:o.stats,notes:o.notes,sheet:o.sheetRequests,meta:o.meta,base:o.base},null,0));
console.log('--- first full run, nothing tagged');
let o=run({full:true}); show(o);
console.log(JSON.stringify(o.writes[1]).slice(0,900));
const md={matchedDeveloperMetadata:[
 {developerMetadata:{metadataId:1,metadataKey:'p',metadataValue:'AAAAAAAAAA',location:{locationType:'ROW',dimensionRange:{dimension:'ROWS',startIndex:1,endIndex:2}}}},
 {developerMetadata:{metadataId:2,metadataKey:'p',metadataValue:'BBBBBBBBBB',location:{locationType:'ROW',dimensionRange:{dimension:'ROWS',startIndex:2,endIndex:3}}}},
 {developerMetadata:{metadataId:3,metadataKey:'p',metadataValue:'STALE',location:{locationType:'ROW',dimensionRange:{dimension:'ROWS',startIndex:3,endIndex:4}}}},
 {developerMetadata:{metadataId:4,metadataKey:'p',metadataValue:'DUP',location:{locationType:'ROW',dimensionRange:{dimension:'ROWS',startIndex:1,endIndex:2}}}},
]};
const fv=o=>{const f={};for(const k in o){const v=o[k];f[k]=typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(x=>({mapValue:{fields:fv(x)}}))}}:{mapValue:{fields:fv(v)}}}return f};
const docs=[
 {document:{name:'projects/P/databases/(default)/documents/posts/AAAAAAAAAA',updateTime:'t1',fields:fv({appDirty:true,appEdits:{feedback:'ignore',caption:'new cap',postDate:'2026-11-20',postTime:'9:30',priceAfter:'599',style:'',items:[{name:'Pad A',manualPhoto:'http://m/p.png',nextPhoto:true}]}})}},
 {document:{name:'projects/P/databases/(default)/documents/posts/NEWDOC12345678901234',updateTime:'t2',fields:fv({appDirty:true,appNew:true,items:[{category:'MB',name:'Board B',manualPhoto:'',nextPhoto:false}],priceAfter:'1400',style:'Static BlackFriday',details:'d',postDate:'2026-11-21',postTime:'17:15',captionStyle:'Short'})}},
 {document:{name:'projects/P/databases/(default)/documents/posts/BBBBBBBBBB',updateTime:'t3',fields:fv({appDirty:true,appDeleted:true})}},
 {document:{name:'projects/P/databases/(default)/documents/posts/GHOST',updateTime:'t4',fields:fv({appDirty:true,appEdits:{feedback:'Done'}})}},
];
console.log('--- quick run with tags, edits, new post, delete, ghost, cache');
o=run({md,docs,sd:{hash:{AAAAAAAAAA:'zz',BBBBBBBBBB:'yy',OLDONE:'q'},catalog:{}}}); show(o);
console.log(JSON.stringify(o.writes.slice(0,4)));
