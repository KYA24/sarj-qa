using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
namespace Nuzul;

public class Jobs
{
    public static readonly IReadOnlyDictionary<string,ITestRunnerAdapter> Adapters=new ITestRunnerAdapter[]{new CSharpRunnerAdapter(),new DartRunnerAdapter()}.ToDictionary(a=>a.Language,StringComparer.Ordinal);
    readonly ConcurrentDictionary<string, CancellationTokenSource> active = new(); static readonly SemaphoreSlim Slots = new(2); public static string Dart => Environment.GetEnvironmentVariable("NUZUL_DART_PATH") ?? "dart";
    public static string DartScript { get { var root = Environment.GetEnvironmentVariable("NUZUL_ROOT") ?? Directory.GetCurrentDirectory(); if (Path.GetFileName(root) == "backend") root = Path.GetDirectoryName(root)!; return Path.Combine(root, "runners", "dart", "main.dart"); } }
    public void Cancel(string id) { if (active.TryGetValue(id, out var c)) c.Cancel(); }
    public Run Start(string id, RunRequest request, Store s) { if (!Adapters.ContainsKey(request.Language)) throw new InvalidOperationException("Unsupported execution adapter"); if (request.Mode is not ("Manual" or "Automated")) throw new InvalidOperationException("Invalid execution mode"); Project p; Run run; List<TestCase> tests; lock (s.Gate) { p = s.Project(id); if (p.Runs.Any(r => r.Status == "Running")) throw new InvalidOperationException("A project run is already active"); tests = p.TestCases.Where(t => request.TestIds == null || request.TestIds.Contains(t.Id)).ToList(); if (tests.Count == 0 || tests.Count > 500) throw new InvalidOperationException("Select1–500 test cases"); run = new() { ProjectId = id, Language = request.Language, TestCasesSnapshot = SafeHttp.Redact(tests,p.Settings.AuthToken), RequirementsSnapshot = SafeHttp.Redact(p.Requirements,p.Settings.AuthToken), TargetSnapshot = p.Settings.BaseUrl }; p.Runs.Add(run); s.Save(p); } var cts = new CancellationTokenSource(TimeSpan.FromMinutes(10)); active[run.Id] = cts; _ = Task.Run(async () => { try { await Slots.WaitAsync(cts.Token); try { var input = new RunnerInput { BaseUrl = p.Settings.BaseUrl, AuthToken = p.Settings.AuthToken, AllowMutations = p.Settings.AllowMutations && request.AllowMutations, Tests = tests }; var adapter=Adapters[request.Language];await adapter.PrepareAsync(input,cts.Token);await adapter.ExecuteAsync(input,r=>SaveResult(s,id,run.Id,r,input.AuthToken),cts.Token); if (cts.IsCancellationRequested) foreach (var pending in tests) { lock (s.Gate) { if (s.Project(id).Runs.First(r => r.Id == run.Id).Results.Any(r => r.TestCaseId == pending.Id)) continue; } SaveResult(s, id, run.Id, new() { TestCaseId = pending.Id, Outcome = "Skipped", ExpectedResult = pending.ExpectedResult, ErrorDetails = "Not executed: run cancelled", EvidenceReference = "evidence-" + Guid.NewGuid().ToString("N") }, input.AuthToken); } } finally { Slots.Release(); } } catch (Exception ex) { foreach (var t in tests) { lock (s.Gate) { if (s.Project(id).Runs.First(r => r.Id == run.Id).Results.Any(r => r.TestCaseId == t.Id)) continue; } SaveResult(s, id, run.Id, new() { TestCaseId = t.Id, Outcome = "Blocked", ExpectedResult = t.ExpectedResult, ErrorDetails = cts.IsCancellationRequested ? "Run cancelled" : SafeHttp.Mask(ex.Message, p.Settings.AuthToken), EvidenceReference = "evidence-" + Guid.NewGuid().ToString("N") }, p.Settings.AuthToken); } } finally { lock (s.Gate) { var latest = s.Project(id); latest.Runs.First(r => r.Id == run.Id).Status = cts.IsCancellationRequested ? "Cancelled" : "Completed"; s.Save(latest); } active.TryRemove(run.Id, out _); cts.Dispose(); } }); return run; }
    static void SaveResult(Store s, string id, string run, ExecutionRecord result, string token) { var safe = SafeHttp.Redact(result,token); lock (s.Gate) { var p = s.Project(id); p.Runs.First(r => r.Id == run).Results.Add(safe); if (safe.Outcome == "Failed") { var test = p.Runs.First(r => r.Id == run).TestCasesSnapshot.FirstOrDefault(t => t.Id == safe.TestCaseId); p.Defects.Add(new() { EvidenceReference = safe.EvidenceReference, BugId = $"SARJ-BUG-{p.Defects.Count + 1:000}", Title = test?.Title ?? "Assertion failure", Description = "A deterministic assertion failed against the configured target. Root cause is not established.", Priority = test?.Priority ?? "High", ReproductionSteps = test?.Steps ?? [] }); } s.Save(p); } }
    internal static async Task DartRun(RunnerInput input,CancellationToken ct,Action<ExecutionRecord> onResult)
    {
        if(!File.Exists(DartScript))throw new InvalidOperationException("Dart runner script not installed: "+DartScript);
        var psi=new ProcessStartInfo(Dart){RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
        psi.ArgumentList.Add(DartScript);psi.ArgumentList.Add("--ndjson");
        using var proc=Process.Start(psi)??throw new InvalidOperationException("Dart runtime unavailable");
        using var reg=ct.Register(()=>{try{proc.Kill(true);}catch{}});
        var errors=ReadLimited(proc.StandardError,ct);
        var seen=new HashSet<string>();int total=0;
        try
        {
            await proc.StandardInput.WriteAsync(JsonSerializer.Serialize(input,Store.Json));proc.StandardInput.Close();
            while(await proc.StandardOutput.ReadLineAsync(ct) is string line)
            {
                total+=line.Length;if(total>8_000_000||line.Length>1_000_000)throw new InvalidOperationException("Runner output limit exceeded");
                if(string.IsNullOrWhiteSpace(line))continue;
                var record=JsonSerializer.Deserialize<ExecutionRecord>(line,Store.Json)??throw new InvalidOperationException("Invalid Dart output record");
                if(!input.Tests.Any(t=>t.Id==record.TestCaseId)||!seen.Add(record.TestCaseId))throw new InvalidOperationException("Dart returned unexpected or duplicate test ID");
                if(record.Outcome is not("Passed" or "Failed" or "Blocked" or "Skipped" or "Needs Review"))throw new InvalidOperationException("Dart returned unsupported outcome");
                onResult(record);
            }
            await proc.WaitForExitAsync(ct);var err=await errors;
            if(proc.ExitCode!=0)throw new InvalidOperationException("Dart runner failed: "+SafeHttp.Mask(err,input.AuthToken));
            if(seen.Count!=input.Tests.Count)throw new InvalidOperationException("Dart runner did not complete all selected tests");
        }
        finally
        {
            if(!proc.HasExited){try{proc.Kill(true);await proc.WaitForExitAsync(CancellationToken.None);}catch{}}
            try{await errors;}catch{}
        }
    }
    static async Task<string> ReadLimited(StreamReader r, CancellationToken ct) { var b = new char[8192]; var output = new System.Text.StringBuilder(); int n; while ((n = await r.ReadAsync(b, ct)) > 0) { if (output.Length + n > 8_000_000) throw new InvalidOperationException("Runner output limit exceeded"); output.Append(b, 0, n); } return output.ToString(); }
    internal static async Task<bool> Runtime() { try { using var p = Process.Start(new ProcessStartInfo(Dart, "--version") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false }); if (p == null) return false; using var ct = new CancellationTokenSource(5000); await p.WaitForExitAsync(ct.Token); return p.ExitCode == 0 && File.Exists(DartScript); } catch { return false; } }
    public static async Task<object> Preflight(Project p) { var checks = new List<object>(); bool blocked = false; try { await SafeHttp.Validate(p.Settings.BaseUrl); using var client = SafeHttp.Client(); using var req = new HttpRequestMessage(HttpMethod.Get, p.Settings.BaseUrl.TrimEnd('/') + "/health"); if (p.Settings.AuthToken.Length > 0) req.Headers.Authorization = new("Bearer", p.Settings.AuthToken); using var r = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead); var ok = (int)r.StatusCode < 400; checks.Add(new { name = "Target connectivity", status = ok ? "Ready" : "Warning", message = $"HTTP {(int)r.StatusCode}; /health is optional for external targets" }); } catch (Exception ex) { blocked = true; checks.Add(new { name = "Target connectivity", status = "Blocked", message = SafeHttp.Mask(ex.Message, p.Settings.AuthToken) }); } var readiness=await Task.WhenAll(Adapters.Values.Select(a=>a.CheckRuntimeAsync()));if(!readiness.Any(a=>a.Language==p.Settings.Language&&a.Ready)) { blocked = true; checks.Add(new { name = "Selected runtime", status = "Blocked", message = "Selected execution runtime is unavailable" }); } checks.Add(new { name = "Authentication", status = p.Settings.AuthToken.Length > 0 ? "Ready" : "Warning", message = p.Settings.AuthToken.Length > 0 ? "Credential stored encrypted; validated by target during execution" : "No bearer credential configured" }); checks.Add(new { name = "Execution permissions", status = p.Settings.AllowMutations ? "Ready" : "Warning", message = p.Settings.AllowMutations ? "Write capability enabled; each run still requires explicit approval" : "Read-only; mutations blocked" }); checks.Add(new { name = "Test data and endpoints", status = p.TestCases.Any(t => t.Path.Contains('{')) ? "Warning" : "Ready", message = p.TestCases.Any(t => t.Path.Contains('{')) ? "Resolve path parameters and prepare referenced booking data before approval" : "Review request examples and target test data before approval" }); return new { status = blocked ? "Blocked" : checks.Any(c => JsonSerializer.Serialize(c).Contains("Warning")) ? "Warning" : "Ready", checks, adapters = readiness }; }
}
