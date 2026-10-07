using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using System.Runtime.InteropServices;
internal static class SelfCheck {
    [DllImport("dwmapi.dll")] private static extern int DwmFlush();
    [DllImport("user32.dll")] private static extern IntPtr GetWindowLongPtr(IntPtr handle,int index);
    internal static void CaptureCheck(){
        // Capture only this test's own opaque client rectangle, never the user's
        // desktop. This exercises actual Windows painting and GDI readback.
        using(var window=new Form{FormBorderStyle=FormBorderStyle.None,Size=new Size(220,140),StartPosition=FormStartPosition.CenterScreen,BackColor=Color.White,TopMost=true,ShowInTaskbar=false}){
            window.Paint+=(s,e)=>e.Graphics.FillRectangle(Brushes.Black,50,40,40,30);window.Show();Application.DoEvents();DwmFlush();
            var p=window.PointToScreen(Point.Empty);using(var frame=new Bitmap(window.ClientSize.Width,window.ClientSize.Height)){
                using(var g=Graphics.FromImage(frame))g.CopyFromScreen(p,Point.Empty,frame.Size,CopyPixelOperation.SourceCopy);
                if(frame.GetPixel(65,50).GetBrightness()>.2||frame.GetPixel(15,15).GetBrightness()<.8)throw new Exception("Native capture failed to read this test window.");
                using(var crop=frame.Clone(new Rectangle(45,35,60,45),frame.PixelFormat))if(!ImageQuality.Encode(crop).StartsWith("data:image/png;base64,"))throw new Exception("Crop encoding failed.");
            }
            if(!Native.RegisterHotKey(window.Handle,9,0x4003,(uint)Keys.F12))throw new Exception("Capture test hotkey was not registered.");Native.UnregisterHotKey(window.Handle,9);
            var settings=new DictionarySettings(new Dictionary<string,object>{{"style","card"}});
            using(var overlay=new AnswerOverlay("D",settings)){overlay.Show();Application.DoEvents();long style=GetWindowLongPtr(overlay.Handle,-20).ToInt64();if((style&0x08000020)!=0x08000020)throw new Exception("Answer blocks focus or clicks.");overlay.Close();}
            window.Close();
        }
    }
    internal static void BridgeCheck(string root){
        var previous=System.Threading.SynchronizationContext.Current;
        // Deliberately blocked context: protocol work must never require a GUI
        // pump, even when a caller waits synchronously (shutdown/diagnostics).
        System.Threading.SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
        try{using(var bridge=new Bridge(root)){
            var models=bridge.Call("models",new Dictionary<string,object>{{"provider","openai"},{"key","mock-key"}}).GetAwaiter().GetResult();
            if(Data.String(Data.Rows(models,"models").First(),"id")!="mock-model")throw new Exception("GUI bridge catalog failed");
            var task=new Dictionary<string,object>{{"provider","openai"},{"key","mock-key"},{"model","mock-model"},{"mode","express"},{"answerOnly",true},{"image","data:image/png;base64,YQ=="}};
            var result=bridge.Call("infer",new Dictionary<string,object>{{"args",task}}).GetAwaiter().GetResult();
            if(Data.String(result,"text")!="Zażółć gęślą jaźń")throw new Exception("GUI bridge UTF-8 inference failed");
        }}finally{System.Threading.SynchronizationContext.SetSynchronizationContext(previous);}
    }
    internal static void Run(){
        if(Shortcut.Parse("alt+z").Text!="Alt+Z"||Shortcut.Parse("Ctrl+Alt+Shift+F10").Modifiers!=0x4007)throw new Exception("Shortcut normalization failed.");
        foreach(string value in new[]{"Z","Alt+Alt+X","Win+X","Alt+F12","Alt+Enter"}){bool refused=false;try{Shortcut.Parse(value);}catch(Exception){refused=true;}if(!refused)throw new Exception("Invalid shortcut accepted.");}
        using(var image=new Bitmap(160,60)){using(var g=Graphics.FromImage(image))g.Clear(Color.White);if(ImageQuality.Inspect(image)==null)throw new Exception("Empty image check failed");
            string data=ImageQuality.Encode(image);if(!data.StartsWith("data:image/png;base64,"))throw new Exception("PNG encoding failed");
            foreach(bool immediate in new[]{false,true})using(var form=new CropForm(image,new Rectangle(0,0,160,60),false,immediate)){
                var flags=System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic;
                typeof(CropForm).GetMethod("OnMouseDown",flags).Invoke(form,new object[]{new MouseEventArgs(MouseButtons.Left,1,10,10,0)});
                typeof(CropForm).GetMethod("OnMouseUp",flags).Invoke(form,new object[]{new MouseEventArgs(MouseButtons.Left,1,140,50,0)});
                if(immediate&&(form.DialogResult!=DialogResult.OK||form.ImageData==null)||!immediate&&form.ImageData!=null)throw new Exception("Mouse release capture mode failed.");
            }}
        string path=Path.Combine(Path.GetTempPath(),"OKStudy-selfcheck-"+Guid.NewGuid().ToString("N"),"settings.dat");
        try {var store=new Store(path);store.Settings["test"]="Zażółć gęślą jaźń";store.Save();var restored=new Store(path);restored.Load();if(Data.String(restored.Settings,"test")!="Zażółć gęślą jaźń")throw new Exception("Encrypted storage failed");
            restored.Catalog("a",new List<Dictionary<string,object>>{new Dictionary<string,object>{{"id","old"},{"name","Old"}}});restored.Catalog("a",new List<Dictionary<string,object>>{new Dictionary<string,object>{{"id","old"},{"name","Old"}},new Dictionary<string,object>{{"id","new"},{"name","New"}}});
            if(!restored.ModelLabel("a",restored.Catalog("a").First(x=>Data.String(x,"id")=="new")).Contains("Nowy"))throw new Exception("New model marker failed");
        }finally{if(File.Exists(path))File.Delete(path);if(Directory.Exists(Path.GetDirectoryName(path)))Directory.Delete(Path.GetDirectoryName(path));}
    }
}
