using Microsoft.Web.WebView2.WinForms;

namespace HakafastKiosk;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        var url = ResolveUrl(args);
        Application.Run(new KioskForm(url));
    }

    static string ResolveUrl(string[] args)
    {
        if (args.Length > 0 && Uri.TryCreate(args[0], UriKind.Absolute, out _))
            return args[0];

        var env = Environment.GetEnvironmentVariable("HF_KIOSK_URL");
        if (!string.IsNullOrWhiteSpace(env) && Uri.TryCreate(env, UriKind.Absolute, out _))
            return env;

        var port = Environment.GetEnvironmentVariable("PORT") ?? "5000";
        var track = Environment.GetEnvironmentVariable("HF_TRACK_SLUG") ?? "kart-demo";
        return $"http://127.0.0.1:{port}/admin/{track}";
    }
}

sealed class KioskForm : Form
{
    readonly WebView2 webView = new();

    public KioskForm(string startUrl)
    {
        Text = "HAKAFAST";
        WindowState = FormWindowState.Maximized;
        FormBorderStyle = FormBorderStyle.None;
        TopMost = true;
        BackColor = Color.Black;
        Controls.Add(webView);
        webView.Dock = DockStyle.Fill;
        Load += async (_, _) =>
        {
            await webView.EnsureCoreWebView2Async();
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.Navigate(startUrl);
        };
        KeyPreview = true;
        KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.F11)
                FormBorderStyle = FormBorderStyle == FormBorderStyle.None
                    ? FormBorderStyle.Sizable
                    : FormBorderStyle.None;
            if (e.Control && e.KeyCode == Keys.Q) Close();
        };
    }
}
