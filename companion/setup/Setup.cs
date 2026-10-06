using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Setup {
    internal static readonly string Target = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OKStudy", "native-host");
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    internal static bool ValidId(string value) { return Regex.IsMatch(value ?? "", "^[a-p]{32}$"); }
    internal static List<string> ExistingIds(string root) {
        try {
            var data = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(root, "pl.okstudy.chatgpt.json")));
            var ids = new List<string>();
            foreach (object origin in (System.Collections.IEnumerable)data["allowed_origins"]) {
                var match = Regex.Match(Convert.ToString(origin), "^chrome-extension://([a-p]{32})/$");
                if (match.Success) ids.Add(match.Groups[1].Value);
            }
            return ids;
        } catch { return new List<string>(); }
    }
    internal static void Install(string root, string extensionId, bool test) {
        if (!ValidId(extensionId)) throw new Exception("Wklej identyfikator rozszerzenia: 32 małe litery od a do p.");
        var ids = ExistingIds(root);
        if (!ids.Contains(extensionId)) ids.Add(extensionId);
        // Only these bundled files can be extracted; archive names are never paths.
        var allowed = new[] { "node.exe", "host.cjs", "NODE-LICENSE.txt", "bundle.json" };
        var payload = new Dictionary<string, byte[]>();
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Read)) {
            foreach (var entry in archive.Entries) {
                if (!allowed.Contains(entry.FullName) || payload.ContainsKey(entry.FullName)) throw new Exception("Nieprawidłowa zawartość instalatora.");
                using (var input = entry.Open()) using (var output = new MemoryStream()) { input.CopyTo(output); payload.Add(entry.FullName, output.ToArray()); }
            }
        }
        if (payload.Count != allowed.Length) throw new Exception("Instalator jest niekompletny.");
        var metadata = Json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(payload["bundle.json"]));
        var hashes = (Dictionary<string, object>)metadata["hashes"];
        using (var sha = SHA256.Create()) foreach (var file in allowed.Where(name => name != "bundle.json")) {
            var actual = BitConverter.ToString(sha.ComputeHash(payload[file])).Replace("-", "").ToLowerInvariant();
            if (actual != Convert.ToString(hashes[file])) throw new Exception("Uszkodzony plik instalatora: " + file);
        }
        Directory.CreateDirectory(root);
        string runtimeDir = Path.Combine(root, "runtime");
        Directory.CreateDirectory(runtimeDir);
        var nodeVersion = Convert.ToString(metadata["nodeVersion"]);
        if (!Regex.IsMatch(nodeVersion, "^v[0-9]+\\.[0-9]+\\.[0-9]+$")) throw new Exception("Nieprawidłowa wersja środowiska.");
        string runtime = Path.Combine(runtimeDir, "node-" + nodeVersion + ".exe");
        bool same = false;
        if (File.Exists(runtime)) using (var sha = SHA256.Create()) using (var file = File.OpenRead(runtime)) {
            same = BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant() == Convert.ToString(hashes["node.exe"]);
        }
        if (!same) File.WriteAllBytes(runtime, payload["node.exe"]);
        File.WriteAllBytes(Path.Combine(root, "host.cjs"), payload["host.cjs"]);
        File.WriteAllBytes(Path.Combine(root, "NODE-LICENSE.txt"), payload["NODE-LICENSE.txt"]);
        File.WriteAllBytes(Path.Combine(root, "installed-version.json"), payload["bundle.json"]);
        string launcher = Path.Combine(root, "host.cmd");
        File.WriteAllText(launcher, "@echo off\r\n\"" + runtime + "\" \"" + Path.Combine(root, "host.cjs") + "\"\r\n", Encoding.Default);
        string manifestPath = Path.Combine(root, "pl.okstudy.chatgpt.json");
        File.WriteAllText(manifestPath, Json.Serialize(new { name = "pl.okstudy.chatgpt", description = "OKStudy ChatGPT connection", path = launcher, type = "stdio", allowed_origins = ids.Select(id => "chrome-extension://" + id + "/").ToArray() }), new UTF8Encoding(false));
        if (!test) foreach (var browser in new[] { "Google\\Chrome", "Microsoft\\Edge", "BraveSoftware\\Brave-Browser" }) {
            using (var key = Registry.CurrentUser.CreateSubKey("Software\\" + browser + "\\NativeMessagingHosts\\pl.okstudy.chatgpt")) key.SetValue("", manifestPath);
        }
    }
    [STAThread]
    private static int Main(string[] args) {
        try {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (args.Length == 3 && args[0] == "--test-install") { Install(Path.GetFullPath(args[1]), args[2], true); return 0; }
            if (args.Length == 2 && args[0] == "--install") { Install(Target, args[1], false); return 0; }
            using (var window = new SetupWindow()) {
                if (args.Length == 2 && args[0] == "--preview") {
                    window.ShowInTaskbar = false;
                    window.StartPosition = FormStartPosition.Manual;
                    window.Location = new Point(-32000, -32000);
                    window.Show();
                    Application.DoEvents();
                    using (var bitmap = new Bitmap(window.Width, window.Height)) { window.DrawToBitmap(bitmap, new Rectangle(0, 0, bitmap.Width, bitmap.Height)); bitmap.Save(Path.GetFullPath(args[1])); }
                    window.Close();
                } else Application.Run(window);
            }
            return 0;
        } catch (Exception error) {
            if (args.Length == 0) MessageBox.Show(error.Message, "OKStudy", MessageBoxButtons.OK, MessageBoxIcon.Error);
            else Console.Error.WriteLine(error.Message);
            return 1;
        }
    }
}

internal sealed class SetupWindow : Form {
    readonly TextBox extensionId;
    readonly Label result;
    readonly Button install;
    readonly Color foreground = Color.FromArgb(241, 242, 234);
    readonly Color muted = Color.FromArgb(174, 189, 179);
    internal SetupWindow() {
        Text = "OKStudy — połączenie ChatGPT";
        ClientSize = new Size(620, 490);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = true;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(18, 23, 22);
        ForeColor = foreground;
        Font = new Font("Segoe UI", 10);
        AutoScaleMode = AutoScaleMode.Dpi;
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("mark.png")) {
            using (var image = Image.FromStream(stream)) {
            var picture = new PictureBox { Left = 30, Top = 26, Width = 48, Height = 48, SizeMode = PictureBoxSizeMode.Zoom, Image = new Bitmap(image) };
            Controls.Add(picture);
            }
        }
        Controls.Add(Label("OKStudy", 91, 25, 330, 42, 23, foreground, true));
        Controls.Add(Label("Połącz swój plan ChatGPT", 32, 98, 560, 40, 21, foreground, true));
        Controls.Add(Label("Jedna instalacja. Potrzebne środowisko jest już w środku.\nNie musisz otwierać PowerShella ani instalować Node.js.", 34, 148, 550, 52, 10, muted, false));
        Controls.Add(Label("IDENTYFIKATOR ROZSZERZENIA", 34, 218, 550, 23, 9, muted, true));
        extensionId = new TextBox { Left = 34, Top = 246, Width = 550, Height = 34, Font = new Font("Consolas", 13), BackColor = Color.FromArgb(32, 42, 37), ForeColor = foreground, BorderStyle = BorderStyle.FixedSingle, MaxLength = 32 };
        extensionId.Text = Setup.ExistingIds(Setup.Target).FirstOrDefault() ?? "";
        Controls.Add(extensionId);
        Controls.Add(Label("Skopiuj go z: OKStudy → Ustawienia → OpenAI → Konto ChatGPT.", 34, 290, 550, 42, 9, muted, false));
        result = Label("Instalacja dla bieżącego użytkownika: Chrome, Edge i Brave.", 34, 337, 550, 64, 10, muted, false);
        Controls.Add(result);
        install = new Button { Left = 334, Top = 420, Width = 250, Height = 44, Text = "Zainstaluj połączenie", FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(188, 243, 90), ForeColor = Color.FromArgb(18, 23, 22), Font = new Font("Segoe UI", 10, FontStyle.Bold) };
        install.FlatAppearance.BorderSize = 0;
        install.Click += async (sender, e) => {
            if (!Setup.ValidId(extensionId.Text.Trim())) { result.Text = "Wklej 32-literowy identyfikator z ustawień rozszerzenia."; result.ForeColor = Color.FromArgb(255, 193, 168); extensionId.Focus(); return; }
            install.Enabled = false; extensionId.Enabled = false; result.ForeColor = muted; result.Text = "Instaluję moduł i przygotowuję połączenie…";
            try {
                var id = extensionId.Text.Trim();
                await System.Threading.Tasks.Task.Run(() => Setup.Install(Setup.Target, id, false));
                result.Text = "Gotowe. Wróć do ustawień OKStudy i kliknij Continue with ChatGPT.";
                result.ForeColor = Color.FromArgb(188, 243, 90); install.Text = "Zainstalowano";
            } catch (Exception error) { result.Text = error.Message; result.ForeColor = Color.FromArgb(255, 193, 168); install.Enabled = true; }
            finally { extensionId.Enabled = true; }
        };
        Controls.Add(install);
        var close = new Button { Left = 34, Top = 420, Width = 140, Height = 44, Text = "Zamknij", FlatStyle = FlatStyle.Flat, ForeColor = muted };
        close.FlatAppearance.BorderColor = Color.FromArgb(70, 85, 75); close.Click += (sender, e) => Close(); Controls.Add(close);
        AcceptButton = install; CancelButton = close;
    }
    Label Label(string text, int x, int y, int width, int height, float size, Color color, bool bold) {
        return new Label { Text = text, Left = x, Top = y, Width = width, Height = height, ForeColor = color, Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular), AutoSize = false };
    }
}
