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

internal static class Program {
    [STAThread] private static int Main(string[] args) {
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        try {
            if(args.Length==2&&args[0]=="--preview"){
                using(var form=new StudyForm(true)){
                    form.CreateControl();foreach(Control c in form.Controls)c.CreateControl();
                    form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-32000,-32000);form.Show();Application.DoEvents();
                    using(var bitmap=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new Rectangle(Point.Empty,bitmap.Size));bitmap.Save(args[1],ImageFormat.Png);}
                    form.Close();
                }return 0;
            }
            if(args.Length==1&&args[0]=="--self-check"){SelfCheck.Run();return 0;}
            if(args.Length==2&&args[0]=="--self-check-bridge"){SelfCheck.BridgeCheck(args[1]);return 0;}
            bool created;using(var instance=new Mutex(true,"Local\\OKStudy.Desktop."+Environment.UserName,out created)){
                if(!created){MessageBox.Show("OKStudy już działa. Otwórz je przez ikonę przy zegarze.","OKStudy");return 0;}
                Application.Run(new StudyForm(false));
            }return 0;
        }catch(Exception e){if(args.Length==2&&args[0]=="--preview"){File.WriteAllText(args[1]+".error.txt",e.ToString());return 1;}MessageBox.Show(e.Message,"OKStudy",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
    }
}

internal sealed class StudyForm : Form {
    private readonly bool preview;
    private readonly Store store;
    private readonly Bridge bridge;
    private NotifyIcon tray;
    private AnswerOverlay overlay;
    private CropForm cropping;
    private readonly System.Windows.Forms.Timer expiry=new System.Windows.Forms.Timer();
    private bool exiting,busy,loadingModels,capturing,building=true;
    private System.Speech.Synthesis.SpeechSynthesizer speech;
    private int generation;
    private string lastImage,lastAnswer="",lastModel="",activeAccount="";
    private Dictionary<string,object> lastSpec,accountStatus=new Dictionary<string,object>();
    private long imageAt;
    private readonly string[] providers={"chatgpt","gemini","claude","openai","grok"};
    private readonly string[] providerNames={"ChatGPT · Twój plan","Gemini · API","Claude · API","OpenAI · API","Grok · API"};
    private ComboBox provider,models,accounts,style,indicator,position;
    private TextBox key,model,historySearch;
    private NumericUpDown opacity,duration,fontSize;
    private CheckBox answerOnly,quality,persistent;
    private Label status,connectionLabel,currentModel;
    private Label answer;
    private bool managedDisposed;
    private FlowLayoutPanel favorites,historyRows;
    private Panel[] pages;
    private Button[] tabs;
    private List<Dictionary<string,object>> catalogRows=new List<Dictionary<string,object>>();
    internal StudyForm(bool sample) {
        preview=sample;
        Theme.Style(this,"OKStudy · Windows",900,760);MinimumSize=new Size(800,650);
        Icon=Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
        string data=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"OKStudy","desktop","settings.dat");
        store=new Store(data);
        string startupError="";
        if(!preview)try{store.Load();}catch(Exception e){startupError="Nie odczytano ustawień: "+e.Message;}
        bridge=new Bridge(AppDomain.CurrentDomain.BaseDirectory);
        bridge.Authorize+=url=>Ui(()=>Process.Start(new ProcessStartInfo(url){UseShellExecute=true}));
        Build();building=false;LoadConnection();
        if(preview){currentModel.Text="ChatGPT · GPT-6.1 Sol";lastAnswer="D";answer.Text="D";connectionLabel.Text="Podgląd wyglądu · przykładowe dane";}
        if(startupError!="")Status(startupError,true);
        expiry.Interval=10000;expiry.Tick+=(s,e)=>{if(lastImage!=null&&Data.Now-imageAt>300000)ClearTask();};expiry.Start();
        FormClosing+=(s,e)=>{if(!exiting&&!preview){e.Cancel=true;Hide();}};
    }
    private void Ui(Action action){if(IsDisposed||Disposing)return;try{BeginInvoke(action);}catch(InvalidOperationException){}}
    private void Build(){
        var footer=new Panel{Dock=DockStyle.Bottom,Height=54,Padding=new Padding(24,6,24,6)};
        status=Theme.Label("Ctrl + Alt + O: zaznacz zadanie · Ctrl + Alt + R: powtórz · Ctrl + Alt + K: przerwij",10,false);
        status.Dock=DockStyle.Fill;status.AutoSize=false;footer.Controls.Add(status);Controls.Add(footer);
        var header=new Panel{Dock=DockStyle.Top,Height=148,Padding=new Padding(24,18,24,8)};
        var mark=new PictureBox{Location=new Point(26,24),Size=new Size(52,52),SizeMode=PictureBoxSizeMode.Zoom};
        using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("mark.png")){if(stream!=null)mark.Image=new Bitmap(stream);}
        header.Controls.Add(mark);
        var title=Theme.Label("OKStudy",26,true);title.Location=new Point(92,20);header.Controls.Add(title);
        var sub=Theme.Label("Twój mały skrót do zrozumienia.",12,false);sub.Location=new Point(94,68);header.Controls.Add(sub);
        var strip=Theme.Row();strip.Location=new Point(24,96);strip.Width=800;
        tabs=new Button[4];string[] names={"Start","Połączenia","Wygląd","Historia"};
        for(int i=0;i<names.Length;i++){int tab=i;tabs[i]=Theme.Button(names[i],()=>ShowPage(tab),i==0);tabs[i].Width=184;strip.Controls.Add(tabs[i]);}
        header.Controls.Add(strip);Controls.Add(header);
        var body=new Panel{Dock=DockStyle.Fill,Padding=new Padding(24,8,24,8)};Controls.Add(body);body.BringToFront();
        pages=new Panel[4];for(int i=0;i<4;i++){pages[i]=new Panel{Dock=DockStyle.Fill,AutoScroll=true,Visible=i==0};body.Controls.Add(pages[i]);}
        var home=Theme.Column();home.Width=780;pages[0].Controls.Add(home);
        var hero=new PictureBox{Size=new Size(780,108),SizeMode=PictureBoxSizeMode.Zoom,BackColor=Theme.Card,Margin=new Padding(0,0,0,10)};
        using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("hero.png")){if(stream!=null)hero.Image=new Bitmap(stream);}
        home.Controls.Add(hero);currentModel=Theme.Label("Wybierz połączenie i model",14,true);home.Controls.Add(currentModel);
        var actions=Theme.Row();actions.Controls.Add(Theme.Button("Zaznacz zadanie",()=>StartCapture(),true));
        actions.Controls.Add(Theme.Button("Powtórz odpowiedź",()=>Repeat(),false));
        actions.Controls.Add(Theme.Button("Przerwij",()=>Cancel(),false));home.Controls.Add(actions);
        home.Controls.Add(Theme.Label("Zrzut powstaje po Twoim poleceniu. Do AI trafia tylko zatwierdzony fragment.",10,false));
        var profiles=Theme.Row();string[] ids={"discreet","readable","study","voice"},labels={"Dyskretny","Czytelny","Nauka","Głos systemu"};
        for(int i=0;i<4;i++){string id=ids[i];profiles.Controls.Add(Theme.Button(labels[i],()=>Profile(id),false));}home.Controls.Add(profiles);
        favorites=Theme.Row();home.Controls.Add(favorites);
        home.Controls.Add(Theme.Label("Ostatnia odpowiedź",15,true));
        var answerBox=new Panel{Size=new Size(780,140),AutoScroll=true,BackColor=Theme.Card};
        answer=new Label{AutoSize=true,MaximumSize=new Size(750,0),Padding=new Padding(12),BackColor=Theme.Card,ForeColor=Theme.Text,Font=new Font("Segoe UI",14)};
        answerBox.Controls.Add(answer);home.Controls.Add(answerBox);var follow=Theme.Row();
        follow.Controls.Add(Theme.Button("Kopiuj",()=>{if(lastAnswer!="")Clipboard.SetText(lastAnswer);},false));
        follow.Controls.Add(Theme.Button("Wyjaśnij",()=>Explain(),false));
        follow.Controls.Add(Theme.Button("Sprawdź innym modelem",()=>Verify(),false));
        follow.Controls.Add(Theme.Button("Wyczyść",()=>{lastAnswer="";answer.Text="";ClearTask();CloseOverlay();Status("Usunięto odpowiedź i kadr.",false);},false));home.Controls.Add(follow);
        var connections=Theme.Column();pages[1].Controls.Add(connections);
        connections.Controls.Add(Theme.Label("Twoje AI. Twój wybór.",22,true));
        connections.Controls.Add(Theme.Label("Plan ChatGPT lub osobno rozliczane API. Połączenie nigdy nie przełącza się samo.",11,false));
        provider=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Width=600};provider.Items.AddRange(providerNames);connections.Controls.Add(provider);
        connectionLabel=Theme.Label("",11,false);connectionLabel.MaximumSize=new Size(760,80);connections.Controls.Add(connectionLabel);
        accounts=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Width=600};connections.Controls.Add(accounts);
        var auth=Theme.Row();auth.Controls.Add(Theme.Button("Continue with ChatGPT",()=>SignIn(false),true));auth.Controls.Add(Theme.Button("Dodaj konto",()=>SignIn(true),false));
        auth.Controls.Add(Theme.Button("Zarządzaj użyciem ↗",()=>Process.Start(new ProcessStartInfo("https://chatgpt.com/settings/usage"){UseShellExecute=true}),false));
        auth.Controls.Add(Theme.Button("Wyloguj konto",()=>SignOut(),false));connections.Controls.Add(auth);
        connections.Controls.Add(Theme.Label("Klucz API · puste pole zachowuje zapisany klucz",11,false));key=Theme.Input(true);connections.Controls.Add(key);
        connections.Controls.Add(Theme.Label("Model · aktualna lista pochodzi od dostawcy",11,false));
        models=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Width=600};connections.Controls.Add(models);
        model=Theme.Input(false);connections.Controls.Add(model);
        var modelActions=Theme.Row();modelActions.Controls.Add(Theme.Button("Odśwież modele",()=>LoadModels(true),false));
        modelActions.Controls.Add(Theme.Button("★ Ulubiony",()=>Favorite(),false));modelActions.Controls.Add(Theme.Button("Zapisz połączenie",()=>SaveConnection(),true));connections.Controls.Add(modelActions);
        connections.Controls.Add(Theme.Label("Nie ma modelu na liście? Wpisz identyfikator. Dostęp potwierdzi dopiero zapytanie.",10,false));
        provider.SelectedIndexChanged+=(s,e)=>{if(building)return;Cancel();ClearTask();LoadConnection();};
        models.SelectedIndexChanged+=(s,e)=>{if(models.SelectedIndex>=0&&models.SelectedIndex<catalogRows.Count)model.Text=Data.String(catalogRows[models.SelectedIndex],"id");};
        accounts.SelectedIndexChanged+=(s,e)=>{if(!building&&accounts.SelectedIndex>=0)SelectAccount();};
        var looks=Theme.Column();pages[2].Controls.Add(looks);looks.Controls.Add(Theme.Label("Tak dyskretnie, jak potrzebujesz.",22,true));
        answerOnly=new CheckBox{Text="Tylko odpowiedź, bez wyjaśnień",AutoSize=true,Checked=!store.Settings.ContainsKey("answerOnly")||Data.Bool(store.Settings,"answerOnly")};looks.Controls.Add(answerOnly);
        style=Chooser(looks,"Prezentacja",new[]{"Karta","Sam tekst"},Data.String(store.Settings,"style","card")=="card"?0:1);
        position=Chooser(looks,"Pozycja",new[]{"Dół ekranu","Góra ekranu"},Data.String(store.Settings,"position")=="top"?1:0);
        indicator=Chooser(looks,"Analizowanie",new[]{"Pełny komunikat","Małe kropki","Wyłączone · krótki ! przy błędzie"},(int)Data.Number(store.Settings,"indicator",1));
        opacity=Number(looks,"Widoczność odpowiedzi (%)",5,100,Data.Number(store.Settings,"opacity",80));
        fontSize=Number(looks,"Rozmiar tekstu",11,28,Data.Number(store.Settings,"textSize",18));duration=Number(looks,"Czas odpowiedzi (sekundy)",3,30,Data.Number(store.Settings,"duration",8));
        quality=new CheckBox{Text="Ostrzegaj o małym, pustym lub słabo czytelnym kadrze",AutoSize=true,Checked=!store.Settings.ContainsKey("quality")||Data.Bool(store.Settings,"quality")};looks.Controls.Add(quality);
        persistent=new CheckBox{Text="Zachowuj historię po zamknięciu · szyfrowana na tym komputerze",AutoSize=true,Checked=Data.Bool(store.Settings,"persistentHistory")};looks.Controls.Add(persistent);
        looks.Controls.Add(Theme.Button("Zapisz wygląd",()=>SaveAppearance(),true));
        looks.Controls.Add(Theme.Label("Historia zapisuje tylko tekst. Ostatni kadr pozostaje w pamięci do 5 minut.",11,false));
        var history=Theme.Column();pages[3].Controls.Add(history);history.Controls.Add(Theme.Label("Wróć do odpowiedzi bez nowego zapytania.",20,true));
        historySearch=Theme.Input(false);history.Controls.Add(historySearch);historySearch.TextChanged+=(s,e)=>RenderHistory();
        history.Controls.Add(Theme.Button("Wyczyść historię",()=>{if(MessageBox.Show("Usunąć wszystkie zapisane odpowiedzi?","OKStudy",MessageBoxButtons.YesNo)==DialogResult.Yes){store.History.Clear();Save();RenderHistory();}},false));
        historyRows=Theme.Column();history.Controls.Add(historyRows);
    }
    private ComboBox Chooser(Control parent,string name,string[] names,int selected){parent.Controls.Add(Theme.Label(name,11,false));var box=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Width=600};box.Items.AddRange(names);box.SelectedIndex=Math.Max(0,Math.Min(names.Length-1,selected));parent.Controls.Add(box);return box;}
    private NumericUpDown Number(Control parent,string name,int min,int max,long value){parent.Controls.Add(Theme.Label(name,11,false));var n=new NumericUpDown{Minimum=min,Maximum=max,Value=Math.Max(min,Math.Min(max,value)),Width=160,BackColor=Theme.Card,ForeColor=Theme.Text};parent.Controls.Add(n);return n;}
    private void Status(string value,bool error){status.Text=value;status.ForeColor=error?Color.FromArgb(255,193,168):Theme.Muted;}
    private void ShowPage(int index){for(int i=0;i<4;i++){pages[i].Visible=i==index;tabs[i].BackColor=i==index?Theme.Lime:Theme.Card;tabs[i].ForeColor=i==index?Theme.Bg:Theme.Text;}
        if(index==1&&!preview)LoadModels(false);if(index==3)RenderHistory();}
    private string Provider {get{return provider.SelectedIndex<0?"chatgpt":providers[provider.SelectedIndex];}}
    private string SavedKey {get{return Data.String(Data.Object(store.Settings,"keys"),Provider);}}
    private string CatalogKey {get{return key!=null&&key.Text.Trim()!=""?key.Text.Trim():SavedKey;}}
    private string Scope {get{return store.Scope(Provider,activeAccount,CatalogKey);}}
    private void LoadConnection(){
        building=true;
        if(provider.SelectedIndex<0)provider.SelectedIndex=Math.Max(0,Array.IndexOf(providers,Data.String(store.Settings,"provider","chatgpt")));
        store.Settings["provider"]=Provider;key.Text="";key.Enabled=Provider!="chatgpt";accounts.Enabled=Provider=="chatgpt";
        model.Text=Data.String(Data.Object(store.Settings,"models"),Provider);building=false;
        connectionLabel.Text=Provider=="chatgpt"?"Połącz konto albo wybierz konto z lokalnego modułu OKStudy.":"Klucz będzie szyfrowany dla Twojego konta Windows. API ma osobne rozliczenie.";
        RefreshCatalog();currentModel.Text=providerNames[provider.SelectedIndex]+" · "+model.Text;
    }
    private bool SaveConnection(){
        if(!Regex.IsMatch(model.Text.Trim(),"^[\\w.:/-]{1,120}$")){Status("Wybierz lub wpisz prawidłowy model.",true);return false;}
        if(Provider=="chatgpt"&&(!Data.Bool(accountStatus,"connected")||!Data.Bool(accountStatus,"sharing"))){Status("Połącz konto i udziel dostępu do planu ChatGPT.",true);return false;}
        var keys=Data.Object(store.Settings,"keys");if(Provider!="chatgpt"){
            if(key.Text.Trim()!="")keys[Provider]=key.Text.Trim();
            if(Data.String(keys,Provider)==""){Status("Wklej klucz API dla wybranego dostawcy.",true);return false;}
        }
        Cancel();ClearTask();store.Settings["keys"]=keys;var choices=Data.Object(store.Settings,"models");choices[Provider]=model.Text.Trim();
        store.Settings["models"]=choices;store.Settings["provider"]=Provider;key.Text="";
        if(!Save())return false;RefreshCatalog();currentModel.Text=providerNames[provider.SelectedIndex]+" · "+model.Text;Status("Połączenie zapisane.",false);return true;
    }
    private bool Save(){try{store.Save();return true;}catch(Exception e){Status("Nie zapisano ustawień: "+e.Message,true);return false;}}
    private async void RefreshAccount(){
        try{accountStatus=await bridge.Call("status",null);ApplyAccount();if(Provider=="chatgpt")LoadModels(false);}catch(Exception e){Status(e.Message,true);}
    }
    private void ApplyAccount(){
        building=true;accounts.Items.Clear();var rows=Data.Rows(accountStatus,"accounts");activeAccount=Data.String(accountStatus,"activeId");
        foreach(var row in rows)accounts.Items.Add(Data.String(row,"label"));accounts.SelectedIndex=rows.FindIndex(x=>Data.String(x,"id")==activeAccount);building=false;
        if(Provider=="chatgpt")connectionLabel.Text=Data.Bool(accountStatus,"connected")?Data.String(accountStatus,"email")+" · "+(Data.Bool(accountStatus,"sharing")?"Korzystasz z planu ChatGPT":"Brak zgody na korzystanie z planu"):"Konto nie jest połączone.";
        RefreshCatalog();
    }
    private async void SignIn(bool additional){
        if(preview||busy)return;Cancel();ClearTask();Status("Dokończ logowanie w przeglądarce…",false);busy=true;
        try{accountStatus=await bridge.Call("signin",new Dictionary<string,object>{{"accountId",additional?"__new":activeAccount}});ApplyAccount();Status("Konto połączone. Pobierz modele i zapisz wybór.",false);LoadModels(true);}
        catch(Exception e){Status(e.Message,true);}finally{busy=false;}
    }
    private async void SelectAccount(){
        if(busy||preview)return;var rows=Data.Rows(accountStatus,"accounts");int i=accounts.SelectedIndex;if(i<0||i>=rows.Count)return;
        Cancel();ClearTask();try{accountStatus=await bridge.Call("select",new Dictionary<string,object>{{"accountId",Data.String(rows[i],"id")}});ApplyAccount();LoadModels(false);}catch(Exception e){Status(e.Message,true);}
    }
    private async void SignOut(){if(preview||busy)return;Cancel();ClearTask();try{accountStatus=await bridge.Call("signout",null);ApplyAccount();}catch(Exception e){Status(e.Message,true);}}
    private async void LoadModels(bool force){
        if(preview||loadingModels||Provider=="chatgpt"&&!Data.Bool(accountStatus,"connected"))return;
        if(Provider!="chatgpt"&&CatalogKey==""){if(force)Status("Wklej klucz, aby pobrać modele. Zapisz połączenie po wyborze modelu.",true);return;}
        string scope=Scope,p=Provider,account=activeAccount,catalogKey=CatalogKey;if(!force&&Data.Now-Data.Number(store.Settings,scope+".at",0)<21600000)return;
        loadingModels=true;Status("Pobieram aktualny katalog…",false);
        try{
            var result=await bridge.Call("models",new Dictionary<string,object>{{"provider",p},{"key",catalogKey},{"accountId",account}});
            store.Catalog(scope,Data.Rows(result,"models"));if(scope!=Scope)return;RefreshCatalog();Status("Pobrano "+catalogRows.Count+" modeli. Nowe pozycje mają oznaczenie Nowy przez 24 godziny.",false);
        }catch(Exception e){Status(e.Message,true);}finally{loadingModels=false;}
    }
    private void RefreshCatalog(){
        string scope=Scope,selected=model.Text;catalogRows=store.Catalog(scope);models.Items.Clear();
        foreach(var row in catalogRows)models.Items.Add(store.ModelLabel(scope,row));models.SelectedIndex=catalogRows.FindIndex(x=>Data.String(x,"id")==selected);model.Text=selected;
        favorites.Controls.Clear();foreach(var row in catalogRows.Where(x=>store.Favorites(scope).Contains(Data.String(x,"id"))).Take(2)){
            string id=Data.String(row,"id");favorites.Controls.Add(Theme.Button(store.ModelLabel(scope,row),()=>{model.Text=id;SaveConnection();},false));
        }
    }
    private void Favorite(){try{if(!Regex.IsMatch(model.Text,"^[\\w.:/-]{1,120}$"))throw new Exception("Najpierw wybierz model.");store.Favorite(Scope,model.Text);RefreshCatalog();}catch(Exception e){Status(e.Message,true);}}
    private void SaveAppearance(){
        store.Settings["answerOnly"]=answerOnly.Checked;store.Settings["quality"]=quality.Checked;store.Settings["persistentHistory"]=persistent.Checked;
        store.Settings["style"]=style.SelectedIndex==0?"card":"text";store.Settings["position"]=position.SelectedIndex==1?"top":"bottom";
        store.Settings["indicator"]=indicator.SelectedIndex;store.Settings["opacity"]=(int)opacity.Value;store.Settings["textSize"]=(int)fontSize.Value;store.Settings["duration"]=(int)duration.Value;
        if(Save())Status("Wygląd zapisany.",false);
    }
    private void Profile(string id){
        answerOnly.Checked=id!="study";store.Settings["voice"]=id=="voice";style.SelectedIndex=id=="discreet"?1:0;
        opacity.Value=id=="discreet"?18:80;fontSize.Value=id=="discreet"?14:18;duration.Value=id=="study"?30:id=="discreet"?6:12;
        indicator.SelectedIndex=id=="discreet"?2:id=="study"?0:1;SaveAppearance();Status("Profil został zmieniony.",false);
    }
    private Dictionary<string,object> Snapshot(){
        return new Dictionary<string,object>{{"provider",Provider},{"model",model.Text.Trim()},{"key",SavedKey},{"accountId",activeAccount},
            {"mode",answerOnly.Checked?"express":"tutor"},{"answerOnly",answerOnly.Checked},{"internet",false}};
    }
    private async void StartCapture(){
        if(preview||busy||capturing||cropping!=null)return;if(!SaveConnection())return;
        capturing=true;int captureEpoch=generation;
        var spec=Snapshot();string captured=null;bool visible=Visible;Hide();CloseOverlay();await Task.Delay(200);
        try {
            if(captureEpoch!=generation)return;
            Rectangle desktop=SystemInformation.VirtualScreen;
            if(desktop.Width<=0||desktop.Height<=0||(long)desktop.Width*desktop.Height>60000000)throw new Exception("Układ ekranów jest zbyt duży do przechwycenia. Zmniejsz rozdzielczość lub liczbę aktywnych monitorów.");
            using(var frame=new Bitmap(desktop.Width,desktop.Height,PixelFormat.Format32bppArgb)){
                using(var g=Graphics.FromImage(frame))g.CopyFromScreen(desktop.Location,Point.Empty,desktop.Size,CopyPixelOperation.SourceCopy);
                using(cropping=new CropForm(frame,desktop,quality.Checked)){
                    if(cropping.ShowDialog()!=DialogResult.OK){if(visible)Open();return;}
                    captured=cropping.ImageData;
                }cropping=null;
            }
            await Infer(spec,captured,false,null);
        }catch(Exception e){Status(e.Message,true);Open();}finally{cropping=null;capturing=false;}
    }
    private async Task Infer(Dictionary<string,object> spec,string image,bool verify,string original){
        if(busy)return;busy=true;int epoch=++generation;string originalModel=lastModel;var args=new Dictionary<string,object>(spec);args["image"]=image;
        int activity=indicator.SelectedIndex;string id=null;
        if(!verify&&activity<2){ShowOverlay(activity==1?"•••":"Analizuję zadanie…",true);}
        Status(verify?"Sprawdzam niezależnie drugim modelem…":"Analizuję zadanie…",false);
        try {
            var call=bridge.Call("infer",new Dictionary<string,object>{{"args",args}});id=bridge.LastId;
            var result=await call;if(epoch!=generation)return;CloseOverlay();string text=Data.String(result,"text");
            if(verify){using(var pair=new Form()){
                Theme.Style(pair,"Dwie niezależne odpowiedzi",740,570);var output=new RichTextBox{Dock=DockStyle.Fill,ReadOnly=true,BackColor=Theme.Card,ForeColor=Theme.Text,BorderStyle=BorderStyle.None,Font=new Font("Segoe UI",14),Text=originalModel+"\n"+original+"\n\n"+Data.String(spec,"model")+"\n"+text};pair.Controls.Add(output);
                var note=Theme.Label("Zgodność nie gwarantuje poprawności. Oceń obie odpowiedzi.",10,false);note.Dock=DockStyle.Bottom;pair.Controls.Add(note);Native.Exclude(pair);pair.ShowDialog(this);
            }}else{
                lastAnswer=text;lastModel=Data.String(spec,"model");answer.Text=text;
                lastImage=image;imageAt=Data.Now;lastSpec=new Dictionary<string,object>(spec);
                if(!Data.Bool(store.Settings,"voice"))ShowOverlay(text,false);
                else SpeakSystem(text);
                try{store.Add(text,lastModel);}catch(Exception e){Status("Odpowiedź gotowa, lecz historia nie została zapisana: "+e.Message,true);return;}
            }
            Status("Odpowiedź gotowa. Kadr dostępny przez 5 minut.",false);
        }catch(Exception e){if(epoch==generation){CloseOverlay();Status(e.Message,true);ShowOverlay("!",true);if(tray!=null){tray.BalloonTipTitle="OKStudy";tray.BalloonTipText=e.Message;tray.ShowBalloonTip(3000);}}}
        finally{if(epoch==generation)busy=false;}
    }
    private void Explain(){if(lastImage==null||Data.Now-imageAt>300000||lastSpec==null){Status("Kadr wygasł. Zaznacz zadanie ponownie.",true);return;}if(busy)return;
        var spec=new Dictionary<string,object>(lastSpec);spec["mode"]="tutor";spec["answerOnly"]=false;Open();Infer(spec,lastImage,false,null).ContinueWith(t=>{},TaskScheduler.Default);}
    private void Verify(){
        if(busy)return;if(lastImage==null||lastSpec==null||lastAnswer==""||Data.Now-imageAt>300000){Status("Kadr wygasł. Zaznacz zadanie ponownie.",true);return;}
        using(var dialog=new Form()){
            Theme.Style(dialog,"Sprawdź innym modelem",700,285);var content=Theme.Column();content.Padding=new Padding(24);dialog.Controls.Add(content);
            var notice=Theme.Label("Drugi model otrzyma ten sam kadr bez pierwszej odpowiedzi.\nTo dodatkowe użycie planu lub płatnego API.",12,false);content.Controls.Add(notice);
            var choice=new ComboBox{Width=600,DropDownStyle=ComboBoxStyle.DropDown};
            string taskScope=store.Scope(Data.String(lastSpec,"provider"),Data.String(lastSpec,"accountId"),Data.String(lastSpec,"key"));
            foreach(var row in store.Catalog(taskScope)){string id=Data.String(row,"id");if(id!=Data.String(lastSpec,"model"))choice.Items.Add(id);}if(choice.Items.Count>0)choice.SelectedIndex=0;
            content.Controls.Add(choice);var actions=Theme.Row();actions.Controls.Add(Theme.Button("Sprawdź",()=>{
                string id=choice.Text.Trim();if(!Regex.IsMatch(id,"^[\\w.:/-]{1,120}$")||id==Data.String(lastSpec,"model")){MessageBox.Show("Wybierz inny, prawidłowy model.","OKStudy");return;}
                dialog.DialogResult=DialogResult.OK;dialog.Close();},true));actions.Controls.Add(Theme.Button("Anuluj",()=>dialog.Close(),false));content.Controls.Add(actions);
            if(dialog.ShowDialog(this)==DialogResult.OK){var spec=new Dictionary<string,object>(lastSpec);spec["model"]=choice.Text.Trim();Infer(spec,lastImage,true,lastAnswer).ContinueWith(t=>{},TaskScheduler.Default);}
        }
    }
    private void SpeakSystem(string text){try{if(speech==null)speech=new System.Speech.Synthesis.SpeechSynthesizer();speech.SpeakAsyncCancelAll();speech.SpeakAsync(text);}catch(Exception e){Status(e.Message,true);}}
    private void Repeat(){if(lastAnswer==""){Status("Brak ostatniej odpowiedzi.",false);return;}ShowOverlay(lastAnswer,false);Status("Powtórzono bez nowego zapytania.",false);}
    private void ShowOverlay(string text,bool transient){CloseOverlay();var settings=new DictionarySettings(store.Settings);if(transient){settings.Duration=text=="!"?2:30;settings.Opacity=1;settings.Card=text.Length>3;}
        overlay=new AnswerOverlay(text,settings);overlay.Show();}
    private void CloseOverlay(){if(overlay!=null){overlay.Close();overlay.Dispose();overlay=null;}}
    private void Cancel(){generation++;if(!preview)bridge.CancelAll();if(speech!=null)speech.SpeakAsyncCancelAll();busy=false;CloseOverlay();Status("Przerwano. Ctrl + Alt + O rozpoczyna nowe zaznaczenie.",false);}
    private void ClearTask(){lastImage=null;lastSpec=null;imageAt=0;}
    private void Open(){Show();WindowState=FormWindowState.Normal;Activate();}
    private void RenderHistory(){
        historyRows.SuspendLayout();foreach(Control c in historyRows.Controls.Cast<Control>().ToArray())c.Dispose();historyRows.Controls.Clear();
        string search=historySearch.Text.Trim();
        foreach(var row in store.History.Where(x=>(Data.String(x,"text")+" "+Data.String(x,"model")).IndexOf(search,StringComparison.CurrentCultureIgnoreCase)>=0).OrderByDescending(x=>Data.Bool(x,"pinned"))){
            var entry=row;string text=Data.String(row,"text");var line=Theme.Row();line.Controls.Add(Theme.Button((Data.Bool(row,"pinned")?"★ ":"")+text.Substring(0,Math.Min(44,text.Length)),()=>{Cancel();lastAnswer=text;lastModel=Data.String(entry,"model");answer.Text=text;ClearTask();ShowPage(0);Repeat();},false));
            line.Controls[0].Width=410;line.Controls.Add(Theme.Button(Data.Bool(row,"pinned")?"Odepnij":"Przypnij",()=>{
                if(!Data.Bool(entry,"pinned")&&store.History.Count(x=>Data.Bool(x,"pinned"))>=20){Status("Możesz przypiąć 20 odpowiedzi.",true);return;}
                entry["pinned"]=!Data.Bool(entry,"pinned");Save();RenderHistory();},false));line.Controls.Add(Theme.Button("Usuń",()=>{store.History.Remove(entry);Save();RenderHistory();},false));historyRows.Controls.Add(line);
        }historyRows.ResumeLayout();
    }
    protected override void OnShown(EventArgs e){base.OnShown(e);Native.Exclude(this);if(preview||tray!=null)return;
        tray=new NotifyIcon{Icon=Icon,Text="OKStudy · Ctrl+Alt+O",Visible=true};var menu=new ContextMenuStrip();
        menu.Items.Add("Zaznacz zadanie",null,(s,a)=>StartCapture());menu.Items.Add("Powtórz odpowiedź",null,(s,a)=>Repeat());menu.Items.Add("Otwórz OKStudy",null,(s,a)=>Open());menu.Items.Add("Zakończ",null,(s,a)=>{exiting=true;Close();});tray.ContextMenuStrip=menu;tray.DoubleClick+=(s,a)=>Open();
        bool hotkeys=true;hotkeys&=Native.RegisterHotKey(Handle,1,0x4003,(uint)Keys.O);hotkeys&=Native.RegisterHotKey(Handle,2,0x4003,(uint)Keys.R);hotkeys&=Native.RegisterHotKey(Handle,3,0x4003,(uint)Keys.K);
        if(!hotkeys)Status("Jeden ze skrótów jest zajęty przez inny program. Możesz użyć ikony OKStudy przy zegarze.",true);
        RefreshAccount();
    }
    protected override void WndProc(ref Message m){if(m.Msg==0x0312){int id=m.WParam.ToInt32();if(id==1)StartCapture();if(id==2)Repeat();if(id==3){if(cropping!=null)cropping.Close();Cancel();}}base.WndProc(ref m);}
    protected override void Dispose(bool disposing){if(disposing&&!managedDisposed){managedDisposed=true;expiry.Dispose();if(IsHandleCreated)for(int i=1;i<=3;i++)Native.UnregisterHotKey(Handle,i);CloseOverlay();if(tray!=null){tray.Visible=false;tray.Dispose();}if(speech!=null)speech.Dispose();bridge.Dispose();ClearTask();}base.Dispose(disposing);}
}

internal static class SelfCheck {
    internal static void BridgeCheck(string root){
        using(var bridge=new Bridge(root)){
            var models=bridge.Call("models",new Dictionary<string,object>{{"provider","openai"},{"key","mock-key"}}).GetAwaiter().GetResult();
            if(Data.String(Data.Rows(models,"models").First(),"id")!="mock-model")throw new Exception("GUI bridge catalog failed");
            var task=new Dictionary<string,object>{{"provider","openai"},{"key","mock-key"},{"model","mock-model"},{"mode","express"},{"answerOnly",true},{"image","data:image/png;base64,YQ=="}};
            var result=bridge.Call("infer",new Dictionary<string,object>{{"args",task}}).GetAwaiter().GetResult();
            if(Data.String(result,"text")!="Zażółć gęślą jaźń")throw new Exception("GUI bridge UTF-8 inference failed");
        }
    }
    internal static void Run(){
        using(var image=new Bitmap(160,60)){using(var g=Graphics.FromImage(image))g.Clear(Color.White);if(ImageQuality.Inspect(image)==null)throw new Exception("Empty image check failed");
            string data=ImageQuality.Encode(image);if(!data.StartsWith("data:image/png;base64,"))throw new Exception("PNG encoding failed");}
        string path=Path.Combine(Path.GetTempPath(),"OKStudy-selfcheck-"+Guid.NewGuid().ToString("N"),"settings.dat");
        try {var store=new Store(path);store.Settings["test"]="Zażółć gęślą jaźń";store.Save();var restored=new Store(path);restored.Load();if(Data.String(restored.Settings,"test")!="Zażółć gęślą jaźń")throw new Exception("Encrypted storage failed");
            restored.Catalog("a",new List<Dictionary<string,object>>{new Dictionary<string,object>{{"id","old"},{"name","Old"}}});restored.Catalog("a",new List<Dictionary<string,object>>{new Dictionary<string,object>{{"id","old"},{"name","Old"}},new Dictionary<string,object>{{"id","new"},{"name","New"}}});
            if(!restored.ModelLabel("a",restored.Catalog("a").First(x=>Data.String(x,"id")=="new")).Contains("Nowy"))throw new Exception("New model marker failed");
        }finally{if(File.Exists(path))File.Delete(path);if(Directory.Exists(Path.GetDirectoryName(path)))Directory.Delete(Path.GetDirectoryName(path));}
    }
}
