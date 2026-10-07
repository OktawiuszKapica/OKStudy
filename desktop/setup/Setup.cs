using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;

internal static class DesktopSetup {
    internal static readonly string Target=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"OKStudy","desktop","app");
    internal const string RegistryPath="Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OKStudyDesktop";
    internal static readonly string[] Names={"OKStudy.exe","Uninstall.exe","node.exe","bridge.cjs","Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.WinForms.dll","WebView2Loader.dll","WEBVIEW2-LICENSE.txt","WebView2Bootstrapper.exe","NODE-LICENSE.txt","THIRD_PARTY_LICENSES.md","README.txt","ui/index.html","ui/studio.css","ui/native.css","ui/app.js","ui/setup.html","ui/setup.js","bundle.json"};
    internal static bool IsTest(string target){string root=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,"artifacts"))+Path.DirectorySeparatorChar;return Path.GetFullPath(target).StartsWith(root,StringComparison.OrdinalIgnoreCase);}
    internal static string CheckedTarget(string target,bool test){
        string full=Path.GetFullPath(target).TrimEnd(Path.DirectorySeparatorChar);if(test?!IsTest(full):!string.Equals(full,Target,StringComparison.OrdinalIgnoreCase))throw new Exception("Nieprawidłowy katalog programu.");
        for(string p=full;!string.IsNullOrEmpty(p);p=Path.GetDirectoryName(p)){if(Directory.Exists(p)&&(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new Exception("Katalog programu nie może być dowiązaniem.");}
        return full;
    }
    private static string PathIn(string target,string relative){if(!Names.Contains(relative))throw new Exception("Nieprawidłowy plik paczki.");return Path.Combine(target,relative.Replace('/',Path.DirectorySeparatorChar));}
    private static void CheckTree(string target){
        if(!Directory.Exists(target))return;
        foreach(string p in Directory.GetFileSystemEntries(target)){
            if((File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new Exception("W katalogu programu znaleziono dowiązanie. Usuń je przed aktualizacją.");
            if(Directory.Exists(p))CheckTree(p);
        }
    }
    internal static void StopApp(string target){
        foreach(var process in Process.GetProcessesByName("OKStudy"))using(process){
            try{if(!string.Equals(process.MainModule.FileName,Path.Combine(target,"OKStudy.exe"),StringComparison.OrdinalIgnoreCase))continue;
                if(process.MainWindowHandle!=IntPtr.Zero)Native.PostMessage(process.MainWindowHandle,Native.ExitMessage,IntPtr.Zero,IntPtr.Zero);
                if(!process.WaitForExit(2500)){process.Kill();process.WaitForExit(5000);}
            }catch(InvalidOperationException){}catch(System.ComponentModel.Win32Exception){}
        }
    }
    internal static void Install(string target,bool register){
        target=CheckedTarget(target,!register);CheckTree(target);
        var payload=new Dictionary<string,byte[]>();long size=0;
        using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))using(var archive=new ZipArchive(stream,ZipArchiveMode.Read)){
            foreach(var entry in archive.Entries){string name=entry.FullName.Replace('\\','/');if(name.EndsWith("/"))continue;
                size+=entry.Length;if(size>220000000||!Names.Contains(name)||payload.ContainsKey(name))throw new Exception("Nieprawidłowa zawartość instalatora.");
                using(var input=entry.Open())using(var output=new MemoryStream()){input.CopyTo(output);payload.Add(name,output.ToArray());}
            }
        }
        if(payload.Count!=Names.Length)throw new Exception("Instalator jest niekompletny.");
        var manifest=Data.Parse(Encoding.UTF8.GetString(payload["bundle.json"]));
        if(Data.String(manifest,"product")!="OKStudy.Desktop")throw new Exception("Nieprawidłowa paczka.");
        var hashes=Data.Object(manifest,"hashes");using(var sha=SHA256.Create())foreach(var name in Names.Where(x=>x!="bundle.json"))if(BitConverter.ToString(sha.ComputeHash(payload[name])).Replace("-","").ToLowerInvariant()!=Data.String(hashes,name))throw new Exception("Uszkodzony plik: "+name);
        string stage=target+".stage-"+Guid.NewGuid().ToString("N"),backup=target+".previous-"+Guid.NewGuid().ToString("N");
        // These resolved siblings remain in the verified target parent; stage
        // contains only the fixed allowlist. Unknown old files are preserved.
        Directory.CreateDirectory(stage);
        try{
            foreach(var name in Names){string p=PathIn(stage,name);Directory.CreateDirectory(Path.GetDirectoryName(p));File.WriteAllBytes(p,payload[name]);}
            if(register)StopApp(target);
            bool moved=false;
            try{if(Directory.Exists(target)){Directory.Move(target,backup);moved=true;}Directory.Move(stage,target);
                if(register)Register(target,Data.String(manifest,"version"));
            }catch{if(Directory.Exists(target)&&moved){RemoveAllowed(target);}if(moved&&Directory.Exists(backup)&&!Directory.Exists(target))Directory.Move(backup,target);throw;}
            if(Directory.Exists(backup))RemoveAllowed(backup);
        }finally{if(Directory.Exists(stage))RemoveAllowed(stage);}
    }
    private static void Shortcut(string target){
        string menu=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"OKStudy");Directory.CreateDirectory(menu);
        var type=Type.GetTypeFromProgID("WScript.Shell");object shell=Activator.CreateInstance(type),link=null;
        try{link=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{Path.Combine(menu,"OKStudy Windows.lnk")});var t=link.GetType();t.InvokeMember("TargetPath",BindingFlags.SetProperty,null,link,new object[]{Path.Combine(target,"OKStudy.exe")});t.InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,link,new object[]{target});t.InvokeMember("Save",BindingFlags.InvokeMethod,null,link,null);}
        finally{if(link!=null)Marshal.FinalReleaseComObject(link);Marshal.FinalReleaseComObject(shell);}
    }
    private static void Register(string target,string version){
        Shortcut(target);using(var key=Registry.CurrentUser.CreateSubKey(RegistryPath)){
            key.SetValue("DisplayName","OKStudy Windows");key.SetValue("DisplayVersion",version);key.SetValue("Publisher","Oktawiusz Kapica");key.SetValue("InstallLocation",target);key.SetValue("DisplayIcon",Path.Combine(target,"OKStudy.exe"));key.SetValue("UninstallString","\""+Path.Combine(target,"Uninstall.exe")+"\"");key.SetValue("NoModify",1,RegistryValueKind.DWord);key.SetValue("NoRepair",1,RegistryValueKind.DWord);key.SetValue("EstimatedSize",40000,RegistryValueKind.DWord);
        }
    }
    private static void RemoveAllowed(string target){
        CheckTree(target);foreach(string name in Names){string p=PathIn(target,name);if(File.Exists(p))File.Delete(p);}
        string ui=Path.Combine(target,"ui");if(Directory.Exists(ui)&&!Directory.EnumerateFileSystemEntries(ui).Any())Directory.Delete(ui);
        if(Directory.Exists(target)&&!Directory.EnumerateFileSystemEntries(target).Any())Directory.Delete(target);
    }
    internal static void Uninstall(string target,bool deleteData,bool test){
        target=CheckedTarget(target,test);CheckTree(target);
        if(!File.Exists(Path.Combine(target,"bundle.json")))throw new Exception("Nie znaleziono zainstalowanego OKStudy.");
        var bundle=Data.Parse(File.ReadAllText(Path.Combine(target,"bundle.json")));if(Data.String(bundle,"product")!="OKStudy.Desktop")throw new Exception("Nieprawidłowa instalacja.");
        if(!test)StopApp(target);RemoveAllowed(target);
        if(test)return;
        string menu=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"OKStudy");string shortcut=Path.Combine(menu,"OKStudy Windows.lnk");if(File.Exists(shortcut))File.Delete(shortcut);if(Directory.Exists(menu)&&!Directory.EnumerateFileSystemEntries(menu).Any())Directory.Delete(menu);
        Registry.CurrentUser.DeleteSubKeyTree(RegistryPath,false);
        if(deleteData){string settings=Path.Combine(Path.GetDirectoryName(Target),"settings.dat");foreach(string p in new[]{settings,settings+".new"})if(File.Exists(p))File.Delete(p);}
        string cache=Path.GetFullPath(Path.Combine(Path.GetDirectoryName(Target),"webview"));
        if(cache!=Path.GetFullPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"OKStudy","desktop","webview")))throw new Exception("Nieprawidłowy katalog pamięci widoku.");
        if(Directory.Exists(cache)){CheckTree(cache);try{Directory.Delete(cache,true);}catch(IOException){}}
        // The companion vault is shared with the extension and is never removed.
    }
}

internal static class SetupProgram {
    private static string temporary;
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] private static extern bool SetDllDirectory(string path);
    [STAThread] private static int Main(string[] args){
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        try{
            if(args.Length==2&&args[0]=="--test-install"){DesktopSetup.Install(args[1],false);return 0;}
            if(args.Length==2&&args[0]=="--test-uninstall"){DesktopSetup.Uninstall(args[1],false,true);return 0;}
            Prepare();
            return Run(args);
        }catch(Exception e){if(args.Length>0&&args[0].StartsWith("--test-")){Console.Error.WriteLine(e.Message);return 1;}MessageBox.Show(e.Message,"OKStudy",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
        finally{
            // DLLs may still be loaded; delete only named files that are unlocked.
            if(temporary!=null)foreach(string f in Directory.GetFiles(temporary)){try{File.Delete(f);}catch(IOException){}catch(UnauthorizedAccessException){}}
        }
    }
    private static void Prepare(){
        temporary=Path.Combine(Path.GetTempPath(),"OKStudy-wizard-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temporary);
        foreach(string name in new[]{"Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.WinForms.dll","WebView2Loader.dll","WebView2Bootstrapper.exe"}){
            using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream(name))using(var output=File.Create(Path.Combine(temporary,name)))input.CopyTo(output);
        }
        using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream("wizard.zip"))using(var archive=new ZipArchive(input,ZipArchiveMode.Read))foreach(var entry in archive.Entries){string name=entry.FullName.Replace('\\','/');if(!new[]{"index.html","studio.css","native.css","app.js","setup.html","setup.js"}.Contains(name))throw new Exception("Nieprawidłowy widok instalatora.");using(var source=entry.Open())using(var output=File.Create(Path.Combine(temporary,name)))source.CopyTo(output);}
        AppDomain.CurrentDomain.AssemblyResolve+=(s,e)=>{string name=new AssemblyName(e.Name).Name;if(name!="Microsoft.Web.WebView2.Core"&&name!="Microsoft.Web.WebView2.WinForms")return null;return Assembly.LoadFrom(Path.Combine(temporary,name+".dll"));};SetDllDirectory(temporary);
    }
    [MethodImpl(MethodImplOptions.NoInlining)] private static int Run(string[] args){
        bool uninstall=Path.GetFileName(Application.ExecutablePath).StartsWith("Uninstall",StringComparison.OrdinalIgnoreCase)||args.Contains("--uninstall");
        if(args.Length==3&&args[0]=="--preview"){Application.Run(new WizardForm(temporary,args[2]=="uninstall",args[1]));return File.Exists(args[1])?0:1;}
        if(uninstall&&Path.GetDirectoryName(Application.ExecutablePath).Equals(DesktopSetup.Target,StringComparison.OrdinalIgnoreCase)){
            // Run the standalone embedded wizard outside the target, so its own
            // EXE and WebView libraries can be deleted during uninstall.
            string copy=Path.Combine(temporary,"Uninstall.exe");File.Copy(Application.ExecutablePath,copy);Process.Start(new ProcessStartInfo(copy,"--uninstall"){UseShellExecute=false,CreateNoWindow=true});return 0;
        }
        try{CoreWebView2Environment.GetAvailableBrowserVersionString();}
        catch(WebView2RuntimeNotFoundException){Application.Run(new RuntimeForm(temporary,uninstall));return 0;}
        Application.Run(new WizardForm(temporary,uninstall,null));return 0;
    }
}

internal sealed class WizardForm : WebShell {
    private readonly bool uninstall;private readonly string previewPath;private string phase="welcome",status="Wszystko gotowe.",note="";
    internal WizardForm(string folder,bool remove,string preview) : base(folder,"setup.html",Path.Combine(folder,"webview"),850,590){uninstall=remove;previewPath=preview;Text="OKStudy · "+(remove?"odinstalowanie":"instalacja");if(preview!=null){StartPosition=FormStartPosition.Manual;Location=new Point(-32000,-32000);}}
    private void Push(){Post(new{type="wizard",mode=uninstall?"uninstall":"install",phase=phase,status=status,path=DesktopSetup.Target,note=note});}
    protected override async Task ViewReady(){Push();if(previewPath!=null){await Task.Delay(750);using(var file=File.Create(previewPath))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,file);Close();}}
    protected override void Trace(string text){if(previewPath!=null)File.AppendAllText(previewPath+".trace.txt",text+Environment.NewLine);}
    protected override void ViewError(string error){phase="welcome";status=error;Push();}
    protected override async Task<object> Command(string action,Dictionary<string,object> args){
        if(phase=="working")return null;
        if(action=="launch"&&phase=="done"&&!uninstall){Process.Start(Path.Combine(DesktopSetup.Target,"OKStudy.exe"));Close();return null;}
        if(action=="finish"&&phase=="done"){Close();return null;}
        if(action!=(uninstall?"uninstall":"install"))throw new Exception("Nieobsługiwana operacja instalatora.");
        phase="working";status=uninstall?"Usuwam program…":"Instaluję OKStudy…";Push();
        bool clear=Data.Bool(args,"deleteData");await Task.Run(()=>{if(uninstall)DesktopSetup.Uninstall(DesktopSetup.Target,clear,false);else DesktopSetup.Install(DesktopSetup.Target,true);});
        phase="done";status=uninstall?"OKStudy został odinstalowany.":"Instalacja ukończona.";note=clear?"Ustawienia i lokalna historia Windows zostały usunięte. Współdzielone konto ChatGPT pozostaje dostępne.":"Ustawienia i lokalna historia zostały zachowane. Współdzielone konto ChatGPT pozostaje dostępne.";Push();return null;
    }
    protected override void OnFormClosing(FormClosingEventArgs e){if(phase=="working")e.Cancel=true;base.OnFormClosing(e);}
}

// When the runtime is missing, the installer still has a usable local interface.
// Uninstall never installs a dependency just to remove the application.
internal sealed class RuntimeForm : Form {
    internal RuntimeForm(string folder,bool uninstall){
        Theme.Style(this,"OKStudy",760,450);var column=Theme.Column();column.Padding=new Padding(35);Controls.Add(column);column.Controls.Add(Theme.Label("OKStudy",28,true));column.Controls.Add(Theme.Label(uninstall?"Usunąć OKStudy Windows?":"Jeszcze jeden mały krok.",22,true));
        var note=Theme.Label(uninstall?"Usuń program, zachowując ustawienia i konto ChatGPT.":"Nowy widok korzysta z Microsoft WebView2.\nZainstalujemy oficjalny składnik Microsoft na Twoim koncie.",12,false);column.Controls.Add(note);
        var button=Theme.Button(uninstall?"Odinstaluj OKStudy":"Zainstaluj WebView2",()=>{},true);button.Width=270;column.Controls.Add(button);
        bool done=false;
        button.Click+=async(s,e)=>{if(done){Close();return;}button.Enabled=false;try{if(uninstall){await Task.Run(()=>DesktopSetup.Uninstall(DesktopSetup.Target,false,false));note.Text="OKStudy został usunięty.";button.Text="Zamknij";button.Enabled=true;done=true;}
            else{using(var p=Process.Start(new ProcessStartInfo(Path.Combine(folder,"WebView2Bootstrapper.exe"),"/silent /install"){UseShellExecute=false,CreateNoWindow=true})){await Task.Run(()=>p.WaitForExit());if(p.ExitCode!=0)throw new Exception("Instalacja WebView2 nie powiodła się. Kod: "+p.ExitCode);}Hide();using(var wizard=new WizardForm(folder,false,null))wizard.ShowDialog();Close();}}
            catch(Exception error){note.Text=error.Message;button.Enabled=true;}};
    }
}
