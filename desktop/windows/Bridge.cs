using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

internal sealed class Bridge : IDisposable {
    private Process process;
    private readonly object gate=new object();
    private readonly Dictionary<string,TaskCompletionSource<Dictionary<string,object>>> pending=new Dictionary<string,TaskCompletionSource<Dictionary<string,object>>>();
    internal event Action<string> Authorize;
    internal string LastId;
    private readonly string root;
    internal Bridge(string directory) { root=directory; }
    private void Start() {
        if(process!=null && !process.HasExited)return;
        process=new Process {StartInfo=new ProcessStartInfo {
            FileName=Path.Combine(root,"node.exe"),Arguments="\""+Path.Combine(root,"bridge.cjs")+"\" --stdio",
            WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,
            StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8
        },EnableRaisingEvents=true};
        process.OutputDataReceived+=Receive;
        process.ErrorDataReceived+=(s,e)=>{}; // Drain stderr; credentials/payloads are never logged.
        process.Exited+=(s,e)=>{lock(gate){if(s==process)FailAll("Moduł połączenia zakończył pracę. Spróbuj ponownie.");}};
        process.Start(); process.StandardInput.AutoFlush=true; process.BeginOutputReadLine();process.BeginErrorReadLine();
    }
    private void Receive(object sender,DataReceivedEventArgs args) {
        if(sender!=process)return;
        if(args.Data==null)return;
        try {
            if(args.Data.Length>900000)throw new Exception("Odpowiedź modułu jest za długa.");
            var m=Data.Parse(args.Data);var id=Data.String(m,"id");TaskCompletionSource<Dictionary<string,object>> task;
            lock(gate) { if(!pending.TryGetValue(id,out task))return; }
            if(Data.String(m,"event")=="authorize") {
                Uri uri; var url=Data.String(m,"url");
                if(!Uri.TryCreate(url,UriKind.Absolute,out uri)||uri.Scheme!="https"||uri.Host!="auth.openai.com")throw new Exception("Nieprawidłowy adres logowania.");
                if(Authorize!=null)Authorize(url);return;
            }
            lock(gate)pending.Remove(id);
            if(Data.Bool(m,"ok"))task.TrySetResult(Data.Object(m,"result"));
            else task.TrySetException(new Exception(Data.String(m,"error","Błąd połączenia.")));
        }catch(Exception e){FailAll(e.Message);}
    }
    internal async Task<Dictionary<string,object>> Call(string action,Dictionary<string,object> values) {
        var m=new Dictionary<string,object>(values??new Dictionary<string,object>());
        string id=Guid.NewGuid().ToString("N");var task=new TaskCompletionSource<Dictionary<string,object>>();
        lock(gate){Start();pending.Add(id,task);LastId=id;m["id"]=id;m["action"]=action;}
        try {
            await Task.Run(()=> { var line=Data.Json.Serialize(m);if(Encoding.UTF8.GetByteCount(line)>31000000)throw new Exception("Zaznaczenie jest zbyt duże.");lock(gate)process.StandardInput.WriteLine(line); }).ConfigureAwait(false);
            if(await Task.WhenAny(task.Task,Task.Delay(action=="signin"?195000:135000)).ConfigureAwait(false)!=task.Task) {Cancel(id);throw new Exception("Przekroczono czas oczekiwania.");}
            var result=await task.Task.ConfigureAwait(false);
            // Model arrays are wrapped by the bridge, all GUI results remain objects.
            return result;
        }catch{Cancel(id);throw;}finally{lock(gate)pending.Remove(id);}
    }
    internal void Cancel(string id) {
        lock(gate) {
            if(process==null||process.HasExited||string.IsNullOrEmpty(id))return;
            TaskCompletionSource<Dictionary<string,object>> task;
            if(pending.TryGetValue(id,out task)){pending.Remove(id);task.TrySetException(new Exception("Operacja została przerwana."));}
            try {process.StandardInput.WriteLine(Data.Json.Serialize(new {id=Guid.NewGuid().ToString("N"),action="cancel",targetId=id}));}catch(IOException){}
        }
    }
    internal void CancelAll() { string[] ids;lock(gate){ids=new List<string>(pending.Keys).ToArray();}foreach(var id in ids)Cancel(id); }
    private void FailAll(string message) {lock(gate){foreach(var t in pending.Values)t.TrySetException(new Exception(message));pending.Clear();}}
    public void Dispose(){lock(gate){if(process!=null){try{process.StandardInput.Close();if(!process.WaitForExit(1000))process.Kill();}catch(InvalidOperationException){}process.Dispose();process=null;}FailAll("Aplikacja została zamknięta.");}}
}
