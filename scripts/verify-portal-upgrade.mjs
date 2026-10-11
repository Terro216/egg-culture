// Upgrade fixture for an isolated preview: prepare with the previous image, check with the candidate.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
const origin=process.env.FRY_ORIGIN||'http://127.0.0.1:4338';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Isolated loopback preview required');
const path=process.env.PORTAL_UPGRADE_FIXTURE||'/checks/upgrade-fixture.json';
let cookies=[];
async function call(endpoint,body) {
  const response=await fetch(origin+endpoint,{method:body?'POST':'GET',headers:{Origin:'https://egg.ilyamedve.dev','Content-Type':'application/json',Cookie:cookies.join('; ')},...(body?{body:JSON.stringify(body)}:{})});
  for(const cookie of response.headers.getSetCookie()) {const pair=cookie.split(';')[0],name=pair.split('=')[0];cookies=cookies.filter(c=>!c.startsWith(name+'='));cookies.push(pair);}
  assert.equal(response.status,200,`unexpected status for ${endpoint}`);return response.json();
}
const oldScore='2000000000000';
if(process.argv[2]==='prepare') {
  const name='Upgrade '+randomBytes(4).toString('hex');
  await call('/api/portal-account',{action:'register',name,password:randomBytes(24).toString('hex')});
  const mine=await call('/api/portal-profile');
  await call('/api/portal-profile',{action:'settings',expectedName:name,public:false,avatar:3});
  const run={id:randomUUID(),game:'fry',score:oldScore,peak:oldScore,seconds:300,sector:8,losses:3,jackpot:true,dodged:5,swaps:6};
  await call('/api/portal-profile',{action:'result',expectedName:name,run});
  const old=await call('/api/portal-profile');assert.equal(old.profile.public,false);assert.equal(old.profile.stats.find(s=>s.game==='fry').best,oldScore);
  await writeFile(path,JSON.stringify({name,cookies,id:mine.profile.id,run}),{mode:0o600});
  console.log(JSON.stringify({prepared:true,privateProfile:true,legacyScore:true}));
} else if(process.argv[2]==='check') {
  const fixture=JSON.parse(await readFile(path,'utf8'));cookies=fixture.cookies;
  const mine=await call('/api/portal-profile');assert.equal(mine.account.name,fixture.name,'the existing session survived');
  assert.equal(mine.profile.id,fixture.id);assert.equal(mine.profile.public,true);assert.equal(mine.profile.avatar,3);
  assert.equal(mine.profile.frySeason,3);assert.ok(!mine.profile.stats.some(s=>s.game==='fry'));
  const publicResponse=await fetch(origin+'/api/portal-profile?id='+fixture.id);assert.equal(publicResponse.status,200);
  await call('/api/portal-profile',{action:'result',expectedName:fixture.name,run:{...fixture.run,id:randomUUID()}});
  const stillFresh=await call('/api/portal-profile');assert.ok(!stillFresh.profile.stats.some(s=>s.game==='fry'),'a late old tab cannot restore the old score');
  await call('/api/portal-profile',{action:'result',expectedName:fixture.name,run:{...fixture.run,id:randomUUID(),season:3,score:'90'}});
  const current=await call('/api/portal-profile');assert.equal(current.profile.stats.find(s=>s.game==='fry').best,'90');
  await call('/api/portal-profile',{action:'settings',expectedName:fixture.name,public:false,avatar:3});
  assert.equal((await fetch(origin+'/api/portal-profile?id='+fixture.id)).status,404);
  console.log(JSON.stringify({existingSession:true,stablePublicId:true,legacyNowPublic:true,freshSeason:true,oldTabIsolated:true,privateToggle:true}));
} else throw new Error('Use prepare or check');
