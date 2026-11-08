(function(){
 'use strict';
 const {Laboratory,DEFAULT:MODEL_DEFAULT,PRESETS:MODEL_PRESETS,DT}=window.OsmosisModel;
 const {ParticleView,COLORS}=window.OsmosisParticles;
 const {Playback}=window.OsmosisPresentation;
 const $=id=>document.getElementById(id),quantityKeys=['insideWater','outsideWater','insideSalt','outsideSalt'];
 const names={water:'水',salt:'鹽'},states={ready:'尚未開始',changing:'變化中',near:'接近平衡',blocked:'不可通',absent:'無此溶質',limit:'超出模型範圍'};
 const DEFAULT={...MODEL_DEFAULT,insideWater:20,outsideWater:40,insideSalt:4,outsideSalt:2};
 const presetChanges={diffusion:{insideWater:20,outsideWater:50,insideSalt:4,outsideSalt:6,waterPermeable:false,saltPermeable:true},equilibrium:{insideSalt:2,outsideSalt:4,saltPermeable:true},both:{saltPermeable:true}};
 const PRESETS=Object.fromEntries(Object.entries(MODEL_PRESETS).map(([id,p])=>[id,{...p,config:{...DEFAULT,...presetChanges[id]}}]));
 PRESETS.equalWater={label:'06 同水量，內鹽較高',description:'兩側水相體積同為 30，內鹽 6、外鹽 2；鹽不可通。比較雙向交換與水的淨流入。',config:{...DEFAULT,insideWater:30,outsideWater:30,insideSalt:6,outsideSalt:2},mode:'basic'};
 let lab=new Laboratory(DEFAULT);
 function visualOptions(){return {temperature:Number($('temperature').value),density:Number($('density').value),targets:{water:Math.min(48,Math.ceil(lab.model.total.water[0]+lab.model.total.water[1])),salt:Math.min(24,Math.ceil(lab.model.total.salt[0]+lab.model.total.salt[1]))}};}
 let view=new ParticleView(lab.model,visualOptions()),speed=2,lastFrame=null,lastRender=0,dirty=true;
 let lastAmounts=null,countChanges={};
 const playback=new Playback(lab,view,{modelTimeScale:0.05});
 let chartSelection=null,chartSelectedSample=null,chartGeometry=null,chartSamples=[],visualLag=false;
 const fmt=(n,d=2)=>n===null?'—':(Math.abs(n)<0.5*10**(-d)?0:n).toFixed(d),pct=n=>n===null?'—':(100*n).toFixed(1)+'%';
 const put=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
 const sim=$('simulationCanvas').getContext('2d'),trend=$('trendCanvas').getContext('2d');
 function showError(e){$('error').textContent=e.message||String(e);$('error').hidden=false;}
 function clearError(){$('error').hidden=true;$('error').textContent='';}
 function attempt(fn){try{clearError();fn();dirty=true;render();}catch(e){showError(e);}}
 function createView({preservePending=false}={}){view=new ParticleView(lab.model,visualOptions());playback.reset(view,{preservePending});chartSelection=null;chartSelectedSample=null;$('transferFeedback').hidden=true;}
 function syncInputs(){const c=lab.config;for(const k of quantityKeys){$(k).value=c[k];$(k+'Range').value=c[k];}$('seed').value=c.seed;$('waterPermeable').checked=lab.model.permeable.water;$('saltPermeable').checked=lab.model.permeable.salt;$('mode').value=lab.mode;}
 function initialValues(){const c={};for(const k of [...quantityKeys,'seed']){const el=$(k);if(!el.checkValidity()){$('initialDetails').open=true;if(k==='seed')el.closest('details').open=true;el.focus();throw new RangeError('請檢查初始數量與種子的範圍。');}c[k]=Number(el.value);}return c;}
 function updateInitial(key,fromRange){attempt(()=>{if(fromRange)$(key).value=$(key+'Range').value;else if($(key).checkValidity())$(key+'Range').value=$(key).value;lab.configure(initialValues());createView();$('preset').value='custom';$('scenarioNote').textContent='自訂條件：比較濃度差、膜通透性與細胞體積。';});}
 $('preset').innerHTML=Object.entries(PRESETS).map(([id,p])=>'<option value="'+id+'">'+p.label+'</option>').join('')+'<option value="custom">自訂實驗</option>';
 $('preset').value='osmosis';$('scenarioNote').textContent=PRESETS.osmosis.description;
 $('preset').addEventListener('change',()=>attempt(()=>{const p=PRESETS[$('preset').value];if(!p)return;lab.newExperiment({...DEFAULT,...p.config},p.mode);createView();syncInputs();$('scenarioNote').textContent=p.description;}));
 for(const k of quantityKeys){$(k).addEventListener('change',()=>updateInitial(k,false));$(k+'Range').addEventListener('input',()=>updateInitial(k,true));}
 $('seed').addEventListener('change',()=>attempt(()=>{lab.configure(initialValues());createView();}));
 $('mode').addEventListener('change',()=>attempt(()=>lab.setMode($('mode').value)));
 for(const t of ['water','salt'])$(t+'Permeable').addEventListener('change',()=>attempt(()=>{playback.setPermeability(t,$(t+'Permeable').checked);if(!lab.hasBegun)createView();else view.ingest(lab.model);}));
 $('startButton').addEventListener('click',()=>attempt(()=>{if(!lab.hasBegun){lab.configure(initialValues());createView();}lab.toggle();lastFrame=null;}));
 $('resetButton').addEventListener('click',()=>attempt(()=>{lab.reset();createView();syncInputs();lastFrame=null;}));
 $('newButton').addEventListener('click',()=>attempt(()=>{lab.newExperiment();createView();syncInputs();lastFrame=null;}));
 $('temperature').addEventListener('input',()=>{view.setTemperature(Number($('temperature').value));$('temperatureValue').textContent=['低溫','常溫','高溫'][view.temperature];dirty=true;render();});
 $('speed').addEventListener('input',()=>{speed=Number($('speed').value);$('speedValue').textContent=speed+'×';});
 $('transferForm').addEventListener('submit',e=>{e.preventDefault();attempt(()=>{playback.transfer($('transferType').value,$('transferDirection').value,Number($('transferAmount').value));$('transferFeedback').textContent=eventText(lab.model.events.at(-1))+'。全系統總量不變。';$('transferFeedback').hidden=false;});});
 $('initialForm').addEventListener('submit',e=>e.preventDefault());
 for(const id of ['showWater','showSalt','chartKind','chartSpecies','chartSide','exchangeSpecies'])$(id).addEventListener('change',()=>{dirty=true;render();});
 $('density').addEventListener('change',()=>{createView({preservePending:true});dirty=true;render();});
 for(const type of ['Water','Salt'])$('fade'+type).addEventListener('click',()=>{const button=$('fade'+type),faded=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(faded));button.textContent=(type==='Water'?'水':'鹽')+(faded?'已淡化':'淡化');dirty=true;render();});
 const chartTabs=Array.from(document.querySelectorAll('[data-chart]'));
 function chooseChart(kind,focus=false){$('chartKind').value=kind;chartSelection=null;chartSelectedSample=null;render();if(focus)$('tab-'+kind).focus();}
 for(const [index,tab]of chartTabs.entries()){
  tab.addEventListener('click',()=>chooseChart(tab.dataset.chart));
  tab.addEventListener('keydown',e=>{let next=index;if(e.key==='ArrowRight')next=(index+1)%4;else if(e.key==='ArrowLeft')next=(index+3)%4;else if(e.key==='Home')next=0;else if(e.key==='End')next=3;else return;e.preventDefault();chooseChart(chartTabs[next].dataset.chart,true);});
 }
 $('chartLive').addEventListener('click',()=>{chartSelection=null;chartSelectedSample=null;render();$('trendCanvas').focus({preventScroll:true});});
 $('trendCanvas').addEventListener('click',e=>{if(!chartGeometry||!chartSamples.length)return;const {from,to,left,right,width}=chartGeometry,rect=$('trendCanvas').getBoundingClientRect();const ratio=Math.max(0,Math.min(1,(e.clientX-rect.left-left)/(width-left-right)));const time=from+ratio*(to-from);chartSelectedSample=chartSamples.reduce((a,s)=>Math.abs(s.time-time)<=Math.abs(a.time-time)?s:a);chartSelection=chartSelectedSample.time;$('trendCanvas').focus({preventScroll:true});render();});
 $('trendCanvas').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();chartSelection=null;chartSelectedSample=null;render();return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||!chartSamples.length)return;e.preventDefault();let i=chartSelection===null?chartSamples.length-1:chartSamples.indexOf(chartSelectedSample);if(i<0)i=chartSamples.findIndex(s=>s.time>=chartSelection);if(i<0)i=chartSamples.length-1;i=e.key==='Home'?0:e.key==='End'?chartSamples.length-1:Math.max(0,Math.min(chartSamples.length-1,i+(e.key==='ArrowLeft'?-1:1)));chartSelectedSample=chartSamples[i];chartSelection=chartSelectedSample.time;render();});
 function eventText(e){return 't='+fmt(e.time)+' · '+(e.kind==='membrane'?names[e.type]+'膜改為'+(e.value?'可通':'不可通'):'人為轉移'+names[e.type]+' '+fmt(e.amount)+'：'+(e.direction==='in'?'外 → 內':'內 → 外'));}
 function dataSeries(){
  const kind=$('chartKind').value,type=$('chartSpecies').value,side=$('chartSide').value;
  if(kind==='volume')return {unit:'初始體積 %',series:[{label:'細胞體積',color:'#425c94',get:s=>s.volume}]};
  if(kind==='concentration')return {unit:'鹽量 / 水相體積',series:[{label:'細胞內鹽濃度',color:'#218449',get:s=>s.cs[0]},{label:'細胞外鹽濃度',color:'#991b34',get:s=>s.cs[1]}]};
  if(kind==='flux')return {unit:'模型量 / 模擬時間',series:[{label:names[type]+'流入',color:'#2774ce',get:s=>s[type+'Flux'].in},{label:names[type]+'流出',color:'#d66e1b',get:s=>s[type+'Flux'].out},{label:'淨流入',color:'#596573',get:s=>s[type+'Flux'].net,dashed:true}]};
  return {unit:'來源占比 %',series:[{label:(side==='inside'?'細胞內':'細胞外')+'的內源'+names[type],color:COLORS[type][0],get:s=>s.origins[type][side][0]===null?null:100*s.origins[type][side][0]},
   {label:(side==='inside'?'細胞內':'細胞外')+'的外源'+names[type],color:COLORS[type][1],get:s=>s.origins[type][side][1]===null?null:100*s.origins[type][side][1]}]};
 }
 function fitCanvas(canvas,logicalWidth,logicalHeight){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(3,window.devicePixelRatio||1),width=Math.max(1,Math.round(r.width*dpr)),height=Math.max(1,Math.round(r.height*dpr));
  if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
  canvas.getContext('2d').setTransform(width/(logicalWidth||r.width||1),0,0,height/(logicalHeight||r.height||1),0,0);return r;
 }
 function drawChart(){
  const m=lab.model,kind=$('chartKind').value,{unit,series}=dataSeries();const history=playback.history(),current=m.snapshot();if(history.at(-1).time!==current.time)history.push(current);
  chartSamples=history;const rect=fitCanvas($('trendCanvas')),c=trend,w=rect.width,h=rect.height,left=53,right=14,top=30,bottom=41;
  c.clearRect(0,0,w,h);const from=history[0].time,to=Math.max(from+5,current.time);chartGeometry={from,to,left,right,width:w};
  const values=history.flatMap(s=>series.map(l=>l.get(s))).filter(Number.isFinite);let low=Math.min(0,...values),high=Math.max(0,...values);if(high===0&&low===0)high=1;
  if(kind==='volume'){low=Math.max(0,Math.min(90,...values.map(v=>v-5)));high=Math.max(110,...values.map(v=>v+5));}
  if(kind==='origins'){low=0;high=100;}
  const rough=(high-low)/4,magnitude=10**Math.floor(Math.log10(rough)),factor=[1,2,2.5,5,10].find(n=>n>=rough/magnitude),step=factor*magnitude;
  low=Math.floor(low/step)*step;high=Math.ceil(high/step)*step;const decimals=Math.max(0,-Math.floor(Math.log10(step)))+(factor===2.5?1:0);
  const x=t=>left+(t-from)/(to-from)*(w-left-right),y=n=>h-bottom-(n-low)/(high-low)*(h-top-bottom);
  c.font='12px system-ui';c.lineWidth=1;
  for(let v=low;v<=high+step*1e-6;v+=step){const yy=y(v);c.strokeStyle='#e1e9df';c.beginPath();c.moveTo(left,yy);c.lineTo(w-right,yy);c.stroke();c.fillStyle='#526f5b';c.textAlign='right';c.fillText(Math.abs(v)>0&&Math.abs(v)<1e-4?v.toExponential(1):fmt(v,Math.min(5,decimals)),left-8,yy+4);}
  c.textAlign='center';const ticks=w>450?4:3;for(let n=0;n<=ticks;n++){const t=from+(to-from)*n/ticks;c.fillStyle='#526f5b';c.fillText(fmt(t,1),x(t),h-bottom+18);}
  c.fillText('模擬時間',left+(w-left-right)/2,h-5);c.textAlign='left';c.fillText(unit,2,15);
  for(const e of m.events.filter(e=>e.time>=from)){c.strokeStyle='#9b7543';c.setLineDash([3,4]);c.beginPath();c.moveTo(x(e.time),top);c.lineTo(x(e.time),h-bottom);c.stroke();c.setLineDash([]);}
  let selected=current;if(chartSelection!==null){selected=chartSelectedSample||history[0];if(selected.time<history[0].time)selected=history[0];chartSelectedSample=selected;chartSelection=selected.time;c.strokeStyle='#82927c';c.setLineDash([2,3]);c.beginPath();c.moveTo(x(selected.time),top);c.lineTo(x(selected.time),h-bottom);c.stroke();c.setLineDash([]);}
  for(const line of series){c.strokeStyle=line.color;c.lineWidth=2.2;c.setLineDash(line.dashed?[5,3]:[]);c.beginPath();let pen=false;for(const s of history){const v=line.get(s);if(v===null){pen=false;continue;}if(pen)c.lineTo(x(s.time),y(v));else{c.moveTo(x(s.time),y(v));pen=true;}}c.stroke();c.setLineDash([]);const value=line.get(selected);if(value!==null){c.fillStyle=line.color;c.beginPath();c.arc(x(selected.time),y(value),3.2,0,2*Math.PI);c.fill();}}
  $('chartLegend').replaceChildren(...series.map(l=>{const span=document.createElement('span'),swatch=document.createElement('i');swatch.className='line-swatch'+(l.dashed?' dashed':'');swatch.style.color=l.color;swatch.setAttribute('aria-hidden','true');span.append(swatch,document.createTextNode(l.label+(l.dashed?'（虛線）':'')));return span;}));
  $('chartLatest').dataset.history=String(chartSelection!==null);$('chartLatest').setAttribute('aria-live',chartSelection===null?'off':'polite');
  put('chartLatest',(chartSelection===null?'即時':'歷史取樣')+' · t='+fmt(selected.time)+'：'+series.map(l=>{const value=l.get(selected);return l.label+' '+(value===null?'無此物質':fmt(value,kind==='concentration'?4:3)+(kind==='volume'||kind==='origins'?'%':''));}).join('；'));
  $('chartLive').hidden=chartSelection===null;$('trendCanvas').setAttribute('aria-label',chartTabs.find(t=>t.dataset.chart===kind).textContent+'，單位 '+unit+'。可用方向鍵查看取樣。');
  put('chartHelp',(kind==='flux'?'流入：外→內；流出：內→外。淨流入為負表示淨流出。':kind==='origins'?'內源與外源表示最初所在位置，跨膜後顏色不變。':kind==='concentration'?'鹽濃度線顯示目前的內外區室，並非按原始來源分組。':'')+'點選圖表查看取樣；聚焦後可用 ← → 選擇時間。');
 }
 function renderAmounts(m,s){
  const now=performance.now(),fields=[['liveWi','water',0],['liveWo','water',1],['liveSi','salt',0],['liveSo','salt',1]];
  if(lastAmounts?.model!==m){lastAmounts=null;countChanges={};}
  const values={};
  for(const [id,type,side]of fields){const value=s[type][side];values[id]=value;put(id,fmt(value));
   const delta=lastAmounts?value-lastAmounts.values[id]:0;
   if(Math.abs(delta)>=0.0005)countChanges[id]={delta,until:now+650};
   const change=countChanges[id],active=change&&change.until>now,direction=active?(change.delta>0?'up':'down'):'steady';
   $(id+'Change').dataset.direction=direction;
   put(id+'Change',active?(change.delta>0?'↑ +':'↓ −')+fmt(Math.abs(change.delta),3):!m.started?'初始量':!lab.running?'數值暫停':!m.permeable[type]?'不可通':'淨量穩定');
  }
  lastAmounts={model:m,values};
  put('particleSummary','代表粒子：水 '+view.particles.filter(p=>p.type==='water').length+' · 鹽 '+view.particles.filter(p=>p.type==='salt').length);
 }
 function renderExchange(){
  const q=playback.exchangeWindow.summary(),type=$('exchangeSpecies').value,f=q[type];
  put('exchangeRange','模型時間 '+fmt(q.from)+'–'+fmt(q.to)+' · '+(q.duration<q.window-1e-8?'觀察中':'最近 1 單位時間'));
  put('exchangeIn',fmt(f.in));put('exchangeOut',fmt(f.out));put('exchangeNet',(Math.abs(f.net)<.005?'':f.net>0?'+':'−')+fmt(Math.abs(f.net)));
  const max=Math.max(f.in,f.out,1e-12);$('exchangeInBar').style.width=(100*f.in/max)+'%';$('exchangeOutBar').style.width=(100*f.out/max)+'%';
  const message=q.duration===0?'開始後，觀察同一段時間內進與出的總量。':f.in+f.out<1e-10?'這段時間沒有自然跨膜交換；區室內仍可隨機運動。':Math.abs(f.net)<1e-8&&f.in>1e-10&&f.out>1e-10?'這段時間流入約等於流出；雙向交換仍在進行。':Math.abs(f.net)<.005?'此窗淨變化小於 0.01 模型單位；請繼續觀察。':names[type]+(f.net>0?'淨流入細胞':'淨流出細胞')+'：'+(f.net>0?'流入量大於流出量。':'流出量大於流入量。');
  put('exchangeMeaning',message);$('exchangeCard').dataset.direction=Math.abs(f.net)<.005?'balanced':f.net>0?'in':'out';
 }
 function render(){
  dirty=false;const m=lab.model,s=m.snapshot(),f=m.flux(),status=m.status();
  $('initialFields').disabled=lab.locked;$('preset').disabled=lab.locked;$('mode').disabled=lab.locked;
  $('membraneFields').disabled=!!m.limit||!!playback.pendingClose||(lab.locked&&lab.mode==='basic');
  $('membraneFields').setAttribute('aria-busy',String(!!playback.pendingClose));
  $('startButton').disabled=!!m.limit||!!playback.pendingClose;$('startButton').textContent=playback.pendingClose?'同步中':lab.running?'暫停':m.started?'繼續':'開始';$('startButton').setAttribute('aria-label',playback.pendingClose?'正在完成關膜前的動畫':(lab.running?'暫停':m.started?'繼續':'開始')+'模擬');
  put('runState',playback.pendingClose?'關膜前同步':m.limit?'演算已停止':lab.running?'進行中':playback.settling?'數值暫停 · 動畫補完':m.started?'已暫停':'尚未開始');$('runState').dataset.running=String(lab.running);
  $('explorePanel').hidden=lab.mode!=='explore';$('transferButton').disabled=!lab.hasBegun||!!m.limit||!!playback.pendingClose;
  $('lockNote').textContent=lab.locked?(lab.mode==='basic'?'本次初始量與膜通透性已鎖定，暫停與重設不解鎖；請建立新實驗以改變條件。':'初始量已鎖定；可即時更動膜通透性，或使用下方人為轉移。'):'開始前可調整初始量；本次容器容量由初始水量決定。';
  put('lockBadge',lab.locked?'已鎖定':'可調整');put('modeHint',lab.mode==='basic'?'開始後鎖定條件，方便比較單一變因。':'開始後可切換膜通透性，或人為轉移庫存。');
  for(const type of ['water','salt']){const closing=playback.pendingClose?.type===type;$(type+'Permeable').checked=closing?false:m.permeable[type];put(type+'PermitLabel',closing?'同步後關閉':m.permeable[type]?'可通過':'不可通過');}
  $('volumeValue').textContent=fmt(s.volume,1)+'%';$('timeValue').textContent=fmt(s.time);put('systemState',status.system==='blocked'?'無跨膜交換':states[status.system]);$('statusCard').dataset.state=status.system;
  $('waterState').textContent='水：'+states[status.water];$('saltState').textContent='鹽：'+states[status.salt];
  $('limitBanner').hidden=!m.limit;if(m.limit)$('limitBanner').textContent='超出模型範圍：已到達'+(m.limit.edge==='upper'?'膨脹上限':'縮小下限')+'（細胞體積 '+fmt(f.geometry.cell)+'）。已停止演算；這不是平衡，也不表示真實細胞會在此尺寸停止。請重設或建立新實驗。';
  $('explanation').textContent=status.system==='near'?'巨觀狀態接近穩定，可通透物質仍持續雙向交換，來源比例仍可能改變。':status.system==='blocked'?'兩種物質均無自然跨膜交換。區室內仍有隨機運動；不可通不等於動態平衡。':status.system==='limit'?'模型已在安全邊界停止，不能把尺寸上限當作生理平衡。':status.system==='ready'?'先設定條件，再按開始。全系統的水、鹽與各來源總量在實驗中固定。':'觀察淨流入與淨流出如何改變庫存；水、鹽會分別判定是否接近平衡。';
  renderAmounts(m,s);renderExchange();
  for(const [id,value]of Object.entries({wi:s.water[0],wo:s.water[1],wt:s.water[0]+s.water[1],si:s.salt[0],so:s.salt[1],st:s.salt[0]+s.salt[1],ci:s.cs[0],co:s.cs[1]}))$(id).textContent=fmt(value,id==='ci'||id==='co'?4:2);
  $('fluxRows').innerHTML=['water','salt'].map(t=>'<tr><th>'+names[t]+'</th><td>'+fmt(f[t].in,4)+'</td><td>'+fmt(f[t].out,4)+'</td><td>'+fmt(f[t].net,4)+'</td></tr>').join('');
  $('originRows').innerHTML=['water','salt'].flatMap(t=>['inside','outside'].map(side=>'<tr><th>'+names[t]+' · '+(side==='inside'?'細胞內':'細胞外')+'</th><td>'+pct(s.origins[t][side][0])+'</td><td>'+pct(s.origins[t][side][1])+'</td></tr>')).join('');
  $('historyRows').innerHTML=playback.history(8).map(s=>'<tr><td>'+fmt(s.time)+'</td><td>'+fmt(s.volume,2)+'</td><td>'+fmt(s.cs[0],4)+'</td><td>'+fmt(s.cs[1],4)+'</td><td>'+fmt(s.waterFlux.net,4)+'</td></tr>').join('');
  $('eventCount').textContent=String(m.events.length);$('events').replaceChildren(...(m.events.length?m.events.map(e=>{const li=document.createElement('li');li.textContent=eventText(e);return li;}):[Object.assign(document.createElement('li'),{textContent:'尚無人為干預。'})]));
  const teacher={'內 / 外水相體積':fmt(f.geometry.inside)+' / '+fmt(f.geometry.outside),'固定非水體積 / 容器容量':fmt(m.p.dryVolume)+' / '+fmt(m.capacity),'固定內 / 外不可通透溶質量':m.background.map(x=>fmt(x)).join(' / '),'內 / 外不可通透溶質濃度':f.cb.map(x=>fmt(x,4)).join(' / '),'鹽反射係數 σ / 相對膜面積 A':f.sigma+' / '+fmt(f.geometry.area,4),'有效水滲透驅動差':fmt(f.drive,6),'本次安全體積範圍':fmt(m.bounds.min)+'–'+fmt(m.bounds.max),'來源守恆誤差 / 容量誤差':fmt(m.audit().maximumOriginError,12)+' / '+fmt(m.audit().capacityError,12)};
  $('teacherInfo').replaceChildren(...Object.entries(teacher).flatMap(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;return[dt,dd];}));
  const kind=$('chartKind').value;$('chartSpecies').disabled=!['flux','origins'].includes(kind);$('chartSide').disabled=kind!=='origins';$('speciesOption').hidden=$('chartSpecies').disabled;$('sideOption').hidden=$('chartSide').disabled;
  for(const tab of chartTabs){const active=tab.dataset.chart===kind;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}$('chartPanel').setAttribute('aria-labelledby','tab-'+kind);
  const visual=view.audit(m);visualLag=Object.values(visual).some(g=>Math.abs(g.shownInside-g.modelInside)>3*g.weight);$('visualNote').classList.toggle('is-lagging',visualLag);
  put('visualNote',playback.pendingClose?'先補完已計算的'+names[playback.pendingClose.type]+'交換，再關閉通道；模型時間暫停。':playback.settling?'正在補完先前已計算的交換；時間、庫存與圖表不再推進。':visualLag?'動畫正在追上已計算的量值；可暫停以完成呈現。':'兩側粒子都隨機運動，並非朝鹽直走；顏色只記錄原始來源。');
  const rect=fitCanvas($('simulationCanvas'),720,440);view.draw(sim,m,{water:$('showWater').checked,salt:$('showSalt').checked,fadeWater:$('fadeWater').getAttribute('aria-pressed')==='true',fadeSalt:$('fadeSalt').getAttribute('aria-pressed')==='true',displayScale:Math.max(1,720/Math.max(1,rect.width))});drawChart();
 }
 function frame(now){
  if(lastFrame===null)lastFrame=now;const elapsed=Math.min(0.1,(now-lastFrame)/1000);lastFrame=now;
  try{const result=playback.advance(elapsed,speed);if(result.changed)dirty=true;
   for(const change of Object.values(countChanges))if(change.until>0&&now>=change.until){change.until=0;dirty=true;}
   if(dirty&&now-lastRender>=90){render();lastRender=now;}
   else if(result.changed){const rect=$('simulationCanvas').getBoundingClientRect();view.draw(sim,lab.model,{water:$('showWater').checked,salt:$('showSalt').checked,fadeWater:$('fadeWater').getAttribute('aria-pressed')==='true',fadeSalt:$('fadeSalt').getAttribute('aria-pressed')==='true',displayScale:Math.max(1,720/Math.max(1,rect.width))});}
  }catch(e){playback.pause();showError(e);$('runState').textContent='已停止';}
  requestAnimationFrame(frame);
 }
 // Read-only observability for local validation, without a second scientific engine.
 Object.defineProperty(window,'osmosisLab',{value:Object.freeze({snapshot:()=>lab.model.snapshot(),exchangeSummary:()=>playback.exchangeWindow.summary(),status:()=>lab.model.status(),events:()=>lab.model.events.map(e=>({...e})),
  diagnostics:()=>({running:lab.running,locked:lab.locked,mode:lab.mode,playbackSpeed:speed,modelTimeScale:playback.modelTimeScale,temperature:view.temperature,motionScale:view.motionScale,particlePositions:view.particles.map(p=>({id:p.id,x:p.x,y:p.y,side:p.side,type:p.type,source:p.source,color:p.color})),particleCount:view.particles.length,visualCrossings:view.records.length,naturalCrossings:{water:view.records.filter(r=>r.kind==='natural'&&r.type==='water').length,salt:view.records.filter(r=>r.kind==='natural'&&r.type==='salt').length},manualCrossings:view.records.filter(r=>r.kind==='manual').length,permeable:{...lab.model.permeable},limit:lab.model.limit,audit:lab.model.audit(),visual:view.audit(lab.model),visualLag,chartSelection,settling:playback.settling,pendingClose:playback.pendingClose?{...playback.pendingClose}:null,maximumMarkerError:view.maximumMarkerError(lab.model),radius:view.radius,targetRadius:view.cellRadius(lab.model)})})});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){playback.pause();lastFrame=null;dirty=true;render();}});
 window.addEventListener('resize',()=>{dirty=true;});
 const resizeObserver=new ResizeObserver(()=>{dirty=true;});resizeObserver.observe($('simulationCanvas'));resizeObserver.observe($('trendCanvas'));
 if(window.matchMedia('(max-width:760px)').matches)$('initialDetails').open=false;
 syncInputs();render();requestAnimationFrame(frame);
})();
