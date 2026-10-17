'use strict';
const assert = require('assert');
const { state, loadFresh } = require('./_harness');
const fs = state.fs;
const { mediaCache: cache, MediaDownloadError } = loadFresh(['services/mediaCache.ts']).mediaCache;
const policy = require('../../node_modules/.cache/wuzz-unit-tests/services/mediaDownloadPolicy.js');
const limits = policy.MEDIA_DOWNLOAD_LIMITS, defaults = { ...limits };
const URL = 'https://media.wuzzhub.id/a.jpg';
const tick = () => new Promise((r) => setImmediate(r));
async function until(fn) { for (let n=0;n<100&&!fn();n++) await tick(); assert.ok(fn(), 'condition never reached'); }
async function fails(p, code) { await assert.rejects(p, (e) => e instanceof MediaDownloadError && e.code===code); }
let count=0;
async function test(name, fn) {
  await cache.cancelPendingDownloads(); fs.files.clear(); fs.downloads=0; fs.cancelCount=0; fs.freeBytes=1024**3;
  fs.download=async()=>({status:200,size:100}); Object.assign(limits, defaults);
  await fn(); console.log(`${++count}. ${name}: OK`);
}
(async()=>{
  await test('shared downloader and progress for all subscribers', async()=>{
    let finish; const gate=new Promise(r=>finish=r);
    fs.download=async(_u,_d,cb)=>{await gate; cb({totalBytesWritten:50,totalBytesExpectedToWrite:100}); return {status:200,size:100};};
    const a=cache.ensureMediaCached(URL,'shared','x.jpg'); await until(()=>fs.downloads===1);
    const seen=[]; const b=cache.downloadToCache(URL,'shared','x.jpg',{expectedSize:100,onProgress:p=>seen.push(p)});
    await tick(); finish(); assert.equal(await a,await b); assert.equal(fs.downloads,1); assert.deepEqual(seen,[0,0.5,1]);
  });
  await test('missing memory-cached file is downloaded again',async()=>{
    const uri=await cache.downloadToCache(URL,'removed'); fs.files.delete(uri);
    assert.equal(await cache.getCachedMediaUri(URL,'removed'),null); await cache.downloadToCache(URL,'removed'); assert.equal(fs.downloads,2);
  });
  await test('truncated legacy copy is repaired',async()=>{
    const path=cache.getLocalFilePath(URL,'legacy'); fs.files.set(path,{size:40});
    await cache.downloadToCache(URL,'legacy',undefined,{expectedSize:100}); assert.equal(fs.files.get(path).size,100); assert.equal(fs.downloads,1);
  });
  await test('403 is forbidden; 404/410 are absent; failure never returns remote URL',async()=>{
    for(const [status,code] of [[403,'forbidden'],[404,'expired'],[410,'expired'],[500,'failed']]) {
      fs.download=async()=>({status,size:100}); await fails(cache.ensureMediaCached(URL,`status-${status}`),code);
    } assert.equal(fs.files.size,0);
  });
  await test('HTTP content length detects truncation without message file_size',async()=>{
    fs.download=async()=>({status:200,size:40,headers:{'Content-Length':'100'}});
    await fails(cache.downloadToCache(URL,'header-truncated'),'incomplete');assert.equal(fs.files.size,0);
  });
  await test('low storage fails before transfer, then retry recovers',async()=>{
    fs.freeBytes=0; await fails(cache.downloadToCache(URL,'space'),'storage'); assert.equal(fs.downloads,0);
    fs.freeBytes=1024**3; await cache.downloadToCache(URL,'space');
  });
  await test('declared and actual oversized files rejected',async()=>{
    await fails(cache.downloadToCache(URL,'huge',undefined,{expectedSize:limits.maxBytes+1}),'too_large'); assert.equal(fs.downloads,0);
    fs.download=async(_u,_d,cb)=>{cb({totalBytesWritten:limits.maxBytes+1,totalBytesExpectedToWrite:limits.maxBytes+1});return {status:200,size:limits.maxBytes+1};};
    await fails(cache.downloadToCache(URL,'huge'),'too_large'); assert.equal(fs.files.size,0);
  });
  await test('URL policy, private file protection, traversal rejection',async()=>{
    for(const url of ['http://media.wuzzhub.id/x','https://media.wuzzhub.id.evil.com/x','https://user:pass@media.wuzzhub.id/x','https://localhost/x','file:///docs/SQLite/secret.db','data:text/html,bad']){
      fs.files.set(url,{size:10}); await fails(cache.downloadToCache(url,'unsafe'),'unsafe_url');
    }
    fs.files.set('file:///docs/wuzzchat_media/../SQLite/secret.db',{size:10});
    assert.equal(await cache.getCachedMediaUri('file:///docs/wuzzchat_media/../SQLite/secret.db','escape'),null);
    fs.files.set('file:///docs/wuzzchat_media/media_victim.jpg',{size:100});
    assert.equal(await cache.getCachedMediaUri('file:///docs/wuzzchat_media/media_victim.jpg','attacker'),null);
    assert.equal(cache.getLocalFilePath(URL,'../../escape'),null); assert.equal(fs.downloads,0);
    assert.ok(policy.isAllowedMediaDownloadUrl('https://abc.supabase.co/storage/v1/object/public/a.jpg'));
  });
  await test('maximum three concurrent native transfers',async()=>{
    const finishers=[]; let active=0,maximum=0;
    fs.download=async()=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>finishers.push(r));active--;return {status:200,size:100};};
    const jobs=Array.from({length:7},(_,i)=>cache.downloadToCache(URL,`bounded-${i}`));
    await until(()=>finishers.length===3); assert.equal(fs.downloads,3);
    for(let i=0;i<7;i++){await until(()=>finishers.length>i);finishers[i]();}
    await Promise.all(jobs);assert.equal(maximum,3);
  });
  await test('bounded queue gives retryable busy error',async()=>{
    limits.queued=1; let finish;const gate=new Promise(r=>finish=r);
    fs.download=async()=>{await gate;return {status:200,size:100};};
    const jobs=Array.from({length:4},(_,i)=>cache.downloadToCache(URL,`queue-${i}`));
    await until(()=>cache.waiting.length===1);await fails(cache.downloadToCache(URL,'overflow'),'busy');finish();await Promise.all(jobs);
  });
  await test('idle timeout cancels native transfer, retry works',async()=>{
    limits.idleTimeoutMs=15;fs.download=async()=>new Promise(()=>{});
    await fails(cache.downloadToCache(URL,'idle'),'timeout');assert.ok(fs.cancelCount>0);assert.equal(fs.files.size,0);
    fs.download=async()=>({status:200,size:100});await cache.downloadToCache(URL,'idle');
  });
  await test('total timeout bounds progressing slow transfer',async()=>{
    limits.timeoutMs=20;let timer;
    fs.download=async(_u,_d,cb)=>new Promise(()=>{let b=0;timer=setInterval(()=>cb({totalBytesWritten:++b,totalBytesExpectedToWrite:100}),2);});
    try{await fails(cache.downloadToCache(URL,'slow'),'timeout');}finally{clearInterval(timer);}
  });
  await test('closing viewer detaches callbacks but shared transfer completes',async()=>{
    let finish;const gate=new Promise(r=>finish=r);
    fs.download=async(_u,_d,cb)=>{await gate;cb({totalBytesWritten:100,totalBytesExpectedToWrite:100});return {status:200,size:100};};
    const c=new AbortController(),seen=[];
    const a=cache.downloadToCache(URL,'detach',undefined,{signal:c.signal,onProgress:p=>seen.push(p)}),b=cache.downloadToCache(URL,'detach');
    await until(()=>fs.downloads===1);c.abort();await fails(a,'cancelled');const before=seen.length;finish();await b;assert.equal(seen.length,before);assert.equal(fs.downloads,1);
  });
  await test('last viewer abort cancels native task and permits a fresh retry',async()=>{
    fs.download=async()=>new Promise(()=>{});const c=new AbortController();
    const job=cache.downloadToCache(URL,'last',undefined,{signal:c.signal});
    await until(()=>fs.downloads===1);c.abort();await fails(job,'cancelled');
    await until(()=>cache.activeCount===0);assert.ok(fs.cancelCount>0);
    fs.download=async()=>({status:200,size:100});await cache.downloadToCache(URL,'last');
  });
  await test('logout cancels active and queued jobs without removing complete media',async()=>{
    const saved=await cache.downloadToCache(URL,'keep');fs.download=async()=>new Promise(()=>{});
    const jobs=Array.from({length:5},(_,i)=>cache.downloadToCache(`${URL}?logout=${i}`,`logout-${i}`)),results=Promise.allSettled(jobs);
    await until(()=>cache.waiting.length===2);await cache.cancelPendingDownloads();
    assert.ok((await results).every(r=>r.status==='rejected'&&r.reason.code==='cancelled'));assert.ok(fs.files.has(saved));assert.equal(cache.activeCount,0);
  });
  await test('startup removes orphan partials, keeps complete copies',async()=>{
    const fresh=loadFresh(['services/mediaCache.ts']).mediaCache.mediaCache;
    fs.files.set('file:///docs/wuzzchat_media/media_orphan.mp4.part',{size:10});fs.files.set('file:///docs/wuzzchat_media/media_old.mp4.1.part',{size:20});fs.files.set('file:///docs/wuzzchat_media/media_valid.mp4',{size:100});
    await fresh.downloadToCache(URL,'first');assert.ok(![...fs.files.keys()].some(k=>k.endsWith('.part')));assert.ok(fs.files.has('file:///docs/wuzzchat_media/media_valid.mp4'));
  });
  await test('atomic sender copy requires explicit local source capability',async()=>{
    const source='file:///cache/recording.m4a';fs.files.set(source,{size:100});await fails(cache.downloadToCache(source,'sender','x.m4a'),'unsafe_url');
    await fails(cache.downloadToCache(source,'sender','x.m4a',{allowLocalSource:true}),'unsafe_url');
    cache.registerLocalSource('sender',source);
    const uri=await cache.downloadToCache(source,'sender','x.m4a',{allowLocalSource:true});assert.ok(uri.startsWith('file:///docs/wuzzchat_media/'));assert.equal(fs.files.get(uri).size,100);assert.ok(fs.files.has(source));assert.ok(![...fs.files.keys()].some(k=>k.endsWith('.part')));
  });
  console.log(`${count} resilience/security cases passed`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>Object.assign(limits,defaults));
