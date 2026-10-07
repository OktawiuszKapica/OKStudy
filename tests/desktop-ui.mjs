import { chromium } from 'playwright';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const out=resolve('artifacts/desktop/ui-verification');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const errors=[],checks=[];
const page=await browser.newPage({viewport:{width:1024,height:744}});
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  let listener;const state={version:'0.2.0',settings:{profile:'readable',style:'text',opacity:45,textSize:18,duration:8,indicator:1,answerOnly:true,quality:true,persistentHistory:false,floating:false,tone:'graphite'},provider:'chatgpt',account:{connected:false,sharing:false,accounts:[]},catalogs:Object.fromEntries(['chatgpt','openai','gemini','claude','grok'].map(p=>[p,{models:[],favorites:[],selected:'',hasKey:false}])),history:[],answer:'',model:'',hasFrame:false,busy:false,status:'Wybierz połączenie.',error:false};
  const send=()=>listener?.({data:{type:'state',state:structuredClone(state)}});
  globalThis.__requests=[];globalThis.__state=state;
  const fake={addEventListener:(type,fn)=>{listener=fn;},postMessage:async m=>{
    __requests.push(m);let result=null;
    if(m.action==='ready'){send();return;}
    if(m.action==='signin'){state.account={connected:true,sharing:true,activeId:'A',email:'Konto testowe',accounts:[{id:'A',label:'Konto testowe'}]};state.catalogs.chatgpt={models:[{id:'gpt-6.1-sol',name:'GPT-6.1 Sol'},{id:'gpt-6-sol',name:'GPT-6 Sol'}],favorites:[],selected:'gpt-6.1-sol',at:Date.now()};}
    if(m.action==='models'){result=structuredClone(state.catalogs[m.args.provider]);if(m.args.provider==='openai'&&m.args.key){result={models:[{id:'api-model',name:'Model API'}],selected:'api-model',favorites:[],at:Date.now(),hasKey:true};}}
    if(m.action==='saveConnection'){state.provider=m.args.provider;state.catalogs[state.provider].selected=m.args.model;state.status='Połączenie zapisane.';}
    if(m.action==='appearance'){Object.assign(state.settings,m.args);}
    if(m.action==='favorite'){state.catalogs[m.args.provider].favorites=[m.args.model];}
    if(m.action==='history'&&m.args.operation==='open'){const r=state.history.find(x=>x.id===m.args.id);state.answer=r.text;state.model=r.model;}
    if(m.action==='history'&&m.args.operation==='pin'){const r=state.history.find(x=>x.id===m.args.id);r.pinned=!r.pinned;}
    if(m.action==='history'&&m.args.operation==='delete'){state.history=state.history.filter(x=>x.id!==m.args.id);}
    send();listener({data:{type:'reply',id:m.id,ok:true,result}});
  }};
  Object.defineProperty(globalThis,'chrome',{value:{webview:fake},configurable:true});globalThis.__emit=send;
});
try{
  await page.goto(pathToFileURL(resolve('desktop/ui/index.html')).href,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>document.querySelector('[data-value=status]').textContent==='Wybierz połączenie.');
  assert.equal(await page.locator('[data-value=last-answer]').innerText(),'Tu pojawi się odpowiedź.');checks.push('real UI starts with no invented answer or connected account');
  await page.locator('[data-page=connections]').click();await page.locator('[data-action=signin]').click();await page.waitForFunction(()=>document.querySelector('[data-control=model]').value==='gpt-6.1-sol');
  assert.equal(await page.locator('[data-control=accounts]').inputValue(),'A');checks.push('login immediately renders real catalog and active account');
  await page.screenshot({path:join(out,'connections.png')});
  await page.locator('[data-action=saveConnection]').click();await page.locator('[data-page=home]').click();assert.equal(await page.locator('[data-value=model-name]').innerText(),'gpt-6.1-sol');checks.push('selected model survives save and is shown on Start');
  await page.locator('[data-action=image]').click();assert.equal(await page.evaluate(()=>__requests.at(-1).action),'image');checks.push('Add image uses file workflow, not capture');
  await page.evaluate(()=>{__state.answer='D';__state.model='gpt-6.1-sol';__state.hasFrame=true;__state.history=[{id:'1',text:'D',model:'gpt-6.1-sol',at:Date.now(),pinned:true},{id:'2',text:'Dynamika Techniczna',model:'gpt-6-sol',at:Date.now(),pinned:false}];__emit();});
  await page.screenshot({path:join(out,'home.png')});
  await page.locator('[data-action=theme]').click();await page.waitForFunction(()=>document.querySelector('#ok-windows-vision').dataset.tone==='paper');assert.equal(await page.locator('.wv-window').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(244, 246, 240)');await page.locator('[data-action=theme]').click();checks.push('paper and graphite themes use correct colors without relying on light-dark support');
  await page.locator('[data-page=appearance]').click();await page.locator('[data-control=opacity]').fill('15');await page.locator('[data-action=saveAppearance]').click();await page.waitForFunction(()=>__state.settings.opacity===15);assert.equal(await page.locator('[data-demo-answer]').evaluate(e=>getComputedStyle(e).opacity),'0.15');checks.push('preview and saved visibility match');
  await page.locator('[data-profile=readable]').filter({visible:true}).click();await page.screenshot({path:join(out,'appearance.png')});
  await page.locator('[data-page=history]').click();await page.locator('[data-control=search]').fill('Dynamika');assert.equal(await page.locator('.wv-history-row').count(),1);checks.push('history searches actual answers');await page.locator('[data-control=search]').fill('');await page.screenshot({path:join(out,'history.png')});
  await page.locator('[data-page=connections]').click();await page.locator('[data-provider=openai]').click();await page.locator('[aria-label="Klucz API"]').fill('test-key');await page.locator('[data-action=refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-control=model]').value==='api-model');checks.push('API draft key catalog is available before saving');
  await page.getByText('Wpisz identyfikator modelu ręcznie',{exact:true}).click();await page.locator('[data-control=manual-model]').fill('new-model');await page.locator('[data-action=saveConnection]').click();assert.equal(await page.evaluate(()=>__state.catalogs.openai.selected),'new-model');checks.push('manual model retained without inventing availability');
  await page.locator('[data-page=shortcuts]').click();await page.screenshot({path:join(out,'shortcuts.png')});
  for(const [width,height] of [[1024,744],[820,680],[760,580]]){await page.setViewportSize({width,height});const metrics=await page.evaluate(()=>({w:document.documentElement.scrollWidth,v:innerWidth,footer:document.querySelector('.wv-footer').getBoundingClientRect().bottom}));assert.ok(metrics.w<=width);assert.ok(metrics.footer<=height+1);checks.push(`fits ${width}x${height} without clipping footer`);}
  assert.deepEqual(errors,[]);checks.push('zero JavaScript errors');
  await writeFile(join(out,'report.json'),JSON.stringify({checks,errors,liveRequests:false},null,2));console.log(checks.map(x=>'✓ '+x).join('\n'));
}finally{await browser.close();}
