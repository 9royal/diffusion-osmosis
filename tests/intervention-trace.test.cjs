const {test}=require('node:test'),assert=require('node:assert/strict');
const {Laboratory,Model,DT,DEFAULT}=require('../src/model.js'),{ParticleView}=require('../src/particles.js'),{Playback}=require('../src/presentation.js');
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
const setup=()=>{const lab=new Laboratory(DEFAULT,'explore'),view=new ParticleView(lab.model),play=new Playback(lab,view);lab.toggle();play.advance(.15);play.pause();return {lab,view,play};};
function interpolate(points,time,key){for(let i=1;i<points.length;i++)if(points[i].time>=time){const a=points[i-1],b=points[i];return a[key]+(b[key]-a[key])*(time-a.time)/(b.time-a.time);}return points.at(-1)[key];}
test('人為轉移在同一時刻保留前後點，圖表不提前畫出轉移量',()=>{
 const {lab,play}=setup(),before=lab.model.snapshot();play.transfer('water','in',60);const after=lab.model.snapshot(),raw=JSON.stringify(lab.model),points=play.history();
 assert.equal(lab.model.history.length,2);assert.equal(points.length,3);assert.deepEqual(points.at(-2),before);assert.deepEqual(points.at(-1),after);near(points.at(-2).time,points.at(-1).time);near(after.volume-before.volume,60/140*100);
 const reference=new Model();for(let i=0;i<3;i++)reference.step();assert.ok(Math.abs(interpolate(points,.075,'volume')-reference.snapshot().volume)<.01);assert.equal(JSON.stringify(lab.model),raw);
});
test('同時刻多次操作保留原順序，切膜通量呈現瞬間跳變',()=>{
 const {lab,play}=setup();play.transfer('water','in',60);const before=lab.model.snapshot();play.setPermeability('salt',true);const points=play.history();assert.equal(points.length,5);assert.deepEqual(points.at(-2),before);assert.equal(points.at(-1).time,before.time);near(points.at(-2).saltFlux.out,0);assert.ok(points.at(-1).saltFlux.out>0);assert.deepEqual(points.at(-3),points.at(-2));
});
test('延後關膜只在真正生效時加入前後點，不推進科學時間',()=>{
 const {lab,play,view}=setup();play.transfer('water','in',60);play.setPermeability('water',false);assert.ok(play.pendingClose);const length=play.history().length,time=lab.model.time;
 assert.equal(play.history().length,length);for(let n=0;n<100&&play.pendingClose;n++)play.advance(.01);assert.equal(play.pendingClose,null);const points=play.history();assert.equal(points.length,length+2);near(points.at(-2).time,time);near(points.at(-1).time,time);assert.ok(points.at(-2).waterFlux.in>0);near(points.at(-1).waterFlux.in,0);assert.deepEqual(points.at(-2).water,points.at(-1).water);assert.ok(view.maximumMarkerError(lab.model)<=2.5);
});
test('無效或相同設定的操作不產生圖表偽事件',()=>{
 const {lab,play}=setup(),before=JSON.stringify(play.history()),raw=JSON.stringify(lab.model);assert.throws(()=>play.transfer('water','in',10000));play.setPermeability('water',true);assert.equal(JSON.stringify(play.history()),before);assert.equal(JSON.stringify(lab.model),raw);
});
test('顯示密度重取樣保留事件歷史，新實驗則清除前一實驗取樣',()=>{
 const {lab,play}=setup();play.transfer('water','in',60);const points=play.history();play.reset(new ParticleView(lab.model,{density:.5}),{preservePending:true});assert.deepEqual(play.history(),points);lab.newExperiment();play.reset(new ParticleView(lab.model));assert.equal(play.history().length,1);near(play.history()[0].time,0);near(play.history()[0].volume,100);
});
test('歷史顯示限額保持最新點順序，讀取不修改模型歷史',()=>{
 const {lab,play}=setup();play.transfer('water','in',60);play.setPermeability('salt',true);const raw=JSON.stringify(lab.model),all=play.history();assert.deepEqual(play.history(2),all.slice(-2));assert.deepEqual(play.history(1),all.slice(-1));assert.throws(()=>play.history(0));assert.equal(JSON.stringify(lab.model),raw);
});
test('呈現層記錄與直接操作產生完全相同的科學狀態',()=>{
 const {lab,play}=setup(),direct=new Laboratory(DEFAULT,'explore');direct.toggle();direct.advance(.15);direct.pause();
 play.transfer('water','in',60);direct.transfer('water','in',60);play.setPermeability('salt',true);direct.setPermeability('salt',true);play.transfer('salt','out',6);direct.transfer('salt','out',6);
 assert.deepEqual(lab.model,direct.model);assert.deepEqual(lab.config,direct.config);assert.equal(lab.accumulator,direct.accumulator);
});
