const fs=require('node:fs'),path=require('node:path');const {Model}=require('../src/model.js'),{ParticleView}=require('../src/particles.js');
const root=path.resolve(__dirname,'..'),file=n=>path.join(root,'qa',n),baseline=JSON.parse(fs.readFileSync(path.join(root,'docs','v0.2.0-reproduction.json'),'utf8')),cases=[];
for(const [index,config]of [{insideWater:40,outsideWater:560,insideSalt:120,outsideSalt:0},{insideWater:560,outsideWater:40,insideSalt:0,outsideSalt:120}].entries()){
 const m=new Model(config),v=new ParticleView(m);for(let n=0;n<80000&&!m.limit;n++){const t=m.time;m.step();v.update(m,m.time-t);}const frozen=JSON.stringify(m),before=v.maximumMarkerError(m);let time=0;
 while(v.hasReplay(m)&&time<5){v.settle(m,.01);time+=.01;}
 cases.push({case:baseline.cases[index].name,oldErrorInMarkers:baseline.cases[index].maximumMarkerError,beforeSettling:before,afterSettling:v.maximumMarkerError(m),displaySeconds:time,modelUnchanged:JSON.stringify(m)===frozen,modelTime:m.time,pending:v.hasReplay(m)});
}
const m=new Model({waterPermeable:false,saltPermeable:false}),v=new ParticleView(m);m.transfer('water','in',60);v.ingest(m);const frozen=JSON.stringify(m),radiusError=v.cellRadius(m)-v.radius;let time=0;
while(v.hasReplay(m)&&time<5){v.settle(m,.01);time+=.01;}
cases.push({case:'paused-manual-water',oldErrorInMarkers:baseline.cases[2].maximumMarkerError,afterSettling:v.maximumMarkerError(m),displaySeconds:time,radiusError,oldRadiusError:baseline.cases[2].targetRadius-baseline.cases[2].geometryRadius,modelUnchanged:JSON.stringify(m)===frozen});
if(cases.some(c=>!c.modelUnchanged||c.pending||c.afterSettling>1.5+1e-8))throw new Error('同步範例驗證失敗。');
fs.writeFileSync(file('synchronization-evidence.json'),JSON.stringify({version:require('../package.json').version,createdAt:new Date().toISOString(),cases,quantization:'固定代表重量會取整；本輪單一配額種類驗收 1.5 顆，混合自然／人為配額驗收 2.5 顆，不把兩種配額互相挪用。'},null,2));
console.log('PASS：動畫同步前後的量化證據已保存至 qa/synchronization-evidence.json。');
