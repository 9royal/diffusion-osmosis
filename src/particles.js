(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OsmosisParticles=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const WIDTH=720,HEIGHT=440,CX=WIDTH/2,CY=HEIGHT/2;
 const COLORS={water:['#e87515','#2774ce'],salt:['#218449','#991b34']};
 function randomGenerator(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
 const radial=p=>Math.hypot(p.x-CX,p.y-CY);
 function edgeDistance(angle){return Math.min((WIDTH/2-12)/Math.max(1e-12,Math.abs(Math.cos(angle))),(HEIGHT/2-12)/Math.max(1e-12,Math.abs(Math.sin(angle))));}
 class ParticleView {
  constructor(model,{density=1,seed=model.initial.seed,targets=null,temperature=1}={}) {
   this.random=randomGenerator(seed);this.density=density;this.particles=[];this.groups=[];this.records=[];
   this.seen={natural:{water:[[0,0],[0,0]],salt:[[0,0],[0,0]]},manual:{water:[[0,0],[0,0]],salt:[[0,0],[0,0]]}};
   this.setTemperature(temperature);this.radius=this.cellRadius(model);this.lastPermeable={...model.permeable};
   for(const type of ['water','salt']) {
    const total=model.total[type][0]+model.total[type][1];if(total===0)continue;
    const base=targets?.[type]??(type==='water'?180:90);
    if(!Number.isFinite(base)||base<=0)throw new RangeError('代表粒子目標數須為正數。');
    const target=Math.max(2,Math.round(base*density));
    let ns=[Math.round(target*model.total[type][0]/total),0];ns[1]=target-ns[0];
    for(let s=0;s<2;s++)if(model.total[type][s]>0&&ns[s]===0){ns[s]=1;ns[1-s]--;}
    for(let source=0;source<2;source++) {
     if(model.total[type][source]===0){ns[source]=0;continue;}
     const count=ns[source],weight=model.total[type][source]/count;
     const group={type,source,weight,budget:{natural:[0,0],manual:[0,0]},particles:[]};
     const nInside=Math.round(count*model.inside[type][source]/model.total[type][source]);
     for(let n=0;n<count;n++) {
      const side=n<nInside?'inside':'outside',angle=this.random()*2*Math.PI;
      const distance=side==='inside'?Math.sqrt(this.random())*(this.radius-7):this.radius+7+this.random()*(edgeDistance(angle)-this.radius-7);
      const p={id:this.particles.length,side,x:CX+distance*Math.cos(angle),y:CY+distance*Math.sin(angle),transition:null,heading:this.random()*2*Math.PI};
      Object.defineProperties(p,{type:{value:type,enumerable:true},source:{value:source,enumerable:true},color:{value:COLORS[type][source],enumerable:true},weight:{value:weight,enumerable:true}});
      group.particles.push(p);this.particles.push(p);
     }
     this.groups.push(group);
    }
   }
   // A density change re-samples the current state; only future exchanges are replayed.
   this._remember(model);
  }
  // Qualitative classroom temperature levels, not kelvin or a calibrated D(T).
  setTemperature(level){if(!Number.isInteger(level)||level<0||level>2)throw new RangeError('溫度示意等級須為 0、1、2。');this.temperature=level;this.motionScale=[0.55,1,1.8][level];}
  _walk(p,dt){
   // Persistent random heading: visible travel between turns, rather than independent frame jitter.
   // Bounded substeps keep reflection stable even for unusually large animation dt.
   let remaining=dt;
   while(remaining>1e-12){const h=Math.min(remaining,0.02);remaining-=h;
    p.heading+=(this.random()+this.random()+this.random()-1.5)*3*Math.sqrt(h);
    let vx=Math.cos(p.heading),vy=Math.sin(p.heading);
    p.x+=vx*44*this.motionScale*h;p.y+=vy*44*this.motionScale*h;
    const dx=p.x-CX,dy=p.y-CY,d=Math.hypot(dx,dy),nx=d?dx/d:1,ny=d?dy/d:0;
    const boundary=p.side==='inside'?this.radius-6:this.radius+6;
    if((p.side==='inside'&&d>boundary)||(p.side==='outside'&&d<boundary)){
     const dot=vx*nx+vy*ny;if((p.side==='inside'&&dot>0)||(p.side==='outside'&&dot<0)){vx-=2*dot*nx;vy-=2*dot*ny;}
     const reflected=2*boundary-d;p.x=CX+nx*reflected;p.y=CY+ny*reflected;
    }
    if(p.x<12||p.x>WIDTH-12){p.x=p.x<12?24-p.x:2*(WIDTH-12)-p.x;vx=-vx;}
    if(p.y<12||p.y>HEIGHT-12){p.y=p.y<12?24-p.y:2*(HEIGHT-12)-p.y;vy=-vy;}
    p.heading=Math.atan2(vy,vx);this._confine(p,this.radius);
   }
  }
  cellRadius(model){return 184*Math.cbrt(model.geometry().cell/model.capacity);}
  _remember(model){for(const kind of ['natural','manual'])for(const type of ['water','salt'])for(let s=0;s<2;s++)for(let d=0;d<2;d++)this.seen[kind][type][s][d]=(kind==='natural'?model.exchange:model.manual)[type][s][d];}
  ingest(model) {
   for(const g of this.groups)for(const kind of ['natural','manual'])for(let d=0;d<2;d++) {
    const ledger=kind==='natural'?model.exchange:model.manual;
    const now=ledger[g.type][g.source][d],was=this.seen[kind][g.type][g.source][d];
    g.budget[kind][d]+=Math.max(0,now-was);this.seen[kind][g.type][g.source][d]=now;
   }
   for(const p of this.particles)if(p.transition&&p.transition.kind==='natural'&&!model.permeable[p.type]) {
    const tr=p.transition;
    if(!tr.crossed){const g=this.groups.find(g=>g.type===p.type&&g.source===p.source);g.budget.natural[tr.direction]+=p.weight;}
    p.transition=null;this._confine(p,this.radius);
   }
   this.lastPermeable={...model.permeable};
   const newRadius=this.cellRadius(model);
   if(Math.abs(newRadius-this.radius)>1e-12){for(const p of this.particles)this._warp(p,this.radius,newRadius);this.radius=newRadius;}
  }
  _confine(p,r) {
   let dx=p.x-CX,dy=p.y-CY,d=Math.hypot(dx,dy);const a=Math.atan2(dy,dx);
   let nd=d;
   if(p.side==='inside')nd=Math.min(d,r-6);
   else nd=Math.max(r+6,Math.min(d,edgeDistance(a)));
   if(d<1e-10){dx=1;dy=0;d=1;}
   if(nd!==d){p.x=CX+dx/d*nd;p.y=CY+dy/d*nd;}
   p.x=Math.max(12,Math.min(WIDTH-12,p.x));p.y=Math.max(12,Math.min(HEIGHT-12,p.y));
  }
  _warp(p,oldR,newR) {
   if(p.transition){const tr=p.transition;p.x=CX+(newR+tr.offset)*Math.cos(tr.angle);p.y=CY+(newR+tr.offset)*Math.sin(tr.angle);return;}
   const d=radial(p),a=Math.atan2(p.y-CY,p.x-CX),edge=edgeDistance(a);
   const nd=p.side==='inside'?d/oldR*newR:newR+(d-oldR)/(edge-oldR)*(edge-newR);
   p.x=CX+nd*Math.cos(a);p.y=CY+nd*Math.sin(a);this._confine(p,newR);
  }
  _schedule(model) {
   // Prioritize marked human transfers; passive animation spends only passive flux budgets.
   for(const g of this.groups)for(const kind of ['manual','natural'])for(let d=0;d<2;d++) {
    if(kind==='natural'&&!model.permeable[g.type])continue;
    if(g.budget[kind][d]+g.weight*1e-12<g.weight)continue;
    const side=d===0?'outside':'inside';
    const candidates=g.particles.filter(p=>p.side===side&&!p.transition).sort((a,b)=>Math.abs(radial(a)-this.radius)-Math.abs(radial(b)-this.radius));
    const backlog=g.budget[kind][d]/g.weight,available=candidates.length;
    for(let n=0;n<available&&g.budget[kind][d]+g.weight*1e-12>=g.weight;n++){
     const p=candidates[n];g.budget[kind][d]=Math.max(0,g.budget[kind][d]-g.weight);
     const offset=radial(p)-this.radius;
     p.transition={kind,direction:d,angle:Math.atan2(p.y-CY,p.x-CX),offset,startOffset:offset,crossed:false,elapsed:0,duration:kind==='manual'?0.24:backlog>3?0.08:0.24};
    }
   }
  }
  _advance(model,dt,walk) {
   this._schedule(model);
   let changed=false;
   for(const p of this.particles) {
    const tr=p.transition;
    if(tr) {
     const sign=tr.direction===0?-1:1;tr.elapsed=Math.min(tr.duration,tr.elapsed+dt);
     const progress=tr.elapsed/tr.duration;
     tr.offset=tr.startOffset+(sign*9-tr.startOffset)*progress;changed=true;
     if(!tr.crossed&&sign*tr.offset>=0) {
      p.side=tr.direction===0?'inside':'outside';tr.crossed=true;
      this.records.push({time:model.time,id:p.id,type:p.type,source:p.source,color:p.color,direction:tr.direction,kind:tr.kind,amount:p.weight});
     }
     p.x=CX+(this.radius+tr.offset)*Math.cos(tr.angle);p.y=CY+(this.radius+tr.offset)*Math.sin(tr.angle);
     if(progress>=1){p.transition=null;this._confine(p,this.radius);}
    } else if(walk) {
     this._walk(p,dt);changed=dt>0||changed;
    }
   }
   return changed;
  }
  update(model,dt) {
   if(!Number.isFinite(dt)||dt<0)throw new RangeError('動畫時間增量無效。');
   this.ingest(model);this._advance(model,dt,true);
  }
  hasReplay(model,type=null) {
   for(const g of this.groups){if(type&&g.type!==type)continue;
    if(g.particles.some(p=>p.transition))return true;
    for(const kind of ['manual','natural']){if(kind==='natural'&&!model.permeable[g.type])continue;
     for(let d=0;d<2;d++)if(g.budget[kind][d]+g.weight*1e-12>=g.weight&&g.particles.some(p=>!p.transition&&p.side===(d===0?'outside':'inside')))return true;
    }
   }
   return false;
  }
  settle(model,dt) {
   if(!Number.isFinite(dt)||dt<0)throw new RangeError('動畫補完時間增量無效。');
   this.ingest(model);let remaining=dt,changed=false;
   while(remaining>1e-12&&this.hasReplay(model)){const h=Math.min(0.01,remaining);changed=this._advance(model,h,false)||changed;remaining-=h;}
   return changed;
  }
  maximumMarkerError(model) {
   return Math.max(0,...Object.values(this.audit(model)).map(g=>Math.abs(g.shownInside-g.modelInside)/g.weight));
  }
  draw(ctx,model,{water=true,salt=true,fadeWater=false,fadeSalt=false,displayScale=1}={}) {
   const r=this.radius,pointScale=Math.max(1,displayScale*0.68),fontSize=Math.max(16,12*displayScale);
   ctx.globalAlpha=1;ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.fillStyle='#f5faf7';ctx.fillRect(0,0,WIDTH,HEIGHT);
   ctx.strokeStyle='#d5e1d9';ctx.lineWidth=1;ctx.strokeRect(9,9,WIDTH-18,HEIGHT-18);
   ctx.fillStyle='#edf1e0';ctx.beginPath();ctx.arc(CX,CY,r,0,2*Math.PI);ctx.fill();
   ctx.strokeStyle='#b5a153';ctx.lineWidth=4;ctx.stroke();
   for(const p of this.particles){if((p.type==='water'&&!water)||(p.type==='salt'&&!salt))continue;
    ctx.globalAlpha=(p.type==='water'?fadeWater:fadeSalt)?0.24:1;
    const size=(p.type==='water'?3.3:4.8)*pointScale;ctx.fillStyle=p.color;ctx.beginPath();if(p.type==='water')ctx.arc(p.x,p.y,size,0,2*Math.PI);else{ctx.moveTo(p.x,p.y-size);ctx.lineTo(p.x+size,p.y);ctx.lineTo(p.x,p.y+size);ctx.lineTo(p.x-size,p.y);ctx.closePath();}ctx.fill();ctx.globalAlpha=1;
    if(p.transition?.kind==='manual'){ctx.strokeStyle='#111827';ctx.lineWidth=1;ctx.stroke();}
   }
   ctx.font=fontSize+'px system-ui';ctx.textAlign='left';ctx.fillStyle='#f5faf7ed';ctx.fillRect(20,17,fontSize*3.6,fontSize+12);ctx.fillStyle='#4b6c5b';ctx.fillText('細胞外',27,23+fontSize);
   ctx.textAlign='center';ctx.fillStyle='#edf1e0ed';ctx.fillRect(CX-fontSize*1.8,CY-r+12,fontSize*3.6,fontSize+10);ctx.fillStyle='#526c4c';ctx.fillText('細胞內',CX,CY-r+17+fontSize);ctx.textAlign='left';
  }
  audit(model) {
   const out={};for(const g of this.groups){const inside=g.particles.filter(p=>p.side==='inside').length;
    out[g.type+g.source]={count:g.particles.length,weight:g.weight,shownInside:inside*g.weight,modelInside:model.inside[g.type][g.source],
      inFlight:g.particles.filter(p=>p.transition).length,pending:g.budget};}
   return out;
  }
 }
 return {ParticleView,randomGenerator,COLORS,WIDTH,HEIGHT};
});
