using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;
using Nuzul;

// Real GoogleHandler challenge/correlation/code exchange/userinfo/cookie pipeline.
// Only Google's external HTTP transport is simulated; no real tokens or owner keys.
Environment.SetEnvironmentVariable("SARJ_AUTH_MODE", "google");
Environment.SetEnvironmentVariable("SARJ_HOSTING_MODE", "device");
Environment.SetEnvironmentVariable("SARJ_OWNER_EMAIL", "owner@example.test");
Environment.SetEnvironmentVariable("SARJ_PUBLIC_ORIGIN", "https://sarj-test.example");
Environment.SetEnvironmentVariable("SARJ_GOOGLE_CLIENT_ID", "synthetic-client");
Environment.SetEnvironmentVariable("SARJ_GOOGLE_CLIENT_SECRET", "synthetic-secret");
var cloud = new CloudHosting();
var count = 0;
void Check(bool pass, string label) { if (!pass) throw new Exception("FAIL " + label); count++; Console.WriteLine("PASS " + label); }
var fake = new GoogleTransport();
var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.WebHost.UseUrls("http://127.0.0.1:0");
var keyDir = Path.Combine(Path.GetTempPath(), "sarj-auth-check-" + Guid.NewGuid().ToString("N"));
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keyDir));
cloud.Configure(builder);
builder.Services.PostConfigure<GoogleOptions>(GoogleDefaults.AuthenticationScheme, options => options.Backchannel = new HttpClient(fake));
await using var app = builder.Build();
app.Use(async (context, next) => { context.Request.Scheme = "https"; context.Request.Host = new HostString("sarj-test.example"); await next(); });
app.UseAuthentication();
cloud.Attach(app);
await app.StartAsync();
using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { BaseAddress = new Uri(app.Urls.Single()) };
string Cookies(HttpResponseMessage response) => string.Join("; ", response.Headers.TryGetValues("Set-Cookie", out var cookies) ? cookies.Select(value => value.Split(';')[0]) : []);
async Task<HttpResponseMessage> Callback(string json, bool correlation = true)
{
    fake.UserInfo = json;
    var challenge = await client.GetAsync("/auth/google");
    var target = challenge.Headers.Location!.ToString();
    Check(target.Contains("code_challenge_method=S256") && target.Contains("prompt=select_account") && !target.Contains(cloud.Owner) && !target.Contains("login_hint"), "PKCE and account chooser without owner disclosure");
    var state = QueryHelpers.ParseQuery(new Uri(target).Query)["state"].ToString();
    using var request = new HttpRequestMessage(HttpMethod.Get, "/signin-google?code=synthetic-code&state=" + Uri.EscapeDataString(state));
    if (correlation) request.Headers.Add("Cookie", Cookies(challenge));
    return await client.SendAsync(request);
}
try
{
    var config = await client.GetStringAsync("/api/auth/config");
    Check(JsonDocument.Parse(config).RootElement.GetProperty("mode").GetString()=="google" && !config.Contains('@'), "Public configuration does not disclose account");
    foreach (var (json, expected) in new[] {
        ("{\"sub\":\"synthetic-owner\",\"email\":\"owner@example.test\",\"email_verified\":true}", true),
        ("{\"sub\":\"synthetic-other\",\"email\":\"other@gmail.com\",\"email_verified\":true}", false),
        ("{\"email\":\"owner@example.test\",\"email_verified\":false}", false),
        ("{\"email\":\"owner@example.test\"}", false),
        ("{\"email\":\"owner@example.test\",\"verified_email\":true}", false),
        ("{\"email\":\"owner@example.test\",\"email_verified\":\"true\"}", false),
        ("{\"email\":123,\"email_verified\":true}", false) })
    {
        using var document = JsonDocument.Parse(json);
        Check(cloud.AcceptGoogleUser(document.RootElement) == expected, "Strict v3 verified-email and sole-owner policy");
        using var callback = await Callback(json);
        Check(callback.StatusCode == HttpStatusCode.Redirect && callback.Headers.Location!.ToString() == (expected ? "/" : "/?auth=failed"), "Actual GoogleHandler callback accepts only verified owner");
        var cookie = Cookies(callback);
        Check(cookie.Contains("__Host-Sarj.Session=") == expected, "Only verified owner receives session cookie");
        if (expected)
        {
            var setCookie = string.Join(" ", callback.Headers.GetValues("Set-Cookie"));
            Check(setCookie.Contains("secure", StringComparison.OrdinalIgnoreCase) && setCookie.Contains("httponly", StringComparison.OrdinalIgnoreCase), "Owner session is Secure and HttpOnly");
            using var sessionRequest = new HttpRequestMessage(HttpMethod.Get, "/auth/session");
            sessionRequest.Headers.Add("Cookie", cookie);
            var session = await client.SendAsync(sessionRequest);
            Check((await session.Content.ReadAsStringAsync()).Contains("\"authenticated\":true"), "Issued owner cookie authenticates following request");
        }
    }
    using var missing = await Callback("{\"email\":\"owner@example.test\",\"email_verified\":true}", false);
    Check(missing.Headers.Location!.ToString() == "/?auth=failed" && !Cookies(missing).Contains("__Host-Sarj.Session="), "Missing correlation cannot create session");
    using var anonymous = await client.GetAsync("/auth/session");
    Check((await anonymous.Content.ReadAsStringAsync()) == "{\"authenticated\":false}", "Anonymous session remains unauthenticated");
    Console.WriteLine($"{count} authentication checks passed; Google transport simulated, no live owner sign-in.");
}
finally { await app.StopAsync(); if (Directory.Exists(keyDir)) Directory.Delete(keyDir, true); }

sealed class GoogleTransport : HttpMessageHandler
{
    public string UserInfo { get; set; } = "{}";
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var json = request.RequestUri!.Host == "oauth2.googleapis.com"
            ? "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}"
            : request.RequestUri.AbsoluteUri == "https://www.googleapis.com/oauth2/v3/userinfo" ? UserInfo : throw new Exception("Unexpected Google endpoint");
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
    }
}
