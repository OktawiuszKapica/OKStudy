using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

internal static class ImageQuality {
    internal static string Inspect(Bitmap image) {
        if(image.Width<120||image.Height<45)return "Mały fragment może zawierać zbyt drobny tekst. Powiększ zadanie albo popraw zaznaczenie.";
        int w=Math.Min(256,image.Width),h=Math.Min(256,image.Height);
        using(var sample=new Bitmap(image,new Size(w,h))) {
            double[,] gray=new double[w,h];double min=255,max=0,edge=0;int count=0;
            for(int y=0;y<h;y++)for(int x=0;x<w;x++){var c=sample.GetPixel(x,y);double v=.299*c.R+.587*c.G+.114*c.B;gray[x,y]=v;min=Math.Min(min,v);max=Math.Max(max,v);}
            if(max-min<18)return "Fragment ma bardzo niski kontrast. Sprawdź, czy zadanie jest widoczne.";
            for(int y=1;y<h-1;y++)for(int x=1;x<w-1;x++){double d=gray[x-1,y]+gray[x+1,y]+gray[x,y-1]+gray[x,y+1]-4*gray[x,y];edge+=d*d;count++;}
            if(count>0&&edge/count<8)return "Fragment może być rozmyty lub prawie pusty. Sprawdź podgląd przed wysłaniem.";
        }return null;
    }
    internal static string Encode(Bitmap image) {
        double scale=Math.Min(1,2048d/Math.Max(image.Width,image.Height));
        using(var resized=new Bitmap(Math.Max(1,(int)(image.Width*scale)),Math.Max(1,(int)(image.Height*scale))))
        using(var g=Graphics.FromImage(resized))using(var stream=new MemoryStream()){
            g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.DrawImage(image,new Rectangle(0,0,resized.Width,resized.Height));resized.Save(stream,ImageFormat.Png);
            return "data:image/png;base64,"+Convert.ToBase64String(stream.ToArray());
        }
    }
}

internal sealed class CropForm : Form {
    private readonly Bitmap screenshot;
    private readonly bool quality;
    private readonly Rectangle imageBounds;
    private Rectangle selected;
    private Point start;
    private bool dragging,acknowledged;
    private readonly Button send;
    private readonly Label hint;
    internal string ImageData;
    internal CropForm(Bitmap frame,Rectangle desktop,bool check) {
        screenshot=frame;quality=check;
        FormBorderStyle=FormBorderStyle.None;AutoScaleMode=AutoScaleMode.None;
        StartPosition=FormStartPosition.Manual;Bounds=desktop;TopMost=true;ShowInTaskbar=false;KeyPreview=true;DoubleBuffered=true;Cursor=Cursors.Cross;
        double scale=Math.Min(1,Math.Min((double)Width/frame.Width,(double)Height/frame.Height));
        imageBounds=new Rectangle((Width-(int)(frame.Width*scale))/2,(Height-(int)(frame.Height*scale))/2,(int)(frame.Width*scale),(int)(frame.Height*scale));
        var bar=new FlowLayoutPanel{AutoSize=true,WrapContents=false,BackColor=Theme.Bg,Padding=new Padding(12),FlowDirection=FlowDirection.LeftToRight};
        hint=Theme.Label("Zaznacz zadanie · Enter: wyślij · Esc: anuluj",12,false);
        hint.MaximumSize=new Size(600,100);bar.Controls.Add(hint);
        send=Theme.Button("Analizuj fragment  ↵",Accept,true);send.Enabled=false;send.Width=210;bar.Controls.Add(send);
        bar.Controls.Add(Theme.Button("Anuluj",()=>Close(),false));Controls.Add(bar);
        Rectangle area=Screen.FromPoint(Cursor.Position).Bounds;bar.Location=new Point(Math.Max(8,area.Left-desktop.Left+(area.Width-760)/2),Math.Max(8,area.Bottom-desktop.Top-95));
        KeyDown+=(s,e)=>{if(e.KeyCode==Keys.Escape)Close();if(e.KeyCode==Keys.Enter)Accept();};
    }
    protected override void OnShown(EventArgs e){base.OnShown(e);Native.Exclude(this);Activate();}
    protected override void OnMouseDown(MouseEventArgs e){if(e.Button!=MouseButtons.Left)return;start=e.Location;dragging=true;acknowledged=false;selected=Rectangle.Empty;Capture=true;}
    protected override void OnMouseMove(MouseEventArgs e){if(!dragging)return;
        selected=Rectangle.Intersect(new Rectangle(Math.Min(start.X,e.X),Math.Min(start.Y,e.Y),Math.Abs(start.X-e.X),Math.Abs(start.Y-e.Y)),imageBounds);
        send.Enabled=selected.Width>=8&&selected.Height>=8;send.Text="Analizuj fragment  ↵";hint.Text="Zaznacz zadanie · Enter: wyślij · Esc: anuluj";Invalidate();
    }
    protected override void OnMouseUp(MouseEventArgs e){dragging=false;Capture=false;}
    protected override void OnPaint(PaintEventArgs e){
        e.Graphics.Clear(Theme.Bg);e.Graphics.DrawImage(screenshot,imageBounds);
        using(var shade=new SolidBrush(Color.FromArgb(140,18,23,22)))e.Graphics.FillRectangle(shade,ClientRectangle);
        if(selected.Width>0&&selected.Height>0){e.Graphics.DrawImage(screenshot,selected,SourceRect(),GraphicsUnit.Pixel);using(var line=new Pen(Theme.Lime,2))e.Graphics.DrawRectangle(line,selected);}
    }
    private Rectangle SourceRect(){double sx=(double)screenshot.Width/imageBounds.Width,sy=(double)screenshot.Height/imageBounds.Height;return Rectangle.Intersect(new Rectangle((int)((selected.X-imageBounds.X)*sx),(int)((selected.Y-imageBounds.Y)*sy),Math.Max(1,(int)(selected.Width*sx)),Math.Max(1,(int)(selected.Height*sy))),new Rectangle(Point.Empty,screenshot.Size));}
    private void Accept(){
        if(!send.Enabled)return;
        using(var crop=screenshot.Clone(SourceRect(),PixelFormat.Format32bppArgb)){
            var warning=quality?ImageQuality.Inspect(crop):null;
            if(warning!=null&&!acknowledged){hint.Text=warning;send.Text="Wyślij mimo ostrzeżenia";acknowledged=true;return;}
            ImageData=ImageQuality.Encode(crop);DialogResult=DialogResult.OK;Close();
        }
    }
}

internal sealed class AnswerOverlay : Form {
    private readonly Timer timer=new Timer();
    private readonly Timer animation=new Timer();
    private readonly Action cancel;
    private readonly bool dots;
    private int phase;
    protected override bool ShowWithoutActivation{get{return true;}}
    protected override CreateParams CreateParams{get{var cp=base.CreateParams;cp.ExStyle|=0x08000000|0x80;if(cancel==null)cp.ExStyle|=0x20;return cp;}}
    internal AnswerOverlay(string text,DictionarySettings settings) : this(text,settings,null){}
    internal AnswerOverlay(string text,DictionarySettings settings,Action onCancel) {
        cancel=onCancel;dots=text=="•••"&&cancel!=null;
        FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;BackColor=settings.Card?Theme.Bg:Color.Magenta;
        if(!settings.Card)TransparencyKey=Color.Magenta;
        Opacity=settings.Opacity;Font=new Font("Segoe UI",settings.TextSize);
        var label=new Label{Text=text,AutoSize=false,Dock=DockStyle.Fill,ForeColor=Theme.Text,BackColor=BackColor,Padding=new Padding(12)};
        Controls.Add(label);
        if(cancel!=null){settings.Card=true;Opacity=1;BackColor=Theme.Bg;TransparencyKey=Color.Empty;label.BackColor=BackColor;label.Cursor=Cursors.Hand;label.Click+=(s,e)=>cancel();}
        Rectangle area=Screen.FromPoint(Cursor.Position).WorkingArea;
        int width=Math.Min(Math.Min(500,area.Width-32),Math.Max(48,TextRenderer.MeasureText(text,Font).Width+24));
        var measure=TextRenderer.MeasureText(text,Font,new Size(width-24,300),TextFormatFlags.WordBreak|TextFormatFlags.NoPadding);
        Size=new Size(width,Math.Min(Math.Max(48,measure.Height+24),300));StartPosition=FormStartPosition.Manual;
        Location=new Point(area.Right-Width-20,settings.Top?area.Top+40:area.Bottom-Height-30);
        if(!settings.Card&&cancel==null){
            try{using(var sample=new Bitmap(1,1))using(var g=Graphics.FromImage(sample)){g.CopyFromScreen(Location.X+Width/2,Location.Y+Height/2,0,0,new Size(1,1));var c=sample.GetPixel(0,0);label.ForeColor=.299*c.R+.587*c.G+.114*c.B>145?Color.FromArgb(27,40,31):Theme.Text;}}catch(System.ComponentModel.Win32Exception){}
        }
        if(cancel==null){timer.Interval=text=="!"?1500:settings.Duration*1000;timer.Tick+=(s,e)=>Close();timer.Start();}
        else if(dots){label.Text="";Size=new Size(46,32);Location=new Point(area.Right-Width-20,area.Bottom-Height-30);label.Paint+=(s,e)=>{e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;for(int i=0;i<3;i++)using(var brush=new SolidBrush(i==phase?Theme.Lime:Theme.Muted))e.Graphics.FillEllipse(brush,11+i*9,i==phase?11:14,5,5);};animation.Interval=230;animation.Tick+=(s,e)=>{phase=(phase+1)%3;label.Invalidate();};animation.Start();}
        else if(settings.Card){int r=12;var path=new System.Drawing.Drawing2D.GraphicsPath();path.AddArc(0,0,r,r,180,90);path.AddArc(Width-r,0,r,r,270,90);path.AddArc(Width-r,Height-r,r,r,0,90);path.AddArc(0,Height-r,r,r,90,90);path.CloseFigure();Region=new Region(path);path.Dispose();}
    }
    protected override void OnShown(EventArgs e){base.OnShown(e);Native.Exclude(this);}
    protected override void Dispose(bool disposing){if(disposing){timer.Dispose();animation.Dispose();}base.Dispose(disposing);}
}
internal sealed class DictionarySettings {
    internal bool Card,Top;internal int Duration,TextSize;internal double Opacity;
    internal DictionarySettings(System.Collections.Generic.Dictionary<string,object> settings){
        Card=Data.String(settings,"style","card")=="card";Top=Data.String(settings,"position")=="top";
        Duration=(int)Math.Max(3,Math.Min(30,Data.Number(settings,"duration",8)));
        TextSize=(int)Math.Max(11,Math.Min(28,Data.Number(settings,"textSize",18)));
        Opacity=Math.Max(.05,Math.Min(1,Data.Number(settings,"opacity",45)/100d));
    }
}

internal sealed class FloatingButton : Form {
    private Point start,origin;private bool moved;
    private readonly Action capture;
    protected override bool ShowWithoutActivation {get{return true;}}
    protected override CreateParams CreateParams{get{var cp=base.CreateParams;cp.ExStyle|=0x08000000|0x80;return cp;}}
    internal FloatingButton(Action analyze,Action repeat,Action open){
        capture=analyze;FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;BackColor=Theme.Bg;Size=new Size(46,46);Opacity=.85;DoubleBuffered=true;Cursor=Cursors.Hand;
        var circle=new System.Drawing.Drawing2D.GraphicsPath();circle.AddEllipse(0,0,46,46);Region=new Region(circle);circle.Dispose();
        var area=Screen.PrimaryScreen.WorkingArea;StartPosition=FormStartPosition.Manual;Location=new Point(area.Right-66,area.Top+area.Height/2);
        var menu=new ContextMenuStrip();menu.Items.Add("Zaznacz zadanie",null,(s,e)=>capture());menu.Items.Add("Powtórz odpowiedź",null,(s,e)=>repeat());menu.Items.Add("Otwórz OKStudy",null,(s,e)=>open());ContextMenuStrip=menu;
    }
    protected override void OnShown(EventArgs e){base.OnShown(e);Native.Exclude(this);}
    protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;using(var pen=new Pen(Theme.Border,1))e.Graphics.DrawEllipse(pen,1,1,43,43);using(var font=new Font("Segoe UI",11,FontStyle.Bold))TextRenderer.DrawText(e.Graphics,"OK",font,ClientRectangle,Theme.Lime,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);}
    protected override void OnMouseDown(MouseEventArgs e){if(e.Button!=MouseButtons.Left)return;start=Cursor.Position;origin=Location;moved=false;Capture=true;}
    protected override void OnMouseMove(MouseEventArgs e){if(!Capture)return;var p=Cursor.Position;int x=p.X-start.X,y=p.Y-start.Y;if(Math.Abs(x)+Math.Abs(y)>5)moved=true;if(moved){var area=Screen.FromPoint(p).WorkingArea;Location=new Point(Math.Max(area.Left,Math.Min(area.Right-Width,origin.X+x)),Math.Max(area.Top,Math.Min(area.Bottom-Height,origin.Y+y)));}}
    protected override void OnMouseUp(MouseEventArgs e){if(e.Button!=MouseButtons.Left)return;Capture=false;if(!moved)capture();}
}
