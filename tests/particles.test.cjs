const {test}=require('node:test');const assert=require('node:assert/strict');
const {Model,DT,PRESETS}=require('../src/model.js');const {ParticleView,COLORS}=require('../src/particles.js');
function run(m,v,t){for(let n=0;n<Math.round(t/DT)&&!m.limit;n++){m.step();v.update(m,DT);}}
test('V01–04/V07 四色來源、代表量在所有跨膜後永久保留，交換只花模型配額',()=>{
 const m=new Model(PRESETS.equilibrium.config),v=new ParticleView(m);run(m,v,90);
 for(const type of ['water','salt'])for(let s=0;s<2;s++)for(let d=0;d<2;d++){
  const records=v.records.filter(r=>r.type===type&&r.source===s&&r.direction===d&&r.kind==='natural');assert.ok(records.length>0);
  const quantity=records.reduce((a,r)=>a+r.amount,0);assert.ok(quantity<=m.exchange[type][s][d]+1e-7);
  for(const r of records)assert.equal(r.color,COLORS[type][s]);
 }
 for(const p of v.particles){assert.equal(p.color,COLORS[p.type][p.source]);assert.equal(Object.getOwnPropertyDescriptor(p,'source').writable,false);}
});
test('V05 畫面密度、顯示切換不影響科學結果',()=>{
 const a=new Model(),b=new Model(),va=new ParticleView(a,{density:0.5}),vb=new ParticleView(b,{density:1.5});run(a,va,30);run(b,vb,30);assert.deepEqual(a.snapshot(),b.snapshot());assert.deepEqual(a.exchange,b.exchange);assert.ok(va.particles.length<vb.particles.length);
});
test('V06 不可通時，細胞伸縮與隨機行走均不使鹽錯誤跨膜',()=>{
 const m=new Model(),v=new ParticleView(m);run(m,v,45);assert.ok(m.geometry().ratio>1);for(const p of v.particles.filter(x=>x.type==='salt')){assert.equal(p.side,p.source===0?'inside':'outside');const d=Math.hypot(p.x-360,p.y-220);assert.ok(p.side==='inside'?d<v.radius:d>v.radius);}assert.ok(!v.records.some(r=>r.type==='salt'));
});
test('V08 相同種子、步數與初始量，可重現粒子軌跡與交換紀錄',()=>{
 const a=new Model(PRESETS.equilibrium.config),b=new Model(PRESETS.equilibrium.config),va=new ParticleView(a),vb=new ParticleView(b);run(a,va,8);run(b,vb,8);assert.deepEqual(va.particles,vb.particles);assert.deepEqual(va.records,vb.records);assert.deepEqual(a.snapshot(),b.snapshot());
});
test('膜關閉後取消未完成的自然跨膜動畫，所有粒子仍有區室內運動',()=>{
 const m=new Model(PRESETS.equilibrium.config),v=new ParticleView(m);run(m,v,3);m.setPermeability('water',false);m.setPermeability('salt',false);v.ingest(m);const n=v.records.length,pos=v.particles.map(p=>[p.x,p.y]);run(m,v,4);assert.equal(v.records.length,n);assert.notDeepEqual(v.particles.map(p=>[p.x,p.y]),pos);
});
test('人為轉移保留來源且具有獨立動畫紀錄，與自然交換分開',()=>{
 const m=new Model({waterPermeable:false,saltPermeable:false}),v=new ParticleView(m);m.transfer('water','in',18);run(m,v,8);assert.ok(v.records.some(r=>r.kind==='manual'));assert.ok(!v.records.some(r=>r.kind==='natural'));assert.deepEqual(m.exchange.water,[[0,0],[0,0]]);
});
test('標準情境動畫來源比例的離散與延遲誤差保持在少量代表粒子內',()=>{
 for(const id of ['osmosis','equilibrium','diffusion']){const m=new Model(PRESETS[id].config),v=new ParticleView(m);for(let n=0;n<4000;n++){m.step();v.update(m,DT);if(n>400)for(const g of Object.values(v.audit(m)))assert.ok(Math.abs(g.shownInside-g.modelInside)/g.weight<3);}}
});
