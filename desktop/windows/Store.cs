using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

internal static class Data {
    internal static readonly JavaScriptSerializer Json=new JavaScriptSerializer {MaxJsonLength=32000000,RecursionLimit=80};
    internal static Dictionary<string,object> Parse(string text){return Json.Deserialize<Dictionary<string,object>>(text);}
    internal static string String(Dictionary<string,object> d,string k,string fallback=""){object v;return d!=null&&d.TryGetValue(k,out v)&&v!=null?Convert.ToString(v):fallback;}
    internal static bool Bool(Dictionary<string,object>d,string k){object v;return d!=null&&d.TryGetValue(k,out v)&&v is bool&&(bool)v;}
    internal static Dictionary<string,object> Object(Dictionary<string,object>d,string k){object v;return d!=null&&d.TryGetValue(k,out v)&&v is Dictionary<string,object>?(Dictionary<string,object>)v:new Dictionary<string,object>();}
    internal static List<Dictionary<string,object>> Rows(Dictionary<string,object>d,string k){object v;var result=new List<Dictionary<string,object>>();if(d!=null&&d.TryGetValue(k,out v)&&v is IEnumerable)foreach(var item in (IEnumerable)v)if(item is Dictionary<string,object>)result.Add((Dictionary<string,object>)item);return result;}
    internal static long Number(Dictionary<string,object>d,string k,long fallback){long v;return long.TryParse(String(d,k),out v)?v:fallback;}
    internal static string Hash(string text){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(Encoding.UTF8.GetBytes(text))).Replace("-","").ToLowerInvariant();}
    internal static long Now {get{return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();}}
}

internal sealed class Store {
    internal Dictionary<string,object> Settings=new Dictionary<string,object>();
    internal List<Dictionary<string,object>> History=new List<Dictionary<string,object>>();
    private readonly string path;
    internal Store(string location){path=location;}
    internal void Load(){
        if(!File.Exists(path))return;
        if(new FileInfo(path).Length>5000000)throw new Exception("Zapis ustawień jest zbyt duży.");
        var bytes=ProtectedData.Unprotect(File.ReadAllBytes(path),null,DataProtectionScope.CurrentUser);
        Settings=Data.Parse(Encoding.UTF8.GetString(bytes));
        if(Data.Bool(Settings,"persistentHistory")){
            History=Data.Rows(Settings,"history").Where(x=>Data.String(x,"text").Length<=100000).Take(60).ToList();
            while(History.Sum(x=>Data.String(x,"text").Length)>600000)History.RemoveAt(History.Count-1);
        }
        Settings.Remove("history");
    }
    internal void Save(){
        var values=new Dictionary<string,object>(Settings);
        if(Data.Bool(Settings,"persistentHistory"))values["history"]=History;
        var bytes=ProtectedData.Protect(Encoding.UTF8.GetBytes(Data.Json.Serialize(values)),null,DataProtectionScope.CurrentUser);
        Directory.CreateDirectory(Path.GetDirectoryName(path));string temp=path+".new";
        File.WriteAllBytes(temp,bytes);
        if(File.Exists(path))File.Replace(temp,path,null);else File.Move(temp,path);
    }
    internal void Add(string text,string model){
        History.Insert(0,new Dictionary<string,object>{{"id",Guid.NewGuid().ToString("N")},{"at",Data.Now},{"model",model},{"text",text.Substring(0,Math.Min(100000,text.Length))},{"pinned",false}});
        while(History.Count>60||History.Sum(x=>Data.String(x,"text").Length)>600000) {
            var index=History.FindLastIndex(x=>!Data.Bool(x,"pinned"));History.RemoveAt(index<0?History.Count-1:index);
        }
        Save();
    }
    internal string Scope(string provider,string account,string key){return "catalog."+Data.Hash(provider+":"+(provider=="chatgpt"?account:key));}
    internal List<string> Favorites(string scope){return Data.Rows(Settings,scope+".favorites").Select(x=>Data.String(x,"id")).ToList();}
    internal void Favorite(string scope,string id){
        var ids=Favorites(scope);if(!ids.Remove(id)){if(ids.Count>=8)throw new Exception("Możesz zapisać 8 ulubionych modeli.");ids.Add(id);}
        Settings[scope+".favorites"]=ids.Select(x=>new Dictionary<string,object>{{"id",x}}).ToList();Save();
    }
    internal List<Dictionary<string,object>> Catalog(string scope){var favorite=Favorites(scope);return Data.Rows(Settings,scope).OrderBy(x=>!favorite.Contains(Data.String(x,"id"))).ThenBy(x=>Data.String(x,"name"),StringComparer.CurrentCultureIgnoreCase).ToList();}
    internal void Catalog(string scope,List<Dictionary<string,object>> models){
        var previous=new HashSet<string>(Data.Rows(Settings,scope).Select(x=>Data.String(x,"id")));
        var old=Data.Object(Settings,scope+".new");var fresh=new Dictionary<string,object>();
        foreach(var row in models.Take(2000)){
            var id=Data.String(row,"id");long at=Data.Number(old,id,0);
            if(previous.Count>0&&!previous.Contains(id))at=Data.Now;
            if(Data.Now-at<86400000)fresh[id]=at;
        }
        Settings[scope]=models.Take(2000).ToList();Settings[scope+".new"]=fresh;Settings[scope+".at"]=Data.Now;Save();
    }
    internal string ModelLabel(string scope,Dictionary<string,object> model){string id=Data.String(model,"id");return (Favorites(scope).Contains(id)?"★ ":"")+Data.String(model,"name",id)+(Data.Now-Data.Number(Data.Object(Settings,scope+".new"),id,0)<86400000?" · Nowy":"");}
}
