// Fixtures are injected only into an isolated preview response. No production writes or debug hooks.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const origin=process.env.FRY_ORIGIN||'http://127.0.0.1:4338';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Isolated loopback preview required');
const artifacts=process.env.FRY_ARTIFACTS||'/tmp/egg-fry-late';
await mkdir(artifacts,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  for(const lang of ['ru','en']){
    const ru=lang==='ru',context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference'});
    await context.addInitScript(()=>{
      window.__fryLabels=[];
      const fill=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,...rest){window.__fryLabels.push(text);return fill.call(this,text,...rest);};
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(origin+'/')&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
    await page.route('**/_astro/engine.*.js',async route=>{
      const response=await route.fetch();let body=await response.text(),factory;
      body=body.replace(/([A-Za-z_$][\w$]*) as createFryEngine/,(_,name)=>{factory=name;return '__lateFryFactory as createFryEngine';});
      assert.ok(factory);body+=`\nasync function __lateFryFactory(...args){const e=await ${factory}(...args);window.__fry=e;return e;}`;
      await route.fulfill({response,body});
    });
    await page.goto(`${origin}/${lang}/fry/?fry=FRY3-0`,{waitUntil:'domcontentloaded'});
    console.log(JSON.stringify({lang,stage:'public-page-loaded'}));
    await page.locator('.egg-fry-primary:not(:disabled)').click({timeout:60000});
    console.log(JSON.stringify({lang,stage:'engine-ready'}));
    await page.evaluate(()=>{const e=window.__fry;cancelAnimationFrame(e.frame);e.frame=0;});
    const fixture=async({x=-2.65,distance=1770,ahead=45,mystery=true}={})=>page.evaluate(({x,distance,ahead,mystery})=>{
      const e=window.__fry;e.reset(0);const s=e.simulation;
      s.distance=distance;s.seconds=150;s.motionTime=150;s.generatedSector=50;s.x=x;s.eggs=1000n;s.peak=10n**60n;
      s.cancelCharges=1;s.brakeCharges=1;e.steering.reanchor(x);
      s.trail.push(distance-80,x);s.trail.push(distance,x);
      s.rows=[{id:'late',kind:'gate',at:distance+ahead,sector:5,reference:1000n,jackpot:false,
        operations:[{kind:'divide',value:2n,divisor:4n,notation:'fraction'},{kind:'multiply',value:8n,divisor:10n,notation:'decimal'}],
        ...(mystery?{mystery:{salt:0}}:{})}];
      for(let i=0;i<180;i++){s.physics.positionFlock(s.eggs,x,s.seconds,s.trail,{seed:0,distance,carton:false});s.physics.step();}
      window.__fryLabels=[];e.draw(2);e.notify();
    },{x,distance,ahead,mystery});
    const advance=async()=>page.evaluate(()=>{
      const e=window.__fry,s=e.simulation,row=s.rows[0];
      for(let i=0;i<300&&s.phase==='running'&&s.distance+3.2<row.at;i++)s.step(e.steering.target);
      e.draw(.016);e.notify();return {eggs:s.eggs.toString(),phase:s.phase,effect:row.mystery?.revealed?.kind??null,notice:s.notice?.kind};
    });
    await fixture();
    const colors=await page.evaluate(()=>window.__fry.rows.get('late').materials.map(m=>m.color.getHex()));
    assert.deepEqual(colors,[0xff7277,0xc794ff,0x70f3c0]);
    const labels=await page.evaluate(()=>window.__fryLabels);
    assert.ok(labels.includes('÷(2/4)'));assert.ok(labels.includes(ru?'×(0,8)':'×(0.8)'));assert.ok(labels.includes('?'));
    assert.equal(await page.evaluate(()=>window.__fry.simulation.speed),34,'exercise the maximum road speed');
    await page.screenshot({path:`${artifacts}/${lang}-triple-390.png`});
    for(const viewport of [{width:320,height:568},{width:844,height:390},{width:1280,height:800}]){
      await page.setViewportSize(viewport);await page.evaluate(()=>{window.__fry.resize();window.__fry.draw(.016);});
      const layout=await page.evaluate(()=>{
        const button=document.querySelector('.egg-fry-mystery-choice'),box=button.getBoundingClientRect();
        const others=[...document.querySelectorAll('.egg-fry-powers button,.egg-fry-steering button')].map(n=>n.getBoundingClientRect());
        return {onscreen:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,
          hit:document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)===button||button.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)),
          separated:others.every(b=>box.bottom<=b.top||box.top>=b.bottom||box.right<=b.left||box.left>=b.right),height:box.height};
      });
      assert.equal(layout.onscreen&&layout.hit&&layout.separated,true,JSON.stringify({viewport,layout}));assert.ok(layout.height>=44);
      await page.screenshot({path:`${artifacts}/${lang}-triple-${viewport.width}.png`});
    }
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.__fry.resize();window.__fry.draw(.016);});
    await page.locator('.egg-fry-mystery-choice').tap();
    assert.equal(await page.evaluate(()=>window.__fry.steering.target),0);
    assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('egg-fry')),true);
    const first=await advance();assert.equal(first.phase,'running');assert.ok(first.effect);assert.equal(first.notice,'mystery');
    assert.ok((await page.locator('.egg-fry-notice--mystery').innerText()).startsWith('? →'));
    assert.equal(await page.locator('.egg-fry-mystery-choice').count(),0);
    await page.screenshot({path:`${artifacts}/${lang}-mystery-reveal.png`});
    await fixture({x:2.65});await page.locator('.egg-fry').focus();await page.keyboard.press('ArrowDown');
    assert.deepEqual(await advance(),first,'keyboard and touch draw the same seeded effect');
    await fixture({x:-2.65});await page.locator('.egg-fry').focus();await page.keyboard.press('s');
    assert.equal(await page.evaluate(()=>window.__fry.steering.target),0);
    // At maximum speed there is still time to cross from one ordinary side to the other.
    await fixture({x:2.65});await page.getByRole('button',{name:ru?'Выбрать левые ворота':'Choose the left gate',exact:true}).tap();
    assert.deepEqual(await advance(),{eggs:'2000',phase:'running',effect:null,notice:'gain'});
    await fixture({x:-2.65});await page.getByRole('button',{name:ru?'Выбрать правые ворота':'Choose the right gate',exact:true}).tap();
    assert.deepEqual(await advance(),{eggs:'800',phase:'running',effect:null,notice:'loss'});
    await fixture({x:0});await page.locator('.egg-fry').focus();await page.keyboard.press('e');
    assert.equal(await page.locator('.egg-fry-mystery-choice').count(),0);
    assert.deepEqual(await page.evaluate(()=>window.__fry.rows.get('late').materials.map(m=>m.color.getHex())),colors,'render changes on the next frame');
    await page.evaluate(()=>{window.__fry.draw(.016);window.__fry.notify();});
    assert.deepEqual(await page.evaluate(()=>window.__fry.rows.get('late').materials.map(m=>m.color.getHex())),[0x94a6ae,0x94a6ae,0x94a6ae]);
    assert.deepEqual(await advance(),{eggs:'1000',phase:'running',effect:null,notice:'cancelled'});
    await fixture({mystery:false});
    assert.equal(await page.locator('.egg-fry-mystery-choice').count(),0);
    await page.screenshot({path:`${artifacts}/${lang}-rational-pair.png`});
    const palettes=[],resources=[];
    await page.setViewportSize({width:1280,height:800});
    for(const [zone,distance] of [[0,200],[1,1220],[2,2230]]){
      await fixture({distance,mystery:zone===2});
      const metrics=await page.evaluate(()=>{
        const e=window.__fry;e.resize();e.draw(.016);return {background:e.scene.background.getHex(),batches:e.surroundings.children.length,
          calls:e.renderer.info.render.calls,triangles:e.renderer.info.render.triangles,geometries:e.renderer.info.memory.geometries,textures:e.renderer.info.memory.textures};
      });
      assert.equal(metrics.batches,6);assert.ok(metrics.calls<130,JSON.stringify(metrics));
      palettes.push(metrics.background);resources.push(metrics);
      await page.screenshot({path:`${artifacts}/${lang}-kitchen-zone-${zone}.png`});
    }
    assert.equal(new Set(palettes).size,3);
    const movement=await page.evaluate(()=>{
      const e=window.__fry,s=e.simulation,mesh=e.scenery.meshes.eggs;
      e.draw(0);const before=Array.from(mesh.instanceMatrix.array);s.motionTime+=1;e.draw(0);
      const animated=before.some((v,i)=>v!==mesh.instanceMatrix.array[i]);
      e.reducedMotion=true;e.draw(0);const calm=Array.from(mesh.instanceMatrix.array);s.motionTime+=1;e.draw(0);
      const frozen=calm.every((v,i)=>v===mesh.instanceMatrix.array[i]);e.reducedMotion=false;
      s.rows=[];e.draw(0);const start={...e.renderer.info.memory};
      for(let i=0;i<120;i++){s.distance+=.15;s.motionTime+=1/60;e.draw(1/60);}
      return {animated,frozen,start,end:{...e.renderer.info.memory}};
    });
    assert.equal(movement.animated&&movement.frozen,true);assert.deepEqual(movement.end,movement.start,'background animation creates no GPU resources');
    await page.getByRole('button',{name:ru?'Пауза':'Pause',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__fry.simulation.phase),'paused');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({lang,threeGates:true,exactLabels:true,touchAndKeyboard:true,avoidableAtMaxSpeed:true,allLanesDisabled:true,mobile320:true,landscape:true,palettes,resources,stableAnimationResources:true,pageErrors:0}));
    await context.close();
  }
}finally{await browser.close();}
