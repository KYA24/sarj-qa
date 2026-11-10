using Nuzul;
using System.Text.Json;
var p=new Project{Name="Test <script>unsafe</script>",Settings=new(){AuthToken="secret-for-masking",BaseUrl="http://127.0.0.1:5290"}};
int checks=0;void Check(bool condition,string name){if(!condition)throw new Exception(name);checks++;Console.WriteLine("PASS "+name);}
void Reject(Action action,string name){var snapshot=JsonSerializer.Serialize(p);try{action();}catch(InvalidOperationException){Check(snapshot==JsonSerializer.Serialize(p),name+" leaves data unchanged");return;}throw new Exception("Expected rejection "+name);}
Reject(()=>TesterWorkflow.AddCheck(p,new("","expected",["step"])) ,"Empty title");
Reject(()=>TesterWorkflow.AddCheck(p,new("check","expected",[""])) ,"Empty step");
Reject(()=>TesterWorkflow.AddCheck(p,new("check","expected",["step"],"unknown")) ,"Unknown source");
TesterWorkflow.AddCheck(p,new("إلغاء الحجز","يختفي الحجز",["افتح الحجز","اضغط إلغاء"]));
var test=p.TestCases.Single();Check(test.Path==""&&test.Assertions.Count==0&&!test.Approved,"User journey is manual and not invented API evidence");
Reject(()=>TesterWorkflow.Record(p,new(test.Id,"Passed","observed",null,false)),"Unconfirmed observation");
Reject(()=>TesterWorkflow.Record(p,new(test.Id,"bogus","observed",null,true)),"Unknown outcome");
Reject(()=>TesterWorkflow.Record(p,new(test.Id,"Passed","",null,true)),"Missing actual observation");
var automated=new Run{Status="Completed",Language="csharp",Results=[new(){TestCaseId=test.Id,Outcome="Blocked",ActualResult="auth error"}]};p.Runs.Add(automated);var before=JsonSerializer.Serialize(automated);
TesterWorkflow.Record(p,new(test.Id,"Failed","يبقى الحجز secret-for-masking",null,true));
Check(JsonSerializer.Serialize(p.Runs[0])==before,"Human record never overwrites earlier automated Blocked");
Check(p.Runs.Count==2&&p.Runs[1].Language=="human"&&p.Runs[1].Results[0].AssertionOutcome==TesterWorkflow.HumanAssertion,"Human provenance and independent run explicit");
Check(!p.Runs[1].Results[0].ActualResult.Contains("secret-for-masking"),"Stored credentials masked in observations");
Check(p.Defects.Single().Description.Contains("يبقى الحجز")&&p.Defects.Single().ReproductionSteps.SequenceEqual(test.Steps),"Human issue preserves actual observation and ordered steps");
test.Title="edited";Check(p.Runs[1].TestCasesSnapshot.Single().Title!="edited","Recorded test snapshot remains immutable after edit");
TesterWorkflow.AddCheck(p,new("اختبار آخر","سلوك آخر",["خطوة"]));Check(p.Sources.Count==1,"Tester expectations grouped without source clutter");
var html=TesterReport.Html(p,"ar");Check(html.Contains("dir='rtl'")&&html.Contains("يبقى الحجز"),"Arabic readable report includes actual human observation");
Check(!html.Contains("<script>")&&!html.Contains("<pre>")&&!html.Contains(test.Id)&&!html.Contains("secret-for-masking"),"Simple report escaped and has no raw JSON/UUID/secrets");
Check(html.Contains("ليست تشغيلًا آليًا"),"Report accurately identifies human evidence");
var originalMode=Environment.GetEnvironmentVariable("SARJ_VERIFICATION_MODE");var originalDir=Environment.GetEnvironmentVariable("NUZUL_DATA_DIR");var originalRoot=Environment.GetEnvironmentVariable("NUZUL_ROOT");
Environment.SetEnvironmentVariable("SARJ_VERIFICATION_MODE","isolated");Environment.SetEnvironmentVariable("NUZUL_ROOT",Directory.GetCurrentDirectory());Environment.SetEnvironmentVariable("NUZUL_DATA_DIR",Path.Combine(Directory.GetCurrentDirectory(),".data"));
try { TesterWorkflow.ValidateVerificationWorkspace(); throw new Exception("Owner data was incorrectly accepted as verification"); } catch(InvalidOperationException) { Check(true,"Verification refuses owner default data directory"); }
Environment.SetEnvironmentVariable("NUZUL_DATA_DIR",Path.Combine(Path.GetTempPath(),"sarj-test-boundary-only"));TesterWorkflow.ValidateVerificationWorkspace();Check(true,"Verification accepts explicit isolated temporary directory");
Environment.SetEnvironmentVariable("SARJ_VERIFICATION_MODE",originalMode);Environment.SetEnvironmentVariable("NUZUL_DATA_DIR",originalDir);Environment.SetEnvironmentVariable("NUZUL_ROOT",originalRoot);
Console.WriteLine($"{checks} tester workflow checks passed.");
