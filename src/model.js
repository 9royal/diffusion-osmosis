(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OsmosisModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DT = 0.025;
  const PARAMETERS = Object.freeze({
    dryVolume: 20, waterVolume: 1, backgroundConcentration: 0.1,
    waterConductanceRT: 30, saltPermeability: 12, waterExchange: 5,
    minVolumeRatio: 0.4, maxVolumeRatio: 1.8, minWaterFraction: 0.02,
    observationWindow: 1, stableWindows: 3,
    relativeFluxTolerance: 1e-5, gradientTolerance: 1e-4, macroTolerance: 2e-4
  });
  const DEFAULT = Object.freeze({insideWater:120, outsideWater:240, insideSalt:24, outsideSalt:12,
    waterPermeable:true, saltPermeable:false, seed:271828});
  const copy = x => JSON.parse(JSON.stringify(x));
  const emptyLedger = () => ({water:[[0,0],[0,0]],salt:[[0,0],[0,0]]});
  const sum = a => a[0] + a[1];
  function validate(config) {
    const c = {...DEFAULT, ...config};
    for (const key of ['insideWater','outsideWater']) {
      if (!Number.isFinite(c[key]) || c[key] < 20 || c[key] > 600) throw new RangeError('初始內外水量各須介於 20–600 模型單位。');
    }
    for (const key of ['insideSalt','outsideSalt']) {
      if (!Number.isFinite(c[key]) || c[key] < 0 || c[key] > 120) throw new RangeError('初始鹽量須介於 0–120 模型單位。');
    }
    if (!Number.isSafeInteger(c.seed) || c.seed < 0 || c.seed > 4294967295) throw new RangeError('隨機種子須為 0–4294967295 的整數。');
    if (typeof c.waterPermeable !== 'boolean' || typeof c.saltPermeable !== 'boolean') throw new TypeError('膜通透性須為二元開關。');
    return Object.freeze(c);
  }
  class Model {
    constructor(config = {}) {
      this.initial = validate(config);
      this.p = PARAMETERS;
      this.total = {water:[this.initial.insideWater,this.initial.outsideWater], salt:[this.initial.insideSalt,this.initial.outsideSalt]};
      this.inside = {water:[this.total.water[0],0], salt:[this.total.salt[0],0]};
      this.permeable = {water:this.initial.waterPermeable,salt:this.initial.saltPermeable};
      this.background = Object.freeze([this.initial.insideWater*this.p.backgroundConcentration,this.initial.outsideWater*this.p.backgroundConcentration]);
      this.capacity = this.p.dryVolume + sum(this.total.water)*this.p.waterVolume;
      this.initialVolume = this.p.dryVolume + this.initial.insideWater*this.p.waterVolume;
      const minimumWater = Math.max(1,sum(this.total.water)*this.p.minWaterFraction)*this.p.waterVolume;
      this.bounds = Object.freeze({min:Math.max(this.p.dryVolume+minimumWater,this.initialVolume*this.p.minVolumeRatio),
        max:Math.min(this.capacity-minimumWater,this.initialVolume*this.p.maxVolumeRatio)});
      this.time=0; this.ticks=0; this.started=false; this.limit=null;
      this.exchange=emptyLedger(); this.manual=emptyLedger(); this.events=[];
      this.stable={water:0,salt:0}; this.nextWindow=1; this.nextSample=0.25;
      this.lastObservation=this.snapshot(); this.history=[this.snapshot()];
    }
    amount(type, side) {
      const n=sum(this.inside[type]); return side==='inside'?n:sum(this.total[type])-n;
    }
    geometry() {
      const vi=this.amount('water','inside')*this.p.waterVolume;
      const cell=this.p.dryVolume+vi;
      return {inside:vi,outside:this.capacity-cell,cell,ratio:cell/this.initialVolume,
        radiusRatio:Math.cbrt(cell/this.initialVolume),area:Math.pow(cell/this.initialVolume,2/3)};
    }
    flux() {
      const g=this.geometry(), wi=this.amount('water','inside'), wo=this.amount('water','outside');
      const cs=[this.amount('salt','inside')/g.inside,this.amount('salt','outside')/g.outside];
      const cb=[this.background[0]/g.inside,this.background[1]/g.outside];
      const sigma=this.permeable.salt?0:1;
      const drive=sigma*(cs[0]-cs[1])+cb[0]-cb[1];
      const waterNet=this.permeable.water?this.p.waterConductanceRT*g.area*drive/this.p.waterVolume:0;
      // A model tracer-exchange coefficient, not a measured molecular rate.
      const base=this.permeable.water?this.p.waterExchange*g.area:0;
      const water={in:base+Math.max(0,waterNet),out:base+Math.max(0,-waterNet),net:waterNet};
      const salt={in:this.permeable.salt?this.p.saltPermeability*g.area*cs[1]:0,
        out:this.permeable.salt?this.p.saltPermeability*g.area*cs[0]:0};
      salt.net=salt.in-salt.out;
      return {water,salt,cs,cb,drive,sigma,geometry:g,waterAmounts:[wi,wo]};
    }
    snapshot() {
      const f=this.flux();
      const origins={};
      for(const type of ['water','salt']) {
        const i=this.amount(type,'inside'), o=this.amount(type,'outside');
        origins[type]={inside:i>0?this.inside[type].map(x=>x/i):[null,null],
          outside:o>0?this.total[type].map((x,k)=>(x-this.inside[type][k])/o):[null,null]};
      }
      return {time:this.time,volume:100*f.geometry.ratio,cellVolume:f.geometry.cell,
        water:[this.amount('water','inside'),this.amount('water','outside')],
        salt:[this.amount('salt','inside'),this.amount('salt','outside')],
        cs:f.cs.slice(),cb:f.cb.slice(),waterFlux:{...f.water},saltFlux:{...f.salt},origins};
    }
    status() {
      if(this.limit)return {system:'limit',water:'limit',salt:'limit'};
      if(!this.started)return {system:'ready',water:'ready',salt:'ready'};
      const states={};
      for(const type of ['water','salt']) states[type]=!this.permeable[type]?'blocked':sum(this.total[type])===0?'absent':this.stable[type]>=this.p.stableWindows?'near':'changing';
      const active=['water','salt'].filter(t=>this.permeable[t]&&sum(this.total[t])>0);
      const system=active.length===0?'blocked':active.every(t=>states[t]==='near')?'near':'changing';
      return {system,...states};
    }
    _resetObservation() {
      this.stable={water:0,salt:0};this.nextWindow=this.time+this.p.observationWindow;this.lastObservation=this.snapshot();
    }
    _observe() {
      if(this.time+1e-10<this.nextWindow)return;
      const s=this.snapshot(),f=this.flux(),old=this.lastObservation;
      const waterOK=this.permeable.water&&Math.abs(f.drive)<this.p.gradientTolerance&&
        Math.abs(f.water.net)/sum(this.total.water)<this.p.relativeFluxTolerance&&
        Math.abs(s.cellVolume-old.cellVolume)/this.initialVolume<this.p.macroTolerance;
      const saltOK=this.permeable.salt&&Math.abs(f.cs[0]-f.cs[1])<this.p.gradientTolerance&&
        Math.abs(f.salt.net)/Math.max(1,sum(this.total.salt))<this.p.relativeFluxTolerance&&
        Math.max(...s.cs.map((c,k)=>Math.abs(c-old.cs[k])))<this.p.macroTolerance;
      this.stable.water=waterOK?this.stable.water+1:0;this.stable.salt=saltOK?this.stable.salt+1:0;
      this.lastObservation=s;this.nextWindow+=this.p.observationWindow;
    }
    _exchange(type, f, h) {
      const a=this.inside[type], totals=this.total[type], ni=sum(a),no=sum(totals)-ni;
      const inbound=f.in*h,outbound=f.out*h;
      for(let k=0;k<2;k++) {
        const incoming=no>0?inbound*(totals[k]-a[k])/no:0;
        const outgoing=ni>0?outbound*a[k]/ni:0;
        a[k]+=incoming-outgoing;
        if(a[k]<-1e-9||a[k]>totals[k]+1e-9)throw new Error('來源庫存超出範圍。');
        a[k]=Math.max(0,Math.min(totals[k],a[k]));
        this.exchange[type][k][0]+=incoming;this.exchange[type][k][1]+=outgoing;
      }
    }
    step() {
      if(this.limit)return false;
      this.started=true;
      let remaining=DT;
      while(remaining>1e-12) {
        const f=this.flux();let h=remaining;
        // Donor-based subdivision preserves positivity without inventing material.
        for(const type of ['water','salt'])for(const [side,direction] of [['inside','out'],['outside','in']]) {
          const rate=f[type][direction];if(rate>0)h=Math.min(h,0.2*this.amount(type,side)/rate);
        }
        let edge=null;
        if(f.water.net>0) {
          const to=(this.bounds.max-f.geometry.cell)/(f.water.net*this.p.waterVolume);
          if(to<=h+1e-12){h=Math.max(0,to);edge='upper';}
        } else if(f.water.net<0) {
          const to=(this.bounds.min-f.geometry.cell)/(f.water.net*this.p.waterVolume);
          if(to<=h+1e-12){h=Math.max(0,to);edge='lower';}
        }
        if(h>0){this._exchange('water',f.water,h);this._exchange('salt',f.salt,h);this.time+=h;remaining-=h;}
        if(edge){this.limit={edge,time:this.time,volume:this.geometry().cell};break;}
        if(h<=1e-12)throw new Error('數值步長不足；已停止以避免無效結果。');
      }
      this.ticks++;
      if(!this.limit)this.time=this.ticks*DT;
      this._observe();
      if(this.time+1e-10>=this.nextSample||this.limit){this.history.push(this.snapshot());this.nextSample+=0.25;}
      return true;
    }
    setPermeability(type,value) {
      if(this.limit)throw new Error('已達模型邊界，請重設或建立新實驗。');
      if(!['water','salt'].includes(type)||typeof value!=='boolean')throw new TypeError('通透性設定無效。');
      if(this.permeable[type]===value)return;
      this.permeable[type]=value;
      this.events.push({kind:'membrane',time:this.time,type,value});this._resetObservation();
      this.history.push(this.snapshot());
    }
    transfer(type,direction,amount) {
      if(this.limit)throw new Error('已達模型邊界，請重設或建立新實驗。');
      if(!['water','salt'].includes(type)||!['in','out'].includes(direction)||!Number.isFinite(amount)||amount<=0)throw new RangeError('請輸入正數轉移量。');
      const side=direction==='in'?'outside':'inside',available=this.amount(type,side);
      if(amount>available+1e-10)throw new RangeError('轉移量超過來源區室的庫存。');
      const sign=direction==='in'?1:-1;
      if(type==='water') {
        const target=this.geometry().cell+sign*amount*this.p.waterVolume;
        if(target<this.bounds.min-1e-9||target>this.bounds.max+1e-9)throw new RangeError('此轉移會超出細胞體積安全範圍。');
      }
      const quantities=this.total[type].map((n,k)=>direction==='in'?n-this.inside[type][k]:this.inside[type][k]);
      for(let k=0;k<2;k++) {
        const moved=available>0?Math.min(amount,available)*quantities[k]/available:0;
        this.inside[type][k]+=sign*moved;this.manual[type][k][direction==='in'?0:1]+=moved;
      }
      this.events.push({kind:'transfer',time:this.time,type,direction,amount});
      this._resetObservation();this.history.push(this.snapshot());
    }
    audit() {
      const g=this.geometry();let maximumError=0;
      for(const type of ['water','salt'])for(let k=0;k<2;k++) {
        const x=this.inside[type][k],total=this.total[type][k];
        if(!Number.isFinite(x)||x<-1e-8||x>total+1e-8)throw new Error('庫存無效。');
        maximumError=Math.max(maximumError,Math.abs(x+(total-x)-total));
      }
      if(g.cell<this.bounds.min-1e-7||g.cell>this.bounds.max+1e-7)throw new Error('細胞體積超出安全界限。');
      return {maximumOriginError:maximumError,capacityError:Math.abs(g.inside+g.outside+this.p.dryVolume-this.capacity)};
    }
  }
  class Laboratory {
    constructor(config={},mode='basic') {
      if(!['basic','explore'].includes(mode))throw new TypeError('實驗模式無效。');
      this.config=validate(config);this.mode=mode;this.model=new Model(this.config);this.running=false;this.hasBegun=false;this.accumulator=0;
    }
    get locked(){return this.hasBegun;}
    configure(patch) {
      if(this.locked)throw new Error('初始條件已鎖定，請選「建立新實驗」。');
      this.config=validate({...this.config,...patch});this.model=new Model(this.config);this.accumulator=0;
    }
    setMode(mode) {
      if(this.locked)throw new Error('本次實驗模式已鎖定。');
      if(!['basic','explore'].includes(mode))throw new TypeError('實驗模式無效。');this.mode=mode;
    }
    toggle(){if(this.model.limit)return;this.running=!this.running;if(this.running){this.hasBegun=true;this.model.started=true;}}
    pause(){this.running=false;}
    advance(duration,onStep=()=>{}) {
      if(!Number.isFinite(duration)||duration<0)throw new RangeError('時間增量無效。');
      if(!this.running)return 0;
      this.accumulator+=duration;let ticks=0;
      while(this.accumulator+1e-12>=DT) {
        const before=this.model.time;this.model.step();this.accumulator-=DT;ticks++;onStep(this.model,this.model.time-before);
        if(this.model.limit){this.running=false;this.accumulator=0;break;}
      }
      return ticks;
    }
    setPermeability(type,value) {
      if(!['water','salt'].includes(type)||typeof value!=='boolean')throw new TypeError('通透性設定無效。');
      if(!this.hasBegun){this.configure({[type+'Permeable']:value});return;}
      if(this.mode!=='explore')throw new Error('基礎實驗開始後不能更動膜通透性。');
      this.model.setPermeability(type,value);
    }
    transfer(type,direction,amount) {
      if(this.mode!=='explore'||!this.hasBegun)throw new Error('開始自由探索實驗後才能人為轉移。');
      this.model.transfer(type,direction,amount);
    }
    reset(){this.running=false;this.accumulator=0;this.model=new Model(this.config);}
    newExperiment(config=this.config,mode=this.mode) {
      const valid=validate(config);if(!['basic','explore'].includes(mode))throw new TypeError('實驗模式無效。');
      this.config=valid;this.mode=mode;this.running=false;this.hasBegun=false;this.accumulator=0;this.model=new Model(valid);
    }
  }
  const PRESETS=Object.freeze({
    diffusion:{label:'01 鹽的擴散',description:'外側鹽量較多，內側濃度卻較高。觀察鹽的淨移動方向。',config:{insideWater:100,outsideWater:300,insideSalt:40,outsideSalt:60,waterPermeable:false,saltPermeable:true},mode:'basic'},
    osmosis:{label:'02 水的滲透',description:'鹽不可通，觀察水的淨流入、細胞膨脹與外部水量減少。',config:{...DEFAULT},mode:'basic'},
    equilibrium:{label:'03 動態平衡',description:'內外初始鹽濃度相等；體積穩定後，來源顏色仍持續混合。',config:{insideWater:120,outsideWater:240,insideSalt:12,outsideSalt:24,waterPermeable:true,saltPermeable:true},mode:'basic'},
    both:{label:'04 水與鹽皆可通',description:'鹽擴散；隱含溶質初始等濃度，因此水無淨流，仍雙向交換。',config:{...DEFAULT,saltPermeable:true},mode:'basic'},
    explore:{label:'05 改變膜通透性',description:'先讓水滲透，再開啟鹽通道。也可人為轉移水或鹽，檢查擾動後的變化。',config:{...DEFAULT},mode:'explore'}
  });
  return {Model,Laboratory,DT,PARAMETERS,DEFAULT,PRESETS,validate,copy};
});
