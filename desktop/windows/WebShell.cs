using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// One renderer for Studio and the install/remove wizard. No remote UI or generic
// native proxy: only typed, allowlisted messages from this local document.
internal abstract class WebShell : Form {
    protected WebView2 web;
    protected bool ready,disposed;
    private readonly string folder,page,profile;
    protected WebShell(string ui,string document,string userData,int width,int height) {
        folder=ui;page=document;profile=userData;
        Theme.Style(this,"OKStudy",width,height);FormBorderStyle=FormBorderStyle.None;
        MinimumSize=new Size(760,580);Padding=new Padding(0);
        Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        web=new WebView2 {Dock=DockStyle.Fill,DefaultBackgroundColor=Theme.Bg};Controls.Add(web);
    }
    protected override async void OnShown(EventArgs e) {
        base.OnShown(e);
        try {
            Trace("creating renderer");
            var environment=await CoreWebView2Environment.CreateAsync(null,profile);
            if(disposed)return;
            await web.EnsureCoreWebView2Async(environment);
            Trace("renderer ready");
            var core=web.CoreWebView2;var settings=core.Settings;
            settings.AreHostObjectsAllowed=false;settings.AreDefaultContextMenusEnabled=false;
            settings.AreDefaultScriptDialogsEnabled=false;settings.AreBrowserAcceleratorKeysEnabled=false;
            settings.AreDevToolsEnabled=false;settings.IsStatusBarEnabled=false;settings.IsZoomControlEnabled=false;
            core.SetVirtualHostNameToFolderMapping("okstudy.local",folder,CoreWebView2HostResourceAccessKind.Deny);
            core.NavigationStarting+=(s,a)=>{if(a.Uri!="https://okstudy.local/"+page)a.Cancel=true;};
            core.FrameNavigationStarting+=(s,a)=>a.Cancel=true;
            core.NewWindowRequested+=(s,a)=>a.Handled=true;
            core.PermissionRequested+=(s,a)=>a.State=CoreWebView2PermissionState.Deny;
            core.DownloadStarting+=(s,a)=>a.Cancel=true;
            core.WebMessageReceived+=Message;
            core.NavigationCompleted+=(s,a)=>Trace("navigation "+a.IsSuccess+" "+a.WebErrorStatus);
            core.ProcessFailed+=(s,a)=>{ready=false;MessageBox.Show("Widok programu został przerwany. Uruchom OKStudy ponownie.","OKStudy");};
            core.Navigate("https://okstudy.local/"+page);
        } catch(Exception error) {
            Trace(error.ToString());
            MessageBox.Show("Nie udało się otworzyć widoku OKStudy.\n"+error.Message+"\nJeśli brakuje WebView2, uruchom instalator OKStudy.","OKStudy",MessageBoxButtons.OK,MessageBoxIcon.Error);
            CloseAfterFailure();
        }
    }
    protected virtual void CloseAfterFailure(){Close();}
    protected virtual void Trace(string text){}
    private async void Message(object sender,CoreWebView2WebMessageReceivedEventArgs e) {
        Trace("message origin "+e.Source);
        if(disposed||e.Source!="https://okstudy.local/"+page)return;
        string id="";
        try {
            if(e.WebMessageAsJson.Length>16000)throw new Exception("Nieprawidłowa wiadomość widoku.");
            var m=Data.Parse(e.WebMessageAsJson);id=Data.String(m,"id");
            string action=Data.String(m,"action");
            Trace("action "+action);
            if(action=="ready"){ready=true;await ViewReady();return;}
            if(action=="drag"){Native.Drag(this);return;}
            if(action=="minimize"){WindowState=FormWindowState.Minimized;return;}
            if(action=="maximize"){MaximizedBounds=Screen.FromControl(this).WorkingArea;WindowState=WindowState==FormWindowState.Maximized?FormWindowState.Normal:FormWindowState.Maximized;return;}
            if(action=="close"){Close();return;}
            if(!System.Text.RegularExpressions.Regex.IsMatch(id,"^[a-zA-Z0-9-]{1,80}$"))return;
            var result=await Command(action,Data.Object(m,"args"));
            Post(new {type="reply",id=id,ok=true,result=result});
        } catch(Exception error) {
            Post(new {type="reply",id=id,ok=false,error=error.Message});
            ViewError(error.Message);
        }
    }
    protected void Post(object message){if(ready&&!disposed&&web.CoreWebView2!=null&&web.Source!=null&&web.Source.AbsoluteUri=="https://okstudy.local/"+page)web.CoreWebView2.PostWebMessageAsJson(Data.Json.Serialize(message));}
    protected abstract Task ViewReady();
    protected abstract Task<object> Command(string action,Dictionary<string,object> args);
    protected abstract void ViewError(string error);
    protected override void OnResize(EventArgs e){
        base.OnResize(e);if(Width<32||Height<32)return;var old=Region;
        if(WindowState==FormWindowState.Maximized)Region=null;
        else using(var path=new System.Drawing.Drawing2D.GraphicsPath()){int r=30;path.AddArc(0,0,r,r,180,90);path.AddArc(Width-r,0,r,r,270,90);path.AddArc(Width-r,Height-r,r,r,0,90);path.AddArc(0,Height-r,r,r,90,90);path.CloseFigure();Region=new Region(path);}
        if(old!=null)old.Dispose();
    }
    protected override void WndProc(ref Message m) {
        if(m.Msg==0x84&&WindowState!=FormWindowState.Maximized){
            base.WndProc(ref m);var p=PointToClient(new Point((short)((long)m.LParam&65535),(short)(((long)m.LParam>>16)&65535)));
            int gap=7;bool l=p.X<gap,r=p.X>=ClientSize.Width-gap,t=p.Y<gap,b=p.Y>=ClientSize.Height-gap;
            if(l||r||t||b)m.Result=new IntPtr(t?(l?13:r?14:12):b?(l?16:r?17:15):l?10:11);return;
        }base.WndProc(ref m);
    }
    protected override void Dispose(bool disposing){if(disposing){disposed=true;ready=false;if(web!=null)web.Dispose();}base.Dispose(disposing);}
}
