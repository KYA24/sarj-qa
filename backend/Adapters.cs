namespace Nuzul;

/// <summary>Language-neutral, controlled-operation adapter. No generated shell or source code is executed.</summary>
public interface ITestRunnerAdapter
{
    string Language { get; }
    IReadOnlyList<string> SupportedCapabilities { get; }
    string RuntimeRequirements { get; }
    Task<AdapterReadiness> CheckRuntimeAsync(CancellationToken cancellationToken = default);
    Task PrepareAsync(RunnerInput input, CancellationToken cancellationToken);
    Task ExecuteAsync(RunnerInput input, Action<ExecutionRecord> onRecord, CancellationToken cancellationToken);
}

public record AdapterReadiness(string Language, bool Ready, IReadOnlyList<string> Capabilities, string Message, string RuntimeRequirements);

public sealed class CSharpRunnerAdapter : ITestRunnerAdapter
{
    public string Language => "csharp";
    public IReadOnlyList<string> SupportedCapabilities { get; } = ["HTTP", "status", "jsonEquals", "jsonExists", "timeout", "cancellation", "live-progress"];
    public string RuntimeRequirements => ".NET 10 (provided by the running API); standalone CLI uses the .NET 10 SDK/runtime";
    public Task<AdapterReadiness> CheckRuntimeAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(new AdapterReadiness(Language, true, SupportedCapabilities, "Primary deterministic C# adapter ready", RuntimeRequirements));
    }
    public async Task PrepareAsync(RunnerInput input, CancellationToken cancellationToken)
    {
        await SafeHttp.Validate(input.BaseUrl, cancellationToken);
    }
    public async Task ExecuteAsync(RunnerInput input, Action<ExecutionRecord> onRecord, CancellationToken cancellationToken)
    {
        foreach (var test in input.Tests)
        {
            if (cancellationToken.IsCancellationRequested) break;
            // The shared fixed DSL handles unsupported operations as Blocked records.
            onRecord(await Engine.Execute(input, test, cancellationToken));
        }
    }
}

public sealed class DartRunnerAdapter : ITestRunnerAdapter
{
    public string Language => "dart";
    public IReadOnlyList<string> SupportedCapabilities { get; } = ["HTTP", "status", "jsonEquals", "jsonExists", "timeout", "cancellation", "live-progress"];
    public string RuntimeRequirements => "Dart SDK 3.12+; configure NUZUL_DART_PATH; fixed runners/dart/main.dart must exist";
    public async Task<AdapterReadiness> CheckRuntimeAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var ready = await Jobs.Runtime();
        return new(Language, ready, SupportedCapabilities, ready ? "Dart runtime and fixed NDJSON runner ready" : "Install Dart and configure NUZUL_DART_PATH", RuntimeRequirements);
    }
    public async Task PrepareAsync(RunnerInput input, CancellationToken cancellationToken)
    {
        await SafeHttp.Validate(input.BaseUrl, cancellationToken);
        if (!File.Exists(Jobs.DartScript)) throw new InvalidOperationException("Fixed Dart runner is not installed");
    }
    public Task ExecuteAsync(RunnerInput input, Action<ExecutionRecord> onRecord, CancellationToken cancellationToken)
        => Jobs.DartRun(input, cancellationToken, onRecord);
}
