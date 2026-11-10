using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.DataProtection;
using Npgsql;

namespace Nuzul;

// Cloud mode never accepts the local Studio key. Google performs the interactive
// authentication; the server checks verified ownership on ticket creation AND use.
public sealed class CloudHosting
{
    public static void GenerateKeyRing(string outputFile)
    {
        var dir = Path.Combine(Path.GetTempPath(), "sarj-keygen-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(dir, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        try
        {
            var provider = DataProtectionProvider.Create(new DirectoryInfo(dir), options => options.SetApplicationName("NuzulQAStudio"));
            provider.CreateProtector("key-generation").Protect("initialize");
            var xml = File.ReadAllBytes(Directory.GetFiles(dir, "key-*.xml").Single());
            File.WriteAllText(outputFile, Convert.ToBase64String(xml));
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(outputFile, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        finally { Directory.Delete(dir, true); }
    }
    public bool OnDevice { get; } = Environment.GetEnvironmentVariable("SARJ_HOSTING_MODE") == "device";
    public bool Enabled { get; } = Environment.GetEnvironmentVariable("SARJ_AUTH_MODE") == "google";
    public string Owner { get; } = Environment.GetEnvironmentVariable("SARJ_OWNER_EMAIL") ?? "";
    public string Origin { get; } = (Environment.GetEnvironmentVariable("SARJ_PUBLIC_ORIGIN") ?? Environment.GetEnvironmentVariable("RENDER_EXTERNAL_URL") ?? "").TrimEnd('/');
    public static string Required(string name) => Environment.GetEnvironmentVariable(name) is { Length: > 0 } value
        ? value : throw new InvalidOperationException($"Missing required cloud setting: {name}");

    public void Configure(WebApplicationBuilder builder)
    {
        if (!Enabled) return;
        if (string.IsNullOrWhiteSpace(Owner) || !Owner.Contains('@')) throw new InvalidOperationException("A sole owner email must be configured.");
        if (!Uri.TryCreate(Origin, UriKind.Absolute, out var origin) || origin.Scheme != "https" || origin.AbsolutePath != "/" || origin.UserInfo.Length > 0 || origin.Query.Length > 0 || origin.Fragment.Length > 0)
            throw new InvalidOperationException("SARJ_PUBLIC_ORIGIN must be an HTTPS origin.");
        if (!OnDevice)
        {
            Required("SARJ_DATABASE_URL");
            // Keep cookie protection stable across cloud restarts without a local disk.
            var ring = Required("SARJ_PROTECTION_KEYRING");
            var ringDir = Path.Combine(Path.GetTempPath(), "sarj-cloud-keyring-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(ring)))[..12]);
            Directory.CreateDirectory(ringDir);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(ringDir, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            var bytes = Convert.FromBase64String(ring);
            using var ringStream = new MemoryStream(bytes);
            var element = System.Xml.Linq.XElement.Load(ringStream);
            var xml = element.ToString(System.Xml.Linq.SaveOptions.DisableFormatting);
            if (element.Name.LocalName != "key") throw new InvalidOperationException("Invalid persisted protection keyring.");
            var ringPath = Path.Combine(ringDir, "key.xml");
            File.WriteAllText(ringPath, xml);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(ringPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            builder.Services.AddDataProtection().SetApplicationName("NuzulQAStudio")
                .PersistKeysToFileSystem(new DirectoryInfo(ringDir)).DisableAutomaticKeyGeneration();
        }
        builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = "__Host-Sarj.Session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.Path = "/";
                options.ExpireTimeSpan = TimeSpan.FromHours(8);
                options.SlidingExpiration = false;
                options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
            })
            .AddGoogle(options =>
            {
                options.ClientId = Required("SARJ_GOOGLE_CLIENT_ID");
                options.ClientSecret = Required("SARJ_GOOGLE_CLIENT_SECRET");
                options.CallbackPath = "/signin-google";
                options.SaveTokens = false;
                options.Scope.Clear(); options.Scope.Add("openid"); options.Scope.Add("email");
                options.UsePkce = true;
                options.Events.OnCreatingTicket = context =>
                {
                    if (!AcceptGoogleUser(context.User))
                        throw new UnauthorizedAccessException("This Google account is not allowed.");
                    context.Identity!.AddClaim(new Claim("sarj:verified-owner", Owner));
                    return Task.CompletedTask;
                };
                options.Events.OnRemoteFailure = context =>
                {
                    // Do not expose provider errors, identities, codes or tokens to clients/logs.
                    var reason = context.Failure is UnauthorizedAccessException ? "owner-policy" : "provider-or-correlation";
                    context.HttpContext.RequestServices.GetRequiredService<ILogger<CloudHosting>>()
                        .LogWarning("Google sign-in failed ({Reason}).", reason);
                    context.HandleResponse();
                    context.Response.Redirect("/?auth=failed");
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAuthorizationEndpoint = context =>
                {
                    // Never send the allowlisted address as a login_hint. Let the user select privately at Google.
                    context.Response.Redirect(context.RedirectUri + "&prompt=select_account");
                    return Task.CompletedTask;
                };
            });
    }

    public bool IsOwner(ClaimsPrincipal user) => user.Identity?.IsAuthenticated == true
        && string.Equals(user.FindFirstValue(ClaimTypes.Email), Owner, StringComparison.OrdinalIgnoreCase)
        && user.FindFirstValue("sarj:verified-owner") == Owner;

    public bool AcceptGoogleUser(JsonElement user) => user.TryGetProperty("email", out var email)
        && email.ValueKind == JsonValueKind.String
        && string.Equals(email.GetString(), Owner, StringComparison.OrdinalIgnoreCase)
        // GoogleHandler uses OAuth v3 userinfo, not the v2 verified_email schema.
        && user.TryGetProperty("email_verified", out var verified) && verified.ValueKind == JsonValueKind.True;

    public bool AcceptMutation(HttpRequest request) => request.Headers["Origin"].ToString() == Origin
        && request.Headers["X-Sarj-Request"].ToString() == "studio"
        && request.Headers["Sec-Fetch-Site"].ToString() is not ("cross-site" or "same-site");

    public void Attach(WebApplication app)
    {
        app.MapGet("/api/auth/config", () => new { mode = Enabled ? "google" : DemoHosting.Enabled ? "demo" : "local", publishedOrigin = Environment.GetEnvironmentVariable("SARJ_PUBLISHED_ORIGIN") ?? (Enabled ? Origin : ""), demo = DemoHosting.Enabled });
        if (!Enabled) return;
        app.MapGet("/auth/session", (HttpContext context) => Results.Json(new { authenticated = IsOwner(context.User) }));
        app.MapGet("/auth/google", () => Results.Challenge(new AuthenticationProperties { RedirectUri = "/" }, [GoogleDefaults.AuthenticationScheme]));
        app.MapPost("/auth/logout", async (HttpContext context) =>
        {
            if (!AcceptMutation(context.Request)) return Results.StatusCode(403);
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Json(new { ok = true });
        });
    }

    public static string DatabaseConnection(string value)
    {
        if (!value.StartsWith("postgres://") && !value.StartsWith("postgresql://")) {
            var raw = new NpgsqlConnectionStringBuilder(value);
            raw.SslMode = raw.Host is "localhost" or "127.0.0.1" or "::1" ? SslMode.Disable : SslMode.VerifyFull;
            return raw.ConnectionString;
        }
        var uri = new Uri(value);
        var auth = uri.UserInfo.Split(':', 2);
        var config = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host, Port = uri.IsDefaultPort || uri.Port < 1 ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(auth[0]), Password = auth.Length == 2 ? Uri.UnescapeDataString(auth[1]) : "",
            SslMode = SslMode.VerifyFull, Timeout = 15, CommandTimeout = 20, MaxPoolSize = 5
        };
        // Explicit local test connections only; cloud/public hosts always verify TLS.
        if (uri.IsLoopback) config.SslMode = SslMode.Disable;
        return config.ConnectionString;
    }
}
