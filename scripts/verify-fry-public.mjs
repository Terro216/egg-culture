// Synthetic completed runs use an isolated loopback preview only. No production writes or accounts.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pilotTarget} from './lib/fry-pilot.mjs';
const origin=process.env.FRY_ORIGIN||'http://127.0.0.1:4338';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Isolated loopback preview required');
const artifacts=process.env.FRY_ARTIFACTS||'/tmp/egg-fry-public';
await mkdir(artifacts,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  for(const lang of ['ru','en']){
    const ru=lang==='ru',context=await browser.newContext({viewport:{width:ru?390:320,height:ru?844:568},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await context.addInitScript({content:`window.__fryPilot=${pilotTarget.toString()};`});
    // Inspect the exact string passed by the real share button without relying on OS clipboard permissions.
    await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__sharedFryUrl=value;}}}));
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const req=route.request();requests.push({method:req.method(),url:req.url()});
      return req.url().startsWith(origin+'/')&&['GET','HEAD'].includes(req.method())?route.continue():route.abort();
    });
    await page.route('**/_astro/engine.*.js',async route=>{
      const response=await route.fetch();let body=await response.text(),factory;
      body=body.replace(/([A-Za-z_$][\w$]*) as createFryEngine/,(_,name)=>{factory=name;return '__publicFryFactory as createFryEngine';});
      assert.ok(factory);body+=`\nasync function __publicFryFactory(...args){const e=await ${factory}(...args);window.__fry=e;return e;}`;
      await route.fulfill({response,body});
    });
    const response=await page.goto(`${origin}/${lang}/fry/?fry=FRY3-3F`,{waitUntil:'networkidle'});
    assert.equal(response.status(),200);assert.equal(new URL(page.url()).pathname,`/${lang}/fry/`);
    assert.equal(await page.locator('meta[name="robots"][content*="noindex"]').count(),0);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),`https://egg.ilyamedve.dev/${lang}/fry/`);
    await page.locator('.egg-fry-primary:not(:disabled)').waitFor({timeout:60000});
    assert.equal(await page.evaluate(()=>localStorage.getItem('egg_adept')),null);
    assert.equal(await page.evaluate(()=>window.__fry.simulation.seed),123);
    await page.screenshot({path:`${artifacts}/public-${lang}-ready.png`});
    await page.locator('.egg-fry-primary').click();
    assert.equal(await page.getByTestId('fry-count').innerText(),'10');
    const banked=await page.evaluate(()=>{
      const e=window.__fry,s=e.simulation,state={};cancelAnimationFrame(e.frame);e.frame=0;
      for(let i=0;i<4200&&s.phase==='running';i++)s.step(window.__fryPilot(s,state));
      // Let the actual engine report the result and exercise its normal guest persistence.
      e.previousTime=performance.now()-17;e.tick(performance.now());cancelAnimationFrame(e.frame);e.frame=0;
      s.skipFrying();e.draw(.016);e.notify();return {success:s.result?.success,eggs:s.result?.eggs.toString()};
    });
    assert.equal(banked.success,true);
    await page.locator('.egg-fry-result-number').waitFor();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('egg_fry_v3')).best),banked.eggs);
    await page.getByRole('button',{name:ru?'Ссылка на дорогу':'Link to this road',exact:true}).click();
    const shared=await page.evaluate(()=>window.__sharedFryUrl);
    assert.equal(shared,`${origin}/${lang}/fry/?fry=FRY3-3F`);
    await page.locator('.egg-fry-toolbar button').first().click();
    assert.equal(await page.locator('.egg-fry-stage canvas').count(),0);
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.ok(await page.locator(`.site-header a[href="/${lang}/fry/"]`).count());
    await page.screenshot({path:`${artifacts}/public-${lang}-landing.png`,fullPage:true});
    await page.locator('.public-fry-start').click();
    await page.locator('.egg-fry-primary:not(:disabled)').waitFor({timeout:60000});
    assert.equal(await page.evaluate(()=>window.__fry.simulation.seed),123);
    assert.ok((await page.locator('.egg-fry-menu-best').innerText()).length>0);
    assert.ok(!requests.some(r=>r.url.includes('/quiz')),'public play never visits Initiation');
    assert.ok(requests.every(r=>['GET','HEAD'].includes(r.method)));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({lang,anonymous:true,noInitiation:true,sharedSeed:123,delivered:banked.eggs,guestBest:true,publicShare:true,reopen:true,mobileLayout:true,pageErrors:0}));
    await context.close();
  }
  const response=await fetch(`${origin}/sitemap.xml`),xml=await response.text();
  assert.equal(response.status,200);
  for(const lang of ['ru','en'])assert.ok(xml.includes(`<loc>https://egg.ilyamedve.dev/${lang}/fry/</loc>`));
  console.log(JSON.stringify({publicSitemap:true}));
}finally{await browser.close();}
