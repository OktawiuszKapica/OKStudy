using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

internal static class DesktopSetup {
    internal static readonly string Target=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"OKStudy","desktop","app");
    internal static void Install(string target,bool shortcut){
        string[] allowed={"OKStudy.exe","node.exe","bridge.cjs","NODE-LICENSE.txt","THIRD_PARTY_LICENSES.md","README.txt","bundle.json"};
        var payload=new Dictionary<string,byte[]>();long size=0;
        using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))using(var archive=new ZipArchive(stream,ZipArchiveMode.Read)){
            foreach(var entry in archive.Entries){
                size+=entry.Length;if(size>180000000||!allowed.Contains(entry.FullName)||payload.ContainsKey(entry.FullName))throw new Exception("Nieprawidłowa zawartość instalatora.");
                using(var input=entry.Open())using(var output=new MemoryStream()){input.CopyTo(output);payload.Add(entry.FullName,output.ToArray());}
            }
        }
        if(payload.Count!=allowed.Length)throw new Exception("Instalator jest niekompletny.");
        var hashes=Data.Object(Data.Parse(Encoding.UTF8.GetString(payload["bundle.json"])),"hashes");
        using(var sha=SHA256.Create())foreach(var file in allowed.Where(x=>x!="bundle.json")){
            if(BitConverter.ToString(sha.ComputeHash(payload[file])).Replace("-","").ToLowerInvariant()!=Data.String(hashes,file))throw new Exception("Uszkodzony plik: "+file);
        }
        Directory.CreateDirectory(target);
        // Every path is a fixed allowlisted basename; settings and credentials live elsewhere.
        foreach(var file in allowed)File.WriteAllBytes(Path.Combine(target,file),payload[file]);
        if(shortcut){
            string menu=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"OKStudy");Directory.CreateDirectory(menu);
            var type=Type.GetTypeFromProgID("WScript.Shell");object shell=Activator.CreateInstance(type);
            object link=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{Path.Combine(menu,"OKStudy Windows.lnk")});
            var t=link.GetType();t.InvokeMember("TargetPath",BindingFlags.SetProperty,null,link,new object[]{Path.Combine(target,"OKStudy.exe")});
            t.InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,link,new object[]{target});t.InvokeMember("Save",BindingFlags.InvokeMethod,null,link,null);
            System.Runtime.InteropServices.Marshal.FinalReleaseComObject(link);System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);
        }
    }
    [STAThread] private static int Main(string[] args){
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        try{
            if(args.Length==2&&args[0]=="--test-install"){
                string root=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,"artifacts"))+Path.DirectorySeparatorChar;
                string target=Path.GetFullPath(args[1]);if(!target.StartsWith(root,StringComparison.OrdinalIgnoreCase))throw new Exception("Testowy katalog musi należeć do artifacts tego projektu.");
                Install(target,false);return 0;
            }
            Application.Run(new SetupForm());return 0;
        }catch(Exception e){MessageBox.Show(e.Message,"OKStudy · instalator",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
    }
}
internal sealed class SetupForm : Form {
    internal SetupForm(){
        Theme.Style(this,"Zainstaluj OKStudy Windows",700,460);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;
        var column=Theme.Column();column.Padding=new Padding(32,24,32,24);Controls.Add(column);
        column.Controls.Add(Theme.Label("OKStudy / Windows",26,true));column.Controls.Add(Theme.Label("Twoja pomoc w każdym programie.",20,true));
        var description=Theme.Label("Zaznacz zadanie w PDF-ie, Wordzie lub przeglądarce.\nOdpowiedź pojawi się nad programem.\n\nCtrl + Alt + O  ·  zaznacz fragment\nCtrl + Alt + R  ·  powtórz odpowiedź\nCtrl + Alt + K  ·  przerwij",12,false);column.Controls.Add(description);
        var note=Theme.Label("Instalacja tylko na Twoim koncie Windows.\nPołączenie z ChatGPT lub API ustawisz po uruchomieniu.",11,false);column.Controls.Add(note);
        var install=Theme.Button("Zainstaluj OKStudy",()=>{},true);install.Width=300;
        bool installed=false;
        install.Click+=(s,e)=>{
            if(installed){System.Diagnostics.Process.Start(Path.Combine(DesktopSetup.Target,"OKStudy.exe"));Close();return;}
            install.Enabled=false;
            try{DesktopSetup.Install(DesktopSetup.Target,true);note.Text="Gotowe. OKStudy znajdziesz w menu Start.";install.Text="Uruchom OKStudy";
                installed=true;
            }catch(Exception error){note.Text=error.Message;}finally{install.Enabled=true;}
        };
        column.Controls.Add(install);
    }
}
