// Requires an isolated, instrumented candidate; see docs/egg-road-upgrade.md.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.ROAD_PLAYWRIGHT_MODULE || 'playwright');
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const origin='http://127.0.0.1:4442', directory=process.env.ROAD_REVIEW_DIR || '/tmp/egg-road-fix';
if (!directory.startsWith('/tmp/') || directory.includes('..')) throw new Error('An isolated directory under /tmp is required');
await mkdir(directory+'/artifacts',{recursive:true});
const preview=spawn(process.execPath,['dist/server/entry.mjs'],{cwd:directory+'/site',env:{...process.env,HOST:'127.0.0.1',PORT:'4442',EGG_ROAD_DATA_DIR:directory+'/data/road',KLADKA_DATA_DIR:directory+'/data/kladka'},stdio:'ignore'});
let browser;
try {
for(let i=0;i<100;i++){try{const response=await fetch(origin+'/en/play/');if(response.ok)break;}catch{}if(i===99)throw new Error('Preview did not start');await new Promise(resolve=>setTimeout(resolve,100));}
browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={};
async function open(lang,viewport,mobile=false,portrait=true){
 const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await context.newPage(),errors=[],posts=[],bests=new Map();let owner='Alpha',boardOffline=false,boardDelay=0;
 const profile=()=>({id:'a'.repeat(24),name:owner,avatar:0,public:true,stats:[],achievements:[],frySeason:3});
 await context.addInitScript(portrait=>{localStorage.setItem('egg_road_active_account_v1','alpha');if(portrait)localStorage.setItem('egg-road-orientation','portrait')},portrait);
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
  if(url.pathname==='/api/portal-profile'){
   if(request.method()==='POST'){posts.push(request.postDataJSON());return route.fulfill({json:{profile:profile()}})}
   return route.fulfill({json:{account:{name:owner,registered:true},profile:profile()}});
  }
  if(url.pathname==='/api/egg-road-records'){
   const body=request.method()==='POST'?request.postDataJSON():null;if(body)posts.push({board:body});
   if(url.searchParams.get('view')==='popular')return route.fulfill({json:{filter:'all',tracks:[]}});
   const code=body?.code??url.searchParams.get('code'),key=owner.toLowerCase()+':'+code;
   if(body){
    if(body.expectedOwner!==owner.toLowerCase())return route.fulfill({status:409,json:{error:'account_changed'}});
    if(boardOffline)return route.fulfill({status:503,json:{error:'unavailable'}});
    if(boardDelay)await new Promise(resolve=>setTimeout(resolve,boardDelay));
    if(body.score>(bests.get(key)?.score??0))bests.set(key,{...body,rank:1,mine:true});
   }
   const personal=bests.get(key)??null;
   return route.fulfill({json:{code,entries:personal?[personal]:[],personal,total:personal?1:0,name:owner,nameClaimed:true,registered:true,endlessBest:0}});
  }
  return ['GET','HEAD'].includes(request.method())?route.continue():route.abort();
 });
 await page.goto(origin+`/${lang}/play/`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>!!window.__road&&!window.__road.disposed,null,{timeout:60000});
 return{page,context,errors,posts,setBoardOffline:value=>boardOffline=value,setBoardDelay:value=>boardDelay=value,setOwner:async name=>{owner=name;await page.evaluate(name=>{localStorage.setItem('egg_road_active_account_v1',name.toLowerCase());window.dispatchEvent(new StorageEvent('storage',{key:'egg_road_active_account_v1',newValue:name.toLowerCase()}))},name);await page.waitForTimeout(200);}};
}
const running=page=>page.waitForFunction(()=>window.__road.simulation.phase==='running');
const forceEnd=async(page,score)=>{
 await page.evaluate(score=>{const e=window.__road,s=e.simulation;s.scoring.reset();s.scoring.totals.gates=score;s.gates=score/100;s.progress=s.gates*18+1;s.seconds=Math.max(s.seconds,10);s.phase='over';s.endReason='flight';e.wake()},score);
 await page.locator('.egg-road-result').waitFor();await page.waitForTimeout(150);
};
const visiblePrimary=async page=>{const box=await page.locator('.egg-road-primary').boundingBox();const height=await page.evaluate(()=>innerHeight);assert.ok(box&&box.y>=0&&box.y+box.height<=height,JSON.stringify({box,height}));return box};
try{
 const desktop=await open('ru',{width:1280,height:800}),p=desktop.page;
 await p.locator('.egg-road-mode-grid button').first().click();await p.locator('.egg-road-primary:not([disabled])').waitFor();
 await p.locator('.egg-road-primary').click();await running(p);
 report.modifiers=await p.evaluate(()=>{const results={};for(const code of ['KeyP','KeyR']){const event=new KeyboardEvent('keydown',{code,ctrlKey:true,bubbles:true,cancelable:true});document.querySelector('.egg-road').dispatchEvent(event);results[code]={prevented:event.defaultPrevented,phase:window.__road.simulation.phase}}return results});
 assert.equal(report.modifiers.KeyP.phase,'running');assert.equal(report.modifiers.KeyR.prevented,false);
 await forceEnd(p,100);const first=desktop.posts.find(post=>post.run);assert.ok(first);
 await p.keyboard.press('r');await running(p);await forceEnd(p,200);const second=desktop.posts.filter(post=>post.run).at(-1);assert.notEqual(first.run.id,second.run.id);
 report.retryIdsDistinct=true;
 await p.locator('.egg-road-primary').focus();await p.keyboard.press('Space');await running(p);report.spaceOnButton=true;
 await p.locator('.egg-road-exit').click();assert.equal(await p.evaluate(()=>window.__road.simulation.phase),'paused');
 await desktop.setOwner('Beta');assert.match(await p.locator('.egg-road-account summary').innerText(),/Beta/);
 await p.locator('.egg-road-primary').click();await running(p);await forceEnd(p,300);
 report.ownerAfterResume=await p.evaluate(()=>{const values=Object.keys(localStorage).filter(key=>key.startsWith('egg_road_runs_v1:')).map(key=>JSON.parse(localStorage.getItem(key)));return values.find(value=>value.result.score===300)?.owner});
 assert.equal(report.ownerAfterResume,'alpha');assert.ok(!desktop.posts.some(post=>post.expectedName==='beta'&&post.run?.score==='300'));
 await desktop.setOwner('Alpha');await p.waitForTimeout(300);assert.ok(desktop.posts.some(post=>post.expectedName==='alpha'&&post.run?.score==='300'));
 await p.waitForFunction(()=>document.querySelector('.egg-road-personal-best')?.textContent.includes('#1'));
 assert.ok(desktop.posts.some(post=>post.board?.score===300&&post.board.expectedOwner==='alpha'));report.automaticPublication=true;
 assert.equal(await p.locator('.egg-road-publish form').count(),0);
 const panelText=await p.locator('.egg-road-panel').innerText();
 assert.ok(!panelText.includes('Сохранённый рекорд'));assert.ok(!panelText.includes('Результат сохранён в профиле.'));
 assert.equal(await p.locator('.egg-road-personal-best').count(),1);report.conciseResult=true;
 const actions=await p.locator('.egg-road-primary-row').evaluate(row=>{const a=row.querySelector('.egg-road-primary'),b=row.querySelector('.egg-road-change-mode'),x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return{adjacent:a.nextElementSibling===b,width:Math.abs(x.width-y.width),height:Math.abs(x.height-y.height),below:y.top>=x.bottom,background:getComputedStyle(b).backgroundColor,label:b.textContent}});
 assert.ok(actions.adjacent&&actions.below&&actions.width<1&&actions.height<1,JSON.stringify(actions));assert.equal(actions.background,'rgba(0, 0, 0, 0)');assert.match(actions.label,/Сменить режим/);report.modeAction=actions;
 // A failed publication retains its result and reconnect retries without a click.
 desktop.setBoardOffline(true);await p.keyboard.press('r');await running(p);await forceEnd(p,400);
 await p.getByText('Не удалось обновить рейтинг.',{exact:false}).waitFor();
 desktop.setBoardOffline(false);await p.evaluate(()=>window.dispatchEvent(new Event('online')));
 await p.waitForFunction(()=>!document.querySelector('.egg-road-publish')?.textContent.includes('Не удалось'));
 assert.equal(desktop.posts.filter(post=>post.board?.score===400).length,2);report.publicationRetry=true;
 desktop.setBoardDelay(400);await p.keyboard.press('r');await running(p);await forceEnd(p,500);
 await p.keyboard.press('r');await running(p);await forceEnd(p,600);await p.waitForTimeout(1000);
 assert.ok(desktop.posts.some(post=>post.board?.score===600));desktop.setBoardDelay(0);report.publicationAcrossRetry=true;
 await p.screenshot({path:directory+'/artifacts/desktop-result.png'});
 const cover=await p.addStyleTag({content:'.egg-road-hud,.egg-road-overlay,.egg-road-instruments,.egg-road-progress{display:none!important}'});
 await p.evaluate(()=>{const e=window.__road;e.pause();cancelAnimationFrame(e.frame);e.frame=0;const end=e.simulation.track.samples.at(-1),center=end.position.clone().addScaledVector(end.tangent,8);e.egg.position.copy(center).addScaledVector(end.normal,1.1);e.camera.position.copy(center).addScaledVector(end.normal,12).addScaledVector(end.tangent,-30).addScaledVector(end.right,14);e.camera.fov=59;e.camera.updateProjectionMatrix();e.camera.lookAt(center);e.renderer.render(e.scene,e.camera)});
 await p.screenshot({path:directory+'/artifacts/finish-platform.png'});await cover.evaluate(node=>node.remove());
 await p.evaluate(async()=>{const e=window.__road;await e.selectRoad({mode:'seed',level:5,seed:4,version:3});e.pause();cancelAnimationFrame(e.frame);e.frame=0;});
 for(const kind of ['bridge','bend']){
  await p.evaluate(kind=>{const e=window.__road,t=e.simulation.track,v=t.variations.find(v=>v.kind===kind),s=t.samples[Math.floor((v.first+v.last)/2)];e.camera.position.copy(s.position).addScaledVector(s.normal,20).addScaledVector(s.tangent,-28).addScaledVector(s.right,14);e.camera.lookAt(s.position);e.renderer.render(e.scene,e.camera)},kind);
  const hidden=await p.addStyleTag({content:'.egg-road-hud,.egg-road-overlay,.egg-road-instruments,.egg-road-progress{display:none!important}'});
  await p.screenshot({path:directory+'/artifacts/'+kind+'.png'});await hidden.evaluate(node=>node.remove());
 }
 report.newRoadFeatures=true;
 // Loss of WebGL is recoverable without accumulating old canvases or listeners.
 await p.evaluate(()=>{window.__previousEngine=window.__road;window.__road.renderer.domElement.dispatchEvent(new Event('webglcontextlost',{cancelable:true}))});
 await p.getByRole('button',{name:'Загрузить заново',exact:true}).click();
 await p.waitForFunction(()=>window.__road!==window.__previousEngine&&window.__previousEngine.disposed);
 assert.equal(await p.locator('.egg-road canvas').count(),1);report.contextRecovery=true;
 report.streaming=await p.evaluate(async()=>{
  const e=window.__road;let start=performance.now();await e.selectRoad({mode:'endless',level:2,seed:739,version:2});const construction=performance.now()-start;e.pause();
  const transitions=[];
  for(let i=0;i<10;i++){
   const s=e.simulation,t=s.track;const deadline=performance.now()+5000;while(!t.endless.prepared&&performance.now()<deadline)await new Promise(r=>setTimeout(r,10));
   if(!t.endless.prepared)throw new Error('Worker did not prepare the next section');
   const current=t.chunks.find(chunk=>chunk.last>=s.sampleIndex),index=current.last+3,target=t.samples[index];
   const before=new Map(e.roadVisuals.chunks);s.sampleIndex=index;s.body.setTranslation(target.position.clone().addScaledVector(target.normal,1.2),true);s.position.copy(s.body.translation());s.body.setLinvel(target.tangent.clone().multiplyScalar(18),true);s.airTime=s.flightTime=0;s.phase='running';
   start=performance.now();s.step(0);const step=performance.now()-start;s.phase='paused';start=performance.now();e.buildRoad();const render=performance.now()-start;
   let retained=0;for(const[chunk,object]of before)if(t.chunks.includes(chunk)){if(e.roadVisuals.chunks.get(chunk)!==object)throw new Error('Retained GPU chunk was rebuilt');retained++}
   transitions.push({step,render,retained,chunks:t.chunks.length,prepared:true});s.originShift.set(0,0,0);
  }
  return{construction,transitions,worker:!!e.factory.worker};
 });
 assert.equal(report.streaming.worker,true);
 await p.locator('.egg-road-exit').click();await p.locator('.egg-road-exit').click();
 assert.equal(await p.locator('.egg-road canvas').count(),0);assert.equal(await p.evaluate(()=>window.__road.disposed),true);report.cleanup=true;
 assert.deepEqual(desktop.errors,[]);await desktop.context.close();
 const mobile=await open('ru',{width:320,height:568},true),m=mobile.page;
 assert.equal(await m.getByRole('button',{name:'Ввести сид',exact:false}).count(),0);assert.equal(await m.locator('#egg-road-seed').count(),1);report.singleSeedInput=true;
 await m.locator('.egg-road-mode-grid button').first().click();await m.locator('.egg-road-primary:not([disabled])').waitFor();
 report.readyButton=await visiblePrimary(m);await m.screenshot({path:directory+'/artifacts/small-ready.png'});
 await m.locator('.egg-road-primary').click();await running(m);
 const cdp=await mobile.context.newCDPSession(m);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:60,y:310,id:1}]});assert.equal(await m.evaluate(()=>window.__road.pointerSteering),-1);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:260,y:310,id:1}]});assert.equal(await m.evaluate(()=>window.__road.pointerSteering),1);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await m.evaluate(()=>window.__road.pointerSteering),0);report.touch=true;
 await m.getByRole('button',{name:'Пауза',exact:true}).click();report.pauseButton=await visiblePrimary(m);
 await m.locator('.egg-road-primary').click();await running(m);await forceEnd(m,100);report.retryButton=await visiblePrimary(m);await m.screenshot({path:directory+'/artifacts/small-result.png'});
 await m.getByText('Настройки и управление',{exact:true}).click();await m.locator('select').selectOption('low');assert.equal(await m.evaluate(()=>window.__road.renderer.shadowMap.enabled),false);report.quality=true;
 await m.getByText('Настройки и управление',{exact:true}).click();await m.locator('.egg-road-primary').click();await running(m);
 await m.evaluate(()=>{const previous=Storage.prototype.setItem;window.__restoreStorage=()=>Storage.prototype.setItem=previous;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}});
 await forceEnd(m,200);assert.ok(await m.getByText('Браузер не разрешил сохранение. Этот результат доступен, пока игра открыта.').isVisible());report.quotaFallback=true;await m.evaluate(()=>window.__restoreStorage());
 assert.deepEqual(mobile.errors,[]);await mobile.context.close();
 const english=await open('en',{width:390,height:844},true,false),en=english.page;
 assert.equal(await en.locator('.egg-road-viewport').getAttribute('data-rotation'),'0');
 await en.locator('.egg-road-mode-grid button').first().click();await en.locator('.egg-road-primary:not([disabled])').waitFor();
 assert.equal(await en.locator('.egg-road-viewport').getAttribute('data-rotation'),'0');await visiblePrimary(en);
 await en.locator('.egg-road-primary').click();await running(en);assert.equal(await en.locator('.egg-road-viewport').getAttribute('data-rotation'),'90');
 await en.getByRole('button',{name:'Pause',exact:true}).click();assert.equal(await en.locator('.egg-road-viewport').getAttribute('data-rotation'),'0');report.naturalMenus=true;
 await en.screenshot({path:directory+'/artifacts/english-pause.png'});assert.deepEqual(english.errors,[]);await english.context.close();
 // A separate, real local guest profile tests the actual service worker.
 const offline=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),off=await offline.newPage(),offlineErrors=[];
 off.on('pageerror',error=>offlineErrors.push(error.message));
 await offline.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await off.goto(origin+'/en/play/',{waitUntil:'networkidle'});await off.waitForFunction(()=>!!window.__road);
 await off.evaluate(()=>navigator.serviceWorker.ready);await off.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const cache=await off.evaluate(async()=>{const names=(await caches.keys()).filter(name=>name.startsWith('egg-road-offline:'));const keys=await(await caches.open(names[0])).keys();return keys.map(key=>new URL(key.url).pathname)});
 assert.ok(cache.some(path=>path.includes('track.worker')));assert.ok(cache.every(path=>!path.startsWith('/api/')));
 await offline.setOffline(true);await off.reload({waitUntil:'domcontentloaded'});await off.waitForFunction(()=>!!window.__road&&!window.__road.disposed,null,{timeout:30000});
 await off.locator('.egg-road-mode-grid button').first().click();await off.locator('.egg-road-primary:not([disabled])').waitFor();await off.locator('.egg-road-primary').click();await running(off);
 report.offline={boot:true,worker:await off.evaluate(()=>!!window.__road.factory.worker),assets:cache.length,privateDataCached:false};
 assert.equal(report.offline.worker,true,'offline generation must stay in its worker');assert.deepEqual(offlineErrors,[]);await offline.close();
 report.passed=true;
}catch(error){report.failure={message:error.message,stack:error.stack};throw error;}
finally{await writeFile(directory+'/browser-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
} finally { await browser?.close(); preview.kill(); }
