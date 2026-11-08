const {test}=require('node:test'),assert=require('node:assert/strict');
const {Model,Laboratory,PRESETS}=require('../src/model'),{ParticleView}=require('../src/particles'),{Playback}=require('../src/presentation');
const config={insideWater:50,outsideWater:50,insideSalt:50,outsideSalt:0};
test('reference observation: 2x, scale .05, water50/50 salt50/0 has 90% change at 18.75s',()=>{
 const m=new Model(config),initial=m.geometry().cell,target=111.66666666666667;let t90,t95;
 for(let i=0;i<4000;i++){m.step();const f=(m.geometry().cell-initial)/(target-initial);if(!t90&&f>=.9)t90=m.time;if(!t95&&f>=.95)t95=m.time;}
 assert.equal(t90,1.875);assert.equal(t95,2.15);assert.equal(t90/(2*.05),18.75);assert.ok(Math.abs(m.geometry().cell-target)<1e-9);assert.equal(m.limit,null);
 for(const speed of [.5,1,2,4,8]){const lab=new Laboratory(config),v=new ParticleView(lab.model,{targets:{water:48,salt:24}}),p=new Playback(lab,v,{modelTimeScale:.05});lab.toggle();p.advance(15,speed);assert.ok(Math.abs(lab.model.time-15*speed*.05)<.026);if(speed===2){assert.ok((lab.model.geometry().cell-initial)/(target-initial)<.9);assert.ok(lab.model.flux().water.net>1);}assert.ok(lab.model.audit().maximumOriginError<1e-8);}
});
test('representative natural replays rest one visual unit and depart into receiving side',()=>{
 const m=new Model(PRESETS.equilibrium.config),v=new ParticleView(m,{targets:{water:48,salt:24}});
 const lastEnd=new Map();let checkedStarts=0,ends=0,now=0;const original=v._schedule.bind(v);
 v._schedule=function(model){const before=new Set(this.particles.filter(p=>p.transition).map(p=>p.id));original(model);for(const p of this.particles)if(p.transition&&!before.has(p.id)&&p.transition.kind==='natural'&&lastEnd.has(p.id)){assert.ok(now-lastEnd.get(p.id)>=.999-1e-8);checkedStarts++;}};
 for(let n=0;n<6000;n++){now+=.01;if(n%5===0)m.step();const before=new Map(v.particles.filter(p=>p.transition).map(p=>[p.id,p.transition.direction]));v.update(m,.01);for(const p of v.particles)if(before.has(p.id)&&!p.transition){lastEnd.set(p.id,now);const dot=Math.cos(p.heading)*(p.x-360)+Math.sin(p.heading)*(p.y-220);assert.ok(before.get(p.id)===0?dot<0:dot>0);ends++;}}
 assert.ok(checkedStarts>10&&ends>20);for(const direction of [0,1])assert.ok(v.records.some(r=>r.direction===direction));
 const frozen=JSON.stringify(m);for(let n=0;n<2000&&v.hasReplay(m);n++)v.settle(m,.01);assert.equal(v.hasReplay(m),false);assert.equal(JSON.stringify(m),frozen);assert.ok(v.maximumMarkerError(m)<2.5);
 for(const type of ['water','salt'])for(let s=0;s<2;s++)for(let d=0;d<2;d++)assert.ok(v.records.filter(r=>r.type===type&&r.source===s&&r.direction===d).reduce((a,r)=>a+r.amount,0)<=m.exchange[type][s][d]+1e-7);
});
