// Synthetic accounts and results: isolated loopback preview with its OWN database only.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const origin=process.env.FRY_ORIGIN||'http://127.0.0.1:4338';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Use an isolated loopback preview for profile checks');
const artifacts=process.env.FRY_ARTIFACTS||'/tmp/egg-portal-browser';
await mkdir(artifacts,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const name=`Browser-${randomUUID().slice(0,8)}`,password=randomUUID(),errors=[];
async function open(viewport){
  const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('egg_adept','true'));
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin)return route.abort();
    if(['GET','HEAD'].includes(req.method()))return route.continue();
    if(req.method()==='POST'&&['/api/portal-account','/api/portal-profile'].includes(url.pathname)){
      // The production build enforces the canonical Origin. Only this loopback test
      // request is rewritten; no request is ever made to the public host.
      const response=await route.fetch({headers:{...req.headers(),origin:'https://egg.ilyamedve.dev'},maxRetries:0});
      return route.fulfill({response});
    }
    return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  return {context,page};
}
const getProfile=page=>page.evaluate(async()=>{const response=await fetch('/api/portal-profile');return {status:response.status,...await response.json()};});
async function waitAccount(page){await page.locator('.portal-settings').waitFor({timeout:20000});}
async function signIn(page,lang,register=false){
  await page.goto(`${origin}/${lang}/profile/`,{waitUntil:'networkidle'});
  await page.locator('.egg-road-account summary').click();
  await page.locator('#road-account-name').waitFor();
  if(!register)await page.locator('.egg-road-account-actions').getByRole('button',{name:lang==='ru'?'Войти':'Sign in',exact:true}).click();
  await page.locator('#road-account-name').fill(name);
  await page.locator('#road-account-password').fill(password);
  if(register)await page.locator('#road-account-confirm').fill(password);
  const accountResponse=page.waitForResponse(r=>r.url()===`${origin}/api/portal-account`&&r.request().method()==='POST');
  await page.locator('form .egg-road-account-submit').click();
  const response=await accountResponse;
  if(!response.ok())throw new Error(`Account ${register?'registration':'login'} failed: ${response.status()} ${(await response.text()).slice(0,160)}`);
  if(register)await page.getByRole('button',{name:'Я сохранил код',exact:true}).click();
  await waitAccount(page);
  await page.locator('.egg-road-account summary').click();
}
async function hookFry(page){
  await page.route('**/_astro/engine.*.js',async route=>{
    const response=await route.fetch();let body=await response.text(),original;
    body=body.replace(/([A-Za-z_$][\w$]*) as createFryEngine/,(match,name)=>{original=name;return '__portalTestFactory as createFryEngine';});
    if(original)body+=`\nasync function __portalTestFactory(...args){const e=await ${original}(...args);window.__fry=e;return e;}`;
    await route.fulfill({response,body});
  });
}
try{
  const first=await open({width:390,height:844}),p=first.page;
  await signIn(p,'ru',true);
  assert.equal(await p.locator('.portal-public-toggle input').isChecked(),true,'new accounts start public');
  await p.getByRole('button',{name:'Знак 3',exact:true}).click();
  await p.getByRole('button',{name:'Сохранить',exact:true}).click();
  await p.getByText('Настройки сохранены.',{exact:true}).waitFor();
  await p.screenshot({path:`${artifacts}/profile-ru-new.png`,fullPage:true});
  const registered=await getProfile(p);assert.equal(registered.profile.public,true);assert.equal(registered.profile.avatar,2);
  const id=registered.profile.id;
  const oldAccount=await p.evaluate(async()=>await(await fetch('/api/egg-road-account')).json());
  assert.equal(oldAccount.name,name,'the old account API sees the same session');

  await hookFry(p);
  await p.goto(`${origin}/ru/dark-side/games/?game=fry&fry=FRY3-3F`,{waitUntil:'networkidle'});
  await p.waitForFunction(()=>Boolean(window.__fry),undefined,{timeout:60000});
  await p.locator('.egg-fry-primary:not(:disabled)').click();
  const eggs=await p.evaluate(()=>{
    const e=window.__fry,s=e.simulation;
    const apply=(n,op)=>{const v=op.value**BigInt(op.power??1)*(op.unit??1n);return op.kind==='add'?n+v:op.kind==='subtract'?(n>v?n-v:0n):op.kind==='multiply'?n*v/(op.divisor??1n):op.kind==='percent'?n*(100n-v)/100n:op.kind==='keep'?n*v/100n:n/v;};
    for(let i=0;i<4200&&s.phase==='running';i++){
      const row=s.rows.find(r=>r.at>s.distance);let x=-2.65;
      if(row?.kind==='gate'){const ops=row.swap?[row.operations[1],row.operations[0]]:row.operations;x=apply(s.eggs,ops[0])>=apply(s.eggs,ops[1])?-2.65:2.65;}
      else if(row?.kind==='hazard')x=row.x<0?3.55:-3.55;
      else if(row?.kind==='pickup'||row?.kind==='shield')x=row.x;
      e.steering.target=x;s.step(x);
    }
    e.draw();e.notify();return s.result?.success?s.result.eggs.toString():null;
  });
  assert.ok(eggs&&BigInt(eggs)>0n,'an actual completed run delivers eggs');
  await p.waitForFunction(()=>window.__fry.reported===true);
  await p.locator('.egg-fry-skip').click();
  await p.getByText('Результат сохранён в профиле.',{exact:true}).waitFor({timeout:20000});
  await p.screenshot({path:`${artifacts}/profile-fry-result.png`});
  const completed=await getProfile(p);assert.equal(completed.profile.stats.find(s=>s.game==='fry').best,eggs);
  assert.equal(completed.profile.stats.find(s=>s.game==='fry').runs,1);

  // The other three game values are isolated API fixtures; Fry above is a full UI run.
  for(const [game,score] of [['road','1234'],['chalaza','87'],['oracle','100']]){
    const value=await p.evaluate(async({game,score,id,name})=>{
      const run={id,game,score,peak:score,seconds:30,sector:0,losses:0,jackpot:false,dodged:0,swaps:0};
      const response=await fetch('/api/portal-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'result',expectedName:name,run})});
      return response.status;
    },{game,score,id:randomUUID(),name});
    assert.equal(value,200);
  }
  await p.goto(`${origin}/ru/profile/`,{waitUntil:'networkidle'});await waitAccount(p);
  assert.equal(await p.locator('.portal-game-stats article').count(),4);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:`${artifacts}/profile-ru-scores.png`,fullPage:true});

  const anonymous=await open({width:1024,height:900});
  let publicResponse=await anonymous.page.goto(`${origin}/ru/adepts/${id}/`,{waitUntil:'networkidle'});
  assert.equal(publicResponse.status(),200);assert.equal(publicResponse.headers()['cache-control'],'no-store');
  assert.equal(await anonymous.page.locator('.portal-identity h2').innerText(),name);
  await anonymous.page.screenshot({path:`${artifacts}/profile-public.png`,fullPage:true});
  const publicData=await anonymous.page.evaluate(async id=>await(await fetch(`/api/portal-profile?id=${id}`)).json(),id);
  assert.deepEqual(Object.keys(publicData.profile).sort(),['achievements','avatar','frySeason','id','name','stats']);
  assert.equal(publicData.profile.frySeason,3);

  const second=await open({width:320,height:568});await signIn(second.page,'en');
  const restored=await getProfile(second.page);
  assert.equal(restored.profile.id,id);assert.equal(restored.profile.stats.length,4);
  assert.equal(restored.profile.stats.find(s=>s.game==='fry').best,eggs);
  assert.ok(restored.profile.achievements.includes('road.thousand'));
  assert.ok(restored.profile.achievements.includes('chalaza.complete'));
  assert.ok(restored.profile.achievements.includes('oracle.complete'));
  assert.equal(await second.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await second.page.screenshot({path:`${artifacts}/profile-en-320.png`,fullPage:true});
  await second.page.locator('.portal-public-toggle input').uncheck();
  await second.page.getByRole('button',{name:'Save',exact:true}).click();
  await second.page.getByText('Settings saved.',{exact:true}).waitFor();
  publicResponse=await anonymous.page.goto(`${origin}/ru/adepts/${id}/`,{waitUntil:'networkidle'});
  assert.equal(publicResponse.status(),404);
  assert.equal(await anonymous.page.evaluate(async id=>(await fetch(`/api/portal-profile?id=${id}`)).status,id),404);
  await second.page.locator('.egg-road-account summary').click();
  await second.page.getByRole('button',{name:'Sign out',exact:true}).click();
  await second.page.waitForFunction(()=>!document.querySelector('.portal-settings'));
  assert.equal((await getProfile(second.page)).profile,null);
  assert.equal(await second.page.evaluate(()=>localStorage.getItem('egg_road_active_account_v1')),null);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({newPublic:true,sharedLegacySession:true,actualFryResult:eggs,gameProfiles:4,secondDevice:true,avatar:true,privacyRevocation:true,logout:true,viewports:['390x844','320x568','1024x900'],pageErrors:0}));
}finally{await browser.close();}
