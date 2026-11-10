using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace Nuzul;

public static class SafeHttp
{
    public static string FixtureOrigin => Environment.GetEnvironmentVariable("NUZUL_FIXTURE_ORIGIN") ?? "http://localhost:5190";
    public static bool Private(IPAddress ip) { if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4(); var b = ip.GetAddressBytes(); return IPAddress.IsLoopback(ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any) || (b.Length == 4 && (b[0] == 0 || b[0] == 10 || b[0] == 127 || b[0] == 169 && b[1] == 254 || b[0] == 172 && b[1] >= 16 && b[1] <= 31 || b[0] == 192 && b[1] == 168 || b[0] >= 224 || b[0] == 100 && b[1] >= 64 && b[1] <= 127)) || (b.Length == 16 && (ip.IsIPv6LinkLocal || ip.IsIPv6Multicast || (b[0] & 254) == 252)); }
    public static async Task<Uri> Validate(string url, CancellationToken ct = default) { if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(u.UserInfo) || !string.IsNullOrEmpty(u.Fragment)) throw new InvalidOperationException("Only HTTP(S) URLs without credentials or fragments are allowed."); var local = u.GetLeftPart(UriPartial.Authority) == FixtureOrigin.TrimEnd('/'); var ips = await Dns.GetHostAddressesAsync(u.Host, ct); if (ips.Length == 0 || (!local && ips.Any(Private))) throw new InvalidOperationException("Private or reserved network targets are not allowed (except the configured local fixture)."); return u; }
    public static HttpClient Client() { var h = new SocketsHttpHandler { AllowAutoRedirect = false, UseProxy = false, ConnectCallback = async (ctx, ct) => { var host = ctx.DnsEndPoint.Host; var fixture = new Uri(FixtureOrigin); bool local = host == fixture.Host && ctx.DnsEndPoint.Port == fixture.Port; var ips = await Dns.GetHostAddressesAsync(host, ct); if (ips.Length == 0 || !local && ips.Any(Private)) throw new HttpRequestException("Target address blocked."); var s = new Socket(SocketType.Stream, ProtocolType.Tcp); try { await s.ConnectAsync(ips, ctx.DnsEndPoint.Port, ct); return new NetworkStream(s, true); } catch { s.Dispose(); throw; } } }; return new HttpClient(h) { Timeout = TimeSpan.FromSeconds(10) }; }
    public static async Task<string> ReadBounded(HttpContent c, CancellationToken ct, int limit = 262144) { await using var s = await c.ReadAsStreamAsync(ct); using var m = new MemoryStream(); var b = new byte[8192]; int n; while ((n = await s.ReadAsync(b, ct)) > 0) { if (m.Length + n > limit) throw new InvalidOperationException("Response exceeds safe size limit."); m.Write(b, 0, n); } return Encoding.UTF8.GetString(m.ToArray()); }
    public static T Redact<T>(T input,string secret="")
    {
        var options=new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var node=JsonSerializer.SerializeToNode(input,options)!;
        void Walk(System.Text.Json.Nodes.JsonNode current)
        {
            if(current is System.Text.Json.Nodes.JsonObject obj)
                foreach(var key in obj.Select(x=>x.Key).ToArray())
                {
                    var child=obj[key];
                    if(child is System.Text.Json.Nodes.JsonValue value&&value.TryGetValue<string>(out var text))obj[key]=Mask(text,secret);
                    else if(child!=null)Walk(child);
                }
            else if(current is System.Text.Json.Nodes.JsonArray arr)
                for(int i=0;i<arr.Count;i++)
                {
                    var child=arr[i];
                    if(child is System.Text.Json.Nodes.JsonValue value&&value.TryGetValue<string>(out var text))arr[i]=Mask(text,secret);
                    else if(child!=null)Walk(child);
                }
        }
        Walk(node);return node.Deserialize<T>(options)!;
    }
    public static string Mask(string value, string secret = "") { if (!string.IsNullOrEmpty(secret)) value = value.Replace(secret, "[REDACTED]"); value = Regex.Replace(value, "(?i)(bearer\\s+)[a-z0-9._~+/=-]+", "$1[REDACTED]"); return Regex.Replace(value, "(?i)(\"(?:password|token|apiKey|secret|authorization|access_token|refresh_token)\"\\s*:\\s*\")[^\"]*", "$1[REDACTED]"); }
}
public static class Engine
{
    public static async Task<ExecutionRecord> Execute(RunnerInput input, TestCase t, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew(); var r = new ExecutionRecord { TestCaseId = t.Id, ExpectedResult = t.ExpectedResult, EvidenceReference = "evidence-" + Guid.NewGuid().ToString("N"), Request = new() { Method = t.Method, Body = SafeHttp.Mask(t.Body, input.AuthToken) } }; try
        {
            if (!t.Approved || t.Excluded) { r.Outcome = "Skipped"; r.ActualResult = "Not approved or excluded"; return r; }
            if (string.IsNullOrEmpty(t.Path)) { r.Outcome = "Needs Review"; r.ActualResult = "Static/manual case requires human review"; return r; }
            if (t.Method is not ("GET" or "HEAD" or "POST" or "PUT" or "PATCH" or "DELETE" or "OPTIONS")) throw new InvalidOperationException("Unsupported HTTP method");
            if (t.Method is not ("GET" or "HEAD" or "OPTIONS") && !input.AllowMutations) throw new InvalidOperationException("Write operations require both stored and per-run permission.");
            var origin = await SafeHttp.Validate(input.BaseUrl, ct); if (!t.Path.StartsWith('/') || t.Path.StartsWith("//") || t.Path.Contains('{')) throw new InvalidOperationException("Endpoint path requires review: use a concrete relative path."); var u = new Uri(origin.GetLeftPart(UriPartial.Authority) + t.Path); if (u.GetLeftPart(UriPartial.Authority) != origin.GetLeftPart(UriPartial.Authority)) throw new InvalidOperationException("Cross-origin endpoint blocked"); r.Request.Url = SafeHttp.Mask(u.ToString(), input.AuthToken);
            using var client = SafeHttp.Client(); using var req = new HttpRequestMessage(new HttpMethod(t.Method), u); req.Headers.Accept.ParseAdd("application/json"); if (input.AuthToken.Length > 0) req.Headers.Authorization = new("Bearer", input.AuthToken); if (t.Body.Length > 0) req.Content = new StringContent(t.Body, Encoding.UTF8, "application/json"); using var resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct); r.Response.Status = (int)resp.StatusCode; var rawBody = await SafeHttp.ReadBounded(resp.Content, ct); r.Response.Body = SafeHttp.Mask(rawBody, input.AuthToken); r.ActualResult = $"HTTP {r.Response.Status}";
            if (r.Response.Status is 401 or 403) { r.Outcome = "Blocked"; r.ErrorDetails = "Authentication/authorization rejected; not classified as product defect."; return r; }
            if (r.Response.Status is >= 300 and < 400) { r.Outcome = "Blocked"; r.ErrorDetails = "Redirects are disabled; configure the final endpoint."; return r; }
            var assertions = new List<Assertion>(t.Assertions); if (t.ExpectedStatus.HasValue && !assertions.Any(a => a.Kind == "status")) assertions.Insert(0, new() { Kind = "status", Expected = t.ExpectedStatus.Value.ToString() }); if (assertions.Count == 0) { r.Outcome = "Needs Review"; r.AssertionOutcome = "No authoritative oracle configured"; return r; }
            var checks = new List<string>(); bool ok = true; foreach (var a in assertions) { bool pass; if (a.Kind == "status") pass = r.Response.Status.ToString() == a.Expected; else if (a.Kind is "jsonEquals" or "jsonExists") { try { using var doc = JsonDocument.Parse(rawBody); var el = doc.RootElement; bool exists = true; foreach (var p in a.Path.Split('.', StringSplitOptions.RemoveEmptyEntries)) { if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty(p, out var found)) el = found; else if (el.ValueKind == JsonValueKind.Array && int.TryParse(p, out var i) && i >= 0 && i < el.GetArrayLength()) el = el[i]; else { exists = false; break; } } pass = a.Kind == "jsonExists" ? exists : exists && (el.ValueKind == JsonValueKind.String ? el.GetString() : el.GetRawText()) == a.Expected; } catch (JsonException) { pass = false; } } else { r.Outcome = "Blocked"; r.ErrorDetails = "Unsupported assertion capability: " + a.Kind; return r; } ok &= pass; checks.Add($"{a.Kind} {a.Path}: expected {a.Expected} => {(pass ? "PASS" : "FAIL")}"); }
            r.Outcome = ok ? "Passed" : "Failed"; r.AssertionOutcome = string.Join("\n", checks);
        }
        catch (OperationCanceledException) { r.Outcome = "Blocked"; r.ErrorDetails = ct.IsCancellationRequested ? "Execution cancelled" : "Request timeout; environment failure"; }
        catch (Exception ex) { r.Outcome = "Blocked"; r.ErrorDetails = SafeHttp.Mask(ex.Message, input.AuthToken); }
        finally { r.DurationMs = sw.Elapsed.TotalMilliseconds; }
        return r;
    }
}
