(() => {
  const root=document.getElementById('ok-windows-vision'),$=s=>root.querySelector(s),host=globalThis.chrome?.webview;
  let mode='install',phase='welcome',busy=false;
  const set=(key,text)=>{$('[data-value='+key+']').textContent=text;};
  root.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;if(action==='primary'){if(!busy)host?.postMessage({id:'wizard',action:phase==='done'?(mode==='install'?'launch':'finish'):mode,args:{deleteData:$('[data-control=delete-data]').checked}});}else if(!busy||action==='minimize')host?.postMessage({action});});
  $('.wv-titlebar').onmousedown=e=>{if(e.button===0&&!e.target.closest('button'))host?.postMessage({action:'drag'});};
  host?.addEventListener('message',e=>{
    const m=e.data;if(m.type==='reply'&&!m.ok){set('status',m.error);return;}if(m.type!=='wizard')return;
    mode=m.mode;phase=m.phase;busy=phase==='working';
    set('caption',mode==='install'?'INSTALACJA':'ODINSTALOWANIE');set('path',m.path||'');set('status',m.status||'Wszystko gotowe.');
    $('[data-progress]').hidden=!busy;$('[data-delete-option]').hidden=mode!=='uninstall'||phase==='done';$('[data-primary]').disabled=busy;$('[data-cancel]').disabled=busy;
    $('[data-primary]').textContent=phase==='done'?(mode==='install'?'Uruchom OKStudy':'Zamknij'):busy?(mode==='install'?'Instaluję…':'Usuwam…'):(mode==='install'?'Zainstaluj OKStudy':'Odinstaluj OKStudy');
    if(phase==='done'){set('step','02 / GOTOWE');set('title',mode==='install'?'Gotowe do nauki.':'Do zobaczenia.');set('description',mode==='install'?'OKStudy znajdziesz w menu Start. Połącz swoje AI i rozwiąż pierwsze zadanie.':'OKStudy Windows został usunięty.');set('panel-title',mode==='install'?'Mały skrót. Duża wygoda.':'Usunięto program.');set('note',mode==='install'?'Ctrl + Alt + O zaznacza zadanie. Esc anuluje zaznaczenie. Zamknięcie okna chowa program przy zegarze.':m.note||'Konta ChatGPT współdzielone z rozszerzeniem pozostają dostępne.');}
    else if(mode==='uninstall'){set('step','01 / ODINSTALOWANIE');set('title','Usunąć OKStudy?');set('description','Zamkniemy program i usuniemy aplikację Windows oraz jej skróty.');set('panel-title','Ty wybierasz, co zachować.');set('note','Domyślnie zachowamy ustawienia i lokalną historię. Współdzielone konto ChatGPT pozostanie dostępne dla rozszerzenia.');}
  });host?.postMessage({action:'ready'});
})();
