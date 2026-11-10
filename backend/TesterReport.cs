using System.Net;
using System.Text;
using System.Text.RegularExpressions;
namespace Nuzul;

public static class TesterReport
{
    public static string Html(Project p, string language="ar")
    {
        var ar=language=="ar";string L(string a,string e)=>ar?a:e;string E(string? v)=>WebUtility.HtmlEncode(v??"");
        string Status(string value)=>value switch { "Passed"=>L("سليم","Passed"),"Failed"=>L("ظهرت مشكلة","Issue found"),"Blocked"=>L("تعذّر الاختبار","Could not test"),"Skipped"=>L("لم يُختبر","Not tested"),_=>L("يحتاج تأكد","Needs checking") };
        var b=new StringBuilder($"<!doctype html><html lang='{(ar?"ar":"en")}' dir='{(ar?"rtl":"ltr")}'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>{L("تقرير اختبار النظام","System test report")} — {E(p.Name)}</title>");
        var font=Path.Combine(Environment.GetEnvironmentVariable("ASPNETCORE_WEBROOT")??Path.Combine(AppContext.BaseDirectory,"wwwroot"),"fonts","Brando-Regular.woff2");
        if(ar&&File.Exists(font))b.Append("<style>@font-face{font-family:Brando;src:url(data:font/woff2;base64,").Append(Convert.ToBase64String(File.ReadAllBytes(font))).Append(") format('woff2');font-weight:400}</style>");
        b.Append("<style>body{font:16px Brando,Arial,sans-serif;line-height:1.9;background:#0b1420;color:#e7f0f6;max-width:950px;padding:28px;margin:auto}h1,h2{color:#a1ebcd}article{background:#132333;border:1px solid #385269;border-radius:12px;padding:24px;margin:24px 0}p,li{overflow-wrap:anywhere}strong{color:#b8e9da}small{color:#bccedb}.status{display:inline-block;padding:4px 12px;background:#263e50;border-radius:6px}.Failed{background:#542d35;color:#ffd7d9}.Passed{background:#204636;color:#c1f3da}.Blocked{background:#483e28;color:#ffe2a0}img{max-width:100%;max-height:400px;object-fit:contain}ol{padding-inline-start:24px}@media(max-width:500px){body{padding:16px}article{padding:18px}h1{font-size:26px}}@media print{body{background:white;color:black}article{background:white;border-color:#aaa;break-inside:avoid}h1,h2,strong,small{color:black}.status{background:#eee;color:black}}</style>");
        var latest=p.Runs.SelectMany(run=>run.Results.Select(record=>(run,record))).GroupBy(x=>x.record.TestCaseId).ToDictionary(g=>g.Key,g=>g.LastOrDefault(x=>x.record.Outcome!="Skipped") is var meaningful && meaningful.record!=null ? meaningful : g.Last());
        b.Append("<header><small>SARJ · ").Append(L("تقرير اختبار النظام","System test report")).Append("</small><h1>").Append(E(p.Name)).Append("</h1><p>").Append(L("يلخص ما اختُبر والمتوقع وما حدث فعلًا. يعرض أحدث نتيجة محفوظة لكل اختبار.","Summarizes checks, expectations and actual observations. Shows the latest saved result for each check.")).Append("</p></header>");
        b.Append("<p>").Append(L("الاختبارات: ","Checks: ")).Append(p.TestCases.Count).Append(" · ").Append(L("سليم: ","Passed: ")).Append(latest.Values.Count(x=>x.record.Outcome=="Passed")).Append(" · ").Append(L("ظهرت مشكلة: ","Issues: ")).Append(latest.Values.Count(x=>x.record.Outcome=="Failed")).Append(" · ").Append(L("متعذر: ","Blocked: ")).Append(latest.Values.Count(x=>x.record.Outcome=="Blocked")).Append(" · ").Append(L("يحتاج تأكد: ","Needs checking: ")).Append(latest.Values.Count(x=>x.record.Outcome=="Needs Review")).Append(" · ").Append(L("بانتظار التجربة: ","Awaiting testing: ")).Append(p.TestCases.Count(t=>!latest.ContainsKey(t.Id)||latest[t.Id].record.Outcome=="Skipped")).Append("</p>");
        var index=0;foreach(var test in p.TestCases){index++;var technical=!string.IsNullOrWhiteSpace(test.Path)||test.Assertions.Count>0;var title=Regex.IsMatch(test.Title,@"^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) ")?L($"التأكد من الإجراء الموثق {index}",$"Documented action {index}"):test.Title;
            b.Append("<article><small>").Append(L($"اختبار {index}",$"Check {index}")).Append("</small><h2>").Append(E(title)).Append("</h2>");
            var expected=test.ExpectedResult;
            b.Append("<p><strong>").Append(L("المتوقع: ","Expected: ")).Append("</strong>").Append(E(expected)).Append("</p>");
            if(!technical){b.Append("<h3>").Append(L("خطوات التجربة","Steps to try")).Append("</h3><ol>");foreach(var step in test.Steps)b.Append("<li>").Append(E(step)).Append("</li>");b.Append("</ol>");}
            if(latest.TryGetValue(test.Id,out var entry)){
                var (run,record)=entry;var human=record.AssertionOutcome==TesterWorkflow.HumanAssertion;
                b.Append("<p class='status ").Append(E(record.Outcome)).Append("'>").Append(Status(record.Outcome)).Append("</p><p><small>").Append(human?L("تجربة سجّلها المختبِر — ليست تشغيلًا آليًا","Tester-recorded observation — not automated execution"):L("فحص خدمة آلي — لا يثبت تجربة واجهة المستخدم","Automated service check — not a user-interface test")).Append("</small></p>");
                var actual=human?record.ActualResult:record.Outcome=="Passed"?L("طابق الفحص الآلي التوقع الموثق.","The automated check matched the documented expectation."):record.Outcome=="Failed"?L("لم يطابق الفحص الآلي التوقع الموثق. التفاصيل محفوظة في التقرير المتخصص.","The automated check did not match the documented expectation. Details are retained in the specialist report."):L("لم يكتمل الفحص. راجع الجاهزية قبل اعتباره مشكلة في النظام.","The check did not complete. Check readiness before treating it as a system issue.");
                b.Append("<p><strong>").Append(L("الفعلي: ","Observed: ")).Append("</strong>").Append(E(actual)).Append("</p>");
                if(!human&&!string.IsNullOrWhiteSpace(record.Observations))b.Append("<p><strong>").Append(L("ملاحظة المختبِر: ","Tester note: ")).Append("</strong>").Append(E(record.Observations)).Append("</p>");
                if(Regex.IsMatch(record.AttachedEvidence,@"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$"))b.Append("<img alt='").Append(L("صورة الدليل","Evidence image")).Append("' src='").Append(E(record.AttachedEvidence)).Append("'>");
                b.Append("<p><strong>").Append(L("الخطوة التالية: ","Next: ")).Append("</strong>").Append(record.Outcome=="Failed"?L("شارك المشكلة وخطواتها مع المسؤول عن الإصلاح. السبب الجذري يحتاج مراجعة.","Share the issue and its steps with the person responsible for fixing it. Root cause requires investigation."):record.Outcome=="Blocked"?L("حل العائق ثم أعد التجربة.","Resolve the blocker and try again."):L("احتفظ بالنتيجة ضمن سجل المشروع.","Keep this result in the project record.")).Append("</p>");
            }else b.Append("<p>").Append(L("لم تُسجّل نتيجة لهذا الاختبار بعد.","No observation recorded for this check yet.")).Append("</p>");
            b.Append("</article>");
        }
        b.Append("<footer><p>").Append(L("هذا التقرير يوضح الأدلة المسجلة، ولا يثبت اختبار النظام بالكامل. الملاحظات البشرية والفحوص الآلية مميزة بوضوح، ولا تُستنتج منها أسباب العيوب تلقائيًا.","This report describes recorded evidence, not complete system coverage. Human observations and automated checks are distinguished; neither automatically establishes root cause.")).Append("</p></footer></html>");return b.ToString();
    }
}
