using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Windows.Forms;

internal static class Native {
    internal static readonly int OpenMessage=unchecked((int)RegisterWindowMessage("OKStudy.Desktop.Open"));
    internal static readonly int ExitMessage=unchecked((int)RegisterWindowMessage("OKStudy.Desktop.Exit"));
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern uint RegisterWindowMessage(string text);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern IntPtr FindWindow(string cls,string title);
    internal static void ActivateExisting(){var h=FindWindow(null,"OKStudy · Windows");if(h!=IntPtr.Zero)PostMessage(h,OpenMessage,IntPtr.Zero,IntPtr.Zero);}
    [DllImport("user32.dll", SetLastError=true)] internal static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] internal static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
    [StructLayout(LayoutKind.Sequential)] private struct WindowRect {internal int Left,Top,Right,Bottom;}
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window,out WindowRect rect);
    internal static Rectangle ActiveBounds(IntPtr own){WindowRect r;var h=GetForegroundWindow();return h!=IntPtr.Zero&&h!=own&&GetWindowRect(h,out r)?Rectangle.Intersect(Rectangle.FromLTRB(r.Left,r.Top,r.Right,r.Bottom),SystemInformation.VirtualScreen):Rectangle.Empty;}
    [DllImport("user32.dll")] private static extern bool SetWindowDisplayAffinity(IntPtr window, uint affinity);
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] internal static extern IntPtr SendMessage(IntPtr window,int message,IntPtr wparam,IntPtr lparam);
    [DllImport("user32.dll")] internal static extern bool PostMessage(IntPtr window,int message,IntPtr wparam,IntPtr lparam);
    internal static void Drag(Form form){ReleaseCapture();SendMessage(form.Handle,0xA1,new IntPtr(2),IntPtr.Zero);}
    internal static void Exclude(Form form) { try { SetWindowDisplayAffinity(form.Handle, 0x11); } catch (EntryPointNotFoundException) {} }
}

internal sealed class Shortcut {
    internal readonly uint Modifiers,Key;internal readonly string Text;
    private Shortcut(uint modifiers,uint key,string text){Modifiers=modifiers|0x4000;Key=key;Text=text;}
    internal static Shortcut Parse(string value){
        string text=(value??"").Trim().ToUpperInvariant();
        if(!System.Text.RegularExpressions.Regex.IsMatch(text,@"^(?:(?:CTRL|ALT|SHIFT)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1[01]))$"))throw new Exception("Skrót musi zawierać Ctrl, Alt lub Shift oraz literę, cyfrę lub F1–F11.");
        var parts=text.Split('+');uint mods=0;
        for(int i=0;i<parts.Length-1;i++){uint bit=parts[i]=="CTRL"?2u:parts[i]=="ALT"?1u:4u;if((mods&bit)!=0)throw new Exception("Modyfikator skrótu jest powtórzony.");mods|=bit;}
        string last=parts[parts.Length-1],keyName=last.Length==1&&char.IsDigit(last[0])?"D"+last:last;
        uint key=(uint)(Keys)Enum.Parse(typeof(Keys),keyName,true);
        return new Shortcut(mods,key,((mods&2)!=0?"Ctrl+":"")+((mods&1)!=0?"Alt+":"")+((mods&4)!=0?"Shift+":"")+last);
    }
}

internal static class Theme {
    internal static readonly Color Bg=Color.FromArgb(18,23,22), Card=Color.FromArgb(28,37,33),
        Border=Color.FromArgb(53,70,61), Lime=Color.FromArgb(188,243,90), Text=Color.FromArgb(242,244,235), Muted=Color.FromArgb(170,190,178);
    internal static void Style(Form form, string title, int width, int height) {
        form.Text=title; form.BackColor=Bg; form.ForeColor=Text; form.Font=new Font("Segoe UI",10);
        form.ClientSize=new Size(width,height); form.StartPosition=FormStartPosition.CenterScreen;
        form.AutoScaleMode=AutoScaleMode.Dpi;
    }
    internal static Label Label(string text,int size,bool bold) {
        return new Label {Text=text,AutoSize=true,ForeColor=bold?Text:Muted,Font=new Font("Segoe UI",size,bold?FontStyle.Bold:FontStyle.Regular),Margin=new Padding(0,4,8,8)};
    }
    internal static Button Button(string text, Action action, bool primary) {
        var b=new ActionButton { Text=text, Width=180,Height=42,Margin=new Padding(0,4,8,8),BackColor=primary?Lime:Card,ForeColor=primary?Bg:Text };
        b.Click+=(s,e)=>action(); return b;
    }
    internal static TextBox Input(bool secret) { return new TextBox {Width=450,BorderStyle=BorderStyle.FixedSingle,BackColor=Card,ForeColor=Text,UseSystemPasswordChar=secret,Margin=new Padding(0,4,8,10)}; }
    internal static FlowLayoutPanel Column() { return new FlowLayoutPanel {FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoSize=true,AutoSizeMode=AutoSizeMode.GrowAndShrink,Margin=new Padding(0),Padding=new Padding(0)}; }
    internal static FlowLayoutPanel Row() { return new FlowLayoutPanel {FlowDirection=FlowDirection.LeftToRight,WrapContents=true,AutoSize=true,Width=720,Margin=new Padding(0)}; }
}

internal sealed class ActionButton : Button {
    private bool over;
    internal ActionButton() { FlatStyle=FlatStyle.Flat; FlatAppearance.BorderSize=0; Cursor=Cursors.Hand; SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true); }
    protected override void OnMouseEnter(EventArgs e) { over=true;Invalidate();base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { over=false;Invalidate();base.OnMouseLeave(e); }
    protected override void OnPaint(PaintEventArgs e) {
        e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        using(var path=new System.Drawing.Drawing2D.GraphicsPath()) {
            int r=20;var box=new Rectangle(1,1,Math.Max(1,Width-3),Math.Max(1,Height-3));
            path.AddArc(box.Left,box.Top,r,r,180,90);path.AddArc(box.Right-r,box.Top,r,r,270,90);
            path.AddArc(box.Right-r,box.Bottom-r,r,r,0,90);path.AddArc(box.Left,box.Bottom-r,r,r,90,90);path.CloseFigure();
            using(var fill=new SolidBrush(over?ControlPaint.Light(BackColor,.12f):BackColor)) e.Graphics.FillPath(fill,path);
            using(var pen=new Pen(Focused?Theme.Lime:Theme.Border,1))e.Graphics.DrawPath(pen,path);
        }
        TextRenderer.DrawText(e.Graphics,Text,Font,ClientRectangle,Enabled?ForeColor:Theme.Muted,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis);
    }
}
