(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OsmosisPresentation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Observes the already-completed natural ledger, never animation counts or manual transfers.
 class ExchangeWindow {
  constructor(model,duration=1){if(!Number.isFinite(duration)||duration<=0)throw new RangeError('觀察時間窗須為正數。');this.duration=duration;this.model=model;this.frames=[];this.record(model);}
  record(model){
   if(model!==this.model)throw new Error('觀察窗須隨新實驗重建。');
   const point={time:model.time};
   for(const type of ['water','salt'])point[type]=[0,1].map(d=>model.exchange[type][0][d]+model.exchange[type][1][d]);
   const last=this.frames.at(-1);if(last&&point.time<last.time)throw new Error('觀察時間不可倒退。');
   if(last&&point.time===last.time)this.frames[this.frames.length-1]=point;else this.frames.push(point);
   const cutoff=point.time-this.duration;
   while(this.frames.length>2&&this.frames[1].time<=cutoff)this.frames.shift();
  }
  summary(){
   const end=this.frames.at(-1),from=Math.max(this.frames[0].time,end.time-this.duration),a=this.frames[0],b=this.frames[1]||a;
   const fraction=b.time>a.time?Math.max(0,Math.min(1,(from-a.time)/(b.time-a.time))):0;
   const result={from,to:end.time,duration:end.time-from,window:this.duration};
   for(const type of ['water','salt']){const quantities=[0,1].map(d=>Math.max(0,end[type][d]-(a[type][d]+fraction*(b[type][d]-a[type][d]))));result[type]={in:quantities[0],out:quantities[1],net:quantities[0]-quantities[1]};}
   return result;
  }
 }
 class Playback {
  constructor(laboratory,view,{modelTimeScale=1}={}){if(!Number.isFinite(modelTimeScale)||modelTimeScale<=0)throw new RangeError('模型播放時間比例無效。');this.modelTimeScale=modelTimeScale;this.lab=laboratory;this.reset(view);}
  reset(view,{preservePending=false}={}){
   this.view=view;if(!preservePending)this.pendingClose=null;
   if(this.traceModel!==this.lab.model){this.traceModel=this.lab.model;this.beforeFrames=new Map();this.exchangeWindow=new ExchangeWindow(this.lab.model);}
  }
  _captureChange(action){
   const model=this.lab.model,before=model.snapshot(),length=model.history.length;action();
   if(this.lab.model!==model){this.traceModel=this.lab.model;this.beforeFrames=new Map();this.exchangeWindow=new ExchangeWindow(this.lab.model);}
   else if(model.history.length>length)this.beforeFrames.set(model.history.at(-1),before);
  }
  history(limit=2000){
   if(!Number.isSafeInteger(limit)||limit<1)throw new RangeError('顯示取樣筆數須為正整數。');
   const points=[],history=this.lab.model.history;
   for(let i=history.length-1;i>=0&&points.length<limit;i--){const after=history[i];points.push(after);const before=this.beforeFrames.get(after);if(before&&points.length<limit)points.push(before);}
   return points.reverse();
  }
  transfer(type,direction,amount){this._captureChange(()=>this.lab.transfer(type,direction,amount));this.view.ingest(this.lab.model);}
  get settling(){return !this.lab.running&&this.view.hasReplay(this.lab.model);}
  pause(){this.lab.pause();if(this.pendingClose)this.pendingClose.resume=false;}
  setPermeability(type,value){
   if(!['water','salt'].includes(type)||typeof value!=='boolean')throw new TypeError('通透性設定無效。');
   if(this.pendingClose)throw new Error('正在完成關膜前的交換動畫。');
   if(this.lab.model.limit){this.lab.setPermeability(type,value);return;}
   if(this.lab.hasBegun&&this.lab.mode!=='explore'){this.lab.setPermeability(type,value);return;}
   this.view.ingest(this.lab.model);
   if(this.lab.hasBegun&&!value&&this.lab.model.permeable[type]&&this.view.hasReplay(this.lab.model,type)){
    this.pendingClose={type,resume:this.lab.running};this.lab.pause();return;
   }
   this._captureChange(()=>this.lab.setPermeability(type,value));this.view.ingest(this.lab.model);
  }
  advance(elapsed,speed=1){
   if(!Number.isFinite(elapsed)||elapsed<0||!Number.isFinite(speed)||speed<=0)throw new RangeError('播放時間或速度無效。');
   let ticks=0,changed=false;
   if(this.pendingClose){
    changed=this.view.settle(this.lab.model,elapsed);
    if(!this.view.hasReplay(this.lab.model,this.pendingClose.type)){
     const action=this.pendingClose;this._captureChange(()=>this.lab.setPermeability(action.type,false));this.view.ingest(this.lab.model);this.pendingClose=null;
     if(action.resume&&!this.lab.model.limit)this.lab.toggle();changed=true;
    }
   }else if(this.lab.running){
    // Numerical transport keeps its fixed step and approved exchange ledger.
    // Classroom pacing slows that clock only; representative motion stays visible every frame.
    if(this.modelTimeScale===1){ticks=this.lab.advance(elapsed*speed,(model,dt)=>{this.view.update(model,dt);this.exchangeWindow.record(model);});}
    else {let remaining=elapsed*speed;
    while(remaining>1e-12&&this.lab.running){const h=Math.min(0.01,remaining);remaining-=h;
     ticks+=this.lab.advance(h*this.modelTimeScale,model=>{this.view.ingest(model);this.exchangeWindow.record(model);});
     this.view.update(this.lab.model,h);
    }
    }
    changed=ticks>0||elapsed>0;
   }
   else if(this.settling)changed=this.view.settle(this.lab.model,elapsed);
   return {ticks,changed};
  }
 }
 return {Playback,ExchangeWindow};
});
