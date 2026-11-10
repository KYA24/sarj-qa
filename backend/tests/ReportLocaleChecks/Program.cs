using Nuzul;
using System.Text.Json;
var p = new Project { Name = "<script>alert('unsafe')</script> مشروع" };
var test = new TestCase { Id = "test-1", Title = "Original source title", RequirementId = "req-1", Steps = ["original step"] };
var req = new Requirement { Id = "req-1", SourceId = "source-1", Reference = "spec §1", Text = "original requirement" };
p.TestCases.Add(test); p.Requirements.Add(req);
p.Runs.Add(new Run { TestCasesSnapshot = [test], RequirementsSnapshot = [req], Results = [new ExecutionRecord { TestCaseId = test.Id, Outcome = "Failed", ExpectedResult = "HTTP 400", ActualResult = "HTTP 201", EvidenceReference = "EVIDENCE-LOCALE-001", AssertionOutcome = "status expected 400 => FAIL" }] });
var original = JsonSerializer.Serialize(p);
int count = 0; void Check(bool pass, string name) { if (!pass) throw new Exception(name); count++; Console.WriteLine("PASS " + name); }
foreach (var locale in new[] { "ar", "en" }) {
    var html = Reports.Html(p, locale); var rtf = Reports.Rtf(p, locale);
    Check(html.Contains($"lang='{locale}'") && html.Contains(locale == "ar" ? "dir='rtl'" : "dir='ltr'"), locale + " language and direction");
    Check(html.Contains(locale == "ar" ? "ملخص التنفيذ" : "Execution summary"), locale + " localized labels");
    Check(!html.Contains("<script>"), locale + " user data escaped");
    Check(html.Contains("EVIDENCE-LOCALE-001") && rtf.Contains("EVIDENCE-LOCALE-001"), locale + " evidence preserved across exports");
    Check(html.Contains("original requirement") && rtf.Contains("original requirement"), locale + " source oracle unchanged");
    Check(html.Contains("HTTP 400") && html.Contains("HTTP 201") && html.Contains("SARJ-BUG-001"), locale + " failed actual/expected preserved");
    Check(rtf.Contains("\\trowd") && (locale != "ar" || rtf.Contains("\\rtlpar")), locale + " editable table and direction");
}
Check(original == JsonSerializer.Serialize(p), "Export locale never mutates saved evidence");
Console.WriteLine($"{count} report locale checks passed.");
