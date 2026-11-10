using System.Net;
using System.Text.Json;
namespace Nuzul;

// Keyless demo is a different process/store, never an authorization bypass on the owner server.
public static class DemoHosting
{
    public static bool Enabled => Environment.GetEnvironmentVariable("SARJ_AUTH_MODE") == "demo";
    public static void Validate()
    {
        if (!Enabled) return;
        var url = Environment.GetEnvironmentVariable("NUZUL_API_URL") ?? "";
        var dir = Environment.GetEnvironmentVariable("NUZUL_DATA_DIR") ?? "";
        var root = Environment.GetEnvironmentVariable("NUZUL_ROOT") ?? Directory.GetCurrentDirectory();
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || !u.IsLoopback || u.Scheme != "http") throw new InvalidOperationException("Demo must bind an explicit HTTP loopback URL.");
        if (string.IsNullOrEmpty(dir) || Path.GetFullPath(dir).TrimEnd('/') == Path.GetFullPath(Path.Combine(root,".data")).TrimEnd('/') || !Path.GetFileName(Path.GetFullPath(dir)).StartsWith(".demo-")) throw new InvalidOperationException("Demo requires its own .demo-* directory, never owner .data.");
        for(var current=new DirectoryInfo(Path.GetFullPath(dir));current!=null;current=current.Parent)
            if(current.Exists && (current.LinkTarget!=null || (current.Attributes & FileAttributes.ReparsePoint)!=0)) throw new InvalidOperationException("Demo data path cannot contain symbolic links.");
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SARJ_DATABASE_URL"))) throw new InvalidOperationException("Demo cannot use the owner/cloud database.");
    }
    public static bool Accept(HttpContext ctx)
    {
        if (ctx.Connection.RemoteIpAddress is not { } ip || !IPAddress.IsLoopback(ip)) return false;
        if (ctx.Request.Host.Host is not ("127.0.0.1" or "localhost" or "::1")) return false;
        if (ctx.Request.Headers["Sec-Fetch-Site"] == "cross-site") return false;
        var origin = ctx.Request.Headers["Origin"].ToString();
        if (origin.Length > 0 && origin != $"http://{ctx.Request.Host}") return false;
        return HttpMethods.IsGet(ctx.Request.Method) || HttpMethods.IsHead(ctx.Request.Method) || ctx.Request.Headers["X-Sarj-Request"] == "studio";
    }
    public static void Seed(Store s)
    {
        if (!Enabled || s.Get<bool>("demo-seeded-v1")) return;
        var path = Path.Combine(Environment.GetEnvironmentVariable("NUZUL_ROOT") ?? ".", "fixtures", "assignment-demo.json");
        if (!File.Exists(path)) throw new InvalidOperationException("Bundled assignment demo is missing.");
        var p = JsonSerializer.Deserialize<Project>(File.ReadAllText(path),Store.Json) ?? throw new InvalidOperationException("Invalid assignment demo.");
        p.Settings = new() { BaseUrl = SafeHttp.FixtureOrigin, Language="csharp", AllowMutations=true };
        s.Save(p); s.Save("demo-seeded-v1",true);
    }
}
