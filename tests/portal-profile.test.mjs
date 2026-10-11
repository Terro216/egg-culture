import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createRoadRecordStore, roadRecordStore } from '../src/server/roadRecords.ts';
import { earnedAchievements, validatePortalRun } from '../src/features/Portal/model.ts';
import { GET, POST } from '../src/pages/api/portal-profile.ts';
import { POST as accountPOST } from '../src/pages/api/portal-account.ts';
import { GET as legacyAccountGET } from '../src/pages/api/egg-road-account.ts';
import { readFryProgress, saveFryResult, legacyFryBest } from '../src/features/EggFry/storage.ts';
import { selectRoadAccount } from '../src/features/EggRoad/storage.ts';
import { campaignSeed, generatePuzzle } from '../src/features/EggUntangle/engine.ts';

const run = (game='fry', score='123456789012345678901234567890') => ({ id: randomUUID(), game, score, peak: score, seconds: 80, sector: 2, losses: 1, jackpot: game==='fry', dodged: 0, swaps: 0, ...(game==='fry'?{season:3}:{}) });

test('portal inputs reject malformed games, nonfinite scores, giant bodies and impossible counters', () => {
  assert.deepEqual(validatePortalRun(run('road','1000'))?.score,'1000');
  const good=run();assert.deepEqual(validatePortalRun(good),good);
  for(const bad of [{...good,game:'fonin'},{...good,score:'1e30'},{...good,score:'9'.repeat(513)},{...good,score:'-1'},
    {...good,seconds:Infinity},{...good,seconds:-1},{...good,peak:'1'},{...good,dodged:0.5},{...good,id:'../profile'},
    {...run('oracle','101')},{...run('road','1000000001')},{...good,season:4},{...good,season:'3'},{...run('road','10'),season:3}])assert.equal(validatePortalRun(bad),null);
  assert.equal(validatePortalRun({...good,season:undefined}).season,2,'an old tab is not silently promoted to the new season');
  assert.ok(earnedAchievements({...good,score:'1000',peak:'1000000',sector:5,dodged:5,swaps:5}).includes('fry.switcher'));
  assert.deepEqual(earnedAchievements(run('oracle','94')),['oracle.complete']);
});

test('approved legacy-profile migration preserves credentials, links and records, and later privacy choices survive restart', async () => {
  const directory=await mkdtemp(join(tmpdir(),'egg-portal-store-'));let store;
  try {
    store=createRoadRecordStore(directory);
    store.submit('guest-one',{code:'EGG1-E-0-ABC',name:'Адепт',score:2000,gates:20,distance:400,seconds:70,finished:false});
    // A registered account from the previous release has no portal-profile row.
    const old=new DatabaseSync(join(directory,'records.sqlite'));
    old.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?)').run('guest-one','previous-guest','unused-test-hash','unused-recovery-hash',Date.now());
    old.prepare('DELETE FROM portal_migrations WHERE name=?').run('public-profiles-fry3-20260920');old.close();
    store.close();store=createRoadRecordStore(directory);
    const player=store.credentials('Адепт').player;
    const own=store.ownProfile(player);assert.equal(own.public,true);assert.ok(store.publicProfile(own.id));
    assert.equal(store.credentials('Адепт').password,'unused-test-hash');
    assert.equal(store.credentials('Адепт').recovery,'unused-recovery-hash');
    store.updateProfile(player,false,0);assert.equal(store.publicProfile(own.id),null);
    assert.notEqual(own.id,player);assert.match(own.id,/^[a-f0-9]{24}$/);
    for(const game of ['fry','road','chalaza','oracle']) {
      const r=run(game,game==='fry'?'123456789012345678901234567890':game==='road'?'1000':'94');
      store.portalResult(player,r);store.portalResult(player,r);
    }
    const privateProfile=store.ownProfile(player);assert.equal(privateProfile.stats.length,4);
    for(const stat of privateProfile.stats)assert.equal(stat.runs,1,'retries do not inflate the attempt count');
    assert.equal(privateProfile.stats.find(s=>s.game==='road').best,'2000','legacy records survive the shared account migration');
    assert.equal(privateProfile.stats.find(s=>s.game==='fry').best,'123456789012345678901234567890');
    store.updateProfile(player,true,3);const publicProfile=store.publicProfile(own.id);
    assert.deepEqual(Object.keys(publicProfile).sort(),['achievementRarity','achievements','avatar','frySeason','id','name','stats']);
    assert.equal(JSON.stringify(publicProfile).includes(player),false);
    assert.equal(publicProfile.avatar,3);assert.equal(store.read('EGG1-E-0-ABC',player).entries[0].profileId,own.id);
    store.close();store=createRoadRecordStore(directory);
    assert.equal(store.publicProfile(own.id).stats.length,4);
    store.updateProfile(player,false,3);assert.equal(store.publicProfile(own.id),null);
    store.close();store=createRoadRecordStore(directory);assert.equal(store.publicProfile(own.id),null,'migration must not undo a subsequent private setting');
    assert.equal(store.read('EGG1-E-0-ABC',player).entries[0].profileId,undefined);
    assert.equal(store.read('EGG1-E-0-ABC',player).personal.score,2000);
    const originalId=own.id;
    assert.equal(store.updateProfileSlug(player,'ilyamed').id,'ilyamed');
    assert.equal(store.publicProfile('ilyamed'),null,'privacy applies to the short address');
    store.updateProfile(player,true,3);
    assert.equal(store.publicProfile(originalId).id,'ilyamed','opaque links keep working');
    assert.equal(store.publicProfile('ilyamed').id,'ilyamed');
    assert.equal(store.read('EGG1-E-0-ABC',player).entries[0].profileId,'ilyamed');
    assert.equal(store.updateProfileSlug(player,'ilyamed-new').id,'ilyamed-new');
    assert.equal(store.publicProfile('ilyamed').id,'ilyamed-new','old short links keep working');
    assert.equal(store.publicProfile(originalId).id,'ilyamed-new');
    store.register('another-guest','Second Adept','hash','recovery','other-session');
    const other=store.credentials('Second Adept').player;
    assert.throws(()=>store.updateProfileSlug(other,'ilyamed'),/taken/i);
    assert.equal(store.updateProfileSlug(other,'second-adept').id,'second-adept');
  } finally {store?.close();await rm(directory,{recursive:true,force:true});}
});

test('fresh fry scores exclude legacy results and late old-tab retries without erasing the other games', async () => {
  const directory=await mkdtemp(join(tmpdir(),'egg-portal-seasons-'));let store;
  try {
    store=createRoadRecordStore(directory);store.register('guest','Season Adept','test-password','test-recovery','session-hash');
    const player=store.credentials('Season Adept').player,id=store.ownProfile(player).id;
    store.updateProfile(player,false,4);
    store.portalResult(player,{...run(),season:undefined});
    store.portalResult(player,run('road','1000'));
    const db=new DatabaseSync(join(directory,'records.sqlite'));
    db.prepare('DELETE FROM portal_migrations WHERE name=?').run('public-profiles-fry3-20260920');
    const old=String(db.prepare("SELECT best FROM portal_stats WHERE game='fry'").get().best);db.close();
    store.close();store=createRoadRecordStore(directory);
    assert.equal(store.session('session-hash'),player);assert.equal(store.publicProfile(id).avatar,4);
    assert.equal(store.ownProfile(player).frySeason,3);assert.ok(!store.ownProfile(player).stats.some(s=>s.game==='fry'));
    const newRun=run('fry','90');store.portalResult(player,newRun);store.portalResult(player,newRun);
    store.portalResult(player,{...run('fry','900000000000000000000000000000000'),season:undefined});
    store.portalResult(player,{...run('fry','999999999999999999999999999999999'),season:2});
    const current=store.ownProfile(player);
    assert.equal(current.stats.find(s=>s.game==='fry').best,'90');assert.equal(current.stats.find(s=>s.game==='fry').runs,1);
    assert.equal(current.stats.find(s=>s.game==='road').best,'1000');assert.ok(BigInt(old)>90n);
    store.updateProfile(player,false,4);store.close();store=createRoadRecordStore(directory);assert.equal(store.publicProfile(id),null);
  }finally{store?.close();await rm(directory,{recursive:true,force:true});}
});

test('portal API shares legacy sessions, enforces CSRF and identity, and revokes public access immediately', async () => {
  const directory=await mkdtemp(join(tmpdir(),'egg-portal-http-'));process.env.EGG_ROAD_DATA_DIR=directory;
  const cookies=new Map();let address=0;
  function context(body=null,search='',headers={},jar=cookies) {
    const url=new URL('https://egg.test/api/portal-profile'+search);
    return {url,site:new URL('https://egg.test'),clientAddress:`192.0.2.${++address}`,
      request:new Request(url,{method:body===null?'GET':'POST',headers:{origin:'https://egg.test','content-type':'application/json',...headers},...(body===null?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),
      cookies:{get:key=>jar.has(key)?{value:jar.get(key)}:undefined,set:(key,value)=>jar.set(key,value),delete:key=>jar.delete(key)}};
  }
  try {
    assert.equal((await POST(context({action:'settings',expectedName:'Адепт',public:true,avatar:0}))).status,401);
    assert.equal((await POST(context({},'',{origin:'https://elsewhere.test'}))).status,403);
    assert.equal((await POST(context({},'',{'content-type':'text/plain'}))).status,415);
    assert.equal((await POST(context(' '.repeat(9000)))).status,413);
    const registered=await accountPOST(context({action:'register',name:'Единый адепт',password:'A sufficiently long test password'}));assert.equal(registered.status,200);
    assert.equal((await (await legacyAccountGET(context())).json()).registered,true,'no second registration for Egg Road');
    const me=await (await GET(context())).json();assert.equal(me.profile.public,true,'new accounts are public as announced at registration');
    const id=me.profile.id;
    assert.equal((await POST(context({action:'slug',expectedName:me.account.name,slug:'ab'}))).status,400);
    assert.equal((await POST(context({action:'slug',expectedName:me.account.name,slug:'ilyamed'}))).status,200);
    assert.equal((await (await GET(context(null,'?id=ilyamed',{},new Map()))).json()).profile.id,'ilyamed');
    assert.equal((await (await GET(context(null,`?id=${id}`,{},new Map()))).json()).profile.id,'ilyamed');
    const anonymous=new Map();assert.equal((await GET(context(null,`?id=${id}`,{},anonymous))).status,200);
    assert.equal((await POST(context({action:'settings',expectedName:me.account.name,public:false,avatar:0}))).status,200);
    assert.equal((await GET(context(null,`?id=${id}`,{},anonymous))).status,404);
    const setting={action:'settings',expectedName:me.account.name,public:true,avatar:2};
    assert.equal((await POST(context({...setting,expectedName:'Somebody else'}))).status,409);
    assert.equal((await POST(context({...setting,avatar:99}))).status,400);
    assert.equal((await POST(context(setting))).status,200);
    const payload={action:'result',expectedName:me.account.name,run:run()};
    assert.equal((await POST(context(payload))).status,200);assert.equal((await POST(context(payload))).status,200);
    const response=await GET(context(null,`?id=${id}`,{},anonymous));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const publicBody=await response.json();assert.equal(publicBody.profile.stats[0].runs,1);
    assert.equal('account' in publicBody,false);assert.equal('public' in publicBody.profile,false);
    assert.equal((await POST(context({...payload,run:{...payload.run,id:randomUUID(),score:'Infinity'}}))).status,400);
    const puzzle=generatePuzzle(campaignSeed(1));
    const untangleRun={...run('untangle','1'),sector:0,losses:0,guestImport:true,
      untangle:{seed:puzzle.seed,level:1,mode:'campaign',moves:8,hints:0,positions:puzzle.initial}};
    const untanglePayload={action:'result',expectedName:me.account.name,run:untangleRun};
    assert.equal((await POST(context(untanglePayload))).status,400,'structurally valid but unsolved geometry is rejected as invalid_result');
    untangleRun.untangle.positions=puzzle.solution;
    const completed=await POST(context(untanglePayload));assert.equal(completed.status,200);
    assert.deepEqual((await completed.json()).profile.untangle.campaign,[1],'invalid geometry did not reserve the UUID');
    const shared=(await (await GET(context(null,`?id=${id}`,{},anonymous))).json()).profile;
    assert.equal('untangle' in shared,false);assert.equal(shared.stats.find(s=>s.game==='untangle').solved,1);
    const otherCookies=new Map(),otherName='Другой адепт';
    assert.equal((await accountPOST(context({action:'register',name:otherName,password:'Another sufficiently long password'},'',{},otherCookies))).status,200);
    const rejected=await POST(context({...untanglePayload,expectedName:otherName},'',{},otherCookies));
    assert.equal(rejected.status,409);assert.equal((await rejected.json()).error,'guest_result_claimed');
    const otherProfile=(await (await GET(context(null,'',{},otherCookies))).json()).profile;
    assert.equal(otherProfile.untangle.totalSolved,0);assert.deepEqual(otherProfile.stats,[]);
    assert.equal((await POST(context(untanglePayload))).status,200,'original owner may safely retry the same guest UUID');
    assert.equal((await POST(context({...setting,public:false}))).status,200);
    assert.equal((await GET(context(null,`?id=${id}`,{},anonymous))).status,404);
    assert.equal((await accountPOST(context({action:'logout'}))).status,200);
    assert.equal((await POST(context(payload))).status,401);
  } finally {roadRecordStore().close();delete process.env.EGG_ROAD_DATA_DIR;await rm(directory,{recursive:true,force:true});}
});

test('new-season browser records are isolated per account and never erase the first-season archive', () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});
  const result={eggs:500n,peak:800n,seconds:40,sector:1,seed:1,success:true,losses:1,jackpot:false};
  try {
    values.set('egg_fry_v1',JSON.stringify({best:'15000000',muted:false}));
    values.set('egg_fry_v2:account:alpha',JSON.stringify({best:'2000000000000',peak:'2000000000000',muted:false,reducedMotion:true,achievements:['million']}));
    assert.equal(readFryProgress('Alpha').best,'0');assert.equal(readFryProgress('Alpha').peak,'0');
    assert.equal(readFryProgress('Alpha').muted,false);assert.equal(readFryProgress('Alpha').reducedMotion,true);
    assert.ok(readFryProgress('Alpha').achievements.includes('million'));
    selectRoadAccount('Alpha');saveFryResult(result);
    selectRoadAccount('Beta');assert.equal(readFryProgress().best,'0');saveFryResult({...result,eggs:900n,peak:1000n});
    assert.equal(readFryProgress('alpha').best,'500');assert.equal(readFryProgress('beta').best,'900');
    selectRoadAccount(null);assert.equal(readFryProgress().best,'0');assert.equal(legacyFryBest(),'15000000');
    assert.equal(JSON.parse(values.get('egg_fry_v1')).best,'15000000');
    assert.equal(JSON.parse(values.get('egg_fry_v2:account:alpha')).best,'2000000000000');
  } finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
