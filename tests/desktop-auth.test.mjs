import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('Windows login returns active account and can immediately load its models', async () => {
  const code=`import {startBridge} from ${JSON.stringify(pathToFileURL(resolve('desktop/bridge.js')).href)};
    let logged=false;
    const status=()=>({connected:logged,sharing:logged,activeId:logged?'account-A':undefined,accounts:logged?[{id:'account-A',label:'Test'}]:[]});
    startBridge({session:async()=>status(),signIn:async()=>{logged=true;return {connected:true,sharing:true};},models:async()=>[{id:'gpt-6.1-sol',name:'GPT-6.1 Sol'}]});`;
  const p=spawn(process.execPath,['--input-type=module','-e',code],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const lines=createInterface({input:p.stdout});const waiting=new Map();let output='';p.stderr.on('data',d=>output+=d);
  lines.on('line',l=>{const m=JSON.parse(l);waiting.get(m.id)?.(m);waiting.delete(m.id);});
  const call=m=>new Promise((r,j)=>{const timer=setTimeout(()=>j(new Error('Timeout '+output)),10000);waiting.set(m.id,x=>{clearTimeout(timer);r(x);});p.stdin.write(JSON.stringify(m)+'\n');});
  try{
    const signed=await call({id:'login',action:'signin'});assert.equal(signed.ok,true);assert.equal(signed.result.activeId,'account-A');assert.equal(signed.result.accounts[0].id,'account-A');
    const models=await call({id:'models',action:'models',provider:'chatgpt',accountId:signed.result.activeId});assert.equal(models.ok,true);assert.equal(models.result.models[0].id,'gpt-6.1-sol');
    const wrong=await call({id:'stale',action:'models',provider:'chatgpt',accountId:'old-account'});assert.equal(wrong.ok,false);assert.match(wrong.error,/Konto zostało zmienione/);
    assert.equal(output,'');
  }finally{lines.close();p.stdin.end();p.kill();}
});
