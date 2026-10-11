// Synthetic fixtures run ONLY in the isolated preview; no production data, account or shipped debug hook.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const origin=process.env.FRY_ORIGIN||'http://127.0.0.1:4338';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Isolated loopback preview required');
const artifacts=process.env.FRY_ARTIFACTS||'/tmp/egg-fry3-mechanics';
await mkdir(artifacts,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('egg_adept','true'));
  const p=await context.newPage(),errors=[];
  p.on('pageerror',error=>errors.push(error.message));
  await p.route('**/*',route=>route.request().url().startsWith(origin+'/')&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
  await p.route('**/_astro/engine.*.js',async route=>{
    const response=await route.fetch();let body=await response.text(),name;
    body=body.replace(/([A-Za-z_$][\w$]*) as createFryEngine/,(_,value)=>{name=value;return '__mechanicsFactory as createFryEngine';});
    assert.ok(name,'factory was located');
    body+=`\nasync function __mechanicsFactory(...args){const e=await ${name}(...args);window.__fry=e;return e;}`;
    await route.fulfill({response,body});
  });
  await p.goto(`${origin}/ru/dark-side/games/?game=fry&fry=FRY3-0`,{waitUntil:'networkidle'});
  await p.locator('.egg-fry-primary:not(:disabled)').click({timeout:60000});
  await p.evaluate(()=>{const e=window.__fry;cancelAnimationFrame(e.frame);e.frame=0;});

  // Test the visible active buttons, not just the simulation methods.
  await p.evaluate(()=>{
    const e=window.__fry,s=e.simulation;s.rows=[];s.eggs=30000000n;s.peak=s.eggs;s.cancelCharges=2;s.brakeCharges=1;
    s.rows.push({id:'risk',kind:'gate',at:s.distance+25,sector:3,reference:s.eggs,jackpot:false,swap:true,swapStartedAt:s.seconds,
      operations:[{kind:'subtract',value:6n,power:2,unit:1000000n},{kind:'multiply',value:5n,divisor:3n}]});
    for(let i=0;i<180;i++){s.physics.positionFlock(s.eggs,0,s.seconds);s.physics.step();}e.draw(2);e.notify();
  });
  assert.equal(await p.locator('.egg-fry-powers button').count(),2);
  assert.ok(!(await p.locator('.egg-fry').innerText()).includes('Меняются местами'));
  await p.screenshot({path:`${artifacts}/ru-scaled-equations.png`});
  await p.setViewportSize({width:320,height:568});
  await p.evaluate(()=>{const e=window.__fry;e.resize();e.draw(.016);});
  await p.screenshot({path:`${artifacts}/ru-powers-320.png`});
  assert.equal(await p.evaluate(()=>{
    const arrows=[...document.querySelectorAll('.egg-fry-steering button')].map(node=>node.getBoundingClientRect());
    return [...document.querySelectorAll('.egg-fry-powers button')].every(node=>{const box=node.getBoundingClientRect();return box.left>=arrows[0].right&&box.right<=arrows[1].left&&box.height>=44;});
  }),true,'both powers fit between the steering buttons at 320 px');
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{const e=window.__fry;e.resize();e.draw(.016);});
  const movement=await p.evaluate(()=>{
    const e=window.__fry,s=e.simulation,prop=e.scenery.props.find(item=>item.position.z<0&&item.position.z>-100);
    const z=prop.position.z,d=s.distance;for(let i=0;i<10;i++)s.step(0);e.draw(.16);
    return {actual:prop.position.z-z,expected:(s.distance-d)*prop.userData.parallax};
  });
  assert.ok(Math.abs(movement.actual-movement.expected)<1e-8,'background displacement follows the actual speed');
  await p.getByRole('button',{name:'Отключить следующие ворота целиком · E',exact:true}).click();
  assert.equal(await p.evaluate(()=>window.__fry.simulation.cancelCharges),1);
  assert.equal(await p.evaluate(()=>window.__fry.simulation.rows[0].cancelled),true);
  assert.equal(await p.evaluate(()=>document.activeElement?.classList.contains('egg-fry')),true,'spent power restores keyboard focus to the game');
  await p.evaluate(()=>{window.__fry.draw(.016);window.__fry.notify();});
  await p.screenshot({path:`${artifacts}/ru-gates-disabled.png`});
  await p.keyboard.press('f');
  assert.ok(await p.evaluate(()=>window.__fry.simulation.snapshot().brakeRemaining)>3.9);
  assert.equal(await p.evaluate(()=>window.__fry.simulation.brakeCharges),0);

  // Two separate, supported roads with a real central void and independent gate panels.
  await p.evaluate(()=>{
    const e=window.__fry;e.reset(0);const s=e.simulation;s.distance=1484;s.x=-2.65;e.steering.target=s.x;s.eggs=1000000000000n;s.peak=s.eggs;
    s.trail.push(1404,s.x);s.trail.push(1484,s.x);
    s.rows=[{id:'split-gate',kind:'gate',at:1530,sector:4,jackpot:false,reference:s.eggs,operations:[{kind:'divide',value:2n,power:2},{kind:'keep',value:4n}]},
      {id:'split-exit',kind:'exit',at:1696,sector:4}];
    for(let i=0;i<180;i++){s.physics.positionFlock(s.eggs,s.x,i/60,s.trail);s.physics.step();}
    s.announce('loss',25n);
    e.draw(2);e.notify();
  });
  assert.equal(await p.evaluate(()=>window.__fry.simulation.snapshot().split),true);
  const support=await p.evaluate(()=>{
    const e=window.__fry,m=new Float32Array(16),crossings=[];
    for(let i=0;i<e.slats.count;i++) {for(let j=0;j<16;j++)m[j]=e.slats.instanceMatrix.array[i*16+j];if(Math.abs(m[14])<1)crossings.push([m[12]-m[0]/2,m[12]+m[0]/2]);}
    return crossings;
  });
  assert.ok(support.length>=2);assert.ok(support.every(([left,right])=>left>0||right<0),'no hidden solid floor through the fork');
  await p.screenshot({path:`${artifacts}/ru-split-roads.png`});
  assert.equal(await p.evaluate(()=>document.querySelector('.egg-fry-notice').getBoundingClientRect().top>innerHeight*.5),true,'loss notices stay below the gate-reading area');

  await p.evaluate(()=>{const e=window.__fry,s=e.simulation;s.invertStarts=s.seconds+1.4;s.invertUntil=s.invertStarts+5.5;e.notify();});
  await p.screenshot({path:`${artifacts}/ru-inversion-warning.png`});
  await p.evaluate(()=>{const e=window.__fry,s=e.simulation;s.invertStarts=0;s.invertUntil=s.seconds+5;e.steering.setInverted(true);e.notify();});
  const target=await p.evaluate(()=>window.__fry.steering.target);
  const cdp=await context.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:650,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:165,y:650,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await p.evaluate(()=>window.__fry.steering.target)<target,'inversion reverses a real touch drag');

  // A tiny positive share is alive on screen, not just in the arithmetic helper.
  await p.evaluate(()=>{
    const e=window.__fry;e.reset(0);const s=e.simulation;s.rows=[];
    s.resolve({id:'last-egg',kind:'gate',at:1,sector:0,jackpot:false,operations:[{kind:'keep',value:4n},{kind:'keep',value:4n}]});
    for(let i=0;i<40;i++)s.step(0);e.draw(.7);e.notify();
  });
  assert.equal(await p.getByTestId('fry-count').innerText(),'1');
  assert.equal(await p.evaluate(()=>window.__fry.simulation.phase),'running');
  await p.screenshot({path:`${artifacts}/ru-last-egg.png`});

  const growth=await p.evaluate(()=>{
    const e=window.__fry;e.reset(0);const s=e.simulation;s.rows=[];s.eggs=160n;s.peak=s.eggs;s.x=4.1;s.trail.push(-80,s.x);s.trail.push(0,s.x);
    for(let i=0;i<150;i++){s.physics.positionFlock(s.eggs,s.x,i/60,s.trail,{seed:0,distance:0,carton:false});s.physics.step();}
    s.resolve({id:'edge-pickup',kind:'pickup',at:3.2,x:s.x,count:25n,sector:0},3.2);
    for(let i=0;i<180;i++)s.step(4.1);e.draw(2);e.notify();
    return {eggs:s.eggs.toString(),losses:s.losses};
  });
  assert.deepEqual(growth,{eggs:'185',losses:0});
  await p.screenshot({path:`${artifacts}/ru-growth-at-edge.png`});

  const packed=await p.evaluate(()=>{
    const e=window.__fry;e.reset(0);const s=e.simulation;s.rows=[];s.eggs=1000000n;s.peak=s.eggs;s.shield=true;
    for(let i=0;i<210;i++)s.step(5.8);e.draw(2);e.notify();
    return {eggs:s.eggs.toString(),rendered:e.flock.count,bodies:s.physics.flock.length,inside:s.physics.flock.every(egg=>{
      const v=egg.body.translation();return Math.abs(v.x-s.x)<1.2&&Math.abs(v.z+.7)<2.45;
    })};
  });
  assert.deepEqual(packed,{eggs:'1000000',rendered:160,bodies:160,inside:true});
  await p.screenshot({path:`${artifacts}/ru-carton-full.png`});
  const unpacking=await p.evaluate(()=>{
    const e=window.__fry,s=e.simulation;
    e.steering.target=5.8;e.steering.begin(9,260,390);
    s.rows=[{id:'carton-break',kind:'hazard',hazard:'spatula',at:s.distance+.7,sector:0,x:s.x,variant:0}];
    const time=performance.now();e.previousTime=time-17;e.accumulator=0;e.tick(time);cancelAnimationFrame(e.frame);e.frame=0;
    const anchored=Math.abs(e.steering.target-s.x)<1e-8;
    e.steering.move(9,260);const stationary=Math.abs(e.steering.target-s.x)<1e-8;e.steering.end(9);
    for(let i=0;i<18;i++)s.step(e.steering.target);e.draw(.3);e.notify();
    return {anchored,stationary};
  });
  assert.deepEqual(unpacking,{anchored:true,stationary:true},'the real engine drops a blocked target when the box breaks');
  assert.equal(await p.evaluate(()=>window.__fry.simulation.shield),false);
  assert.equal(await p.evaluate(()=>window.__fry.simulation.eggs.toString()),'1000000');
  await p.screenshot({path:`${artifacts}/ru-carton-unfolding.png`});

  await p.evaluate(()=>{
    const e=window.__fry;e.reset(0);const s=e.simulation;s.skillPoints=4;
    s.rows=[{id:'level-up',kind:'pickup',at:4,x:0,count:12n,sector:0}];
    for(let i=0;i<24;i++)s.step(0);
    s.rows=[{id:'doubled',kind:'pickup',at:s.distance+26,x:0,count:12n,sector:0}];s.step(0);e.draw(.5);e.notify();
  });
  assert.equal(await p.locator('.egg-fry-mastery').count(),1,'level-up and gain notices never share a React key');
  assert.equal(await p.locator('.egg-fry-mastery b').innerText(),'Сбор ×2');
  assert.equal(await p.evaluate(()=>window.__fry.simulation.rows[0].count.toString()),'24');
  await p.setViewportSize({width:320,height:568});
  await p.evaluate(()=>{const e=window.__fry;e.resize();e.draw(.016);});
  assert.equal(await p.evaluate(()=>{
    const box=document.querySelector('.egg-fry-mastery').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth;
  }),true);
  await p.screenshot({path:`${artifacts}/ru-multiplier-320.png`});
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{const e=window.__fry;e.resize();e.draw(.016);});

  await p.evaluate(()=>{
    const e=window.__fry;e.reset(0);const s=e.simulation;s.rows=[{id:'pit',kind:'hazard',hazard:'gap',at:12,sector:8,x:0,variant:Math.PI/2}];
    for(let i=0;i<150&&s.phase==='running';i++)s.step(0);for(let i=0;i<8;i++)s.step(0);e.draw(.016);e.notify();
  });
  assert.equal(await p.evaluate(()=>window.__fry.simulation.phase),'falling');
  assert.equal(await p.evaluate(()=>window.__fry.pan.visible),false);
  assert.equal(await p.evaluate(()=>window.__fry.fragments.count),10);
  await p.screenshot({path:`${artifacts}/ru-eggs-falling.png`});

  for(const count of ['90','1000000000000']) {
    await p.evaluate(count=>{
      const e=window.__fry;e.reset(0);const s=e.simulation;s.eggs=BigInt(count);s.peak=s.eggs;
      s.finish(true,1);for(let i=0;i<340;i++)s.step(0);e.draw(.016);e.notify();
    },count);
    const metrics=await p.evaluate(()=>({eggs:window.__fry.simulation.result.eggs.toString(),marks:window.__fry.whites.count}));
    assert.equal(metrics.eggs,count);assert.equal(metrics.marks,count==='90'?90:480);
    await p.screenshot({path:`${artifacts}/ru-pan-${count==='90'?'90':'trillion'}.png`});
    await p.evaluate(()=>{const e=window.__fry;e.simulation.skipFrying();e.notify();});
    assert.ok(!(await p.locator('.egg-fry').innerText()).includes('Сковорода увеличена'));
  }

  const sound=await p.evaluate(async()=>{
    const a=window.__fry.audio;a.setMuted(false);a.unlock();a.fry(1);
    const source=a.sizzle.buffer,ctx=new OfflineAudioContext(1,source.length,source.sampleRate);
    const noise=ctx.createBufferSource();noise.buffer=source;
    const high=ctx.createBiquadFilter(),low=ctx.createBiquadFilter(),gain=ctx.createGain();
    high.type='highpass';high.frequency.value=a.sizzleFilters[0].frequency.value;high.Q.value=.5;
    low.type='lowpass';low.frequency.value=a.sizzleFilters[1].frequency.value;low.Q.value=.5;
    gain.gain.value=.12*.45;noise.connect(high).connect(low).connect(gain).connect(ctx.destination);noise.start();
    const output=(await ctx.startRendering()).getChannelData(0);let sum=0,peak=0;
    for(const sample of output){sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
    const result={rms:Math.sqrt(sum/output.length),peak,high:high.frequency.value,low:low.frequency.value};
    a.stopFry();a.setMuted(true);return {...result,disconnected:a.sizzle===null&&a.sizzleFilters.length===0};
  });
  assert.ok(sound.rms>.001&&sound.rms<.016);assert.ok(sound.peak<.06);assert.ok(sound.disconnected);
  assert.equal(sound.high,750);assert.equal(sound.low,5200);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({equations:true,powerButtons:true,keyboardPower:true,speedMatchedBackground:true,realSplit:true,touchInversion:true,lastEggSurvives:true,growthAtEdge:true,containedCarton:true,safeUnpacking:true,multiplier320:true,noFakePanUpgrade:true,falling:true,proportionalPan:true,sound,pageErrors:errors.length}));
  await context.close();
}finally{await browser.close();}
