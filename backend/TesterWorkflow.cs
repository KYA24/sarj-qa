namespace Nuzul;

public record ManualCheckRequest(string Title, string ExpectedResult, List<string> Steps, string? SourceId = null);
public record ManualObservationRequest(string TestCaseId, string Outcome, string ActualResult, string? Evidence, bool Confirmed);

public static class TesterWorkflow
{
    public static void ValidateVerificationWorkspace()
    {
        if (Environment.GetEnvironmentVariable("SARJ_VERIFICATION_MODE") != "isolated") return;
        var dir = Environment.GetEnvironmentVariable("NUZUL_DATA_DIR");
        var root = Environment.GetEnvironmentVariable("NUZUL_ROOT") ?? Directory.GetCurrentDirectory();
        if (string.IsNullOrWhiteSpace(dir) || Path.GetFullPath(dir).TrimEnd(Path.DirectorySeparatorChar) == Path.GetFullPath(Path.Combine(root,".data")).TrimEnd(Path.DirectorySeparatorChar)) throw new InvalidOperationException("Verification requires an explicit data directory separate from the owner's workspace.");
    }
    public const string HumanAssertion = "Human observation; not an automated deterministic assertion";
    public static void AddCheck(Project p, ManualCheckRequest input)
    {
        if (string.IsNullOrWhiteSpace(input.Title) || input.Title.Length > 500 || string.IsNullOrWhiteSpace(input.ExpectedResult) || input.ExpectedResult.Length > 6000 || input.Steps.Count is < 1 or > 100 || input.Steps.Any(s => string.IsNullOrWhiteSpace(s) || s.Length > 6000)) throw new InvalidOperationException("Provide a title, expected result and at least one complete step.");
        if (p.TestCases.Count >= 500) throw new InvalidOperationException("Maximum 500 checks per project.");
        var source = input.SourceId == null ? null : p.Sources.FirstOrDefault(s => s.Id == input.SourceId) ?? throw new InvalidOperationException("Source not found.");
        if (source == null) {
            var note = SafeHttp.Mask(input.Title + "\n" + input.ExpectedResult, p.Settings.AuthToken);
            source = p.Sources.FirstOrDefault(s => s.Type == "tester" && s.Name == "Tester-defined expectations");
            if (source == null) { source = new Source { Type = "tester", Name = "Tester-defined expectations", Content = note }; p.Sources.Add(source); }
            else { if (source.Content.Length + note.Length > 2_000_000) throw new InvalidOperationException("Tester notes exceed workspace limit."); source.Content += "\n\n" + note; }
        }
        var requirement = new Requirement { SourceId = source.Id, Reference = source.Name, Text = SafeHttp.Mask(input.ExpectedResult.Trim(), p.Settings.AuthToken), Status = "Inferred / Needs Review" };
        p.Requirements.Add(requirement);
        p.TestCases.Add(new TestCase { Title = SafeHttp.Mask(input.Title.Trim(), p.Settings.AuthToken), RequirementId = requirement.Id, ExpectedResult = requirement.Text, Steps = input.Steps.Select(s => SafeHttp.Mask(s.Trim(), p.Settings.AuthToken)).ToList(), ExecutionMode = "Manual", TestType = "User journey", Method = "", Path = "", VerificationStatus = "Needs Review", Approved = false });
    }
    public static void Record(Project p, ManualObservationRequest input)
    {
        var test = p.TestCases.FirstOrDefault(t => t.Id == input.TestCaseId) ?? throw new InvalidOperationException("Test not found.");
        if (test.Excluded || !input.Confirmed || string.IsNullOrWhiteSpace(test.ExpectedResult) || test.Steps.Count == 0 || test.Steps.Any(string.IsNullOrWhiteSpace)) throw new InvalidOperationException("Review the expected result and complete steps, then confirm your observation.");
        if (input.Outcome is not ("Passed" or "Failed" or "Blocked" or "Needs Review") || string.IsNullOrWhiteSpace(input.ActualResult) || input.ActualResult.Length > 20000 || (input.Evidence?.Length ?? 0) > 1_000_000) throw new InvalidOperationException("Select an outcome and describe what you actually observed.");
        // A new human record never overwrites or reclassifies an automated outcome.
        var record = new ExecutionRecord { TestCaseId = test.Id, Outcome = input.Outcome, ExpectedResult = test.ExpectedResult, ActualResult = SafeHttp.Mask(input.ActualResult.Trim(), p.Settings.AuthToken), Observations = SafeHttp.Mask(input.ActualResult.Trim(), p.Settings.AuthToken), AttachedEvidence = SafeHttp.Mask(input.Evidence ?? "", p.Settings.AuthToken), AssertionOutcome = HumanAssertion, EvidenceReference = "evidence-" + Guid.NewGuid().ToString("N"), Reviewed = true, ReviewedOutcome = input.Outcome };
        p.Runs.Add(new Run { ProjectId = p.Id, Status = "Completed", Language = "human", TargetSnapshot = p.Settings.BaseUrl, TestCasesSnapshot = SafeHttp.Redact(new List<TestCase>{test}, p.Settings.AuthToken), RequirementsSnapshot = SafeHttp.Redact(p.Requirements.Where(r => r.Id == test.RequirementId).ToList(), p.Settings.AuthToken), Results = [record] });
        if (input.Outcome == "Failed") p.Defects.Add(new Defect { BugId = $"SARJ-BUG-{p.Defects.Count + 1:000}", EvidenceReference = record.EvidenceReference, Title = test.Title, Description = record.ActualResult, ReproductionSteps = [..test.Steps], Severity = "Needs triage", Priority = test.Priority });
    }
}
