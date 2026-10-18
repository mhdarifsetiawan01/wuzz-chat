const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(file) {
 const filename = path.resolve(__dirname, '../../lib', file);
 const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const m = new Module(filename, module); m.filename=filename;m.paths=module.paths;m._compile(output,filename);return m.exports;
}
const {SourceRequest, SOURCE_UNAVAILABLE, sourceContextPath, hasSourceTarget} = load('sourceMessage.ts');
const {needsForumReview,forumMemoryLabel}=load('forumLifecycle.ts');
(async()=>{
 const rows=[{id:'message/source',room_id:'sub_forum',is_deleted:false}];
 assert.equal(hasSourceTarget(rows,'sub_forum','message/source'),true);
 for (const invalid of [[],[{...rows[0],is_deleted:true}],[{...rows[0],room_id:'sub_other'}], [...rows,{id:'other',room_id:'sub_other'}]]) assert.equal(hasSourceTarget(invalid,'sub_forum','message/source'),false);
 assert.equal(sourceContextPath('sub_forum','message/source'),'/api/messages?room_id=sub_forum&message_id=message%2Fsource');
 const request=new SourceRequest();let finish,signal;
 const old=request.run(s=>{signal=s;return new Promise(r=>finish=r)});
 assert.deepEqual(await request.run(async()=>rows),{value:rows});assert.equal(signal.aborted,true);finish('late');assert.equal(await old,null);
 const canceled=request.run(()=>new Promise(r=>finish=r));request.cancel();finish('old account');assert.equal(await canceled,null);
 for (const status of [403,404]) assert.equal((await request.run(async()=>{throw {status}})).error,SOURCE_UNAVAILABLE);
 let late;assert.match((await request.run(()=>new Promise(r=>late=r),5)).error,/Periksa koneksi/);late(rows);
 for(const [memory_state,label] of [['processing','Memori sedang diproses'],['under_review','Sedang ditinjau admin'],['published','Memori tersedia']]) assert.equal(forumMemoryLabel({is_active:false,memory_enabled:true,memory_state}),label);
 const draft={is_active:false,memory_enabled:true,memory_state:'review_required',draft_id:'secret',parent_role:'admin'};
 assert.equal(needsForumReview(draft),true);assert.equal(needsForumReview({...draft,parent_role:'member'}),false);assert.equal(needsForumReview({...draft,memory_enabled:false}),false);assert.equal(forumMemoryLabel({...draft,memory_enabled:false}),'');
 console.log('Web source contract, lifecycle, cancellation, timeout and late response passed');
})().catch(e=>{console.error(e);process.exitCode=1});
