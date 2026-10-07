(() => {
  'use strict';
  const root=document.getElementById('ok-windows-vision'), $=s=>root.querySelector(s), all=s=>[...root.querySelectorAll(s)];
  const pending=new Map(),modelPending=new Map();let serial=0,page='home',state=null,provider='chatgpt',draftModel='',draftCatalog=null,draftScope='',initialized=false,appearanceDirty=false,shortcutsDirty=false;
  const host=globalThis.chrome?.webview;
  const names={chatgpt:'ChatGPT',openai:'OpenAI API',gemini:'Gemini',claude:'Claude',grok:'Grok'};
  const paths={house:'M3 10 12 3l9 7v10H3z M9 20v-7h6v7',history:'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',scan:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 12h10',copy:'M8 8h13v13H8z M16 8V3H3v13h5', 'volume-2':'M11 4 6 8H2v8h4l5 4z M15 8q6 4 0 8 M18 5q9 7 0 14','rotate-ccw':'M3 11a9 9 0 1 1 2 7 M3 4v7h7', 'plug-zap':'M7 3v5 M13 3v5 M5 8h10v3a5 5 0 0 1-5 5v5 M18 2l-3 5h6l-3 5','sliders-horizontal':'M3 6h5 M12 6h9 M3 12h10 M17 12h4 M3 18h3 M10 18h11 M8 3v6 M13 9v6 M6 15v6',keyboard:'M2 5h20v14H2z M5 9h1 M9 9h1 M13 9h1 M17 9h1 M5 13h1 M9 13h1 M13 13h1 M17 13h1 M7 16h10',sun:'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'image-plus':'M3 3h14v14H3z M3 13l4-4 4 4 3-3 3 3 M20 15v7 M17 18h6', 'chevron-down':'M5 9l7 7 7-7','arrow-up-right':'M7 17 17 7 M7 7h10v10','refresh-cw':'M21 7v5h-5 M3 17v-5h5 M5 7a8 8 0 0 1 14-1l2 6 M3 12l2 6a8 8 0 0 0 14-1',star:'M12 2l3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z',search:'M15 15l6 6 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0','shield-check':'M12 2l8 4v6q0 7-8 10Q4 19 4 12V6z M8 12l3 3 5-6','arrow-left':'M20 12H4 M10 6l-6 6 6 6','git-compare-arrows':'M3 5h15l-4-4 M18 5l-4 4 M21 19H6l4-4 M6 19l4 4',pin:'M8 3h8l-1 7 4 4H5l4-4z M12 14v8'};
  all('[data-lucide]').forEach(el=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[el.dataset.lucide]||'M4 4h16v16H4z');svg.append(path);el.replaceChildren(svg);});
  function rpc(action,args={}) {
    if(!host)return Promise.reject(new Error('Uruchom ten widok przez OKStudy Windows.'));
    const id='ui-'+(++serial);
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Przekroczono czas oczekiwania.'));},210000);pending.set(id,{resolve,reject,timer});host.postMessage({id,action,args});});
  }
  function notify(action,args={}){host?.postMessage({action,args});}
  function value(name,text){const el=$('[data-value="'+name+'"]');if(el)el.textContent=text||'';}
  function setPage(next){page=next;all('[data-screen]').forEach(s=>s.hidden=s.dataset.screen!==next);all('[data-page]').forEach(b=>{if(b.dataset.page===next)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(next==='connections')loadModels(false).catch(showError);if(next==='history')history();$('.wv-main').scrollTop=0;}
  function showError(error){value('status',error.message||String(error));$('.wv-footer-status').dataset.error='true';}
  function scope(){return provider+':'+(state?.account?.activeId||'')+':'+($('[aria-label="Klucz API"]').value||'saved');}
  function catalog(){return $('[aria-label="Klucz API"]').value.trim()&&draftCatalog&&draftScope===scope()?draftCatalog:state?.catalogs?.[provider]||{models:[],favorites:[],selected:''};}
  function setOptions(select,rows,selected,empty='Wybierz model') {
    select.replaceChildren();const placeholder=new Option(empty,'');select.append(placeholder);
    for(const row of rows)select.append(new Option(row.name||row.id,row.id));
    if(selected&&!rows.some(x=>x.id===selected))select.append(new Option(selected+' · poza bieżącym katalogiem',selected));
    select.value=selected||'';
  }
  function renderCatalog(){
    const c=catalog();if(!draftModel)draftModel=c.selected||c.models[0]?.id||'';
    setOptions($('[data-control=model]'),c.models,draftModel,c.loading?'Pobieram modele…':'Wybierz model');
    $('[data-control=manual-model]').value=draftModel;
    value('catalog-note',state?.catalogError||(!c.models.length?'Lista jest pusta. Odśwież po połączeniu konta lub wklejeniu klucza.':c.models.length+' modeli · pobrano '+new Date(c.at||Date.now()).toLocaleString('pl-PL')));
    $('[data-value=catalog-note]').classList.toggle('error',Boolean(state?.catalogError));
    $('[data-action=favorite]').setAttribute('aria-pressed',String(c.favorites?.includes(draftModel)||false));
    const saved=state?.catalogs?.[state.provider];value('provider-name',names[state?.provider]||'Wybierz połączenie');value('model-name',saved?.selected||'Wybierz i zapisz model');
    if(state?.provider)$('.wv-connection-strip>img').src=$('[data-provider='+state.provider+'] img').src;
    const quick=$('[data-quick-models]');quick.replaceChildren();for(const id of (saved?.favorites||[]).slice(0,2)){const button=document.createElement('button');button.className='wv-control';button.textContent='★ '+id;button.onclick=()=>rpc('saveConnection',{provider:state.provider,model:id}).catch(showError);quick.append(button);}
    const list=$('#comparison-models');list.replaceChildren();for(const row of saved?.models||[])if(row.id!==state?.model)list.append(new Option(row.name||row.id,row.id));
  }
  function render(){
    if(!state)return;
    if(!initialized){provider=state.provider;draftModel=state.catalogs[provider]?.selected||'';initialized=true;}
    root.dataset.tone=state.settings.tone||'graphite';
    value('status',state.status);$('.wv-footer-status').dataset.error=String(state.error);value('last-answer',state.answer||'Tu pojawi się odpowiedź.');
    const answer=$('[data-value=last-answer]');answer.classList.toggle('long',(state.answer||'').length>20);answer.classList.toggle('empty',!state.answer);
    value('detail-answer',state.answer);value('detail-title',state.model);value('frame-note',state.hasFrame?'Możesz poprosić o wyjaśnienie lub sprawdzić kadr innym modelem.':'Kadr nie jest dostępny. Powtórzenie odpowiedzi nie wysyła nowego zapytania.');
    value('first-answer',state.answer);value('first-model',state.model);value('second-answer',state.secondAnswer||'—');value('second-model',state.secondModel);
    const a=state.account;
    value('account-title',a.connected?'Konto połączone':'Połącz swój plan ChatGPT');value('account-sub',a.connected?(a.email||'Konto ChatGPT')+' · '+(a.sharing?'Korzystasz z planu ChatGPT':'Brak zgody na użycie planu'):'Zaloguj się i wybierz model z katalogu konta.');
    $('[data-account-extra]').hidden=provider!=='chatgpt'||!a.connected;
    setOptions($('[data-control=accounts]'),(a.accounts||[]).map(x=>({id:x.id,name:x.label})),a.activeId,'Wybierz konto');
    all('[data-provider]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.provider===provider)));
    $('[data-connection=account]').hidden=provider!=='chatgpt';$('[data-connection=api]').hidden=provider==='chatgpt';
    $('[aria-label="Klucz API"]').placeholder=state.catalogs[provider]?.hasKey?'Klucz zapisany · wklej tylko, aby go zmienić':'Wklej klucz API';
    const s=state.settings;if(!appearanceDirty)for(const [field,key] of [['opacity','opacity'],['size','textSize'],['duration','duration']]){$('[data-control='+field+']').value=s[key];$('[data-output='+field+']').textContent=s[key]+(field==='opacity'?'%':field==='size'?' px':' s');}
    all('[data-profile]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.profile===s.profile)));all('[data-indicator]').forEach(b=>b.setAttribute('aria-pressed',String(['full','dots','off'].indexOf(b.dataset.indicator)===s.indicator)));all('[data-format]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.format===s.style)));
    for(const [field,key] of [['only','answerOnly'],['history-save','persistentHistory'],['quality','quality'],['floating','floating'],['auto-voice','voice']])if(!['only','auto-voice'].includes(field)||!appearanceDirty)$('[data-control='+field+']').checked=Boolean(s[key]);
    if(!appearanceDirty){$('[data-control=position]').value=s.position||'bottom';$('[data-control=tone]').value=s.tone||'graphite';}
    if(!shortcutsDirty)for(const name of ['captureShortcut','screenShortcut','screenTarget','questionTarget'])$('[data-control='+name+']').value=s[name]||(name==='captureShortcut'?'Alt+Z':name==='screenShortcut'?'Alt+X':name==='screenTarget'?'monitor':'cursor');
    value('hotkey-note',state.hotkeyError||'Skróty działają także przy ukrytym przycisku OK.');value('capture-shortcut',s.captureShortcut||'Alt+Z');
    preview();renderCatalog();history();
    all('[data-action]').forEach(b=>{if(['capture','screen','image','signin','additional','signout','saveConnection','compare-run','explain'].includes(b.dataset.action))b.disabled=Boolean(state.busy);if(['copy','speak','repeat','detail','clear','compare'].includes(b.dataset.action))b.disabled=!state.answer;if(['compare','compare-run','explain'].includes(b.dataset.action))b.disabled=Boolean(state.busy)||!state.hasFrame;});
    const status=$('[data-value=status]');status.title=state.status;
  }
  function appearance(){return{opacity:+$('[data-control=opacity]').value,textSize:+$('[data-control=size]').value,duration:+$('[data-control=duration]').value,answerOnly:$('[data-control=only]').checked,voice:$('[data-control=auto-voice]').checked,position:$('[data-control=position]').value,tone:$('[data-control=tone]').value,style:state.settings.style,profile:state.settings.profile,indicator:state.settings.indicator};}
  function preview(){const demo=$('[data-demo-answer]');demo.style.opacity=$('[data-control=opacity]').value/100;demo.style.fontSize=$('[data-control=size]').value+'px';demo.dataset.format=state?.settings.style||'text';}
  function history(){
    if(!state)return;const list=$('[data-history-list]'),query=$('[data-control=search]').value.toLocaleLowerCase('pl');list.replaceChildren();
    const rows=state.history.filter(r=>(r.text+' '+r.model).toLocaleLowerCase('pl').includes(query)).sort((a,b)=>Number(b.pinned)-Number(a.pinned));
    if(!rows.length){const p=document.createElement('p');p.className='wv-history-empty';p.textContent=query?'Brak pasujących odpowiedzi.':'Twoja pierwsza odpowiedź pojawi się tutaj.';list.append(p);}
    for(const r of rows){const row=document.createElement('div');row.className='wv-history-row';const mark=document.createElement('span');mark.className='wv-history-symbol';mark.textContent=r.pinned?'★':'↗';const body=document.createElement('button');body.className='wv-history-text';const title=document.createElement('strong');title.textContent=r.text.slice(0,100);const sub=document.createElement('small');sub.textContent=r.model+' · '+new Date(r.at).toLocaleString('pl-PL');body.append(title,sub);body.onclick=()=>rpc('history',{id:r.id}).then(()=>setPage('detail')).catch(showError);const actions=document.createElement('div');actions.className='wv-actions';for(const [op,label] of [['pin',r.pinned?'Odepnij':'Przypnij'],['delete','Usuń']]){const b=document.createElement('button');b.className='wv-control wv-control-quiet';b.textContent=label;b.onclick=()=>rpc('history',{id:r.id,operation:op}).catch(showError);actions.append(b);}row.append(mark,body,actions);list.append(row);}
  }
  async function loadModels(force){
    if(!state)return;const c=catalog(),key=$('[aria-label="Klucz API"]').value;if(!force&&(provider==='chatgpt'?!state.account.connected:!key&&!c.hasKey))return;
    value('catalog-note','Pobieram aktualny katalog…');const requested=scope();const p=provider;
    if(modelPending.has(requested))return modelPending.get(requested);
    const request=rpc('models',{provider:p,key,force});modelPending.set(requested,request);$('[data-action=refresh]').disabled=true;
    try{const result=await request;if(requested!==scope())return;draftCatalog=result;draftScope=requested;if(!draftModel)draftModel=result.selected||result.models[0]?.id||'';renderCatalog();}
    catch(e){if(requested!==scope())return;value('catalog-note',e.message);$('[data-value=catalog-note]').classList.add('error');throw e;}
    finally{modelPending.delete(requested);$('[data-action=refresh]').disabled=modelPending.size>0;}
  }
  function modal(title,text){const layer=document.createElement('div');layer.className='wv-dialog';const panel=document.createElement('div');panel.className='wv-panel';const h=document.createElement('h3');h.textContent=title;const pre=document.createElement('pre');pre.textContent=text;const button=document.createElement('button');button.className='wv-control';button.textContent='Zamknij';button.onclick=()=>layer.remove();panel.append(h,pre,button);layer.append(panel);root.append(layer);button.focus();layer.onclick=e=>{if(e.target===layer)layer.remove();};}
  async function action(name){
    if(['home','history','connections','appearance','shortcuts','detail','compare'].includes(name)){setPage(name);return;}
    if(['minimize','maximize','close'].includes(name)){notify(name);return;}
    if(name==='theme'){await rpc('appearance',{tone:state.settings.tone==='paper'?'graphite':'paper'});return;}
    if(name==='refresh'){await loadModels(true);return;}
    if(name==='signin'||name==='additional'){await rpc('signin',{additional:name==='additional'});provider='chatgpt';draftModel='';draftCatalog=null;render();return;}
    if(name==='saveConnection'){await rpc(name,{provider,model:draftModel,key:$('[aria-label="Klucz API"]').value});$('[aria-label="Klucz API"]').value='';draftCatalog=null;render();return;}
    if(name==='saveAppearance'){const settings=appearance();appearanceDirty=false;await rpc('appearance',settings);return;}
    if(name==='saveShortcuts'){const settings=Object.fromEntries(['captureShortcut','screenShortcut','screenTarget','questionTarget'].map(n=>[n,$('[data-control='+n+']').value]));await rpc('shortcuts',settings);shortcutsDirty=false;render();return;}
    if(name==='favorite'){await rpc(name,{provider,model:draftModel,key:$('[aria-label="Klucz API"]').value});await loadModels(false);return;}
    if(name==='compare-run'){await rpc('compare',{model:$('[data-control=compare-model]').value});return;}
    if(name==='explain'){await rpc(name);setPage('detail');return;}
    if(name==='diagnostics'){const c=catalog();modal('Szczegóły połączenia','Dostawca: '+names[provider]+'\nKonto: '+(state.account.connected?'połączone':'niepołączone')+'\nDostęp do planu: '+(state.account.sharing?'tak':'nie')+'\nModele: '+c.models.length+'\nWybrany: '+draftModel+'\n\n'+c.models.map(m=>m.id).join('\n')+'\n\n'+(state.catalogError||state.status));return;}
    if(name==='persistent'){setPage('history');return;}
    await rpc(name);
  }
  all('[data-action]').forEach(b=>b.addEventListener('click',()=>action(b.dataset.action).catch(showError)));
  all('[data-page]').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
  all('[data-provider]').forEach(b=>b.onclick=()=>{provider=b.dataset.provider;draftCatalog=null;draftModel='';$('[aria-label="Klucz API"]').value='';render();loadModels(false).catch(showError);});
  $('[data-control=model]').onchange=e=>{draftModel=e.target.value;$('[data-control=manual-model]').value=draftModel;};$('[data-control=manual-model]').oninput=e=>{draftModel=e.target.value.trim();};
  $('[data-control=accounts]').onchange=e=>{draftCatalog=null;draftModel='';rpc('account',{accountId:e.target.value}).catch(showError);};
  $('[data-control=search]').oninput=history;
  all('[data-profile]').forEach(b=>b.onclick=()=>{appearanceDirty=false;const p=b.dataset.profile;const settings=p==='discreet'?{opacity:15,textSize:14,duration:5,indicator:2,style:'text'}:p==='study'?{opacity:90,textSize:21,duration:25,indicator:0,style:'card'}:{opacity:45,textSize:18,duration:8,indicator:1,style:'text'};rpc('appearance',{...settings,profile:p,answerOnly:p!=='study'}).catch(showError);});
  all('[data-indicator]').forEach(b=>b.onclick=()=>rpc('appearance',{...appearance(),indicator:['full','dots','off'].indexOf(b.dataset.indicator)}).catch(showError));
  all('[data-format]').forEach(b=>b.onclick=()=>rpc('appearance',{...appearance(),style:b.dataset.format}).catch(showError));
  for(const field of ['opacity','size','duration'])$('[data-control='+field+']').oninput=()=>{appearanceDirty=true;$('[data-output='+field+']').textContent=$('[data-control='+field+']').value+(field==='opacity'?'%':field==='size'?' px':' s');preview();};
  $('[data-control=only]').onchange=()=>{appearanceDirty=true;};
  for(const field of ['auto-voice','position','tone'])$('[data-control='+field+']').onchange=()=>{appearanceDirty=true;};
  for(const [field,key] of [['history-save','persistentHistory'],['quality','quality'],['floating','floating']])$('[data-control='+field+']').onchange=e=>rpc('appearance',{[key]:e.target.checked}).catch(showError);
  for(const name of ['captureShortcut','screenShortcut','screenTarget','questionTarget'])$('[data-control='+name+']').oninput=()=>{shortcutsDirty=true;};
  for(const name of ['captureShortcut','screenShortcut'])$('[data-control='+name+']').onkeydown=e=>{if(e.key==='Tab')return;const key=e.key.toUpperCase();if((e.ctrlKey||e.altKey||e.shiftKey)&&/^(?:[A-Z0-9]|F(?:[1-9]|1[01]))$/.test(key)){e.preventDefault();e.target.value=(e.ctrlKey?'Ctrl+':'')+(e.altKey?'Alt+':'')+(e.shiftKey?'Shift+':'')+key;shortcutsDirty=true;}};
  for(const name of ['captureShortcut','screenShortcut']){const input=$('[data-control='+name+']');input.onfocus=()=>notify('shortcutEditing',{editing:true});input.onblur=()=>notify('shortcutEditing',{editing:false});}
  $('.wv-titlebar').onmousedown=e=>{if(e.button===0&&!e.target.closest('button'))notify('drag');};$('.wv-titlebar').ondblclick=e=>{if(!e.target.closest('button'))notify('maximize');};
  $('.wv-footer-status').onclick=()=>modal('Ostatni komunikat',state?.status||'');
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const dialog=$('.wv-dialog');if(dialog)dialog.remove();else if(state?.busy)rpc('cancel').catch(showError);}});
  host?.addEventListener('message',e=>{const m=e.data;if(m.type==='state'){if(state?.account?.activeId!==m.state.account.activeId){draftModel='';draftCatalog=null;}state=m.state;render();}else if(m.type==='page')setPage(m.page);else if(m.type==='reply'){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.ok?p.resolve(m.result):p.reject(new Error(m.error));}}});
  notify('ready');
})();
