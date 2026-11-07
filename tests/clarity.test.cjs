const test=require('node:test'),assert=require('node:assert/strict');
const {Model,DT}=require('../src/model.js'),{ParticleView,COLORS}=require('../src/particles.js');
const config={insideWater:20,outsideWater:40,insideSalt:4,outsideSalt:2};
const options=m=>({targets:{water:Math.min(48,Math.ceil(m.total.water[0]+m.total.water[1])),salt:Math.min(24,Math.ceil(m.total.salt[0]+m.total.salt[1]))}});
test('精簡代表粒子按總量取樣、上限為 48/24，各原始來源重量仍守恆',()=>{
 for(const c of [config,{insideWater:50,outsideWater:50,insideSalt:50,outsideSalt:50},{...config,insideSalt:0,outsideSalt:0}]){
  const m=new Model(c),before=m.snapshot(),v=new ParticleView(m,options(m));
  assert.equal(v.particles.filter(p=>p.type==='water').length,48);
  assert.equal(v.particles.filter(p=>p.type==='salt').length,c.insideSalt===0?0:c.insideSalt+c.outsideSalt>24?24:c.insideSalt+c.outsideSalt);
  for(const g of v.groups)assert.ok(Math.abs(g.particles.reduce((n,p)=>n+p.weight,0)-m.total[g.type][g.source])<1e-10);
  assert.deepEqual(m.snapshot(),before);
 }
 const m=new Model(config);assert.equal(new ParticleView(m,options(m)).particles.length,54);
 assert.throws(()=>new ParticleView(m,{targets:{water:NaN}}),RangeError);
});
test('精簡粒子在四種通透與 50 上限情境中補完有界，不改變數值或來源色',()=>{
 for(const water of [false,true])for(const salt of [false,true])for(const c of [config,{insideWater:20,outsideWater:50,insideSalt:50,outsideSalt:0}]){
  const m=new Model({...c,waterPermeable:water,saltPermeable:salt}),v=new ParticleView(m,{...options(m),density:0.5});
  for(let n=0;n<1200&&!m.limit;n++){m.step();v.update(m,DT);}
  const frozen=m.snapshot();v.settle(m,8);assert.deepEqual(m.snapshot(),frozen);assert.ok(v.maximumMarkerError(m)<=1.5+1e-8);
  for(const p of v.particles)assert.equal(p.color,COLORS[p.type][p.source]);
  assert.ok(m.audit().maximumOriginError<1e-9);
 }
});
test('水鹽淡化只改繪圖透明度，保留來源色、位置、庫存與後續隨機軌跡',()=>{
 for(const fadeWater of [false,true])for(const fadeSalt of [false,true]){
  const m=new Model(config),controlModel=new Model(config),v=new ParticleView(m,options(m)),control=new ParticleView(controlModel,options(controlModel));
  const frozen=m.snapshot(),particles=JSON.parse(JSON.stringify(v.particles)),fills=[];
  const ctx={globalAlpha:1,fillStyle:'',fill(){fills.push({color:this.fillStyle,alpha:this.globalAlpha});}};
  for(const name of ['clearRect','fillRect','strokeRect','beginPath','arc','stroke','moveTo','lineTo','closePath','fillText'])ctx[name]=()=>{};
  v.draw(ctx,m,{fadeWater,fadeSalt});assert.equal(ctx.globalAlpha,1);assert.deepEqual(m.snapshot(),frozen);assert.deepEqual(v.particles,particles);
  for(const type of ['water','salt'])for(const color of COLORS[type]){const group=fills.filter(f=>f.color===color);assert.ok(group.length);assert.ok(group.every(f=>f.alpha===((type==='water'?fadeWater:fadeSalt)?0.24:1)));}
  m.step();controlModel.step();v.update(m,DT);control.update(controlModel,DT);assert.deepEqual(v.particles,control.particles);assert.deepEqual(m.snapshot(),controlModel.snapshot());
 }
});
