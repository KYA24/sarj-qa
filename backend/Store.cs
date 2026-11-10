using Microsoft.Data.Sqlite;
using System.Data.Common;
using Npgsql;
using Microsoft.AspNetCore.DataProtection;
using System.Text.Json;
namespace Nuzul;

public class Store
{
    readonly string path; readonly string? postgres = Environment.GetEnvironmentVariable("SARJ_DATABASE_URL"); readonly IDataProtector protector; public readonly object Gate = new(); public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public Store(IDataProtectionProvider provider) { var dir = Environment.GetEnvironmentVariable("NUZUL_DATA_DIR") ?? Path.Combine(AppContext.BaseDirectory, "data"); Directory.CreateDirectory(dir); if(!OperatingSystem.IsWindows())File.SetUnixFileMode(dir,UnixFileMode.UserRead|UnixFileMode.UserWrite|UnixFileMode.UserExecute);path = Path.Combine(dir, "studio.db"); protector = provider.CreateProtector("nuzul.local.storage.v1"); using var c = Open(); using var cmd = c.CreateCommand(); cmd.CommandText = "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, body TEXT NOT NULL)"; cmd.ExecuteNonQuery(); }
    DbConnection Open() { DbConnection c = string.IsNullOrWhiteSpace(postgres) ? new SqliteConnection($"Data Source={path}") : new NpgsqlConnection(CloudHosting.DatabaseConnection(postgres)); c.Open(); return c; }
    static void Param(DbCommand cmd, string name, object value) { var p = cmd.CreateParameter(); p.ParameterName = name; p.Value = value; cmd.Parameters.Add(p); }
    public T? Get<T>(string id) { lock (Gate) { using var c = Open(); using var cmd = c.CreateCommand(); cmd.CommandText = "SELECT body FROM documents WHERE id=@id"; Param(cmd,"id",id); var v = cmd.ExecuteScalar() as string; return v == null ? default : JsonSerializer.Deserialize<T>(protector.Unprotect(v), Json); } }
    public void Save<T>(string id, T obj) { lock (Gate) { using var c = Open(); using var cmd = c.CreateCommand(); cmd.CommandText = "INSERT INTO documents(id,body) VALUES(@id,@body) ON CONFLICT(id) DO UPDATE SET body=excluded.body"; Param(cmd,"id",id); Param(cmd,"body",protector.Protect(JsonSerializer.Serialize(obj, Json))); cmd.ExecuteNonQuery(); } }
    public List<Project> All() { lock (Gate) { using var c = Open(); using var cmd = c.CreateCommand(); cmd.CommandText = "SELECT id FROM documents WHERE id LIKE 'project-%'"; using var r = cmd.ExecuteReader(); var ids = new List<string>(); while (r.Read()) ids.Add(r.GetString(0)); return ids.Select(id => Get<Project>(id)!).ToList(); } }
    public Project Project(string id) => Get<Project>("project-" + id) ?? throw new KeyNotFoundException("Project not found"); public void Save(Project p) => Save("project-" + p.Id, p);
    public Project Public(Project p) { var copy = JsonSerializer.Deserialize<Project>(JsonSerializer.Serialize(p, Json), Json)!; var token = copy.Settings.AuthToken; copy.Settings.AuthToken = token.Length == 0 ? "" : "[STORED]"; return SafeHttp.Redact(copy,token); }
}
