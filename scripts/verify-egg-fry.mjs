// Run against an isolated preview only. The factory hook exists in this test response, not in the shipped bundle.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pilotTarget } from './lib/fry-pilot.mjs';
const origin=process.env.FRY_ORIGIN||'http://127.0.0.1:4338';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Use an isolated loopback preview for synthetic fry checks');
const artifacts=process.env.FRY_ARTIFACTS||'/tmp/egg-fry-browser';
await mkdir(artifacts,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});

async function open(lang,viewport,adept=true){
  const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript({content:`window.__fryPilot = ${pilotTarget.toString()};`});
  if(adept)await context.addInitScript(()=>localStorage.setItem('egg_adept','true'));
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const request=route.request();requests.push({method:request.method(),url:request.url()});
    return request.url().startsWith(origin+'/')&&['GET','HEAD'].includes(request.method())?route.continue():route.abort();
  });
  await page.route('**/_astro/engine.*.js',async route=>{
    const response=await route.fetch();let body=await response.text(),original;
    body=body.replace(/([A-Za-z_$][\w$]*) as createFryEngine/,(match,name)=>{original=name;return '__fryTestFactory as createFryEngine';});
    if(original)body+=`\nasync function __fryTestFactory(...args){const engine=await ${original}(...args);window.__fry=engine;return engine;}`;
    await route.fulfill({response,body});
  });
  await page.goto(`${origin}/${lang}/dark-side/games/?game=fry&fry=FRY3-3F`,{waitUntil:'networkidle'});
  if(adept){await page.locator('.egg-fry-primary:not(:disabled)').waitFor({timeout:60000});await page.waitForFunction(()=>Boolean(window.__fry),undefined,{timeout:60000});}
  return {context,page,errors,requests};
}

async function toPan(page){
  return page.evaluate(()=>{
    const engine=window.__fry,sim=engine.simulation;
    const state={};
    for(let i=0;i<4200&&sim.phase==='running';i++){
      const target=window.__fryPilot(sim,state);
      engine.steering.target=target;sim.step(target);
    }
    return {phase:sim.phase,eggs:sim.result?.eggs.toString(),success:sim.result?.success};
  });
}

try{
  const mobile=await open('ru',{width:390,height:844});const p=mobile.page;
  await p.screenshot({path:`${artifacts}/ru-ready.png`});
  await p.locator('.egg-fry-primary').click();
  assert.equal(await p.locator('[data-testid="fry-count"]').innerText(),'10');
  const cdp=await mobile.context.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:110,y:650,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:205,y:650,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await p.evaluate(()=>window.__fry.steering.target)>1,'touch drag steers the clutch');
  const target=await p.evaluate(()=>window.__fry.steering.target);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:50,y:650,id:2}]});
  assert.equal(await p.evaluate(()=>window.__fry.steering.target),target,'retouch does not jump');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await p.waitForTimeout(350);await p.screenshot({path:`${artifacts}/ru-running.png`});
  await p.getByRole('button',{name:'Пауза',exact:true}).click();
  const frozen=await p.evaluate(()=>window.__fry.simulation.distance);await p.waitForTimeout(250);
  assert.equal(await p.evaluate(()=>window.__fry.simulation.distance),frozen);
  await p.getByRole('button',{name:'Продолжить забег',exact:true}).click();
  await p.locator('.egg-fry-countdown').waitFor();
  assert.equal(await p.evaluate(()=>window.__fry.simulation.distance),frozen);
  await p.waitForFunction(()=>window.__fry.simulation.phase==='running',undefined,{timeout:15000});
  const banked=await toPan(p);assert.equal(banked.phase,'frying');assert.equal(banked.success,true);
  await p.waitForFunction(()=>window.__fry.reported===true);
  await p.evaluate(()=>{const e=window.__fry;for(let i=0;i<155;i++)e.simulation.step(0);e.draw();e.notify();});
  await p.screenshot({path:`${artifacts}/ru-pan.png`});
  await p.locator('.egg-fry-skip').click();
  await p.locator('.egg-fry-result-number').waitFor();
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('egg_fry_v3')).best),banked.eggs);
  await p.screenshot({path:`${artifacts}/ru-result.png`});
  await p.getByRole('button',{name:'Повторить эту дорогу',exact:true}).click();
  assert.equal(await p.evaluate(()=>window.__fry.simulation.eggs.toString()),'10');
  assert.equal(await p.evaluate(()=>window.__fry.simulation.seed),123);
  assert.equal(await p.evaluate(()=>{
    const e=window.__fry,s=e.simulation,row={id:'browser-pickup',at:s.distance+4,sector:0,kind:'pickup',x:0,count:12n};
    s.rows.push(row);e.draw();const visible=e.rows.has(row.id);
    for(let i=0;i<22;i++)s.step(0);e.draw();e.notify();
    return visible&&s.collected.has(row.id)&&!e.rows.has(row.id);
  }),true,'collected objects disappear from the rendered road');
  await p.evaluate(()=>{const e=window.__fry,s=e.simulation;s.rows=[];s.eggs=10000000000n;s.peak=s.eggs;e.steering.target=0;for(let i=0;i<190;i++)s.step(0);e.draw(2);e.notify();});
  assert.ok(await p.evaluate(()=>window.__fry.flock.count)>1100);
  await p.locator('.portal-achievement-toast').waitFor();
  await p.screenshot({path:`${artifacts}/ru-tail-achievement.png`});
  if(await p.evaluate(()=>document.fullscreenEnabled)){
    await p.locator('.egg-fry-fullscreen').click();
    await p.waitForFunction(()=>Boolean(document.fullscreenElement));
    await p.evaluate(()=>window.dispatchEvent(new CustomEvent('egg:achievements',{detail:['fry.risk']})));
    await p.waitForFunction(()=>document.fullscreenElement?.contains(document.querySelector('.portal-achievement-toast')));
    await p.screenshot({path:`${artifacts}/ru-fullscreen-achievement.png`});
  }
  await p.locator('.egg-fry-toolbar button').first().click();
  await p.locator('.adept-game-card').first().waitFor();assert.equal(await p.locator('.adept-game-card').count(),4);
  assert.equal(await p.locator('.egg-fry-stage canvas').count(),0);
  await p.screenshot({path:`${artifacts}/ru-games.png`});
  assert.deepEqual(mobile.errors,[]);assert.ok(mobile.requests.every(r=>['GET','HEAD'].includes(r.method)));
  console.log(JSON.stringify({viewport:'390x844',language:'ru',startsWithTen:true,touch:true,retouch:true,pause:true,pan:true,exactRecord:banked.eggs,retry:true,cleanup:true,pageErrors:0}));
  await mobile.context.close();

  const english=await open('en',{width:320,height:568});
  await english.page.screenshot({path:`${artifacts}/en-ready-320.png`});
  assert.ok((await english.page.locator('.egg-fry-primary').innerText()).includes('Start with ten'));
  await english.page.locator('.egg-fry-primary').click();
  await english.page.keyboard.down('ArrowLeft');await english.page.waitForTimeout(250);await english.page.keyboard.up('ArrowLeft');
  assert.ok(await english.page.evaluate(()=>window.__fry.steering.target)<0);
  assert.equal(await english.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await english.page.screenshot({path:`${artifacts}/en-running-320.png`});
  await english.page.setViewportSize({width:667,height:375});await english.page.waitForTimeout(250);
  await english.page.screenshot({path:`${artifacts}/en-landscape.png`});
  assert.equal(await english.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await english.page.evaluate(()=>{
    const e=window.__fry,s=e.simulation;
    s.resolve({id:'browser-zero',at:s.distance,sector:0,kind:'gate',jackpot:false,operations:[{kind:'subtract',value:s.eggs},{kind:'subtract',value:s.eggs}]});e.notify();
  });
  await english.page.locator('.egg-fry-result-number').waitFor({timeout:10000});
  assert.equal(await english.page.locator('.egg-fry-result-number').innerText(),'0');
  assert.equal(await english.page.evaluate(()=>window.__fry.simulation.physics.fried.length),0);
  assert.deepEqual(english.errors,[]);
  console.log(JSON.stringify({viewport:'320x568 / 667x375',language:'en',keyboard:true,layout:true,emptyPan:true,automaticResult:true,pageErrors:0}));
  await english.context.close();

  const gate=await open('en',{width:390,height:844},false);
  await gate.page.waitForURL('**/en/fry/?fry=FRY3-3F');
  await gate.page.locator('.egg-fry-primary:not(:disabled)').waitFor({timeout:60000});
  assert.equal(await gate.page.evaluate(()=>localStorage.getItem('egg_adept')),null);
  await gate.page.goto(`${origin}/en/dark-side/games/?road=EGG1-R-1-0`,{waitUntil:'networkidle'});
  await gate.page.waitForURL('**/en/quiz**');
  assert.equal(await gate.page.evaluate(()=>localStorage.getItem('egg_after_quiz')),'/en/dark-side/?road=EGG1-R-1-0#games');
  assert.deepEqual(gate.errors,[]);await gate.context.close();
  console.log(JSON.stringify({legacyFryLinkIsPublic:true,otherTrialsStillRequireInitiation:true}));
}finally{await browser.close();}
