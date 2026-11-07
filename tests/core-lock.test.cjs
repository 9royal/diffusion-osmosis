const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),baseline=require('../docs/v0.1.0-baseline.json');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
test('動畫同步更新維持 v0.1.0 科學核心逐位元一致',()=>{
 assert.equal(hash(fs.readFileSync(path.join(root,'src/model.js'))),baseline.modelSha256);
});
