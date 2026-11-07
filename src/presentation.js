(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OsmosisPresentation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class Playback {
  constructor(laboratory,view){this.lab=laboratory;this.reset(view);}
  reset(view,{preservePending=false}={}){
   this.view=view;if(!preservePending)this.pendingClose=null;
   if(this.traceModel!==this.lab.model){this.traceModel=this.lab.model;this.beforeFrames=new Map();}
  }
  _captureChange(action){
   const model=this.lab.model,before=model.snapshot(),length=model.history.length;action();
   if(this.lab.model!==model){this.traceModel=this.lab.model;this.beforeFrames=new Map();}
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
   }else if(this.lab.running){ticks=this.lab.advance(elapsed*speed,(model,dt)=>this.view.update(model,dt));changed=ticks>0;}
   else if(this.settling)changed=this.view.settle(this.lab.model,elapsed);
   return {ticks,changed};
  }
 }
 return {Playback};
});
