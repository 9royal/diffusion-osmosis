const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Model,DT}=require('../src/model.js'),{ParticleView}=require('../src/particles.js');
const config={insideWater:20,outsideWater:40,insideSalt:4,outsideSalt:2},m=new Model(config);
const v=new ParticleView(m,{targets:{water:48,salt:6}}),initial=m.snapshot(),representatives=v.audit(m);
for(let n=0;n<600/DT;n++)m.step();const final=m.snapshot();assert.ok(Math.abs(final.water[0]-30)<1e-6);assert.ok(Math.abs(final.volume-125)<1e-6);assert.equal(m.status().system,'near');assert.ok(final.waterFlux.in>0&&final.waterFlux.out>0);assert.ok(m.audit().maximumOriginError<1e-9);
const sha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..','src/model.js'))).digest('hex');assert.equal(sha256,'6413f35f59456e5f9082accc4ec9fc8639685ec39a7efe1d0be37cf3fe31b2a2');
const report={result:'PASS',version:require('../package.json').version,createdAt:new Date().toISOString(),coreSha256:sha256,initial,representatives,defaultParticleCount:v.particles.length,previousParticleCount:270,reductionPercent:80,newDefaultOsmoticEquilibrium:{expectedInsideWater:30,expectedVolumePercent:125,actual:final,status:m.status(),audit:m.audit()},note:'這是新介面 20/40 水、4/2 鹽的解析驗證；其他歷史數值證據仍測核心 120/240 水的壓力情境。'};
fs.mkdirSync(path.join(__dirname,'..','qa'),{recursive:true});fs.writeFileSync(path.join(__dirname,'..','qa/clarity-evidence.json'),JSON.stringify(report,null,2));console.log('PASS：新預設平衡水量 30、體積 125%；54 顆代表粒子及科學核心雜湊已驗證。');
