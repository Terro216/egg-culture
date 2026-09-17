import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {hashPassword,verifyPassword,validPassword,digestToken} from '../src/server/roadPasswords.ts';
import {createRoadRecordStore,roadRecordStore,RoadAccountError} from '../src/server/roadRecords.ts';
import {ROAD_GUEST_COOKIE,ROAD_SESSION_COOKIE} from '../src/server/roadHttp.ts';
import {GET,POST} from '../src/pages/api/egg-road-account.ts';
import {GET as recordsGET,POST as recordsPOST} from '../src/pages/api/egg-road-records.ts';
import {readTrackBest,saveTrackScore,readPointsBest,saveRoadScore,selectRoadAccount} from '../src/features/EggRoad/storage.ts';

const password='A long egg rolling phrase';
const nextPassword='A different long egg phrase';
const finalPassword='An entirely new egg phrase';
const run=(score=100,code='EGG1-R-2-ABC',name='Путник')=>({code,name,score,gates:score/100,distance:score/100*18+1,seconds:10,finished:false,breakdown:{gates:score,edge:0,speed:0,rhythm:0,drop:0,shortcut:0}});

test('passwords use salted scrypt, preserve their exact text and reject invalid length',async()=>{
  const a=await hashPassword(password),b=await hashPassword(password);
  assert.notEqual(a,b);assert.match(a,/^scrypt-17-8-1\$/);
  assert.ok(await verifyPassword(password,a));assert.equal(await verifyPassword(password+' ',a),false);
  assert.equal(await verifyPassword(password,null),false);
  for(const value of ['short','a'.repeat(129),42,'a'.repeat(15)+'\uD800'])assert.equal(validPassword(value),false);
  assert.ok(validPassword('я'.repeat(15)));assert.ok(validPassword('🪺'.repeat(128)));
});

test('registration, cross-device login, reset, logout and old-cookie rejection preserve existing records',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'egg-road-auth-'));process.env.EGG_ROAD_DATA_DIR=dir;
  let number=0;
  function client(cookies){
    const ip=`192.0.2.${++number}`,values=new Map(cookies),attributes=[];
    const context=(body=null,headers={},path='egg-road-account')=>{
      const url=new URL(`https://egg.example/api/${path}?code=EGG1-R-2-ABC`);
      return {url,site:new URL('https://egg.example'),clientAddress:ip,
        request:new Request(url,{method:body===null?'GET':'POST',headers:{origin:'https://egg.example','content-type':'application/json',...headers},...(body===null?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),
        cookies:{get:key=>values.has(key)?{value:values.get(key)}:undefined,set:(key,value,options)=>{values.set(key,value);attributes.push({key,...options});},delete:key=>values.delete(key)},
      };
    };
    return {values,attributes,context,post:body=>POST(context(body)),get:()=>GET(context()),board:()=>recordsGET(context(null,{},'egg-road-records')),publish:body=>recordsPOST(context(body,{},'egg-road-records'))};
  }
  const json=async response=>{assert.equal(response.status,200);return response.json();};
  try {
    const a=client();assert.equal((await json(await a.get())).registered,false);
    await json(await a.publish(run(200)));await json(await a.publish(run(300,'EGG1-E-2-ABC')));
    const legacy=client(a.values),legacyToken=a.values.get(ROAD_GUEST_COOKIE);
    const denied=await POST(a.context({action:'register',name:'Путник',password},{origin:'https://elsewhere.example'}));assert.equal(denied.status,403);
    assert.equal((await POST(a.context('x'.repeat(9000)))).status,413);
    assert.equal((await a.post({action:'register',name:'Путник',password:'short'})).status,400);
    const registered=await json(await a.post({action:'register',name:'Путник',password}));
    assert.deepEqual(registered.account,{name:'Путник',registered:true});assert.match(registered.recoveryCode,/^[A-F0-9]{4}(?:-[A-F0-9]{4}){9}$/);
    assert.notEqual(a.values.get(ROAD_GUEST_COOKIE),legacyToken);
    const session=a.values.get(ROAD_SESSION_COOKIE);assert.match(session,/^[a-f0-9]{64}$/);
    assert.deepEqual(a.attributes.find(v=>v.key===ROAD_SESSION_COOKIE),{key:ROAD_SESSION_COOKIE,httpOnly:true,sameSite:'lax',secure:true,path:'/',maxAge:2592000});
    let board=await json(await a.board());assert.equal(board.personal.score,200);assert.equal(board.endlessBest,300);assert.equal(board.registered,true);
    assert.ok(!JSON.stringify(board).includes('password'));assert.ok(!JSON.stringify(board).includes(session));
    assert.equal((await json(await legacy.board())).personal,null,'legacy guest cookies cannot authorize a registered player');
    assert.equal((await legacy.publish(run(900))).status,409);assert.equal((await json(await a.board())).personal.score,200);
    assert.equal((await legacy.post({action:'register',name:'путник',password})).status,409);
    const b=client();
    for(const name of ['Путник','Unknown player']){
      const wrong=await b.post({action:'login',name,password:nextPassword});assert.equal(wrong.status,401);assert.deepEqual(await wrong.json(),{error:'invalid_credentials'});
    }
    await json(await b.post({action:'login',name:'  ПУТНИК ',password}));
    assert.equal((await json(await b.board())).personal.score,200);
    const switched=await b.publish(run(400,'EGG1-R-2-ABC','Sneaky rename'));
    assert.equal(switched.status,409);assert.deepEqual(await switched.json(),{error:'account_changed'});
    assert.equal((await json(await a.board())).personal.score,200);
    await json(await b.publish(run(400)));
    board=await json(await a.board());assert.equal(board.personal.name,'Путник');assert.equal(board.personal.score,400);
    assert.equal((await b.post({action:'change',currentPassword:nextPassword,password:finalPassword})).status,401);
    assert.equal((await json(await a.get())).registered,true);
    const bOld=client(b.values);
    const changed=await json(await b.post({action:'change',currentPassword:password,password:nextPassword}));
    assert.notEqual(changed.recoveryCode,registered.recoveryCode);
    assert.equal((await json(await a.get())).registered,false);assert.equal((await json(await bOld.get())).registered,false);
    assert.equal((await a.post({action:'login',name:'Путник',password})).status,401);
    const c=client();
    assert.equal((await c.post({action:'recover',name:'Путник',password:finalPassword,recoveryCode:registered.recoveryCode})).status,401);
    const recovered=await json(await c.post({action:'recover',name:'Путник',password:finalPassword,recoveryCode:changed.recoveryCode.toLowerCase()}));
    assert.notEqual(recovered.recoveryCode,changed.recoveryCode);
    assert.equal((await json(await b.get())).registered,false);
    assert.equal((await c.post({action:'recover',name:'Путник',password,recoveryCode:changed.recoveryCode})).status,401,'recovery code is single-use');
    assert.equal((await json(await c.board())).personal.score,400);
    const replay=client(c.values);await json(await c.post({action:'logout'}));
    assert.equal((await json(await replay.get())).registered,false);
    assert.equal((await json(await c.get())).registered,false);
    await json(await c.post({action:'login',name:'Путник',password:finalPassword}));
    const reopened=createRoadRecordStore(dir);
    const accountPlayer=reopened.credentials('Путник').player;
    assert.notEqual(accountPlayer,digestToken(legacyToken));
    assert.equal(reopened.session(digestToken(c.values.get(ROAD_SESSION_COOKIE))),accountPlayer);
    assert.equal(reopened.read('EGG1-E-2-ABC',accountPlayer).personal.score,300);reopened.close();
    const db=new DatabaseSync(join(dir,'records.sqlite'));
    assert.notEqual(db.prepare('SELECT token FROM sessions LIMIT 1').get().token,c.values.get(ROAD_SESSION_COOKIE));
    assert.notEqual(db.prepare('SELECT recovery FROM accounts LIMIT 1').get().recovery,recovered.recoveryCode);
    db.prepare('UPDATE sessions SET expires=0 WHERE token=?').run(digestToken(c.values.get(ROAD_SESSION_COOKIE)));db.close();
    assert.equal((await json(await c.get())).registered,false);
    const x=client(),y=client();
    const race=await Promise.all([x.post({action:'register',name:'Racing signup',password}),y.post({action:'register',name:'RACING SIGNUP',password})]);
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
    const exhausted=client();let limited=false;
    for(let i=0;i<32;i++)if((await exhausted.post({action:'logout'})).status===429)limited=true;
    assert.ok(limited);
  } finally {roadRecordStore().close();delete process.env.EGG_ROAD_DATA_DIR;await rm(dir,{recursive:true,force:true});}
});

test('credential changes invalidate in-flight checks and persistent throttles survive reopen',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'egg-road-auth-state-'));let store=createRoadRecordStore(dir);
  try {
    store.register('p','Player','before','recovery-1','token-1');
    const old=store.credentials('Player');
    store.resetPassword(old,'after','recovery-2','token-2');
    assert.throws(()=>store.login(old,'late-login'),RoadAccountError);
    assert.throws(()=>store.resetPassword(old,'bad','bad','late-reset'),RoadAccountError);
    assert.equal(store.session('token-1'),null);assert.equal(store.session('token-2'),old.player);
    assert.equal(store.allowAuth('test-limit',2,60000),true);store.close();store=createRoadRecordStore(dir);
    assert.equal(store.allowAuth('test-limit',2,60000),true);assert.equal(store.allowAuth('test-limit',2,60000),false);
    const db=new DatabaseSync(join(dir,'records.sqlite'));db.exec('UPDATE auth_limits SET until=0');db.close();
    assert.equal(store.allowAuth('test-limit',2,60000),true);
  } finally {store.close();await rm(dir,{recursive:true,force:true});}
});

test('local score caches isolate accounts and only registration adopts existing guest scores',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}});
  try {
    saveTrackScore('EGG1-R-2-ABC',100);saveRoadScore('endless',200);
    selectRoadAccount('Первый',true);assert.equal(readTrackBest('EGG1-R-2-ABC'),100);assert.equal(readPointsBest('endless'),200);
    saveTrackScore('EGG1-R-2-ABC',300);
    selectRoadAccount('Второй');assert.equal(readTrackBest('EGG1-R-2-ABC'),0);assert.equal(readPointsBest('endless'),0);
    selectRoadAccount(null);assert.equal(readTrackBest('EGG1-R-2-ABC'),100);
    selectRoadAccount('ПЕРВЫЙ');assert.equal(readTrackBest('EGG1-R-2-ABC'),300);
  } finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
