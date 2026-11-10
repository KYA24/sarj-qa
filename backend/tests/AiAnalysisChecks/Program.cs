using Nuzul;
using System.Text.Json;
var p=new Project{Sources=[new(){Id="text-1",Type="text",Name="Requirements",Content="Checkout follows checkin"},new(){Id="image-1",Type="image",Name="Screen"}],Settings=new(){AuthToken="test-secret"}};
int count=0;
string Output(string source,string status="Verified",string text="Visible booking field")=>JsonSerializer.Serialize(new{requirements=new[]{new{sourceId=source,reference="booking form",text,status}}});
void Check(bool ok,string name){if(!ok)throw new Exception(name);count++;Console.WriteLine("PASS "+name);}
void Reject(string json,string name){try{AiAnalysis.Validate(p,json);}catch{Check(true,name);return;}throw new Exception("Expected rejection: "+name);}
var drafts=AiAnalysis.Validate(p,Output("image-1"));Check(drafts.Single().Status=="Inferred / Needs Review","Vision draft can never become Verified");
Check(drafts.Single().SourceId=="image-1"&&drafts.Single().Reference.Contains("Screen"),"Screenshot source traceability retained");
Check(AiAnalysis.Validate(p,Output("text-1","Unknown")).Single().Status=="Unknown","Unknown analysis remains Unknown");
Check(!AiAnalysis.Validate(p,Output("text-1",text:"test-secret observation")).Single().Text.Contains("test-secret"),"Configured credentials masked in draft");
Reject(Output("invented"),"Unknown source rejected");Reject("{}","Missing structured requirements rejected");Reject("[]","Nonobject analysis rejected");Reject(Output("text-1",text:""),"Empty draft rejected");
var approved=new TestCase{Approved=true};p.TestCases.Add(approved);p.Requirements.Add(new(){Text="Authoritative",Status="Verified"});AiAnalysis.Validate(p,Output("text-1"));Check(p.TestCases.Single().Approved&&p.Requirements.Single().Status=="Verified","Validation preserves approved tests and authoritative requirements");
Console.WriteLine($"{count} pure structured-analysis checks passed. No provider calls performed.");
