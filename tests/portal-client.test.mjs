import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { selectRoadAccount, saveRoadScore, readPointsBest, saveTrackScore, readTrackBest } from '../src/features/EggRoad/storage.ts';

async function fixture(name, sharedClient = false) {
  const globals=['window','document','localStorage','fetch'];
  const saved=Object.fromEntries(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};
  Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
  const module=await import(`../src/features/Portal/client.ts${sharedClient ? '' : `?case=${name}`}`);
  return {module,values,restore(){for(const key of globals){if(saved[key])Object.defineProperty(globalThis,key,saved[key]);else delete globalThis[key];}}};
}
const profile=name=>({id:'a'.repeat(24),name,public:true,avatar:0,stats:[],achievements:[],frySeason:3});
const response=name=>Response.json({account:{name,registered:true},profile:profile(name)});
const result={score:'3000',peak:'3000',seconds:40,sector:1,losses:1,jackpot:true,dodged:0,swaps:0};
async function idle(module){for(let i=0;i<100&&module.portalState().syncing;i++)await delay(2);}
function deferred() { let resolve, reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }
async function until(condition) { for(let i=0;i<100&&!condition();i++)await delay(2);assert.equal(condition(),true,'expected async work to settle'); }

test('queued results keep their owner through logout/account switch and reuse their ID after a lost response',async()=>{
  const f=await fixture('owners');let user='Alpha',fail=true;const posts=[];
  globalThis.fetch=async(url,options={})=>{
    if(options.method!=='POST')return response(user);
    const body=JSON.parse(options.body);posts.push(body);
    if(fail)throw new Error('simulated lost response');
    return Response.json({profile:{...profile(user),stats:[{game:'fry',best:body.run.score,runs:1}]}});
  };
  try {
    await f.module.refreshPortal();const ticket=f.module.beginPortalRun('fry');assert.equal(ticket.owner,'alpha');
    f.module.submitPortalResult(ticket,result);await idle(f.module);assert.equal(posts.length,1);assert.equal(f.module.portalState().unsynced,1);
    user='Beta';await f.module.refreshPortal();await idle(f.module);
    assert.equal(posts.length,1,'Alpha is never submitted with Beta signed in');
    f.module.submitPortalResult({...ticket,id:crypto.randomUUID()},result);await idle(f.module);assert.equal(posts.length,1);
    user='Alpha';fail=false;await f.module.refreshPortal();await idle(f.module);
    assert.equal(posts[1].run.id,posts[0].run.id,'uncertain delivery retries use the same idempotency key');
    assert.ok(posts.every(post=>post.expectedName==='alpha'));assert.equal(f.module.portalState().unsynced,0);
    assert.equal([...f.values.keys()].filter(k=>k.includes('outbox')).length,0);
    assert.equal(JSON.parse(f.values.get('egg_fry_v3:account:alpha')).best,'3000');
    assert.equal(f.values.has('egg_fry_v3:account:beta'),false);
    assert.ok(posts.every(post=>post.run.season===3));
  }finally{f.restore();}
});

test('old outbox deliveries keep season two and an old server profile cannot contaminate the new browser record',async()=>{
  const f=await fixture('seasons');const posts=[];let legacy=true;
  const oldRun={...result,id:crypto.randomUUID(),game:'fry',score:'2000000000000',peak:'2000000000000'};
  f.values.set('egg_portal_outbox_v1:account:alpha:'+oldRun.id,JSON.stringify(oldRun));
  f.values.set('egg_fry_v2:account:alpha',JSON.stringify({best:oldRun.score,muted:false}));
  globalThis.fetch=async(url,options={})=>{
    const data={...profile('Alpha'),frySeason:legacy?undefined:3,stats:[{game:'fry',best:legacy?oldRun.score:'90',runs:1}]};
    if(options.method!=='POST')return Response.json({account:{name:'Alpha',registered:true},profile:data});
    posts.push(JSON.parse(options.body));return Response.json({profile:data});
  };
  try {
    await f.module.refreshPortal();await idle(f.module);
    assert.equal(posts[0].run.season,2);assert.equal(f.values.has('egg_fry_v3:account:alpha'),false);
    legacy=false;await f.module.refreshPortal();await idle(f.module);
    assert.equal(JSON.parse(f.values.get('egg_fry_v3:account:alpha')).best,'90');
    assert.equal(JSON.parse(f.values.get('egg_fry_v2:account:alpha')).best,oldRun.score);
    assert.equal(f.module.beginPortalRun('fry').season,3);
  }finally{f.restore();}
});

test('late profile reads cannot replace a newer signed-in identity',async()=>{
  const f=await fixture('late');let resolveOld,calls=0;
  globalThis.fetch=()=>++calls===1?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve(response('Beta'));
  try {
    const first=f.module.refreshPortal();await f.module.refreshPortal();resolveOld(response('Alpha'));await first;
    assert.equal(f.module.portalState().account.name,'Beta');assert.equal(f.values.get('egg_road_active_account_v1'),'beta');
  }finally{f.restore();}
});

test('blocked browser storage retains an uncertain submission in this tab',async()=>{
  const f=await fixture('blocked');let fail=true,posts=0;
  globalThis.fetch=async(url,options={})=>{
    if(options.method!=='POST')return response('Alpha');
    posts++;if(fail)throw new Error('offline');return Response.json({profile:profile('Alpha')});
  };
  try {
    await f.module.refreshPortal();const ticket=f.module.beginPortalRun('fry');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>key==='egg_road_active_account_v1'?'alpha':null,setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');},length:0}});
    f.module.submitPortalResult(ticket,result);await idle(f.module);assert.equal(posts,1);assert.equal(f.module.portalState().unsynced,1);
    fail=false;await f.module.flushPortal();assert.equal(posts,2);assert.equal(f.module.portalState().unsynced,0);
  }finally{f.restore();}
});

test('sign-in and result ownership work when all browser storage access is blocked',async()=>{
  const f=await fixture('blocked-identity');const posts=[];let signedIn=true;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('storage disabled');}});
  globalThis.fetch=async(url,options={})=>{
    if(options.method!=='POST')return signedIn?response('Alpha'):Response.json({account:{name:'',registered:false},profile:null});
    posts.push(JSON.parse(options.body));return Response.json({profile:profile('Alpha')});
  };
  try {
    await f.module.refreshPortal();const ticket=f.module.beginPortalRun('fry');assert.equal(ticket.owner,'alpha');
    f.module.submitPortalResult(ticket,result);await idle(f.module);
    assert.equal(posts.length,1);assert.equal(posts[0].expectedName,'alpha');assert.equal(f.module.portalState().unsynced,0);
    signedIn=false;await f.module.refreshPortal();assert.equal(f.module.beginPortalRun('fry').owner,null);
  }finally{f.restore();}
});

test('a road finishing after an account switch keeps its local records with its original owner',async()=>{
  const f=await fixture('road-owner');
  try {
    selectRoadAccount('Beta');saveRoadScore('endless',1200,'Alpha');saveTrackScore('EGG1-E-2-1',1200,'Alpha');
    assert.equal(readPointsBest(),0);assert.equal(readTrackBest('EGG1-E-2-1'),0);
    assert.equal(readPointsBest('endless','alpha'),1200);
    assert.equal(readTrackBest('EGG1-E-2-1','alpha'),1200);
  }finally{selectRoadAccount(null);f.restore();}
});

test('cloud merge repairs null or malformed motion scores without dropping either trial or later game stats',async()=>{
  const f=await fixture('motion-merge');
  const motionKey='egg_motion_trials_v1:account:alpha';
  const cloud={...profile('Alpha'),stats:[
    {game:'chalaza',best:'94',runs:1},{game:'oracle',best:'96',runs:1},
    {game:'fry',best:'4321',runs:1},{game:'road',best:'1200',runs:1,roadRules:2},
  ],achievements:['chalaza.complete','oracle.complete','road.first','fry.thousand']};
  globalThis.fetch=async()=>Response.json({account:{name:'Alpha',registered:true},profile:cloud});
  try {
    f.values.set('egg_motion_trials_v1',JSON.stringify({chalaza:100}));
    for(const stored of ['null','{broken',JSON.stringify({chalaza:98,oracle:99})]) {
      f.values.set(motionKey,stored);
      await f.module.refreshPortal();
      assert.deepEqual(JSON.parse(f.values.get(motionKey)),stored.startsWith('{"')?{chalaza:98,oracle:99}:{chalaza:94,oracle:96});
      assert.equal(JSON.parse(f.values.get('egg_fry_v3:account:alpha')).best,'4321');
      assert.equal(readPointsBest('portal-v2','alpha'),1200);
      assert.deepEqual(new Set(JSON.parse(f.values.get('egg_portal_achievements_v1:account:alpha'))),new Set(cloud.achievements));
      assert.equal(f.module.portalState().failed,false);
    }
    assert.deepEqual(JSON.parse(f.values.get('egg_motion_trials_v1')),{chalaza:100},'repair stays within the signed-in owner');
  }finally{f.restore();}
});

test('initiation during a delayed login waits for the account and cloud receipt instead of reporting guest success',async()=>{
  // adept.ts imports the canonical client URL; use that same instance for this integration test.
  const f=await fixture('initiation-login',true),login=deferred(),receipt=deferred();
  Object.defineProperty(globalThis,'document',{configurable:true,value:{cookie:''}});
  const adept=await import('../src/features/Portal/adept.ts');
  const answers=[1,2,1,1,1,1,1,2,1,2],posts=[];
  let signingIn=false,completed=false,reading,completion;
  globalThis.fetch=async(_url,options={})=>{
    if(options.method==='POST'){posts.push(JSON.parse(options.body));return receipt.promise;}
    return signingIn?login.promise:Response.json({account:{name:'',registered:false},profile:null});
  };
  try {
    await f.module.refreshPortal();
    selectRoadAccount('Alpha');signingIn=true;reading=f.module.refreshPortal();
    assert.equal(f.module.portalIdentityReady(),false);
    completion=adept.recordInitiation(answers).then(()=>{completed=true;});
    await delay(0);
    assert.equal(completed,false,'pending account discovery must not award the guest shortcut');
    assert.equal(posts.length,0);
    assert.equal(document.cookie,'');assert.equal(f.values.has('egg_adept'),false);
    login.resolve(Response.json({account:{name:'Alpha',registered:true},profile:{...profile('Alpha'),initiated:false}}));
    await reading;await until(()=>posts.length===1);
    assert.equal(completed,false,'the UI must wait until the account write is acknowledged');
    assert.deepEqual(posts[0],{action:'initiation',expectedName:'Alpha',answers});
    receipt.resolve(Response.json({profile:{...profile('Alpha'),initiated:true}}));
    await completion;
    assert.equal(adept.isInitiated(),true);
    assert.equal(document.cookie,'');assert.equal(f.values.has('egg_adept'),false,'account completion never writes a guest flag');
  }finally{
    login.resolve(response('Alpha'));receipt.resolve(Response.json({profile:{...profile('Alpha'),initiated:true}}));
    await Promise.allSettled([reading,completion].filter(Boolean));f.restore();
  }
});

test('settledPortal follows a newer profile read after the read it awaited is aborted',async()=>{
  const f=await fixture('settled-newer-read'),reads=[];
  let first,latest,waiting,settled=false;
  globalThis.fetch=(_url,options)=>{
    const read=deferred();reads.push(read);
    options.signal.addEventListener('abort',()=>read.reject(new DOMException('Aborted','AbortError')),{once:true});
    return read.promise;
  };
  try {
    first=f.module.refreshPortal();waiting=f.module.settledPortal().then(value=>{settled=true;return value;});
    latest=f.module.refreshPortal();await first;await delay(0);
    assert.equal(settled,false,'cancellation of the old GET does not settle account discovery');
    assert.equal(f.module.portalState().account,null);
    reads[1].resolve(response('Beta'));
    await latest;const value=await waiting;
    assert.equal(value.account.name,'Beta');assert.equal(value.failed,false);
    assert.equal(f.module.beginPortalRun('oracle').owner,'beta');
  }finally{
    for(const read of reads)read.resolve(response('Beta'));
    await Promise.allSettled([first,latest,waiting].filter(Boolean));f.restore();
  }
});

test('an old account flush finishing after a switch starts the new outbox automatically without retry loops',async()=>{
  for(const failBeta of [false,true]) {
    const f=await fixture(`flush-switch-${failBeta}`),oldReceipt=deferred(),posts=[];
    let user='Alpha';
    const betaRun={...result,id:crypto.randomUUID(),game:'fry',season:3,score:'4500',peak:'4500'};
    const betaKey='egg_portal_outbox_v1:account:beta:'+betaRun.id;
    globalThis.fetch=async(_url,options={})=>{
      if(options.method!=='POST')return response(user);
      const body=JSON.parse(options.body);posts.push(body);
      if(body.expectedName==='alpha')return oldReceipt.promise;
      if(failBeta)throw new Error('Beta is temporarily offline');
      return Response.json({profile:{...profile('Beta'),stats:[{game:'fry',best:body.run.score,runs:1}]}});
    };
    try {
      await f.module.refreshPortal();const alphaTicket=f.module.beginPortalRun('fry');
      f.module.submitPortalResult(alphaTicket,result);await until(()=>posts.length===1);
      f.values.set(betaKey,JSON.stringify(betaRun));
      user='Beta';await f.module.refreshPortal();
      assert.equal(posts.length,1,'the two account flushes cannot overlap');
      oldReceipt.resolve(Response.json({profile:profile('Alpha')}));
      await until(()=>posts.length===2&&!f.module.portalState().syncing);
      assert.deepEqual(posts.map(post=>post.expectedName),['alpha','beta']);
      assert.equal(posts[1].run.id,betaRun.id);
      assert.equal(f.module.portalState().account.name,'Beta');
      assert.equal(f.module.portalState().profile.name,'Beta','the old response cannot replace the current profile');
      assert.equal(f.module.portalState().unsynced,failBeta?1:0);
      assert.equal(f.values.has(betaKey),failBeta);
      assert.equal(f.values.has('egg_portal_outbox_v1:account:alpha:'+alphaTicket.id),false);
      if(!failBeta)assert.equal(JSON.parse(f.values.get('egg_fry_v3:account:beta')).best,'4500');
      await delay(10);assert.equal(posts.length,2,'a failed new owner waits for explicit retry or reconnect');
    }finally{
      oldReceipt.resolve(Response.json({profile:profile('Alpha')}));await idle(f.module);f.restore();
    }
  }
});

test('a same-account refresh during delivery drains the rest of the outbox automatically',async()=>{
  const f=await fixture('flush-refresh-same-owner'),receipt=deferred(),posts=[];
  globalThis.fetch=async(_url,options={})=>{
    if(options.method!=='POST')return response('Alpha');
    const body=JSON.parse(options.body);posts.push(body);
    if(posts.length===1)return receipt.promise;
    return Response.json({profile:{...profile('Alpha'),stats:[{game:'fry',best:body.run.score,runs:2}]}});
  };
  try {
    await f.module.refreshPortal();
    const first=f.module.beginPortalRun('fry'),second=f.module.beginPortalRun('fry');
    f.module.submitPortalResult(first,result);
    f.module.submitPortalResult(second,{...result,score:'4500',peak:'4500'});
    await until(()=>posts.length===1);
    await f.module.refreshPortal();
    receipt.resolve(Response.json({profile:profile('Alpha')}));
    await until(()=>posts.length===2&&!f.module.portalState().syncing);
    assert.deepEqual(posts.map(post=>post.run.id),[first.id,second.id]);
    assert.ok(posts.every(post=>post.expectedName==='alpha'));
    assert.equal(f.module.portalState().unsynced,0);
    assert.equal([...f.values.keys()].filter(key=>key.includes('outbox')).length,0);
    assert.equal(f.module.portalState().profile.stats[0].best,'4500');
  }finally{
    receipt.resolve(Response.json({profile:profile('Alpha')}));await idle(f.module);f.restore();
  }
});

const profileWrites = {
  settings: module=>module.saveProfileSettings(false,1),
  slug: module=>module.saveProfileSlug('alpha-new'),
  initiation: module=>module.completeInitiation([1,2,1,1,1,1,1,2,1,2]),
};

test('settings, public address and initiation accept receipts after refreshing the same account',async()=>{
  for(const [action,write] of Object.entries(profileWrites)) {
    const f=await fixture(`write-refresh-${action}`),receipt=deferred(),posts=[];
    const updated={...profile('Alpha'),public:false,avatar:1,slug:'alpha-new',initiated:true};
    let writing;
    globalThis.fetch=async(_url,options={})=>{
      if(options.method!=='POST')return response('Alpha');
      posts.push(JSON.parse(options.body));return receipt.promise;
    };
    try {
      await f.module.refreshPortal();writing=write(f.module);
      await until(()=>posts.length===1);
      await f.module.refreshPortal();
      receipt.resolve(Response.json({profile:updated}));
      await writing;
      assert.equal(posts[0].action,action);
      assert.equal(posts[0].expectedName,'Alpha');
      assert.deepEqual(f.module.portalState().profile,updated,'a benign refresh does not report a failed save or discard its receipt');
    }finally{
      receipt.resolve(Response.json({profile:updated}));await Promise.allSettled([writing].filter(Boolean));f.restore();
    }
  }
});

test('profile write receipts stay invalid after an actual switch, including switching back to their old owner',async()=>{
  for(const [action,write] of Object.entries(profileWrites))for(const switchBack of [false,true]) {
    const f=await fixture(`write-switch-${action}-${switchBack}`),receipt=deferred(),posts=[];
    let user='Alpha',writing;
    globalThis.fetch=async(_url,options={})=>{
      if(options.method!=='POST')return response(user);
      posts.push(JSON.parse(options.body));return receipt.promise;
    };
    try {
      await f.module.refreshPortal();
      writing=write(f.module).then(()=>({saved:true}),error=>({saved:false,error:error.message}));
      await until(()=>posts.length===1);
      user='Beta';await f.module.refreshPortal();
      if(switchBack){user='Alpha';await f.module.refreshPortal();}
      receipt.resolve(Response.json({profile:{...profile('Alpha'),public:false,avatar:7,initiated:true}}));
      const outcome=await writing;
      assert.equal(outcome.saved,false);
      assert.match(outcome.error,/[Aa]ccount[ _]changed/);
      assert.deepEqual(f.module.portalState().profile,profile(user),'the old mutation cannot overwrite a profile loaded after switching identities');
    }finally{
      receipt.resolve(Response.json({profile:profile('Alpha')}));await Promise.allSettled([writing].filter(Boolean));f.restore();
    }
  }
});

test('untangle solution receipts survive offline ownership changes and announce cloud progress without contaminating motion scores',async()=>{
  const { campaignSeed, generatePuzzle } = await import('../src/features/EggUntangle/engine.ts');
  const f=await fixture('untangle-outbox'),puzzle=generatePuzzle(campaignSeed(24)),posts=[],toasts=[];
  let user='Alpha',offline=true;
  window.addEventListener('egg:achievements',event=>toasts.push(...event.detail));
  const untangle={seed:puzzle.seed,level:24,mode:'campaign',moves:40,hints:0,positions:puzzle.solution};
  const progress={campaign:Array.from({length:24},(_,i)=>i+1),puzzles:[],totalSolved:24,dailySolved:0,dailyStreak:0,bestDailyStreak:0};
  globalThis.fetch=async(_url,options={})=>{
    if(options.method!=='POST')return response(user);
    const body=JSON.parse(options.body);posts.push(body);
    if(offline)throw new Error('offline');
    return Response.json({profile:{...profile('Alpha'),untangle:progress,
      stats:[{game:'untangle',best:'24',runs:24,solved:24,completedLevels:24}],
      achievements:['untangle.first','untangle.clean','untangle.master','untangle.campaign']}});
  };
  try {
    f.values.set('egg_motion_trials_v1:account:alpha',JSON.stringify({oracle:97}));
    await f.module.refreshPortal();const ticket=f.module.beginPortalRun('untangle');
    assert.equal(f.module.submitPortalResult(ticket,{score:'24',peak:'24',seconds:90,sector:0,losses:0,jackpot:false,dodged:0,swaps:0,untangle}),true);
    await idle(f.module);assert.equal(f.module.portalState().unsynced,1);
    const persisted=JSON.parse(f.values.get('egg_portal_outbox_v1:account:alpha:'+ticket.id));
    assert.deepEqual(persisted.untangle,untangle);
    user='Beta';await f.module.refreshPortal();await idle(f.module);assert.equal(posts.length,1);
    offline=false;user='Alpha';await f.module.refreshPortal();await idle(f.module);
    assert.equal(posts.length,2);assert.equal(posts[1].run.id,ticket.id);assert.deepEqual(posts[1].run.untangle,untangle);
    assert.equal(f.module.portalState().unsynced,0);assert.deepEqual(f.module.portalState().profile.untangle,progress);
    assert.deepEqual(JSON.parse(f.values.get('egg_motion_trials_v1:account:alpha')),{oracle:97});
    assert.equal(toasts.filter(id=>id==='untangle.campaign').length,1);
  }finally{f.restore();}
});

test('a completed guest puzzle is imported only by explicit consent to the current owner, retaining its UUID and offline proof',async()=>{
  const { campaignSeed, generatePuzzle }=await import('../src/features/EggUntangle/engine.ts');
  const f=await fixture('guest-explicit-import'),puzzle=generatePuzzle(campaignSeed(1)),posts=[];
  let user=null,offline=true;
  const values={score:'1',peak:'1',seconds:45,sector:0,losses:0,jackpot:false,dodged:0,swaps:0,
    untangle:{seed:puzzle.seed,level:1,mode:'campaign',moves:6,hints:0,positions:puzzle.solution}};
  globalThis.fetch=async(_url,options={})=>{
    if(options.method!=='POST')return user?response(user):Response.json({account:{name:'',registered:false},profile:null});
    posts.push(JSON.parse(options.body));if(offline)throw new Error('offline');return Response.json({profile:profile(user)});
  };
  try {
    await f.module.refreshPortal();const guest=f.module.beginPortalRun('untangle');assert.equal(guest.owner,null);
    assert.equal(f.module.submitPortalResult(guest,values),true);assert.equal(posts.length,0);
    user='Alpha';await f.module.refreshPortal();await idle(f.module);assert.equal(posts.length,0,'signing in never imports a guest result automatically');
    assert.equal(await f.module.importGuestPortalResult(guest,values,'Beta'),null,'consent is bound to the visibly selected owner');
    assert.equal(await f.module.importGuestPortalResult({...guest,game:'fry'},values,'Alpha'),null);
    const adopted=await f.module.importGuestPortalResult(guest,values,'Alpha');await idle(f.module);
    assert.deepEqual(adopted,{...guest,owner:'alpha',guestImport:true});
    assert.equal(posts.length,1);assert.equal(posts[0].run.id,guest.id);assert.equal(posts[0].run.guestImport,true);
    assert.deepEqual(posts[0].run.untangle,values.untangle);assert.equal(f.module.portalState().unsynced,1);
    assert.equal(await f.module.importGuestPortalResult(adopted,values,'Alpha'),null,'account-owned tickets cannot be adopted again');
    offline=false;await f.module.flushPortal();assert.equal(posts.length,2);
    assert.equal(posts[1].run.id,guest.id);assert.equal(f.module.portalState().unsynced,0);
  }finally{f.restore();}
});

test('guest import consent cannot move across an account switch while profile discovery is pending',async()=>{
  const { campaignSeed, generatePuzzle }=await import('../src/features/EggUntangle/engine.ts');
  const f=await fixture('guest-import-race'),oldRead=deferred(),puzzle=generatePuzzle(campaignSeed(1)),posts=[];
  let user='Alpha',delayRead=false,refreshing,adopting;
  const guest={id:crypto.randomUUID(),game:'untangle',owner:null};
  const values={score:'1',peak:'1',seconds:45,sector:0,losses:0,jackpot:false,dodged:0,swaps:0,
    untangle:{seed:puzzle.seed,level:1,mode:'campaign',moves:6,hints:0,positions:puzzle.solution}};
  globalThis.fetch=async(_url,options={})=>{
    if(options.method==='POST'){posts.push(JSON.parse(options.body));return Response.json({profile:profile(user)});}
    return delayRead?oldRead.promise:response(user);
  };
  try {
    await f.module.refreshPortal();delayRead=true;refreshing=f.module.refreshPortal();
    adopting=f.module.importGuestPortalResult(guest,values,'Alpha');
    user='Beta';delayRead=false;await f.module.refreshPortal();oldRead.resolve(response('Alpha'));
    await refreshing;assert.equal(await adopting,null);assert.equal(posts.length,0);
    assert.equal(f.module.portalState().account.name,'Beta');
  }finally{oldRead.resolve(response('Alpha'));await Promise.allSettled([refreshing,adopting].filter(Boolean));f.restore();}
});

test('a guest claim rejected by another account leaves no blocked outbox and preserves subsequent normal results',async()=>{
  const { campaignSeed, generatePuzzle }=await import('../src/features/EggUntangle/engine.ts');
  const f=await fixture('guest-import-conflict'),puzzle=generatePuzzle(campaignSeed(1)),posts=[];
  const values={score:'1',peak:'1',seconds:45,sector:0,losses:0,jackpot:false,dodged:0,swaps:0,
    untangle:{seed:puzzle.seed,level:1,mode:'campaign',moves:6,hints:0,positions:puzzle.solution}};
  globalThis.fetch=async(_url,options={})=>{
    if(options.method!=='POST')return response('Alpha');
    const body=JSON.parse(options.body);posts.push(body);
    return body.run.guestImport?Response.json({error:'guest_result_claimed'},{status:409}):Response.json({profile:profile('Alpha')});
  };
  try {
    await f.module.refreshPortal();
    const guest={id:crypto.randomUUID(),game:'untangle',owner:null};
    assert.ok(await f.module.importGuestPortalResult(guest,values,'Alpha'));
    f.module.submitPortalResult(f.module.beginPortalRun('untangle'),values);
    await idle(f.module);
    assert.equal(posts.length,2);assert.equal(f.module.portalState().unsynced,0);
    assert.equal(f.module.portalState().resultError,'guest_result_claimed');
    assert.equal([...f.values.keys()].filter(key=>key.includes('outbox')).length,0);
  }finally{f.restore();}
});

test('rejected guest imports never unlock local achievements or toasts before the server accepts ownership',async()=>{
  const { campaignSeed, generatePuzzle }=await import('../src/features/EggUntangle/engine.ts');
  const f=await fixture('guest-import-no-provisional-badges'),puzzle=generatePuzzle(campaignSeed(12,'swap')),receipt=deferred(),accepted=deferred(),toasts=[];
  const owner='Import Rejection',key='egg_portal_achievements_v1:account:import%20rejection';
  const values={score:'12',peak:'12',seconds:45,sector:0,losses:0,jackpot:false,dodged:0,swaps:0,
    untangle:{seed:puzzle.seed,level:12,mode:'campaign',moves:6,hints:0,positions:puzzle.solution}};
  window.addEventListener('egg:achievements',event=>toasts.push(...event.detail));
  globalThis.fetch=async(_url,options={})=>options.method==='POST'?receipt.promise:response(owner);
  try {
    await f.module.refreshPortal();
    const guest={id:crypto.randomUUID(),game:'untangle',owner:null};
    assert.ok(await f.module.importGuestPortalResult(guest,values,owner));
    assert.deepEqual(JSON.parse(f.values.get(key)??'[]'),[],'queueing guest proof must not save provisional account badges');
    assert.deepEqual(toasts,[],'queueing guest proof must not announce provisional account badges');
    receipt.resolve(Response.json({error:'guest_result_claimed'},{status:409}));await idle(f.module);
    assert.equal(f.module.portalState().resultError,'guest_result_claimed');
    assert.deepEqual(JSON.parse(f.values.get(key)??'[]'),[]);assert.deepEqual(toasts,[]);
    globalThis.fetch=async(_url,options={})=>options.method==='POST'?accepted.promise:response(owner);
    assert.ok(await f.module.importGuestPortalResult({...guest,id:crypto.randomUUID()},values,owner));
    assert.deepEqual(toasts,[]);
    const badges=['untangle.first','untangle.hard.first'];
    accepted.resolve(Response.json({profile:{...profile(owner),achievements:badges}}));await idle(f.module);
    assert.deepEqual(toasts,badges,'only achievements confirmed by the accepted profile are announced');
    assert.deepEqual(JSON.parse(f.values.get(key)),badges);
  }finally{receipt.resolve(Response.json({error:'guest_result_claimed'},{status:409}));accepted.resolve(Response.json({profile:profile(owner)}));await idle(f.module);f.restore();}
});

test('a late guest-claim rejection cannot attach its error to a newly selected account',async()=>{
  const { campaignSeed, generatePuzzle }=await import('../src/features/EggUntangle/engine.ts');
  const f=await fixture('guest-import-late-rejection'),puzzle=generatePuzzle(campaignSeed(1)),receipt=deferred();
  let user='Claim Alpha';
  const values={score:'1',peak:'1',seconds:45,sector:0,losses:0,jackpot:false,dodged:0,swaps:0,
    untangle:{seed:puzzle.seed,level:1,mode:'campaign',moves:6,hints:0,positions:puzzle.solution}};
  globalThis.fetch=async(_url,options={})=>options.method==='POST'?receipt.promise:response(user);
  try {
    await f.module.refreshPortal();
    assert.ok(await f.module.importGuestPortalResult({id:crypto.randomUUID(),game:'untangle',owner:null},values,user));
    user='Claim Beta';await f.module.refreshPortal();
    receipt.resolve(Response.json({error:'guest_result_claimed'},{status:409}));await idle(f.module);
    assert.equal(f.module.portalState().account.name,'Claim Beta');
    assert.equal(f.module.portalState().resultError,undefined);assert.equal(f.module.portalState().unsynced,0);
    user='Claim Alpha';await f.module.refreshPortal();assert.equal(f.module.portalState().resultError,undefined);
  }finally{receipt.resolve(Response.json({error:'guest_result_claimed'},{status:409}));await idle(f.module);f.restore();}
});

test('quota failure for a guest outbox cannot hide its durable proof behind a smaller claim marker',async()=>{
  const { campaignSeed, generatePuzzle }=await import('../src/features/EggUntangle/engine.ts');
  const { guestNestResults, markGuestNestClaimed, nestKey, saveNestSession }=await import('../src/features/EggUntangle/storage.ts');
  const f=await fixture('guest-import-quota-proof'),puzzle=generatePuzzle(campaignSeed(1)),posts=[];
  const owner='Quota Import',guest={id:crypto.randomUUID(),game:'untangle',owner:null};
  const proof={seed:puzzle.seed,mode:'campaign',points:puzzle.solution,moves:6,hints:0,seconds:45,ticket:guest,done:true};
  const values={score:'1',peak:'1',seconds:45,sector:0,losses:0,jackpot:false,dodged:0,swaps:0,
    untangle:{seed:puzzle.seed,level:1,mode:'campaign',moves:6,hints:0,positions:puzzle.solution}};
  let quota=false;
  const storage=globalThis.localStorage,setItem=storage.setItem;
  storage.setItem=(key,value)=>{if(quota&&value.length>80)throw Error('quota exceeded');setItem(key,value);};
  globalThis.fetch=async(_url,options={})=>{
    if(options.method!=='POST')return response(owner);
    posts.push(JSON.parse(options.body));throw Error('offline');
  };
  try {
    assert.equal(saveNestSession(proof),true);await f.module.refreshPortal();quota=true;
    storage.setItem('small-quota-probe',JSON.stringify('quota import'));
    const adopted=await f.module.importGuestPortalResult(guest,values,owner);
    if(adopted)markGuestNestClaimed(guest.id,adopted.owner); // The component acts only on an accepted receipt.
    await idle(f.module);assert.equal(adopted,null,'memory-only queueing must not authorize hiding the guest proof');
    assert.ok(guestNestResults().some(result=>result.ticket.id===guest.id));
    assert.equal(f.values.has(nestKey(null,`claimed:${guest.id}`)),false);
    assert.equal(JSON.parse(f.values.get(nestKey(null,`receipt:${guest.id}`))).ticket.id,guest.id);
    const reloaded=await import('../src/features/Portal/client.ts?case=guest-import-quota-reloaded');
    await reloaded.refreshPortal();assert.equal(reloaded.portalState().unsynced,0,'a fresh module correctly loses the failed memory-only outbox');
    assert.ok(guestNestResults().some(result=>result.ticket.id===guest.id),'the durable guest proof remains offered after that loss');
    quota=false;
    const retried=await f.module.importGuestPortalResult(guest,values,owner);await idle(f.module);
    assert.ok(retried,'retrying the same in-memory UUID attempts durable persistence again');
    assert.equal(JSON.parse(f.values.get('egg_portal_outbox_v1:account:quota%20import:'+guest.id)).id,guest.id);
    markGuestNestClaimed(guest.id,retried.owner);
    assert.equal(guestNestResults().some(result=>result.ticket.id===guest.id),false);
    assert.ok(posts.every(post=>post.run.id===guest.id));
  }finally{quota=false;storage.setItem=setItem;await idle(f.module);f.restore();}
});
