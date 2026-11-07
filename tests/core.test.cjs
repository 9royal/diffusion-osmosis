const {test}=require('node:test');const assert=require('node:assert/strict');
const {Model,Laboratory,DT,DEFAULT,PRESETS}=require('../src/model.js');
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b} (tol ${t})`);
function run(m,t){for(let i=0;i<Math.round(t/DT)&&!m.limit;i++)m.step();return m;}
function conserved(m){const a=m.audit();near(a.maximumOriginError,0);near(a.capacityError,0);for(const t of ['water','salt']){near(m.amount(t,'inside')+m.amount(t,'outside'),m.total[t][0]+m.total[t][1]);for(let k=0;k<2;k++)assert.ok(m.inside[t][k]>=0&&m.inside[t][k]<=m.total[t][k]);}}
test('S01 不可通時無跨膜交換，但不能稱為動態平衡',()=>{
 const m=run(new Model({waterPermeable:false,saltPermeable:false}),20);conserved(m);near(m.amount('water','inside'),120);near(m.amount('salt','inside'),24);assert.equal(m.status().system,'blocked');assert.deepEqual(m.exchange,{water:[[0,0],[0,0]],salt:[[0,0],[0,0]]});
});
test('S02/S05 擴散由濃度決定；固定體積下符合解析指數解',()=>{
 const m=new Model(PRESETS.diffusion.config),w=m.amount('water','inside'),s0=m.amount('salt','inside');
 assert.ok(m.amount('salt','outside')>s0);assert.ok(m.flux().salt.net<0);
 const t=10,eq=100/400*100,rate=12*(1/100+1/300);run(m,t);
 near(m.amount('water','inside'),w);near(m.amount('salt','inside'),eq+(s0-eq)*Math.exp(-rate*t),0.012);conserved(m);
 const e=run(new Model({insideWater:100,outsideWater:300,insideSalt:10,outsideSalt:30,waterPermeable:false,saltPermeable:true}),30);
 near(e.amount('salt','inside'),10);assert.ok(e.exchange.salt[0][1]>0);assert.equal(e.status().salt,'near');
});
test('S03/S07/S09 不可通鹽造成滲透；水與背景溶質守恆，外部空間同步縮小',()=>{
 const m=new Model(),b=m.background.slice(),v=m.geometry();run(m,10);
 assert.ok(m.amount('water','inside')>120);assert.ok(m.amount('water','outside')<240);
 assert.ok(m.geometry().outside<v.outside);assert.deepEqual(m.background,b);assert.ok(m.flux().cb[0]<0.1);near(m.amount('salt','inside'),24);conserved(m);
 run(m,400);const expected=360*(24+12)/(24+12+12+24);near(m.amount('water','inside'),expected,1e-7);assert.equal(m.status().system,'near');
 near(m.geometry().radiusRatio,Math.cbrt(m.geometry().ratio));
});
test('S08 水可淨流出、細胞縮小',()=>{
 const m=run(new Model({insideSalt:6,outsideSalt:72}),10);assert.ok(m.amount('water','inside')<120);assert.ok(m.geometry().ratio<1);conserved(m);
});
test('S04 自由通透鹽的反射係數為零；擾動後水由背景溶質驅動',()=>{
 const m=new Model({saltPermeable:true});near(m.flux().water.net,0);assert.ok(m.flux().salt.net<0);run(m,100);near(m.geometry().ratio,1);conserved(m);
 m.transfer('water','in',20);assert.ok(m.flux().water.net<0);assert.ok(Math.abs(m.flux().cb[0]-m.flux().cb[1])>0);run(m,600);near(m.amount('water','inside'),120,1e-7);near(m.flux().cs[0],m.flux().cs[1],1e-7);assert.equal(m.status().system,'near');
});
test('S06 巨觀平衡仍有雙向交換，來源比例繼續變化',()=>{
 const m=run(new Model(PRESETS.equilibrium.config),4);assert.equal(m.status().system,'near');const a=m.snapshot(),ledger=m.exchange.water[0][1];run(m,20);const b=m.snapshot();
 near(a.cellVolume,b.cellVolume);near(a.cs[0],b.cs[0]);assert.ok(m.flux().water.in>0&&m.flux().water.out>0);assert.ok(m.flux().salt.in>0&&m.flux().salt.out>0);assert.ok(b.origins.water.inside[1]>a.origins.water.inside[1]);assert.ok(m.exchange.water[0][1]>ledger);conserved(m);
});
test('S10 上下安全邊界均停止，不冒稱平衡，不輸出負庫存',()=>{
 for(const config of [{insideWater:40,outsideWater:560,insideSalt:120,outsideSalt:0},{insideWater:560,outsideWater:40,insideSalt:0,outsideSalt:120}]){
  const m=run(new Model(config),1000);assert.ok(m.limit);assert.equal(m.status().system,'limit');near(m.geometry().cell,m.bounds[m.limit.edge==='upper'?'max':'min'],1e-7);conserved(m);const before=m.snapshot();assert.equal(m.step(),false);assert.deepEqual(m.snapshot(),before);
 }
});
test('所有來源：長時間四通透組合、極端初始量、零鹽仍守恆',()=>{
 let seed=77;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 for(let n=0;n<40;n++)for(const waterPermeable of [false,true])for(const saltPermeable of [false,true]){
  const m=new Model({insideWater:20+580*rand(),outsideWater:20+580*rand(),insideSalt:n===0?0:120*rand(),outsideSalt:n===0?0:120*rand(),waterPermeable,saltPermeable});run(m,30);conserved(m);
 }
 const z=run(new Model({insideSalt:0,outsideSalt:0,saltPermeable:true}),20);assert.equal(z.status().salt,'absent');near(z.amount('salt','inside'),0);near(z.geometry().ratio,1);
});
test('雙向量差值等於庫存改變，各來源分別滿足收支',()=>{
 const m=run(new Model({saltPermeable:true}),80);for(const type of ['water','salt'])for(let k=0;k<2;k++)near(m.inside[type][k],(k===0?m.total[type][k]:0)+m.exchange[type][k][0]-m.exchange[type][k][1],1e-9);conserved(m);
});
test('非法初始值與轉移被拒絕，狀態保持原樣',()=>{
 for(const x of [0,-1,NaN,Infinity,601])assert.throws(()=>new Model({insideWater:x}));
 assert.throws(()=>new Model({insideSalt:-1}));assert.throws(()=>new Model({seed:1.5}));
 const m=new Model(),state=m.snapshot();for(const a of [-1,0,Infinity,10000])assert.throws(()=>m.transfer('water','in',a));assert.deepEqual(m.snapshot(),state);
});
test('U01 基礎實驗開始與暫停後都鎖定，重設不解除鎖定，新實驗才解鎖',()=>{
 const lab=new Laboratory();lab.configure({insideSalt:30});lab.toggle();lab.advance(1);lab.pause();assert.ok(lab.locked);assert.throws(()=>lab.configure({insideSalt:12}));assert.throws(()=>lab.setPermeability('salt',true));assert.throws(()=>lab.setMode('explore'));lab.reset();near(lab.model.time,0);near(lab.model.amount('salt','inside'),30);assert.ok(lab.locked);lab.newExperiment();lab.configure({insideSalt:12});assert.equal(lab.locked,false);
});
test('U02/U05 探索干預守恆、保留來源、不記入自然交換，重新觀察平衡',()=>{
 const l=new Laboratory(PRESETS.equilibrium.config,'explore');l.toggle();l.advance(10);l.pause();assert.equal(l.model.status().system,'near');const ledger=JSON.stringify(l.model.exchange),b=l.model.background.slice();l.transfer('water','in',10);assert.equal(JSON.stringify(l.model.exchange),ledger);assert.ok(l.model.manual.water[0][0]>0&&l.model.manual.water[1][0]>0);assert.deepEqual(l.model.background,b);assert.equal(l.model.status().system,'changing');assert.equal(l.model.events.at(-1).time,10);l.setPermeability('salt',false);assert.equal(l.model.status().salt,'blocked');conserved(l.model);
});
test('U03 暫停不推進時間或狀態',()=>{
 const l=new Laboratory();l.toggle();l.advance(2);l.pause();const before=l.model.snapshot();l.advance(100);assert.deepEqual(l.model.snapshot(),before);
});
test('U04 固定步長使不同幀率、速度與時間分段得到相同結果',()=>{
 const a=new Laboratory(),b=new Laboratory();a.toggle();b.toggle();for(let i=0;i<600;i++)a.advance(1/60);for(let i=0;i<200;i++)b.advance(0.05);assert.deepEqual(a.model.snapshot(),b.model.snapshot());assert.deepEqual(a.model.exchange,b.model.exchange);near(a.model.time,10);
});
test('U06 重設完整恢復原始來源、通透性、背景量、圖表與干預紀錄',()=>{
 const l=new Laboratory(DEFAULT,'explore'),initial=l.model.snapshot();l.toggle();l.advance(4);l.transfer('salt','out',5);l.setPermeability('salt',true);l.reset();assert.deepEqual(l.model.snapshot(),initial);assert.deepEqual(l.model.events,[]);assert.equal(l.model.history.length,1);assert.equal(l.running,false);
});
test('觸界時最後一個部分步長與動畫回呼使用相同模擬時間',()=>{
 const l=new Laboratory({insideWater:40,outsideWater:560,insideSalt:120,outsideSalt:0});let animationTime=0;l.toggle();l.advance(10,(m,dt)=>animationTime+=dt);assert.ok(l.model.limit);near(animationTime,l.model.time,1e-10);assert.equal(l.running,false);
});
