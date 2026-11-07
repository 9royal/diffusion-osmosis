const {test}=require('node:test');const assert=require('node:assert/strict');
const {Model,Laboratory,DT,PRESETS}=require('../src/model.js');const {ParticleView,COLORS}=require('../src/particles.js');const {Playback}=require('../src/presentation.js');
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`);
function run(m,v,t){for(let i=0;i<Math.round(t/DT)&&!m.limit;i++){const before=m.time;m.step();v.update(m,m.time-before);}}
function settle(m,v,max=4){let elapsed=0;while(v.hasReplay(m)&&elapsed<max){v.settle(m,.01);elapsed+=.01;}assert.equal(v.hasReplay(m),false,'動畫沒有在測試時間內補完');return elapsed;}
function approved(m,v){for(const kind of ['natural','manual'])for(const type of ['water','salt'])for(let s=0;s<2;s++)for(let d=0;d<2;d++){const used=v.records.filter(r=>r.kind===kind&&r.type===type&&r.source===s&&r.direction===d).reduce((n,r)=>n+r.amount,0),allowed=(kind==='natural'?m.exchange:m.manual)[type][s][d];assert.ok(used<=allowed+1e-7,`${kind}/${type}/${s}/${d}: ${used} > ${allowed}`);}for(const r of v.records)assert.equal(r.color,COLORS[r.type][r.source]);}
test('上下界與三種顯示密度：停止後補完，來源誤差不超過 1.5 顆且模型完全不變',()=>{
 for(const density of [.5,1,1.5])for(const config of [{insideWater:40,outsideWater:560,insideSalt:120,outsideSalt:0},{insideWater:560,outsideWater:40,insideSalt:0,outsideSalt:120}]){
  const m=new Model(config),v=new ParticleView(m,{density});run(m,v,2000);assert.ok(m.limit);const frozen=JSON.stringify(m);settle(m,v);assert.equal(JSON.stringify(m),frozen);assert.equal(m.status().system,'limit');assert.ok(v.maximumMarkerError(m)<=1.5+1e-8);approved(m,v);
 }
});
test('暫停的大額雙向人為轉移立即更新幾何，補完不產生自然交換',()=>{
 const m=new Model({waterPermeable:false,saltPermeable:false}),v=new ParticleView(m);
 for(const [type,direction,amount]of [['water','in',60],['water','out',40],['salt','in',6],['salt','out',10]]){m.transfer(type,direction,amount);v.ingest(m);near(v.radius,v.cellRadius(m));}
 const frozen=JSON.stringify(m);settle(m,v);assert.equal(JSON.stringify(m),frozen);assert.ok(v.maximumMarkerError(m)<=1.5);assert.ok(v.records.some(r=>r.kind==='manual'));assert.equal(v.records.some(r=>r.kind==='natural'),false);approved(m,v);
});
test('同一時刻反覆搬移仍只花批准配額，不因動畫循環創造物質',()=>{
 const m=new Model({waterPermeable:false,saltPermeable:false}),v=new ParticleView(m);
 for(let i=0;i<10;i++){m.transfer('water','in',80);v.ingest(m);m.transfer('water','out',80);v.ingest(m);}
 const frozen=JSON.stringify(m);settle(m,v,6);assert.equal(JSON.stringify(m),frozen);assert.ok(v.maximumMarkerError(m)<=1.5+1e-8);approved(m,v);
});
test('關膜先補完批准動畫、凍結模型時間；關閉生效後零自然跨膜',()=>{
 const lab=new Laboratory(PRESETS.equilibrium.config,'explore'),v=new ParticleView(lab.model),p=new Playback(lab,v);lab.toggle();p.advance(.6);
 assert.equal(v.hasReplay(lab.model,'water'),true);const frozenTime=lab.model.time;p.setPermeability('water',false);assert.ok(p.pendingClose);assert.equal(lab.model.permeable.water,true);
 for(let i=0;i<200&&p.pendingClose;i++){p.advance(.01);near(lab.model.time,frozenTime);}
 assert.equal(p.pendingClose,null);assert.equal(lab.model.permeable.water,false);assert.equal(lab.running,true);assert.equal(lab.model.events.at(-1).time,frozenTime);
 const count=v.records.filter(r=>r.kind==='natural'&&r.type==='water').length;p.advance(3);assert.equal(v.records.filter(r=>r.kind==='natural'&&r.type==='water').length,count);near(lab.model.geometry().ratio,1);approved(lab.model,v);
});
test('補完後停住：沒有新批准量時不再隨機移動或累加視覺紀錄',()=>{
 const m=new Model({waterPermeable:false,saltPermeable:false}),v=new ParticleView(m);m.transfer('water','in',60);v.ingest(m);settle(m,v);const frozen=JSON.stringify(v.particles),records=v.records.length;
 for(let i=0;i<100;i++)assert.equal(v.settle(m,.01),false);assert.equal(JSON.stringify(v.particles),frozen);assert.equal(v.records.length,records);
});
test('同種子與相同補完時間可重現，補完分段不改變終點',()=>{
 const a=new Model({waterPermeable:false,saltPermeable:false}),b=new Model({waterPermeable:false,saltPermeable:false}),va=new ParticleView(a),vb=new ParticleView(b);a.transfer('water','in',60);b.transfer('water','in',60);va.settle(a,1);for(let i=0;i<100;i++)vb.settle(b,.01);assert.deepEqual(va.particles,vb.particles);assert.deepEqual(va.records,vb.records);assert.deepEqual(a.snapshot(),b.snapshot());
});
test('關膜同步時隱藏頁面或要求暫停，不會在完成後自行恢復科學運算',()=>{
 const l=new Laboratory(PRESETS.equilibrium.config,'explore'),v=new ParticleView(l.model),p=new Playback(l,v);l.toggle();p.advance(.6);p.setPermeability('water',false);p.pause();for(let i=0;i<200&&p.pendingClose;i++)p.advance(.01);assert.equal(p.pendingClose,null);assert.equal(l.running,false);assert.equal(l.model.permeable.water,false);
});
test('關膜同步中重設或調整密度，各自保留正確操作意圖',()=>{
 const l=new Laboratory(PRESETS.equilibrium.config,'explore');let v=new ParticleView(l.model);const p=new Playback(l,v);l.toggle();p.advance(.6);p.setPermeability('water',false);v=new ParticleView(l.model,{density:.5});p.reset(v,{preservePending:true});p.advance(.01);assert.equal(l.model.permeable.water,false);assert.equal(l.running,true);
 l.setPermeability('water',true);p.advance(.6);p.setPermeability('water',false);l.reset();p.reset(new ParticleView(l.model));p.advance(1);assert.equal(l.model.permeable.water,true);assert.equal(l.model.time,0);assert.equal(p.pendingClose,null);assert.equal(l.running,false);
});
test('極小正鹽量與零鹽來源：正確分配代表粒子數，不產生無效重量',()=>{
 for(const amounts of [[120,1e-8],[1e-8,120],[0,120],[0,0]]){const m=new Model({insideSalt:amounts[0],outsideSalt:amounts[1],saltPermeable:true}),v=new ParticleView(m,{density:.5});assert.equal(v.particles.filter(p=>p.type==='salt').length,amounts[0]+amounts[1]===0?0:45);for(const p of v.particles)assert.ok(Number.isFinite(p.weight)&&p.weight>0);run(m,v,3);settle(m,v);approved(m,v);}
});
test('無效時間、基礎模式切膜與觸界後切膜均被拒絕',()=>{
 const l=new Laboratory(),v=new ParticleView(l.model),p=new Playback(l,v);for(const n of [-1,NaN,Infinity]){assert.throws(()=>v.settle(l.model,n));assert.throws(()=>p.advance(n));}l.toggle();assert.throws(()=>p.setPermeability('water',false));
 const extreme=new Laboratory({insideWater:40,outsideWater:560,insideSalt:120,outsideSalt:0},'explore'),eview=new ParticleView(extreme.model),ep=new Playback(extreme,eview);extreme.toggle();ep.advance(2);assert.ok(extreme.model.limit);assert.throws(()=>ep.setPermeability('water',false));assert.equal(ep.pendingClose,null);
});
test('隨機初始量與四種通透組合，暫停補完後來源取樣誤差有界',()=>{
 let seed=361;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<16;i++)for(const waterPermeable of [false,true])for(const saltPermeable of [false,true]){
  const m=new Model({insideWater:20+580*rand(),outsideWater:20+580*rand(),insideSalt:120*rand(),outsideSalt:120*rand(),waterPermeable,saltPermeable}),v=new ParticleView(m,{density:[.5,1,1.5][i%3]});run(m,v,10);const frozen=JSON.stringify(m);settle(m,v);assert.equal(JSON.stringify(m),frozen);assert.ok(v.maximumMarkerError(m)<=1.5+1e-7);approved(m,v);
 }
});
test('自然與人為配額分開取整：混合來源補完後誤差不超過 2.5 顆且不互相借用',()=>{
 for(const density of [.5,1,1.5])for(const duration of [.2,.6,3,10]){
  const l=new Laboratory({},'explore'),v=new ParticleView(l.model,{density}),p=new Playback(l,v);l.toggle();p.advance(duration);p.pause();p.advance(1);l.transfer('water','in',60);v.ingest(l.model);const frozen=JSON.stringify(l.model);settle(l.model,v);assert.equal(JSON.stringify(l.model),frozen);assert.ok(v.maximumMarkerError(l.model)<=2.5+1e-8);approved(l.model,v);
  p.setPermeability('water',false);for(let i=0;i<100&&p.pendingClose;i++)p.advance(.01);const count=v.records.filter(r=>r.kind==='natural'&&r.type==='water').length;l.transfer('water','out',30);v.ingest(l.model);settle(l.model,v);assert.ok(v.maximumMarkerError(l.model)<=2.5+1e-8);assert.equal(v.records.filter(r=>r.kind==='natural'&&r.type==='water').length,count);approved(l.model,v);
 }
});
