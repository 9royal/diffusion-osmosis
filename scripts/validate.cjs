const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa');fs.mkdirSync(out,{recursive:true});
function execute(args,file){const result=cp.spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});fs.writeFileSync(path.join(out,file),(result.stdout||'')+(result.stderr||''));process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;if(result.status!==0)throw new Error(file+' failed: '+result.status);return result.stdout;}
const tests=fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.cjs')).map(n=>'tests/'+n);
const log=execute(['--test','--test-reporter=spec',...tests],'unit-results.txt');execute(['scripts/check.cjs'],'static-check.txt');
const {Model,DT,PRESETS}=require('../src/model.js');
const run=(m,t)=>{for(let i=0;i<Math.round(t/DT)&&!m.limit;i++)m.step();return m;};
const salt=run(new Model(PRESETS.diffusion.config),10),analytic=25+15*Math.exp(-0.16*10);
const osm=run(new Model(),600),eq=run(new Model(PRESETS.equilibrium.config),4),before=eq.snapshot();run(eq,20);
const limits=[{insideWater:40,outsideWater:560,insideSalt:120,outsideSalt:0},{insideWater:560,outsideWater:40,insideSalt:0,outsideSalt:120}].map(c=>{const m=run(new Model(c),1000);return {limit:m.limit,bounds:m.bounds,status:m.status(),audit:m.audit()};});
const report={result:'PASS',version:require('../package.json').version,node:process.version,createdAt:new Date().toISOString(),tests:Number(log.match(/tests (\d+)/)?.[1]),
 diffusion:{time:10,numericalInsideSalt:salt.amount('salt','inside'),analyticInsideSalt:analytic,absoluteError:Math.abs(salt.amount('salt','inside')-analytic),audit:salt.audit()},
 osmosis:{time:600,numericalInsideWater:osm.amount('water','inside'),analyticInsideWater:180,volumePercent:osm.snapshot().volume,status:osm.status(),audit:osm.audit()},
 dynamicEquilibrium:{before,after:eq.snapshot(),status:eq.status(),audit:eq.audit()},limits};
fs.writeFileSync(path.join(out,'numerical-evidence.json'),JSON.stringify(report,null,2));execute(['scripts/sync-evidence.cjs'],'sync-check.txt');execute(['scripts/review-evidence.cjs'],'review-check.txt');execute(['scripts/clarity-evidence.cjs'],'clarity-check.txt');console.log('PASS：測試與數值證據已保存至 qa/。');
