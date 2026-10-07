using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

internal static class Program {
    [STAThread] private static int Main(string[] args) {
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        try {
            if(args.Length==1&&args[0]=="--self-check"){SelfCheck.Run();return 0;}
            if(args.Length==1&&args[0]=="--capture-check"){SelfCheck.CaptureCheck();return 0;}
            if(args.Length==2&&args[0]=="--self-check-bridge"){SelfCheck.BridgeCheck(args[1]);return 0;}
            if(args.Length>=2&&args[0]=="--preview") {
                using(var form=new StudyForm(args[1],args.Length>2?args[2]:"home"))Application.Run(form);
                return File.Exists(args[1])?0:1;
            }
            bool created;using(var instance=new Mutex(true,"Local\\OKStudy.Desktop."+Environment.UserName,out created)) {
                if(!created){Native.ActivateExisting();return 0;}
                Application.Run(new StudyForm(null,null));
            }return 0;
        }catch(Exception e){if(args.Length>1&&args[0]=="--preview")File.WriteAllText(args[1]+".error.txt",e.ToString());else if(args.Length>0&&args[0].StartsWith("--"))Console.Error.WriteLine(e.Message);else MessageBox.Show(e.Message,"OKStudy",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
    }
}

internal sealed class StudyForm : WebShell {
    private readonly Store store;
    private readonly Bridge bridge;
    private readonly string previewPath,previewPage;
    private readonly string[] providers={"chatgpt","openai","gemini","claude","grok"};
    private NotifyIcon tray;private AnswerOverlay overlay;private FloatingButton floating;private CropForm crop;
    private System.Speech.Synthesis.SpeechSynthesizer speech;
    private readonly System.Windows.Forms.Timer expiry=new System.Windows.Forms.Timer();
    private Dictionary<string,object> account=new Dictionary<string,object>(),lastSpec;
    private string lastImage,lastAnswer="",lastModel="",secondAnswer="",secondModel="",message="Wybierz połączenie, aby zacząć.",catalogError="",hotkeyError="";
    private long imageAt;private int generation,connectionGeneration;private bool busy,capturing,exiting,managedDisposed,isError;
    private readonly HashSet<string> modelRequests=new HashSet<string>();
    private bool editingShortcuts;
    private bool preview {get{return previewPath!=null;}}
    private string Provider {get{return Data.String(store.Settings,"provider","chatgpt");}}
    private string AccountId {get{return Data.String(account,"activeId");}}
    private string Key(string p){return Data.String(Data.Object(store.Settings,"keys"),p);}
    private string Scope(string p,string k){return store.Scope(p,AccountId,k);}
    private string Selected(string p,string k){return Data.String(store.Settings,Scope(p,k)+".selected");}
    internal StudyForm(string output,string screen) : base(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ui"),"index.html",output==null?Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"OKStudy","desktop","webview"):Path.Combine(Path.GetTempPath(),"OKStudy-preview-"+Guid.NewGuid().ToString("N")),1024,744) {
        previewPath=output;previewPage=screen;Text="OKStudy · Windows";
        store=new Store(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"OKStudy","desktop","settings.dat"));
        if(!preview)try{store.Load();}catch(Exception e){message="Nie odczytano ustawień: "+e.Message;isError=true;}
        Defaults();
        bridge=new Bridge(AppDomain.CurrentDomain.BaseDirectory);
        bridge.Authorize+=url=>Ui(()=>Process.Start(new ProcessStartInfo(url){UseShellExecute=true}));
        if(preview){StartPosition=FormStartPosition.Manual;Location=new Point(-32000,-32000);Fixture();}
        expiry.Interval=10000;expiry.Tick+=(s,e)=>{if(lastImage!=null&&Data.Now-imageAt>300000){ClearTask(false);Push();}};expiry.Start();
        FormClosing+=(s,e)=>{if(!exiting&&!preview){e.Cancel=true;Hide();}};
        Deactivate+=(s,e)=>{if(editingShortcuts)EditShortcuts(false);};
    }
    private void Defaults(){
        var d=new Dictionary<string,object>{{"style","text"},{"profile","readable"},{"opacity",45},{"textSize",18},{"duration",8},{"indicator",1},{"answerOnly",true},{"quality",true},{"tone","graphite"},{"floating",true},{"captureShortcut","Alt+Z"},{"screenShortcut","Alt+X"},{"screenTarget","monitor"},{"questionTarget","cursor"}};
        foreach(var kv in d)if(!store.Settings.ContainsKey(kv.Key))store.Settings[kv.Key]=kv.Value;
        if(!providers.Contains(Provider))store.Settings["provider"]="chatgpt";
    }
    private void Fixture(){
        account=new Dictionary<string,object>{{"connected",true},{"sharing",true},{"activeId","preview"},{"email","Konto ChatGPT"},{"accounts",new[]{new Dictionary<string,object>{{"id","preview"},{"label","Konto ChatGPT"}}}}};
        store.Settings[Scope("chatgpt","")]=new[]{new Dictionary<string,object>{{"id","model-z-konta"},{"name","Model z konta"}}};
        store.Settings[Scope("chatgpt","")+".selected"]="model-z-konta";
        lastAnswer="D";lastModel="Model z konta";message="Podgląd wyglądu · przykładowe dane";
        store.History=new List<Dictionary<string,object>>{new Dictionary<string,object>{{"id","preview"},{"text","D"},{"model","Model z konta"},{"at",Data.Now},{"pinned",true}}};
    }
    protected override async Task ViewReady(){
        Push();
        if(preview){Post(new{type="page",page=previewPage});await Task.Delay(750);await web.CoreWebView2.ExecuteScriptAsync("document.fonts.ready.then(()=>true)");using(var output=File.Create(previewPath))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,output);exiting=true;Close();return;}
        Native.Exclude(this);CreateTray();ApplyFloating();
        try{account=await bridge.Call("status",null);MigrateModels();Push();await LoadModels(Provider,Key(Provider),false);}catch(Exception e){Status(e.Message,true);}
    }
    protected override void CloseAfterFailure(){exiting=true;base.CloseAfterFailure();}
    protected override void Trace(string text){if(previewPath!=null)File.AppendAllText(previewPath+".trace.txt",text+Environment.NewLine);}
    private void Ui(Action a){if(disposed)return;try{BeginInvoke(a);}catch(InvalidOperationException){}}
    private void Status(string text,bool error){message=text;isError=error;Push();}
    protected override void ViewError(string error){Status(error,true);}
    private void Push(){
        if(disposed)return;
        var settings=new Dictionary<string,object>(store.Settings.Where(kv=>new[]{"profile","style","opacity","textSize","duration","indicator","answerOnly","quality","persistentHistory","position","tone","floating","voice","captureShortcut","screenShortcut","screenTarget","questionTarget"}.Contains(kv.Key)).ToDictionary(kv=>kv.Key,kv=>kv.Value));
        string scope=Scope(Provider,Key(Provider));
        var catalogs=new Dictionary<string,object>();
        foreach(string p in providers){string s=Scope(p,Key(p));catalogs[p]=new{models=ModelRows(s),selected=Selected(p,Key(p)),favorites=store.Favorites(s),at=Data.Number(store.Settings,s+".at",0),hasKey=Key(p)!="",loading=modelRequests.Contains(s)};}
        Post(new {type="state",state=new{version="0.2.1",settings=settings,provider=Provider,account=account,catalogs=catalogs,history=store.History,answer=lastAnswer,model=lastModel,secondAnswer=secondAnswer,secondModel=secondModel,hasFrame=lastImage!=null,busy=busy||capturing,status=message,error=isError,catalogError=catalogError,hotkeyError=hotkeyError}});
    }
    private bool Save(){if(preview)return true;try{store.Save();return true;}catch(Exception e){Status("Nie zapisano ustawień: "+e.Message,true);return false;}}
    private List<Dictionary<string,object>> ModelRows(string scope){return store.Catalog(scope).Select(row=>new Dictionary<string,object>{{"id",Data.String(row,"id")},{"name",store.ModelLabel(scope,row)}}).ToList();}
    private void MigrateModels(){var legacy=Data.Object(store.Settings,"models");bool changed=false;foreach(string p in providers){string id=Data.String(legacy,p);if(id==""||p=="chatgpt"&&AccountId=="")continue;string scope=Scope(p,Key(p));if(Selected(p,Key(p))=="")store.Settings[scope+".selected"]=id;legacy.Remove(p);changed=true;}if(changed){if(legacy.Count==0)store.Settings.Remove("models");Save();}}
    private string ValidProvider(Dictionary<string,object> a){string p=Data.String(a,"provider",Provider);if(!providers.Contains(p))throw new Exception("Nieznany dostawca.");return p;}
    private string DraftKey(Dictionary<string,object> a,string p){string key=Data.String(a,"key").Trim();if(key.Length>4096)throw new Exception("Klucz jest zbyt długi.");return key!=""?key:Key(p);}
    protected override async Task<object> Command(string action,Dictionary<string,object> a) {
        if(action=="shortcutEditing"){if(!preview)EditShortcuts(Data.Bool(a,"editing"));return null;}
        if(action=="models"){string p=ValidProvider(a),k=DraftKey(a,p);await LoadModels(p,k,Data.Bool(a,"force"));string scope=Scope(p,k);return new{models=ModelRows(scope),selected=Selected(p,k),favorites=store.Favorites(scope),at=Data.Number(store.Settings,scope+".at",0),hasKey=k!=""};}
        if(action=="signin") {
            if(busy)throw new Exception("Najpierw przerwij analizę.");Cancel(false);connectionGeneration++;ClearTask();busy=true;Status("Dokończ logowanie w przeglądarce…",false);
            try{account=await bridge.Call("signin",new Dictionary<string,object>{{"accountId",Data.Bool(a,"additional")?"__new":AccountId}});MigrateModels();store.Settings["provider"]="chatgpt";catalogError="";Push();await LoadModels("chatgpt","",true);Status("Konto połączone. Wybierz model i zapisz połączenie.",false);}finally{busy=false;Push();}return null;
        }
        if(action=="account"||action=="signout"){
            if(busy)throw new Exception("Najpierw przerwij analizę.");Cancel(false);ClearTask();connectionGeneration++;
            account=await bridge.Call(action=="account"?"select":"signout",new Dictionary<string,object>{{"accountId",Data.String(a,"accountId")}});Push();if(action=="account")await LoadModels("chatgpt","",false);else Status("Konto odłączone.",false);return null;
        }
        if(action=="saveConnection"){
            string p=ValidProvider(a),k=DraftKey(a,p),m=Data.String(a,"model").Trim();
            if(!Regex.IsMatch(m,"^[\\w.:/-]{1,120}$"))throw new Exception("Wybierz lub wpisz model.");
            if(p=="chatgpt"&&(!Data.Bool(account,"connected")||!Data.Bool(account,"sharing")||AccountId==""))throw new Exception("Połącz konto i udziel dostępu do planu ChatGPT.");
            if(p!="chatgpt"&&k=="")throw new Exception("Wklej klucz API.");
            var previous=new Dictionary<string,object>(store.Settings);
            Cancel(false);connectionGeneration++;ClearTask();store.Settings["provider"]=p;var keys=new Dictionary<string,object>(Data.Object(store.Settings,"keys"));if(p!="chatgpt")keys[p]=k;store.Settings["keys"]=keys;
            store.Settings[Scope(p,k)+".selected"]=m;
            if(!Save()){store.Settings=previous;Push();throw new Exception("Zapis połączenia nie powiódł się.");}catalogError="";Status("Połączenie zapisane.",false);return null;
        }
        if(action=="appearance"){
            var previous=new Dictionary<string,object>(store.Settings);
            foreach(string n in new[]{"answerOnly","quality","persistentHistory","floating","voice"})if(a.ContainsKey(n))store.Settings[n]=Data.Bool(a,n);
            foreach(var rule in new[]{new[]{"opacity","5","100"},new[]{"textSize","12","26"},new[]{"duration","3","30"},new[]{"indicator","0","2"}})if(a.ContainsKey(rule[0]))store.Settings[rule[0]]=(int)Math.Max(int.Parse(rule[1]),Math.Min(int.Parse(rule[2]),Data.Number(a,rule[0],18)));
            foreach(string n in new[]{"style","profile","position","tone"})if(a.ContainsKey(n)){
                var allowed=n=="style"?new[]{"text","card"}:n=="profile"?new[]{"discreet","readable","study"}:n=="position"?new[]{"top","bottom"}:new[]{"system","graphite","paper"};
                if(!allowed.Contains(Data.String(a,n)))throw new Exception("Nieprawidłowe ustawienie wyglądu.");store.Settings[n]=Data.String(a,n);
            }
            if(!Save()){store.Settings=previous;Push();throw new Exception("Zapis wyglądu nie powiódł się.");}ApplyFloating();Status("Wygląd zapisany.",false);return null;
        }
        if(action=="favorite"){
            string p=ValidProvider(a),m=Data.String(a,"model");if(!Regex.IsMatch(m,"^[\\w.:/-]{1,120}$"))throw new Exception("Wybierz model.");store.Favorite(Scope(p,DraftKey(a,p)),m);Push();return null;
        }
        if(action=="shortcuts"){
            Dictionary<string,object> previous=new Dictionary<string,object>(store.Settings),candidate=new Dictionary<string,object>(store.Settings);
            Shortcut select=Shortcut.Parse(Data.String(a,"captureShortcut")),screen=Shortcut.Parse(Data.String(a,"screenShortcut"));
            if(select.Text==screen.Text||new[]{select.Text,screen.Text}.Any(x=>x=="Ctrl+Alt+R"||x=="Ctrl+Alt+K"))throw new Exception("Wybierz różne skróty. Ctrl+Alt+R i Ctrl+Alt+K są już używane.");
            string target=Data.String(a,"screenTarget"),question=Data.String(a,"questionTarget");if(!new[]{"monitor","window"}.Contains(target)||!new[]{"cursor","center"}.Contains(question))throw new Exception("Nieprawidłowy wybór ekranu lub pytania.");
            candidate["captureShortcut"]=select.Text;candidate["screenShortcut"]=screen.Text;candidate["screenTarget"]=target;candidate["questionTarget"]=question;
            string error=preview?"":RegisterShortcuts(candidate);
            if(error!=""){RegisterShortcuts(previous);hotkeyError=error;Push();throw new Exception(error);}
            store.Settings=candidate;if(!Save()){store.Settings=previous;if(!preview)RegisterShortcuts(previous);Push();throw new Exception("Nie zapisano skrótów.");}hotkeyError="";Status("Skróty zapisane. Przycisk OK możesz ukryć poniżej.",false);return null;
        }
        if(action=="capture"){await StartCapture(true);return null;}
        if(action=="screen"){await StartCapture(false,true);return null;}
        if(action=="image"){await AddImage();return null;}
        if(action=="cancel"){Cancel(true);return null;}
        if(action=="repeat"){Repeat();return null;}
        if(action=="copy"){if(lastAnswer!="")Clipboard.SetText(lastAnswer);Status("Odpowiedź skopiowana.",false);return null;}
        if(action=="clear"){Cancel(false);lastAnswer="";lastModel="";ClearTask();Status("Usunięto odpowiedź i kadr.",false);return null;}
        if(action=="speak"){if(lastAnswer=="")throw new Exception("Brak odpowiedzi do odczytania.");if(speech==null)speech=new System.Speech.Synthesis.SpeechSynthesizer();if(speech.State==System.Speech.Synthesis.SynthesizerState.Speaking)speech.SpeakAsyncCancelAll();else speech.SpeakAsync(lastAnswer);return null;}
        if(action=="explain"||action=="compare"){
            RequireFrame();if(busy)throw new Exception("Analiza już trwa.");var spec=new Dictionary<string,object>(lastSpec);
            if(action=="explain"){spec["mode"]="tutor";spec["answerOnly"]=false;}else{string m=Data.String(a,"model");if(!Regex.IsMatch(m,"^[\\w.:/-]{1,120}$")||m==Data.String(spec,"model"))throw new Exception("Wybierz inny model.");spec["model"]=m;}
            await Infer(spec,lastImage,action=="compare",false);return null;
        }
        if(action=="history"){
            var row=store.History.FirstOrDefault(x=>Data.String(x,"id")==Data.String(a,"id"));if(row==null)throw new Exception("Nie znaleziono odpowiedzi.");
            string operation=Data.String(a,"operation","open");if(operation=="delete")store.History.Remove(row);
            else if(operation=="pin"){if(!Data.Bool(row,"pinned")&&store.History.Count(x=>Data.Bool(x,"pinned"))>=20)throw new Exception("Możesz przypiąć 20 odpowiedzi.");row["pinned"]=!Data.Bool(row,"pinned");}
            else if(operation=="open"){Cancel(false);ClearTask();lastAnswer=Data.String(row,"text");lastModel=Data.String(row,"model");}
            else throw new Exception("Nieznana operacja historii.");Save();Push();return null;
        }
        if(action=="usage"){Process.Start(new ProcessStartInfo("https://chatgpt.com/settings/usage"){UseShellExecute=true});return null;}
        if(action=="exit"){exiting=true;Close();return null;}
        throw new Exception("Nieobsługiwana operacja.");
    }
    private async Task LoadModels(string p,string key,bool force){
        if(preview)return;
        string scope=Scope(p,key),id=AccountId;int epoch=connectionGeneration;
        if(p=="chatgpt"&&(!Data.Bool(account,"connected")||!Data.Bool(account,"sharing")||id=="")){if(force)throw new Exception("Zaloguj się, aby pobrać modele konta.");return;}
        if(p!="chatgpt"&&key==""){if(force)throw new Exception("Wklej klucz API, aby pobrać listę modeli.");return;}
        if(modelRequests.Contains(scope))return;
        if(!force&&store.Catalog(scope).Count>0&&Data.Now-Data.Number(store.Settings,scope+".at",0)<21600000){Push();return;}
        modelRequests.Add(scope);catalogError="";Status("Pobieram aktualny katalog modeli…",false);
        try{
            var result=await bridge.Call("models",new Dictionary<string,object>{{"provider",p},{"key",key},{"accountId",id}});
            if(epoch!=connectionGeneration||p=="chatgpt"&&id!=AccountId)return;
            var rows=Data.Rows(result,"models");if(rows.Count==0)throw new Exception("Usługa zwróciła pustą listę modeli.");
            store.Catalog(scope,rows);
            if(Selected(p,key)==""){store.Settings[scope+".selected"]=Data.String(rows[0],"id");Save();}
            Status("Pobrano "+rows.Count+" modeli. Wybierz model i zapisz połączenie.",false);
        }catch(Exception e){if(epoch!=connectionGeneration)return;catalogError=e.Message;Status("Nie pobrano modeli. "+e.Message,true);throw;}
        finally{modelRequests.Remove(scope);Push();}
    }
    private Dictionary<string,object> Snapshot(){
        string p=Provider,m=Selected(p,Key(p));if(!Regex.IsMatch(m,"^[\\w.:/-]{1,120}$"))throw new Exception("Wybierz i zapisz model w Połączeniach.");
        if(p=="chatgpt"&&(!Data.Bool(account,"connected")||!Data.Bool(account,"sharing")||AccountId==""))throw new Exception("Połącz konto ChatGPT w Połączeniach.");
        if(p!="chatgpt"&&Key(p)=="")throw new Exception("Zapisz klucz API w Połączeniach.");
        bool only=Data.Bool(store.Settings,"answerOnly");return new Dictionary<string,object>{{"provider",p},{"model",m},{"key",Key(p)},{"accountId",AccountId},{"mode",only?"express":"tutor"},{"answerOnly",only},{"internet",false}};
    }
    private async Task StartCapture(bool immediate=false,bool full=false){
        if(preview||busy||capturing)return;var spec=Snapshot();Point focus=Cursor.Position;Rectangle monitor=Screen.FromPoint(focus).Bounds;
        Rectangle target=full?(Data.String(store.Settings,"screenTarget")=="window"?Native.ActiveBounds(Handle):monitor):SystemInformation.VirtualScreen;
        capturing=true;int epoch=++generation;bool wasVisible=Visible,sent=false;
        try{
            Hide();CloseOverlay();if(floating!=null)floating.Hide();await Task.Delay(230);if(epoch!=generation)return;
            if(full&&Data.String(store.Settings,"screenTarget")=="window"&&target.IsEmpty){target=Native.ActiveBounds(Handle);if(target.IsEmpty)throw new Exception("Przejdź do okna z zadaniem i użyj skrótu analizy ekranu.");}
            if(full){bool center=Data.String(store.Settings,"questionTarget")=="center"||!target.Contains(focus);spec["fullScreen"]=true;spec["focusX"]=center ? 0.5 : Math.Max(0,Math.Min(1,(focus.X-target.Left)/(double)Math.Max(1,target.Width)));spec["focusY"]=center ? 0.5 : Math.Max(0,Math.Min(1,(focus.Y-target.Top)/(double)Math.Max(1,target.Height)));}
            Rectangle desktop=target;
            if(desktop.Width<=0||desktop.Height<=0||(long)desktop.Width*desktop.Height>60000000)throw new Exception("Układ ekranów jest zbyt duży do przechwycenia.");
            string image;
            using(var frame=new Bitmap(desktop.Width,desktop.Height,PixelFormat.Format32bppArgb)){
                using(var g=Graphics.FromImage(frame))g.CopyFromScreen(desktop.Location,Point.Empty,desktop.Size,CopyPixelOperation.SourceCopy);
                if(full)image=ImageQuality.Encode(frame);
                else {using(crop=new CropForm(frame,desktop,Data.Bool(store.Settings,"quality"),immediate)){if(crop.ShowDialog()!=DialogResult.OK){if(wasVisible)Open();return;}image=crop.ImageData;}crop=null;}
            }
            if(epoch!=generation)return;capturing=false;sent=true;await Infer(spec,image,false,true);
        }catch(Exception e){if(!sent){Status(e.Message,true);Open();}}
        finally{crop=null;capturing=false;ApplyFloating();Push();}
    }
    private async Task AddImage(){
        if(busy||capturing)return;var spec=Snapshot();
        using(var picker=new OpenFileDialog{Filter="Obrazy|*.png;*.jpg;*.jpeg;*.bmp",Title="Wybierz zadanie",CheckFileExists=true}){
            if(picker.ShowDialog(this)!=DialogResult.OK)return;
            if(new FileInfo(picker.FileName).Length>20000000)throw new Exception("Obraz jest zbyt duży. Wybierz plik do 20 MB.");
            using(var source=Image.FromFile(picker.FileName)){
                if((long)source.Width*source.Height>60000000)throw new Exception("Obraz ma zbyt dużą rozdzielczość.");
                using(var frame=new Bitmap(source))using(crop=new CropForm(frame,Screen.FromControl(this).Bounds,Data.Bool(store.Settings,"quality"))){if(crop.ShowDialog(this)!=DialogResult.OK)return;string data=crop.ImageData;crop=null;await Infer(spec,data,false,false);}
            }
        }
    }
    private async Task Infer(Dictionary<string,object> spec,string image,bool compare,bool showAnswer){
        if(busy)return;busy=true;int epoch=++generation;string original=lastAnswer,originalModel=lastModel;
        var args=new Dictionary<string,object>(spec);args["image"]=image;
        if(!compare&&showAnswer&&Data.Number(store.Settings,"indicator",1)<2)ShowActivity();
        Status(compare?"Sprawdzam niezależnie drugim modelem…":"Analizuję zadanie…",false);
        try{
            var result=await bridge.Call("infer",new Dictionary<string,object>{{"args",args}});if(epoch!=generation)return;
            string text=Data.String(result,"text");if(text.Trim()=="")throw new Exception("Model nie zwrócił odpowiedzi.");CloseOverlay();
            if(compare){secondAnswer=text;secondModel=Data.String(spec,"model");lastAnswer=original;lastModel=originalModel;}
            else{
                lastAnswer=text;lastModel=Data.String(spec,"model");lastImage=image;imageAt=Data.Now;lastSpec=new Dictionary<string,object>(spec);secondAnswer="";secondModel="";
                if(showAnswer){if(Data.Bool(store.Settings,"voice")){if(speech==null)speech=new System.Speech.Synthesis.SpeechSynthesizer();speech.SpeakAsync(text);}else ShowOverlay(text,false);}
                try{store.Add(text,lastModel);}catch(Exception e){Status("Odpowiedź gotowa. Nie zapisano historii: "+e.Message,true);return;}
            }
            Status("Odpowiedź gotowa. Kadr jest dostępny przez 5 minut.",false);
        }catch(Exception e){if(epoch!=generation)return;CloseOverlay();Status(e.Message,true);if(showAnswer)ShowOverlay("!",true);throw;}
        finally{if(epoch==generation){busy=false;Push();}}
    }
    private void RequireFrame(){if(lastImage==null||lastSpec==null||Data.Now-imageAt>300000){ClearTask(false);throw new Exception("Kadr wygasł. Zaznacz zadanie ponownie.");}}
    private void ClearTask(bool clearComparison=true){lastImage=null;lastSpec=null;imageAt=0;if(clearComparison){secondAnswer="";secondModel="";}}
    private void Repeat(){if(lastAnswer==""){Status("Brak ostatniej odpowiedzi.",false);return;}ShowOverlay(lastAnswer,false);Status("Powtórzono bez nowego zapytania.",false);}
    private void ShowOverlay(string text,bool brief){CloseOverlay();var s=new DictionarySettings(store.Settings);if(brief){s.Duration=2;s.Opacity=1;s.Card=true;}overlay=new AnswerOverlay(text,s);overlay.Show();}
    private void ShowActivity(){CloseOverlay();overlay=new AnswerOverlay(Data.Number(store.Settings,"indicator",1)==1?"•••":"Analizuję zadanie…",new DictionarySettings(store.Settings),()=>Cancel(true));overlay.Show();}
    private void CloseOverlay(){if(overlay!=null){overlay.Close();overlay.Dispose();overlay=null;}}
    private void Cancel(bool notify){generation++;bridge.CancelAll();if(crop!=null)crop.Close();if(speech!=null)speech.SpeakAsyncCancelAll();busy=false;CloseOverlay();if(notify)Status("Przerwano.",false);}
    private void Open(){Show();WindowState=FormWindowState.Normal;Activate();}
    private void ApplyFloating(){if(preview||disposed)return;if(Data.Bool(store.Settings,"floating")){if(floating==null){floating=new FloatingButton(()=>RunCapture(),()=>Repeat(),()=>Open());}if(!capturing)floating.Show();}else if(floating!=null){floating.Close();floating.Dispose();floating=null;}}
    private async void RunCapture(bool immediate=true,bool full=false){try{await StartCapture(immediate,full);}catch(Exception e){Status(e.Message,true);Open();}}
    private string RegisterShortcuts(Dictionary<string,object> settings){
        for(int i=1;i<=5;i++)if(i!=2&&i!=3)Native.UnregisterHotKey(Handle,i);
        Shortcut select=Shortcut.Parse(Data.String(settings,"captureShortcut","Alt+Z")),screen=Shortcut.Parse(Data.String(settings,"screenShortcut","Alt+X"));var errors=new List<string>();
        if(!Native.RegisterHotKey(Handle,1,select.Modifiers,select.Key))errors.Add(select.Text);
        if(!Native.RegisterHotKey(Handle,4,screen.Modifiers,screen.Key))errors.Add(screen.Text);
        if(select.Text!="Ctrl+Alt+O"&&screen.Text!="Ctrl+Alt+O")Native.RegisterHotKey(Handle,5,0x4003,(uint)Keys.O);
        return errors.Count==0?"":"Skrót "+string.Join(", ",errors)+" jest zajęty przez inny program. Wybierz inną kombinację w Skrótach.";
    }
    private void EditShortcuts(bool editing){
        if(editing==editingShortcuts||tray==null)return;editingShortcuts=editing;
        if(editing){for(int i=1;i<=5;i++)Native.UnregisterHotKey(Handle,i);}
        else{hotkeyError=RegisterShortcuts(store.Settings);Native.RegisterHotKey(Handle,2,0x4003,(uint)Keys.R);Native.RegisterHotKey(Handle,3,0x4003,(uint)Keys.K);Push();}
    }
    private void CreateTray(){
        if(tray!=null)return;tray=new NotifyIcon{Icon=Icon,Text="OKStudy",Visible=true};var menu=new ContextMenuStrip();menu.Items.Add("Zaznacz zadanie",null,(s,e)=>RunCapture());menu.Items.Add("Analizuj ekran",null,(s,e)=>RunCapture(false,true));menu.Items.Add("Powtórz odpowiedź",null,(s,e)=>Repeat());menu.Items.Add("Otwórz OKStudy",null,(s,e)=>Open());menu.Items.Add("Zakończ",null,(s,e)=>{exiting=true;Close();});tray.ContextMenuStrip=menu;tray.DoubleClick+=(s,e)=>Open();
        hotkeyError=RegisterShortcuts(store.Settings);bool repeat=Native.RegisterHotKey(Handle,2,0x4003,(uint)Keys.R),cancel=Native.RegisterHotKey(Handle,3,0x4003,(uint)Keys.K);if(!repeat||!cancel)hotkeyError+=(hotkeyError==""?"":" ")+"Skrót powtórzenia lub przerwania jest zajęty.";if(hotkeyError!="")Status(hotkeyError,true);
    }
    protected override void WndProc(ref Message m){if(m.Msg==0x0312){int id=m.WParam.ToInt32();if(id==1)RunCapture();if(id==2)Repeat();if(id==3)Cancel(true);if(id==4)RunCapture(false,true);if(id==5)RunCapture(false);}if(m.Msg==Native.OpenMessage)Open();if(m.Msg==Native.ExitMessage){exiting=true;Close();}base.WndProc(ref m);}
    protected override void Dispose(bool disposing){if(disposing&&!managedDisposed){managedDisposed=true;expiry.Dispose();if(IsHandleCreated)for(int i=1;i<=5;i++)Native.UnregisterHotKey(Handle,i);CloseOverlay();if(floating!=null)floating.Dispose();if(tray!=null){tray.Visible=false;tray.Dispose();}if(speech!=null)speech.Dispose();bridge.Dispose();ClearTask();}base.Dispose(disposing);}
}
