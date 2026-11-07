const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
for(const name of ['src/model.js','src/particles.js','src/presentation.js','src/app.js','scripts/serve.cjs'])cp.execFileSync(process.execPath,['--check',path.join(root,name)],{stdio:'inherit'});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'styles.css'),'utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size,'重複的 HTML id');
assert.ok(!/https?:\/\//.test(html+css+fs.readFileSync(path.join(root,'src/app.js'),'utf8')),'執行介面不可依賴外部 URL');
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){if(match[1].startsWith('#'))assert.ok(ids.includes(match[1].slice(1)),'找不到頁面錨點 '+match[1]);else assert.ok(fs.existsSync(path.join(root,match[1])),'找不到資產 '+match[1]);}
const mark=fs.readFileSync(path.join(root,'assets/ro-mark.svg'),'utf8');assert.ok(mark.includes('viewBox="0 280 520 334"'));assert.ok(html.includes('alt="Ro"'));
assert.ok(html.includes('lang="zh-Hant-TW"'));console.log('PASS：JS 語法、HTML id、相對資產、離線依賴、Ro 原始 viewBox 與替代文字。');
