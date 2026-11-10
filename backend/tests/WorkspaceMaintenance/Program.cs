using Nuzul;
using Microsoft.AspNetCore.DataProtection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;
using System.Text;
var dir = Environment.GetEnvironmentVariable("NUZUL_DATA_DIR") ?? throw new Exception("Explicit data directory required");
if (!File.Exists(Path.Combine(dir,"studio.db"))) throw new Exception("Existing workspace database required");
var provider=DataProtectionProvider.Create(new DirectoryInfo(Path.Combine(dir,"keys")),o=>o.SetApplicationName("NuzulQAStudio"));
var store=new Store(provider);
string Fingerprint(Project p) { var node=JsonSerializer.SerializeToNode(p,Store.Json)!.AsObject(); node.Remove("archived");node.Remove("archiveReason");return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(node.ToJsonString()))); }

if(args.Length==0) { Console.WriteLine(JsonSerializer.Serialize(store.All().Select(p=>new { p.Id,p.Name,p.Archived,contentFingerprint=Fingerprint(p),sourceHashes=p.Sources.Select(s=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s.Content)))),sourceNames=p.Sources.Select(s=>s.Name),sourceTypes=p.Sources.Select(s=>s.Type),checks=p.TestCases.Count,runs=p.Runs.Count }),new JsonSerializerOptions{WriteIndented=true})); return; }
if(args.Length!=2||args[0]!="--archive-verified")throw new Exception("Use --archive-verified JSON with exact IDs and reasons");
var entries=JsonSerializer.Deserialize<Dictionary<string,string>>(File.ReadAllText(args[1]))??throw new Exception("Explicit verification manifest required");
var changed=new List<object>();foreach(var (id,reason) in entries){if(reason.Length<20)throw new Exception("Provenance reason required");var p=store.Project(id);p.Archived=true;p.ArchiveReason=reason;store.Save(p);changed.Add(new{p.Id,p.Name,p.Archived});}
Console.WriteLine(JsonSerializer.Serialize(changed,new JsonSerializerOptions{WriteIndented=true}));
