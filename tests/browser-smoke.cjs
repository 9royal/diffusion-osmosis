const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa');fs.mkdirSync(out,{recursive:true});
const url=process.env.BASE_URL||pathToFileURL(path.join(root,'index.html')).href;
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const report={url,checks:[],errors:[],externalRequests:[]};
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{}),args:['--disable-background-networking']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('file:')&&!r.url().startsWith('data:')&&(!process.env.BASE_URL||new URL(r.url()).origin!==new URL(process.env.BASE_URL).origin))report.externalRequests.push(r.url());});
  const advance=async(ms)=>{const d=await page.evaluate(()=>window.osmosisLab.diagnostics());await page.clock.runFor(d.running?ms/(d.modelTimeScale||1):ms);};
try{
  await page.clock.install();await page.goto(url);await page.waitForFunction(()=>!!window.osmosisLab);
  const state=()=>page.evaluate(()=>window.osmosisLab.snapshot());
  const diag=()=>page.evaluate(()=>window.osmosisLab.diagnostics());
  const selectChart=kind=>page.locator('[data-chart="'+kind+'"]').click();
  const initial=await state();near(initial.volume,100);assert.equal((await diag()).particleCount,54);
  assert.ok(await page.locator('footer img').evaluate(img=>img.complete&&img.naturalWidth>0));
  await page.screenshot({path:path.join(out,'desktop-initial.png'),fullPage:true});report.checks.push('介面載入、初始數值與 Ro 圖像');
  const layout=await page.evaluate(()=>{const view=document.getElementById('observation').getBoundingClientRect(),data=document.getElementById('data').getBoundingClientRect(),chart=document.getElementById('trendCanvas').getBoundingClientRect();return {viewRight:view.right,dataLeft:data.left,chartTop:chart.top,chartBottom:chart.bottom,height:innerHeight};});assert.ok(layout.dataLeft>layout.viewRight);assert.ok(layout.chartTop<layout.height&&layout.chartBottom<layout.height);report.checks.push('桌面觀察與數據並排，趨勢圖在初始可視範圍');
  await page.locator('#startButton').click();await advance(5000);await page.locator('#startButton').click();
  const changed=await state();assert.ok(changed.water[0]>initial.water[0]);assert.ok(changed.volume>100);assert.ok(await page.locator('#insideWater').isDisabled());assert.ok(await page.locator('#saltPermeable').isDisabled());
  await page.getByText('顯示設定',{exact:true}).click();await page.locator('#showWater').uncheck();await page.locator('#density').selectOption('0.5');await advance(1500);assert.deepEqual(await state(),changed);report.checks.push('基礎模式鎖定、暫停、隱藏與密度切換保持數值');
  await page.locator('#tab-volume').focus();await page.locator('#tab-volume').press('ArrowRight');assert.equal(await page.locator('#tab-concentration').getAttribute('aria-selected'),'true');assert.equal(await page.locator('[role=tab][aria-selected=true]').count(),1);assert.deepEqual(await state(),changed);report.checks.push('圖表分頁方向鍵與單一選取狀態，保持模型不變');
  await selectChart('volume');await page.locator('#trendCanvas').focus();await page.locator('#trendCanvas').press('Home');assert.equal((await diag()).chartSelection,0);assert.ok((await page.locator('#chartLatest').innerText()).includes('歷史取樣'));await page.locator('#trendCanvas').press('ArrowRight');assert.ok((await diag()).chartSelection>0);const chartBox=await page.locator('#trendCanvas').boundingBox();await page.locator('#trendCanvas').click({position:{x:chartBox.width*0.55,y:90}});assert.ok((await diag()).chartSelection>0);assert.deepEqual(await state(),changed);await page.screenshot({path:path.join(out,'desktop-history.png'),fullPage:true});await page.locator('#chartLive').click();assert.equal((await diag()).chartSelection,null);report.checks.push('歷史取樣鍵盤與點選檢視及回到即時，只改變圖表顯示');
  await page.locator('#resetButton').click();near((await state()).water[0],initial.water[0]);assert.ok(await page.locator('#insideWater').isDisabled());await page.locator('#newButton').click();assert.ok(await page.locator('#insideWater').isEnabled());
  await page.locator('#showWater').check();await page.locator('#density').selectOption('1');
  await page.locator('#preset').selectOption('diffusion');await page.locator('#startButton').click();await advance(12000);await page.locator('#startButton').click();const d=await state();near(d.water[0],20);assert.ok(d.salt[0]<4);report.checks.push('鹽依濃度擴散；水不通時體積固定');
  await page.locator('#newButton').click();await page.locator('#preset').selectOption('equilibrium');await page.locator('#speed').fill('8');await page.locator('#startButton').click();await advance(1200);
  let e=await state(),dg=await diag();assert.equal((await page.evaluate(()=>window.osmosisLab.status())).system,'near');near(e.volume,100);assert.ok(e.waterFlux.in>0&&e.waterFlux.out>0);assert.ok(dg.visualCrossings>0);
  await selectChart('origins');await page.locator('#chartSpecies').selectOption('water');const origin=e.origins.water.inside[1];await advance(1500);e=await state();assert.ok(e.origins.water.inside[1]>origin);near(e.volume,100);
  await page.locator('#startButton').click();await page.screenshot({path:path.join(out,'desktop-equilibrium.png'),fullPage:true});report.checks.push('平衡仍交換、來源比例改變、粒子跨膜持續');
  for(const kind of ['volume','concentration','flux','origins']){await selectChart(kind);if(kind==='flux'||kind==='origins'){for(const t of ['water','salt']){await page.locator('#chartSpecies').selectOption(t);assert.ok((await page.locator('#chartLatest').innerText()).includes(t==='water'?'水':'鹽'));}}}
  report.checks.push('四種圖表與水／鹽雙向交換、來源比例切換');
  await page.locator('#newButton').click();await page.locator('#preset').selectOption('explore');await page.locator('#startButton').click();await advance(300);await page.locator('#startButton').click();
  const before=await state();await page.locator('#transferAmount').fill('10');await page.locator('#transferButton').click();const after=await state();near(after.water[0]-before.water[0],10);near(after.water[0]+after.water[1],60);assert.ok(after.origins.water.inside[1]>0);
  await page.locator('#saltPermeable').check();let events=await page.evaluate(()=>window.osmosisLab.events());assert.ok(events.some(e=>e.kind==='transfer'));assert.ok(events.some(e=>e.kind==='membrane'));assert.ok(await page.locator('#error').isHidden());assert.ok(await page.locator('#transferFeedback').isVisible());assert.ok((await page.locator('#transferFeedback').innerText()).includes('總量不變'));
  const afterMembrane=await state();await selectChart('flux');await page.locator('#chartSpecies').selectOption('salt');await page.locator('#trendCanvas').press('End');assert.ok((await page.locator('#chartLatest').innerText()).includes('鹽流出 '+afterMembrane.saltFlux.out.toFixed(3)));await page.locator('#trendCanvas').press('ArrowLeft');assert.ok((await page.locator('#chartLatest').innerText()).includes('鹽流出 0.000'));await page.locator('#chartLive').click();report.checks.push('同一模擬時間的多次干預仍可逐筆查看前後數值');
  await page.locator('#eventDetails').evaluate(e=>e.open=true);await selectChart('flux');await page.locator('#chartSpecies').selectOption('salt');await page.screenshot({path:path.join(out,'desktop-exploration.png'),fullPage:true});report.checks.push('探索模式即時膜切換、守恆轉移、事件與圖表標記');
  await page.locator('#transferAmount').fill('10000');const safe=await state();await page.locator('#transferButton').click();assert.ok(await page.locator('#error').isVisible());assert.deepEqual(await state(),safe);report.checks.push('拒絕超過庫存的轉移且不修改狀態');
  await page.locator('#newButton').click();for(const [key,value]of Object.entries({insideWater:20,outsideWater:50,insideSalt:50,outsideSalt:0})){await page.locator('#'+key).fill(String(value));await page.locator('#'+key).press('Tab');}
  await page.locator('#saltPermeable').uncheck();await page.locator('#startButton').click();await advance(6000);dg=await diag();assert.ok(dg.limit);assert.equal(dg.running,false);assert.equal((await page.evaluate(()=>window.osmosisLab.status())).system,'limit');assert.ok(await page.locator('#limitBanner').isVisible());assert.ok(await page.locator('#startButton').isDisabled());await page.screenshot({path:path.join(out,'desktop-limit.png'),fullPage:true});report.checks.push('體積邊界停止並顯示模型限制，沒有錯誤平衡');
  await page.locator('#newButton').click();await page.locator('#preset').selectOption('equilibrium');
  for(const width of [320,390,768,1024,1440,1920]){await page.setViewportSize({width,height:900});await advance(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'水平溢出 '+width);}
  report.checks.push('320、390、768、1024、1440、1920px 無頁面水平溢出');
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});mobile.on('pageerror',e=>report.errors.push(e.message));await mobile.clock.install();await mobile.goto(url);await mobile.waitForFunction(()=>!!window.osmosisLab);await mobile.clock.runFor(200);
  assert.equal(await mobile.locator('#initialDetails').evaluate(e=>e.open),false);const pixels=await mobile.locator('#simulationCanvas').evaluate(c=>({width:c.width,css:c.getBoundingClientRect().width}));assert.ok(pixels.width>=pixels.css*1.9);await mobile.screenshot({path:path.join(out,'mobile-observation.png')});
  await mobile.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await mobile.clock.runFor(500);const bar=await mobile.locator('#startButton').boundingBox();assert.ok(bar.y>=0&&bar.y+bar.height<=844&&bar.height>=44);await mobile.locator('#startButton').tap();await mobile.clock.runFor(1000);assert.ok((await mobile.evaluate(()=>window.osmosisLab.snapshot())).time>0);await mobile.locator('#startButton').tap();
  await mobile.locator('#data').scrollIntoViewIfNeeded();await mobile.clock.runFor(500);assert.ok(await mobile.locator('#amountTable').evaluate(table=>Array.from(table.querySelectorAll('td')).every(td=>{const r=document.createRange();r.selectNodeContents(td);const text=r.getBoundingClientRect(),cell=td.getBoundingClientRect();return text.left>=cell.left&&text.right<=cell.right;})));await mobile.screenshot({path:path.join(out,'mobile-data.png')});await mobile.close();report.checks.push('手機高 DPI、折疊設定、固定操作列、觸控播放與庫存表數字間距');
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.waitForFunction(()=>!!window.osmosisLab);await page.locator('#startButton').click();await advance(1000);assert.ok((await state()).time>0);assert.ok((await state()).water[0]>20);await page.locator('#startButton').click();report.checks.push('file:// 離線開啟與本機腳本運算');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
  report.result='PASS';report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){report.result='FAIL';report.failure=error.stack;fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));await page.screenshot({path:path.join(out,'browser-failure.png'),fullPage:true}).catch(()=>{});throw error;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
