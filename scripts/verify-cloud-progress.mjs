// Synthetic accounts only: use an isolated preview with its own database.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const origin=process.env.EGG_REVIEW_ORIGIN || 'http://127.0.0.1:13442', canonical=process.env.EGG_REVIEW_CANONICAL || 'https://egg.ilyamedve.dev', report={},contexts=[];
if (!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname)) throw new Error('Use an isolated loopback preview');
const output=process.env.EGG_REVIEW_OUTPUT || '/tmp/egg-cloud-check';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function setup(viewport={width:390,height:844},init){
 const c=await browser.newContext({viewport,isMobile:viewport.width<900,hasTouch:viewport.width<900,reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Pacific/Honolulu'});contexts.push(c);
 await c.route('**/*',async r=>{const req=r.request(),u=new URL(req.url());if(u.origin!==origin)return r.abort();if(req.method()==='POST'){const response=await r.fetch({headers:{...await req.allHeaders(),origin:canonical}});return r.fulfill({response});}return r.continue();});
 if(init)await c.addInitScript(init);
 const p=await c.newPage();p.setDefaultTimeout(20000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 return{c,p,errors};
}
const go=(p,path)=>p.goto(origin+path,{waitUntil:'domcontentloaded'});
async function call(c,path,body){const p=c.pages()[0];if(p.url()==='about:blank')await go(p,'/en/');return p.evaluate(async({path,body})=>{const r=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});return{status:r.status,data:await r.json()};},{path,body});}
async function post(c,path,body){const r=await call(c,path,body);assert.equal(r.status,200,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
async function check(name,run){try{report[name]=await run();}catch(error){report[name]={error:String(error),stack:error.stack};}finally{for(const c of contexts.splice(0))await c.close().catch(()=>{});}console.log(name,JSON.stringify(report[name]));await writeFile(`${output}/cloud-results.json`,JSON.stringify(report,null,2));}
const answers=[1,2,1,1,1,1,1,2,1,2];
await check('cloud-two-devices-and-account-isolation',async()=>{
 const one=await setup(),two=await setup({width:1280,height:800});
 const name='Review'+Date.now(), password='preview-only-long-password';
 await post(one.c,'/api/portal-account',{action:'register',name,password});
 const today=new Date(Date.now()+3*3600000).toISOString().slice(0,10),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
 await one.c.addInitScript(egg=>localStorage.setItem('egg_incubator_v1',JSON.stringify(egg)),{startedAt:yesterday,lastWarm:yesterday,streak:1,qi:1,burns:0,totalWarmed:1});
 await go(one.p,'/ru/incubator/');await one.p.bringToFront();
 const warm=one.p.getByRole('button',{name:/^Прогреть яйцо/});try { await warm.waitFor(); } catch (error) { console.log('cloud-debug', JSON.stringify({body:(await one.p.locator('body').innerText()).slice(-2500),profile:(await call(one.c,'/api/portal-profile')).data,incubator:(await call(one.c,'/api/incubator?expectedName='+name)).data,today,yesterday,errors:one.errors})); throw error; } await warm.focus();await one.p.waitForTimeout(500);await one.p.keyboard.down('Space');await one.p.waitForTimeout(4000);await one.p.keyboard.up('Space');
 try{await one.p.getByText('Яйцо прогрето.',{exact:false}).waitFor();}catch(e){console.log('warm-debug',JSON.stringify({body:await one.p.locator('.incubator').innerText(),state:(await call(one.c,'/api/incubator?expectedName='+name)).data,focused:await one.p.evaluate(()=>({hidden:document.hidden,focus:document.hasFocus(),active:document.activeElement?.outerHTML.slice(0,500)}))}));throw e;}
 const first=(await call(one.c,'/api/incubator?expectedName='+name)).data;assert.equal(first.state.qi,2);
 await post(two.c,'/api/portal-account',{action:'login',name,password});await go(two.p,'/ru/incubator/');await two.p.getByText('Яйцо прогрето.',{exact:false}).waitFor();
 const second=(await call(two.c,'/api/incubator?expectedName='+name)).data;assert.deepEqual(second.state,first.state);
 await post(one.c,'/api/portal-profile',{action:'initiation',expectedName:name,answers});
 await go(two.p,'/ru/profile/');await two.p.getByRole('button',{name:'Сертификат адепта',exact:true}).click();await two.p.locator('.adept-cert-input').waitFor();assert.equal(await two.p.locator('.adept-cert-input').inputValue(),name);
 await go(two.p,'/ru/dark-side/#games');await two.p.locator('.adept-game-card').first().waitFor();await two.p.waitForTimeout(500);assert.match(two.p.url(),/dark-side/);
 await post(two.c,'/api/portal-account',{action:'logout'});
 const other=name+'B';await post(two.c,'/api/portal-account',{action:'register',name:other,password});
 await two.c.addInitScript(()=>localStorage.setItem('egg_adept','true'));
 await go(two.p,'/ru/dark-side/');await two.p.waitForURL('**/quiz/**');assert.equal(await two.p.locator('.quiz-question').count(),10);
 const stale=await call(two.c,'/api/incubator',{action:'warm',expectedName:name});assert.equal(stale.status,409);
 const empty=(await call(two.c,'/api/incubator?expectedName='+other)).data;assert.equal(empty.state,null);
 await one.p.screenshot({path:`${output}/cloud-incubator-mobile.png`});
 return{sameEggOnTwoDevices:true,keyboardWarmth:true,certificateOnSecondDevice:true,guestFlagDoesNotUnlockAnotherAccount:true,staleWriteStatus:stale.status,errors:[...one.errors,...two.errors]};
});
await check('midnight-without-reload',async()=>{
 const {c,p,errors}=await setup(undefined,()=>localStorage.setItem('egg_incubator_v1',JSON.stringify({startedAt:'2026-10-02',lastWarm:'2026-10-02',streak:1,qi:1,burns:0,totalWarmed:1})));
 await c.route('**/api/portal-profile',r=>r.fulfill({json:{account:{name:'',registered:false},profile:null}}));
 await p.clock.install({time:new Date('2026-10-02T20:59:50Z')});await go(p,'/ru/incubator/');await p.getByText('Яйцо прогрето.',{exact:false}).waitFor();
 await p.clock.runFor(21000);await p.getByRole('button',{name:/^Прогреть яйцо/}).waitFor();
 return{readyAfterMoscowMidnight:true,browserTimezone:'Pacific/Honolulu',errors};
});
await check('delayed-old-account-response',async()=>{
 const {c,p,errors}=await setup();let account='Alpha',held,seen;const requested=new Promise(resolve=>seen=resolve);
 const profile=()=>({account:{name:account,registered:true},profile:{id:account,name:account,public:true,avatar:0,stats:[],achievements:[],achievementRarity:{},initiated:false}});
 await c.route('**/api/portal-profile',r=>r.fulfill({json:profile()}));
 await c.route('**/api/incubator?*',async r=>{if(new URL(r.request().url()).searchParams.get('expectedName')==='Alpha'){held=r;seen();}else await r.fulfill({json:{state:null,today:'2026-10-02',mode:'lay',missedDays:0}});});
 await go(p,'/ru/incubator/');await requested;account='Beta';await p.evaluate(()=>window.dispatchEvent(new Event('egg:account')));
 await p.getByRole('button',{name:'Заложить яйцо',exact:true}).waitFor();
 await held.fulfill({json:{state:{startedAt:'2026-10-02',lastWarm:'2026-10-02',streak:99,qi:99,burns:0,totalWarmed:99},today:'2026-10-02',mode:'warmedToday',missedDays:0}}).catch(()=>{});
 await p.waitForTimeout(300);assert.equal(await p.getByRole('button',{name:'Заложить яйцо',exact:true}).count(),1);assert.match(await p.locator('.incubator').innerText(),/Beta/);
 return{lateAlphaStateIgnored:true,errors};
});
await check('quiz-with-disabled-storage',async()=>{
 const {c,p,errors}=await setup(undefined,()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Disabled','SecurityError')}}));
 await go(p,'/ru/quiz/');await p.locator('.quiz-question').first().waitFor();
 for(let i=0;i<answers.length;i++)await p.locator('.quiz-question').nth(i).getByRole('radio').nth(answers[i]).check();
 await p.locator('.quiz-btn').click();await p.waitForURL('**/dark-side**');await p.waitForTimeout(700);assert.match(p.url(),/dark-side/);assert.equal(await p.locator('.adept-game-card').count(),4);
 return{guestCompletesWithCookieFallback:true,errors};
});
await browser.close();process.exitCode=Object.values(report).some(x=>x.error||x.errors?.length)?1:0;
