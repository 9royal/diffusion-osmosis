const {test}=require('node:test'),assert=require('node:assert/strict');
const {Model,DT,PRESETS}=require('../src/model.js'),{ParticleView}=require('../src/particles.js');
const run=(m,v,n)=>{for(let i=0;i<n;i++){m.step();v.update(m,DT);}};
test('temperature levels increase path length; no stationary jitter or unapproved crossings',()=>{
 const lengths=[];
 for(const temperature of [0,1,2]){const m=new Model({waterPermeable:false,saltPermeable:false}),v=new ParticleView(m,{temperature});let distance=0;const start=v.particles.map(p=>[p.x,p.y]);for(let n=0;n<100;n++){const before=v.particles.map(p=>[p.x,p.y]);run(m,v,1);v.particles.forEach((p,i)=>{distance+=Math.hypot(p.x-before[i][0],p.y-before[i][1]);assert.equal(p.side,p.source===0?'inside':'outside');});}assert.equal(v.records.length,0);assert.ok(v.particles.filter((p,i)=>Math.hypot(p.x-start[i][0],p.y-start[i][1])>10).length>v.particles.length*0.7);lengths.push(distance);}
 assert.ok(lengths[1]>lengths[0]*1.6);assert.ok(lengths[2]>lengths[1]*1.6);
});
test('temperature never changes numerical transport, equilibrium, source colors or budgets',()=>{
 const models=[];for(const temperature of [0,1,2]){const m=new Model(PRESETS.equilibrium.config),v=new ParticleView(m,{temperature});run(m,v,1000);models.push(m);assert.ok(v.records.length>0);for(const p of v.particles)assert.equal(p.color,require('../src/particles.js').COLORS[p.type][p.source]);for(const type of ['water','salt'])for(let s=0;s<2;s++)for(let d=0;d<2;d++)assert.ok(v.records.filter(r=>r.type===type&&r.source===s&&r.direction===d).reduce((a,r)=>a+r.amount,0)<=m.exchange[type][s][d]+1e-7);}
 for(const m of models.slice(1)){assert.deepEqual(m.snapshot(),models[0].snapshot());assert.deepEqual(m.exchange,models[0].exchange);}
});
test('invalid temperature is rejected; zero dt and settled pause do not move particles',()=>{const m=new Model(),v=new ParticleView(m);for(const x of [-1,3,NaN,0.5])assert.throws(()=>v.setTemperature(x));const old=v.particles.map(p=>({...p}));v.update(m,0);v.setTemperature(2);v.settle(m,1);assert.deepEqual(v.particles,old);});
