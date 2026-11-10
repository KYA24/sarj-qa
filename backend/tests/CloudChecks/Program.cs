using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Npgsql;
using Nuzul;

var root = Environment.GetEnvironmentVariable("NUZUL_ROOT") ?? Directory.GetCurrentDirectory();
var dotnet = Environment.ProcessPath!;
// A dotnet run apphost is not the dotnet driver.
dotnet = Environment.GetEnvironmentVariable("DOTNET_HOST_PATH") ?? Path.Combine(root, ".tools/dotnet/dotnet");
var runDir = Path.Combine(root, ".data", "cloud-check-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(runDir);
CloudHosting.GenerateKeyRing(Path.Combine(runDir, "ring.b64"));
var encoded = File.ReadAllText(Path.Combine(runDir, "ring.b64"));
Environment.SetEnvironmentVariable("SARJ_AUTH_MODE", "google");
Environment.SetEnvironmentVariable("SARJ_OWNER_EMAIL", "owner@example.test");
Environment.SetEnvironmentVariable("SARJ_PUBLIC_ORIGIN", "https://sarj-test.example");
var cloud = new CloudHosting();
var count = 0;
void Check(bool ok, string label) { if (!ok) throw new Exception("FAIL " + label); count++; Console.WriteLine("PASS " + label); }
foreach (var (json, expected) in new[] {
    ("{\"email\":\"owner@example.test\",\"email_verified\":true}", true),
    ("{\"email\":\"other@gmail.com\",\"email_verified\":true}", false),
    ("{\"email\":\"owner@example.test\",\"email_verified\":false}", false),
    ("{\"email\":\"owner@example.test\"}", false) })
{ using var d = JsonDocument.Parse(json); Check(cloud.AcceptGoogleUser(d.RootElement) == expected, "Google userinfo allowlist/verified-email policy"); }
var pg = Environment.GetEnvironmentVariable("SARJ_TEST_DATABASE_URL") ?? "postgres://sarj@127.0.0.1:55439/postgres";
var tableConnection = new NpgsqlConnection(CloudHosting.DatabaseConnection(pg));
await tableConnection.OpenAsync();
// The test requires a dedicated empty database, never a production URL.
if (tableConnection.Host != "127.0.0.1" || tableConnection.Port != 55439) throw new Exception("Dedicated loopback PostgreSQL required.");
await new NpgsqlCommand("DROP TABLE IF EXISTS documents", tableConnection).ExecuteNonQueryAsync();

var ringDir = Path.Combine(runDir, "ring"); Directory.CreateDirectory(ringDir);
File.WriteAllBytes(Path.Combine(ringDir,"key.xml"),Convert.FromBase64String(encoded));
var provider = DataProtectionProvider.Create(new DirectoryInfo(ringDir), o => o.SetApplicationName("NuzulQAStudio").DisableAutomaticKeyGeneration());
var format = new TicketDataFormat(provider.CreateProtector("Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationMiddleware", "Cookies", "v2"));
string Cookie(string email, bool verified = true)
{
    var claims = new List<Claim>{new(ClaimTypes.Email,email),new(ClaimTypes.NameIdentifier,"synthetic-local-test")};
    if (verified) claims.Add(new("sarj:verified-owner",cloud.Owner));
    var ticket = new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims,"Cookies")), new AuthenticationProperties{IssuedUtc=DateTimeOffset.UtcNow,ExpiresUtc=DateTimeOffset.UtcNow.AddMinutes(5)},"Cookies");
    return "__Host-Sarj.Session=" + format.Protect(ticket);
}
Process Start()
{
    var start = new ProcessStartInfo(dotnet) { WorkingDirectory=root,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false };
    start.ArgumentList.Add(Path.Combine(root,"backend/bin/Release/net10.0/Nuzul.Api.dll"));
    start.ArgumentList.Add("--webroot"); start.ArgumentList.Add(Path.Combine(root,"frontend/dist"));
    start.Environment["NUZUL_API_URL"]="http://127.0.0.1:5288";
    start.Environment["NUZUL_DATA_DIR"]=Path.Combine(runDir,"ephemeral-data");
    start.Environment["SARJ_DATABASE_URL"]=pg;
    start.Environment["SARJ_PROTECTION_KEYRING"]=encoded;
    start.Environment["SARJ_GOOGLE_CLIENT_ID"]="synthetic.apps.googleusercontent.com";
    start.Environment["SARJ_GOOGLE_CLIENT_SECRET"]="synthetic-not-a-real-client-secret";
    var process=Process.Start(start)!;
    // Do not log environments, authentication payloads or private data.
    var logGate = new object();
    void Log(string? line) { if(line == null) return; lock(logGate) File.AppendAllText(Path.Combine(root,"evidence/cloud-test-server.log"),line.Replace(encoded,"[REDACTED]")+Environment.NewLine); }
    process.OutputDataReceived+=(_,e)=>Log(e.Data);process.ErrorDataReceived+=(_,e)=>Log(e.Data);
    process.BeginOutputReadLine();process.BeginErrorReadLine();return process;
}
using var client = new HttpClient(new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){BaseAddress=new Uri("http://127.0.0.1:5288")};
async Task Ready(Process process)
{
    for(int i=0;i<80;i++){if(process.HasExited)throw new Exception("Cloud test process stopped early.");try{if((await client.GetAsync("/api/health")).IsSuccessStatusCode)return;}catch(HttpRequestException){}await Task.Delay(100);}
    throw new Exception("Cloud test did not become ready.");
}
async Task<HttpResponseMessage> Send(string path,string? cookie=null,HttpMethod? method=null,object? body=null,string? origin="https://sarj-test.example",bool marker=true)
{
    var req=new HttpRequestMessage(method??HttpMethod.Get,path);
    if(cookie!=null)req.Headers.Add("Cookie",cookie);
    req.Headers.Add("X-Studio-Key","synthetic-local-key-cannot-bypass-cloud");
    if(marker)req.Headers.Add("X-Sarj-Request","studio");
    if(origin!=null)req.Headers.Add("Origin",origin);
    if(body!=null)req.Content=JsonContent.Create(body);
    return await client.SendAsync(req);
}
var app=Start();
try
{
    await Ready(app);
    Check((await Send("/api/projects")).StatusCode==HttpStatusCode.Unauthorized,"Local key cannot bypass cloud authentication");
    Check((await Send("/api/projects","__Host-Sarj.Session=forged")).StatusCode==HttpStatusCode.Unauthorized,"Forged cookie rejected");
    Check((await Send("/api/projects",Cookie("other@gmail.com"))).StatusCode==HttpStatusCode.Unauthorized,"Valid signed cookie for wrong email rejected");
    Check((await Send("/api/projects",Cookie(cloud.Owner,false))).StatusCode==HttpStatusCode.Unauthorized,"Unverified owner cookie rejected");
    var owner=Cookie(cloud.Owner);
    Check((await Send("/api/projects",owner)).IsSuccessStatusCode,"Owner signed cookie accepted");
    Check((await Send("/api/projects",owner,HttpMethod.Post,new{name="denied"},"https://attacker.example")).StatusCode==HttpStatusCode.Forbidden,"Cross-origin mutation rejected");
    Check((await Send("/api/projects",owner,HttpMethod.Post,new{name="denied"},marker:false)).StatusCode==HttpStatusCode.Forbidden,"Mutation without request marker rejected");
    var created=await Send("/api/projects",owner,HttpMethod.Post,new{name="Cloud persistence synthetic verification"});
    Check(created.IsSuccessStatusCode,"Same-origin owner project save accepted");
    var doc=await created.Content.ReadFromJsonAsync<JsonElement>();var id=doc.GetProperty("id").GetString();
    var rows=await new NpgsqlCommand("SELECT body FROM documents LIMIT 1",tableConnection).ExecuteScalarAsync() as string;
    Check(rows!=null&&!rows.Contains("Cloud persistence synthetic verification"),"Cloud PostgreSQL stores protected document, not plaintext");
    var challenge=await Send("/auth/google");
    var target=challenge.Headers.Location?.AbsoluteUri??"";
    Check(challenge.StatusCode==HttpStatusCode.Redirect&&target.StartsWith("https://accounts.google.com/")&&target.Contains("code_challenge_method=S256")&&target.Contains("%2Fsignin-google"),"Google authorization-code challenge uses PKCE and fixed callback");
    Check((await Send("/auth/logout",owner,HttpMethod.Post,origin:"https://attacker.example")).StatusCode==HttpStatusCode.Forbidden,"Cross-origin logout rejected");
    app.Kill(true);await app.WaitForExitAsync();app.Dispose();
    app=Start();await Ready(app);
    var reopened=await Send("/api/projects/"+id,owner);
    Check(reopened.IsSuccessStatusCode&&(await reopened.Content.ReadAsStringAsync()).Contains("Cloud persistence synthetic verification"),"Encrypted project and owner session survive application restart");
    Check((await Send("/auth/logout",owner,HttpMethod.Post)).IsSuccessStatusCode,"Same-origin logout succeeds");
    File.WriteAllText(Path.Combine(root,"evidence/cloud-checks.json"),JsonSerializer.Serialize(new{passed=count,scope="Real local PostgreSQL, actual HTTP/cookie protections and restart; Google userinfo policy synthetic; not real Google login or cloud deployment."}));
    Console.WriteLine($"{count} cloud checks passed");
}
finally { if(!app.HasExited){app.Kill(true);await app.WaitForExitAsync();}app.Dispose();await tableConnection.DisposeAsync(); }
