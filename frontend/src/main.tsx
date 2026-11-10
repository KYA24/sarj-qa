import { UsageGuide } from "./UsageGuide";
import { DeploymentChooser } from "./DeploymentChooser";
import { TesterWorkspace } from "./TesterWorkspace";
import { tr, currentLocale, setLocale, type Locale } from "./i18n";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Code2,
  Copy,
  Download,
  FileText,
  FlaskConical,
  FolderPlus,
  KeyRound,
  Layers3,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  Project,
  TestCase,
  Run,
  Result,
  Preflight,
  Settings,
  Assertion,
  Defect,
} from "./types";
import "./style.css";
const stages = [
  ["Understand", "Planning + Analysis", "Establish the source of truth."],
  ["Design", "Test Design", "Review and approve traceable cases."],
  ["Prepare", "Test Implementation", "Validate the target and runners."],
  ["Execute", "Test Execution", "Run controlled, deterministic tests."],
  [
    "Review & Export",
    "Monitoring, Control + Completion",
    "Inspect evidence and document findings.",
  ],
];
function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        (/Passed|Ready|Verified|Completed|Approved/.test(value)
          ? "good"
          : /Failed|Blocked/.test(value)
            ? "bad"
            : /Review|Warning|Unknown/.test(value)
              ? "warn"
              : "neutral")
      }
    >
      {tr(String(value))}
    </span>
  );
}
function App() {
  const [locale, updateLocale] = useState<Locale>(currentLocale);
  const [technicalMode, setTechnicalMode] = useState(false);
  const [demoEntered,setDemoEntered]=useState(false);
  const [guideOpen,setGuideOpen]=useState(location.hash.startsWith("#guide="));
  const localeSwitch = <div className="locale-switch" role="group" aria-label={tr("Interface language")}>
    <button type="button" lang="ar" aria-pressed={locale === 'ar'} onClick={() => {setLocale('ar'); updateLocale('ar');}}>العربية</button>
    <button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => {setLocale('en'); updateLocale('en');}}>English</button>
  </div>;

  const [key, setKey] = useState(sessionStorage.getItem("nuzul-key") || "");
  const [draftKey, setDraftKey] = useState("");
  const [authConfig, setAuthConfig] = useState<{mode: string; publishedOrigin?:string; demo?:boolean} | null>(null);
  const [cloudAuthenticated, setCloudAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(["denied", "failed"].includes(new URLSearchParams(location.search).get("auth") || "") ? "Sign-in could not be completed. Try again or choose a different Google account." : "");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/config");
        if (!response.ok) throw Error("Authentication configuration unavailable.");
        const config = await response.json();
        if (!["google", "local", "demo"].includes(config.mode)) throw Error("Invalid authentication mode.");
        let signedIn = false;
        if (config.mode === "google") {
          const session = await fetch("/auth/session");
          if (!session.ok) throw Error("Sign-in status unavailable.");
          signedIn = (await session.json()).authenticated === true;
        }
        if (!cancelled) { setCloudAuthenticated(signedIn); setAuthConfig(config); }
      } catch { if (!cancelled) { setAuthError("Cannot load sign-in. Reload to retry."); setAuthConfig({mode:"unavailable"}); } }
    })();
    return () => { cancelled = true; };
  }, []);
  const authHeaders: Record<string,string> = ["google","demo"].includes(authConfig?.mode||"") ? {"X-Sarj-Request":"studio"} : {"X-Studio-Key": key};
  const [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [stage, setStage] = useState(0),
    [settingsPage, setSettingsPage] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [newName, setNewName] = useState(""),
    [sourceType, setSourceType] = useState("openapi"),
    [sourceName, setSourceName] = useState(""),
    [content, setContent] = useState(""),
    [query, setQuery] = useState(""),
    [retrieved, setRetrieved] = useState<unknown>(null);
  const [manualCase, setManualCase] = useState<TestCase | null>(null),
    [editing, setEditing] = useState<TestCase | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [lower, setLower] = useState(false),
    [useAi, setUseAi] = useState(false),
    [preflight, setPreflight] = useState<Preflight | null>(null),
    [env, setEnv] = useState<Settings>({
      baseUrl: "",
      language: "csharp",
      allowMutations: false,
      authToken: "",
    });
  const [run, setRun] = useState<Run | null>(null),
    [activeResult, setActiveResult] = useState<Result | null>(null),
    [consoleFilter, setConsoleFilter] = useState("All"),
    [expanded, setExpanded] = useState(false),
    [mutationConsent, setMutationConsent] = useState(false),
    [observations, setObservations] = useState(""),
    [evidence, setEvidence] = useState(""),
    [reviewOutcome, setReviewOutcome] = useState("Needs Review");
  const [defect, setDefect] = useState<Defect | null>(null);
  const [provider, setProvider] = useState({
    providerUrl: "",
    model: "",
    apiKey: "",
    enabled: false,
  });
  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const r = await fetch("/api" + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...init.headers,
      },
    });
    if (!r.ok) {
      let msg = await r.text();
      try {
        const parsed = JSON.parse(msg);
        msg = parsed.error || parsed.message || parsed.detail || msg;
      } catch {}
      if (r.status === 401) {
        if (authConfig?.mode === "google") { setCloudAuthenticated(false); msg = "Your session ended. Sign in again."; }
        else msg = "Studio key rejected. Reconnect with the key from your local setup.";
      }
      throw Error(msg || `${r.status} ${r.statusText}`);
    }
    return r.json();
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function load(p: Project | null) {
    setProject(p);
    if (!p) { setRun(null); setEditing(null); localStorage.removeItem("nuzul-project"); return; }
    setEnv({ ...p.settings, authToken: "" });
    const latest = p.runs?.at(-1);
    setRun(latest || null);
    setPreflight(null);
    setEditing(null);
    setSelected([]);
    localStorage.setItem("nuzul-project", p.id);
  }
  async function refresh() {
    const ps = await api<Project[]>("/projects");
    setProjects(ps);
    if (ps.length) {
      const wanted =
        ps.find((p) => p.id === localStorage.getItem("nuzul-project")) || ps[0];
      load(await api<Project>(`/projects/${wanted.id}`));
    }
  }
  useEffect(() => {
    if (authConfig?.mode === "demo" && demoEntered || (authConfig?.mode === "google" ? cloudAuthenticated : authConfig?.mode === "local" && key)) void action(refresh);
  }, [key, authConfig?.mode, cloudAuthenticated, demoEntered]);
  useEffect(() => {
    if (!project || run?.status !== "Running") return;
    const timer = setInterval(async () => {
      try {
        const r = await api<Run>(`/projects/${project.id}/runs/${run.id}`);
        setRun(r);
        if (r.status !== "Running") {
          const p = await api<Project>(`/projects/${project.id}`);
          setProject(p);
        }
      } catch (e) {
        setError(String(e));
      }
    }, 650);
    return () => clearInterval(timer);
  }, [run?.id, run?.status, project?.id, key]);
  const root = project ? `/projects/${project.id}` : "";
  async function saveTest(t: TestCase) {
    const p = await api<Project>(`${root}/tests/${t.id}`, {
      method: "PUT",
      body: JSON.stringify(t),
    });
    setProject(p);
    setEditing(null);
    setNotice("Test case saved. Approval is preserved exactly as selected.");
  }
  async function execute(ids?: string[], mode = "Automated") {
    if (!project) return;
    const r = await api<Run>(`${root}/runs`, {
      method: "POST",
      body: JSON.stringify({
        testIds: ids,
        language: env.language,
        mode,
        allowMutations: mutationConsent,
      }),
    });
    setRun(r);
    setActiveResult(null);
    setStage(3);
  }
  async function download(format: string) {
    const r = await fetch(`/api${root}/reports/${format}?lang=${locale}`, {
      headers: authHeaders,
    });
    if (!r.ok) throw Error(await r.text());
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project!.name.replace(/[\\/:*?"<>|]/g, "-")}-report.${format === "summary" ? "html" : format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const counts = (outcome: string) =>
    run?.results.filter((r) => r.outcome === outcome).length || 0;
  const completed = [
    !!project?.sources.length,
    !!project?.testCases.some((t) => t.approved),
    preflight?.status === "Ready",
    run?.status === "Completed",
    !!run?.results.length,
  ];
  const sourceUpload = async (file: File) => {
    setSourceName(file.name);
    if (file.size > 1_400_000) {
      setError("Source file must be smaller than 1.4 MB.");
      return;
    }
    if (file.type.startsWith("image/")) {
      setSourceType("image");
      const reader = new FileReader();
      reader.onload = () => setContent(String(reader.result));
      reader.readAsDataURL(file);
    } else {
      setSourceType(/ya?ml|json/i.test(file.name) ? "openapi" : "text");
      setContent(await file.text());
    }
  };
  if(guideOpen)return <UsageGuide onClose={()=>setGuideOpen(false)} locale={locale}/>;
  if (!authConfig) return <div className="auth-shell">{localeSwitch}<main className="auth-card"><h1>{tr("Sarj QA Studio")}</h1><p>{tr("Loading sign-in…")}</p></main></div>;
  if(authConfig.mode === "demo" && !demoEntered || authConfig.mode === "google" && !cloudAuthenticated) return <DeploymentChooser mode={authConfig.mode} publishedOrigin={authConfig.publishedOrigin} localeSwitch={localeSwitch} onLocal={()=>setDemoEntered(true)}/>;
  if (!(authConfig.mode === "demo" || (authConfig.mode === "google" ? cloudAuthenticated : authConfig.mode === "local" && key)))
    return (
      <div className="auth-shell">{localeSwitch}
        <div className="auth-brand">
          <Layers3 size={30} />
          <span>{tr(" SARJ ")}<b>{tr("QA STUDIO")}</b>
          </span>
        </div>
        <main className="auth-card">
          <span className="eyebrow">{tr("LOCAL-FIRST TEST ENGINEERING")}</span>
          <h1>{authConfig.mode === "google" ? <>{tr("Sign in to")}<br />{tr("Sarj QA Studio.")}</> : <>{tr("Evidence starts")}<br />{tr("with a trusted workspace.")}</>}</h1>
          <p>
            {authConfig.mode === "google" ? tr("Private workspace. Sign in securely to continue.") : tr("Connect to your local studio to import requirements, approve tests and capture reproducible results.")}
          </p>
          {authError && <p role="alert">{tr(authError)}</p>}
          {authConfig.mode === "google" ? <a className="primary google-login" href="/auth/google"><ShieldCheck size={18} />{tr(" Sign in with Google ")}<ArrowRight size={16}/></a> : authConfig.mode === "local" ? <form
            onSubmit={(e) => {
              e.preventDefault();
              sessionStorage.setItem("nuzul-key", draftKey);
              setKey(draftKey);
            }}
          >
            <label>{tr(" Studio access key ")}<input
                autoFocus
                type="password"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                required
                autoComplete="off"
                placeholder={tr("Paste the key from scripts/start.sh")}
              />
            </label>
            <button className="primary">
              <KeyRound size={16} />{tr(" Open workspace ")}<ArrowRight size={16} />
            </button>
          </form> : null}
          {authConfig.mode === "local" && <small>{tr("The key stays in this browser session. Target API credentials are managed separately.")}</small>}
        </main>
      </div>
    );
  if (!technicalMode) return <><div className="demo-mode-bar"><span>{authConfig.mode==='demo'?'نسخة لوكال مستقلة · لا تحتوي بيانات المالك':'مساحة خاصة · Google'}</span>{authConfig.mode==='demo'&&<button onClick={()=>setDemoEntered(false)}>اختيار النسخة</button>}<button onClick={()=>setGuideOpen(true)}>دليل الاستخدام</button><a href="/presentation/index.html" target="_blank" rel="noreferrer">عرض المشروع</a></div><TesterWorkspace locale={locale} localeSwitch={localeSwitch} projects={projects} project={project} request={api} load={load} updateProjects={setProjects} technical={()=>setTechnicalMode(true)} download={download} logout={async()=>{if(authConfig.mode === "google"){const r=await fetch("/auth/logout",{method:"POST",headers:{"X-Sarj-Request":"studio"}});if(!r.ok)throw Error("Sign-out failed. Please retry.");setCloudAuthenticated(false);setProject(null);setProjects([]);}else{sessionStorage.removeItem("nuzul-key");setKey("");setProject(null);setProjects([]);if(authConfig.mode==='demo')setDemoEntered(false);}}} /></>;
  return (
    <><div className="tester-specialist-return"><span>{locale === "ar" ? "أدوات متخصصة — تفاصيل الخدمة والفحوص الآلية" : "Specialist tools — service details and automated checks"}</span><button onClick={()=>{setTechnicalMode(false);setSettingsPage(false);}}>{locale === "ar" ? "العودة لمساحة المختبِر" : "Back to tester workspace"}</button></div><div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <div className="brand-mark">
            <Layers3 size={24} />
          </div>
          <div>{tr(" SARJ")}<span>{tr("QA STUDIO")}</span>
          </div>
        </a>
        <div className="workspace-label">{tr("ACTIVE WORKSPACE")}</div>
        <select
          aria-label={tr("Select project")}
          value={project?.id || ""}
          onChange={(e) =>
            void action(async () =>
              load(await api<Project>(`/projects/${e.target.value}`)),
            )
          }
        >
          <option value="" disabled>{tr(" Select a project ")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <form
          className="new-project"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              const p = await api<Project>("/projects", {
                method: "POST",
                body: JSON.stringify({ name: newName }),
              });
              setProjects([...projects, p]);
              load(p);
              setNewName("");
              setStage(0);
            });
          }}
        >
          <input
            aria-label={tr("New project name")}
            placeholder={tr("New project name")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <button title={tr("Create project")} aria-label={tr("Create project")}>
            <FolderPlus size={17} />
          </button>
        </form>
        <nav aria-label={tr("Testing stages")}>
          {stages.map((s, i) => (
            <button
              key={s[0]}
              aria-current={stage === i && !settingsPage ? "step" : undefined}
              className={
                stage === i && !settingsPage ? "stage active" : "stage"
              }
              onClick={() => {
                setStage(i);
                setSettingsPage(false);
              }}
            >
              <span
                className={"stage-number " + (completed[i] ? "complete" : "")}
              >
                {completed[i] ? (
                  <Check size={13} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <span>
                {tr(String(s[0]))}
                <small>{tr(String(s[1]))}</small>
              </span>
              {stage === i && !settingsPage && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="rail-note">
          <ShieldCheck size={18} />
          <p>{tr(" Human-approved tests. ")}<br />{tr(" Runner-verified outcomes. ")}</p>
        </div>
        <button
          className={"settings-link " + (settingsPage ? "active" : "")}
          onClick={() => {
            setSettingsPage(true);
            void action(async () =>
              setProvider({
                ...provider,
                ...(await api<typeof provider>("/settings")),
                apiKey: "",
              }),
            );
          }}
        >
          <Settings2 size={17} />{tr(" Provider settings ")}</button>
        <button
          className="text-button disconnect"
          onClick={() => {
            if (authConfig.mode === "google") {
              void action(async () => {
                const r = await fetch("/auth/logout", {method:"POST",headers:{"X-Sarj-Request":"studio"}});
                if (!r.ok) throw Error("Sign-out failed. Please retry.");
                setCloudAuthenticated(false); setProject(null); setProjects([]);
              });
            } else { sessionStorage.removeItem("nuzul-key"); setKey(""); }
          }}
        >{tr(" Disconnect studio ")}</button>
      </aside>
      <div className="main-shell">
        <header className="topbar">{localeSwitch}
          <span>
            <span className="live-dot" />{tr(" Local workspace")}{" "}
            <span className="divider">{tr("/")}</span>{" "}
            {project?.name || tr("No project selected")}
          </span>
          <span className="top-meta">
            <Code2 size={14} />{tr(" C# + Dart adapters ")}</span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {settingsPage
                  ? tr("WORKSPACE CONFIGURATION")
                  : (locale === "ar" ? `المرحلة ${stage + 1} من 5` : `STAGE ${stage + 1} OF 5`)}
              </div>
              <h1>
                {tr(settingsPage ? "Configure your AI provider" : stages[stage][0])}
              </h1>
              <p>
                {settingsPage
                  ? tr("Optional structured assistance. Source evidence and human approval stay authoritative.")
                  : tr(stages[stage][2])}
              </p>
            </div>
            {project && !settingsPage && stage < 4 && (
              <button className="quiet" onClick={() => setStage(stage + 1)}>{tr(" Next stage ")}<ArrowRight size={15} />
              </button>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              {tr(error)}
              <button aria-label={tr("Dismiss error")} onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {tr(notice)}
            </div>
          )}
          {busy && (
            <div className="busy" role="status">
              <RefreshCw size={14} />{tr(" Working with the local API… ")}</div>
          )}
          {settingsPage ? (
            <section className="panel narrow">
              <div className="panel-heading">
                <h2>{tr("OpenAI-compatible provider")}</h2>
                <Badge value={provider.enabled ? "Enabled" : "Disabled"} />
              </div>
              <p className="muted">{tr(" No provider is required for deterministic OpenAPI extraction. An enabled provider can assist analysis and test design; no execution result comes from the model. ")}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await api("/settings", {
                      method: "PUT",
                      body: JSON.stringify({
                        ...provider,
                        apiKey: provider.apiKey || "[STORED]",
                      }),
                    });
                    setProvider({ ...provider, apiKey: "" });
                    setNotice(
                      tr("Provider settings saved. Stored credentials are never returned."),
                    );
                  });
                }}
              >
                <label>{tr(" Provider API URL ")}<input
                    value={provider.providerUrl}
                    onChange={(e) =>
                      setProvider({ ...provider, providerUrl: e.target.value })
                    }
                    placeholder={tr("https://api.example.com/v1/chat/completions")}
                  />
                </label>
                <label>{tr(" Model ")}<input
                    value={provider.model}
                    onChange={(e) =>
                      setProvider({ ...provider, model: e.target.value })
                    }
                  />
                </label>
                <label>{tr(" API key ")}<input
                    type="password"
                    value={provider.apiKey}
                    onChange={(e) =>
                      setProvider({ ...provider, apiKey: e.target.value })
                    }
                    placeholder={tr("Leave blank to retain saved key")}
                    autoComplete="off"
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={provider.enabled}
                    onChange={(e) =>
                      setProvider({ ...provider, enabled: e.target.checked })
                    }
                  />{tr(" Enable AI assistance ")}</label>
                <button className="primary" disabled={busy}>{tr(" Save provider ")}</button>
              </form>
            </section>
          ) : !project ? (
            <section className="empty panel">
              <FlaskConical size={42} />
              <h2>{tr("Create your first QA project")}</h2>
              <p>{tr(" Use the workspace field in the sidebar. Import an OpenAPI document or add requirements to begin. ")}</p>
            </section>
          ) : (
            <>
              {stage === 0 && (
                <>
                  <div className="two-column">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>
                          <Upload size={18} />{tr(" Source materials ")}</h2>
                        <span className="counter">
                          {project.sources.length}{tr(" sources ")}</span>
                      </div>
                      <p className="muted">{tr(" Combine specifications, requirements and screenshots. Images remain static-review sources unless an API is documented. ")}</p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action(async () => {
                            setProject(
                              await api<Project>(`${root}/sources`, {
                                method: "POST",
                                body: JSON.stringify({
                                  type: sourceType,
                                  name: sourceName,
                                  content,
                                }),
                              }),
                            );
                            setContent("");
                            setSourceName("");
                            setNotice(
                              tr("Source imported and grounded requirements extracted."),
                            );
                          });
                        }}
                      >
                        <div className="form-row">
                          <label>{tr(" Source type ")}<select
                              value={sourceType}
                              onChange={(e) => setSourceType(e.target.value)}
                            >
                              <option value="openapi">{tr(" OpenAPI JSON / YAML ")}</option>
                              <option value="text">{tr("Text requirements")}</option>
                              <option value="url">{tr("API documentation URL")}</option>
                              <option value="image">{tr("Screenshot / image")}</option>
                            </select>
                          </label>
                          <label>{tr(" Source name ")}<input
                              required
                              value={sourceName}
                              onChange={(e) => setSourceName(e.target.value)}
                              placeholder={tr("Booking API specification")}
                            />
                          </label>
                        </div>
                        <label className="upload-control">
                          <Upload size={15} />{tr(" Choose specification, text or image ")}<input
                            type="file"
                            accept=".json,.yaml,.yml,.txt,.md,image/*"
                            onChange={(e) => {
                              if (e.target.files?.[0])
                                void sourceUpload(e.target.files[0]);
                            }}
                          />
                        </label>
                        {sourceType === "image" &&
                        content.startsWith("data:image") ? (
                          <div className="image-preview">
                            <img
                              src={content}
                              alt={tr("Pending screenshot source")}
                            />
                          </div>
                        ) : (
                          <label>
                            {sourceType === "url"
                              ? tr("Documentation URL")
                              : tr("Source content")}
                            <textarea
                              required
                              rows={9}
                              value={content}
                              onChange={(e) => setContent(e.target.value)}
                              placeholder={
                                sourceType === "url"
                                  ? "https://…"
                                  : "Paste a single specification or requirements narrative"
                              }
                            />
                          </label>
                        )}
                        <button className="primary" disabled={busy || !content}>
                          <Plus size={16} />{tr(" Add source & analyze ")}</button>
                      </form>
                      <details className="ai-source-action"><summary>{tr("Optional AI analysis")}</summary>
<button type="button" className="quiet" disabled={busy || !project.sources.length} onClick={() => void action(async () => {
setProject(await api<Project>(`${root}/analyze`, {method: 'POST', body: JSON.stringify({useAi: true})}));
setNotice(tr('AI analysis saved as inferred requirements for human review. Original sources remain authoritative.'));
})}><FlaskConical size={15}/>{tr("Analyze sources with AI")}</button>
<p className="muted">{tr("Optional · requires an enabled provider. Clicking sends project source content, including images, to that provider. Imported sources are otherwise analyzed locally; AI requirements always need review.")}</p>
</details>
<div className="source-list">
                        {project.sources.map((s) => (
                          <details key={s.id}>
                            <summary>
                              <FileText size={15} />
                              <span>{s.name}</span>
                              <Badge value={s.type} />
                            </summary>
                            {s.type === "image" &&
                            s.content.startsWith("data:image") ? (
                              <img
                                className="source-image"
                                src={s.content}
                                alt={s.name}
                              />
                            ) : (
                              <pre>{s.content}</pre>
                            )}
                          </details>
                        ))}
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>
                          <BookOpen size={18} />{tr(" Requirement register ")}</h2>
                        <span className="counter">
                          {project.requirements.length}{tr(" extracted ")}</span>
                      </div>
                      {!project.requirements.length ? (
                        <div className="empty">
                          <FileText size={32} />
                          <p>{tr(" Import a source to establish testable requirements. ")}</p>
                        </div>
                      ) : (
                        <div className="requirements">
                          {project.requirements.map((r) => (
                            <article key={r.id}>
                              <div className="requirement-top">
                                <code>{r.id}</code>
                                <Badge value={r.status} />
                              </div>
                              <p>{r.text}</p>
                              <small>
                                <FileText size={12} />
                                {
                                  project.sources.find(
                                    (s) => s.id === r.sourceId,
                                  )?.name
                                }{" "}{tr(" · ")}{r.reference}
                              </small>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                  <details className="panel grounding"><summary>{tr("Inspect source grounding")}</summary>
                    <div>
                      <h2>{tr("Inspect source grounding")}</h2>
                      <p className="muted">{tr(" Retrieve relevant source excerpts. Retrieval supports review; it is not proof of correctness. ")}</p>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action(async () =>
                          setRetrieved(
                            await api(`${root}/retrieve`, {
                              method: "POST",
                              body: JSON.stringify({ query }),
                            }),
                          ),
                        );
                      }}
                    >
                      <input
                        aria-label={tr("Search source evidence")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={tr("Search booking date requirements")}
                        required
                      />
                      <button className="quiet">
                        <Search size={16} />{tr(" Retrieve ")}</button>
                    </form>
                    {retrieved !== null && (
                      <pre>{JSON.stringify(retrieved, null, 2)}</pre>
                    )}
                  </details>
                </>
              )}
              {stage === 1 && (
                <>
                  <section className="panel design-toolbar">
                    <div>
                      <h2>{tr("Review before execution")}</h2>
                      <p className="muted">{tr(" Only approved, non-excluded cases can run. Unknown expected outcomes require an oracle. ")}</p>
                    </div>
                    <div className="design-actions">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={lower}
                          onChange={(e) => setLower(e.target.checked)}
                        />{tr(" Include Medium / Low ")}</label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={useAi}
                          onChange={(e) => setUseAi(e.target.checked)}
                        />{tr(" Use configured AI ")}</label>
                      <button
                        className="primary"
                        disabled={busy || !project.sources.length}
                        onClick={() => {
                          if (
                            project.testCases.length &&
                            !confirm(
                              tr("Regenerate the test design? Approved cases are preserved; other current cases may be replaced."),
                            )
                          )
                            return;
                          void action(async () => {
                            setProject(
                              await api<Project>(`${root}/design`, {
                                method: "POST",
                                body: JSON.stringify({
                                  includeLowerPriorities: lower,
                                  useAi,
                                }),
                              }),
                            );
                            setNotice(
                              tr("Test design generated. Review each expected result before approval."),
                            );
                          });
                        }}
                      >
                        <FlaskConical size={16} />
                        {project.testCases.length
                          ? tr("Regenerate")
                          : tr("Generate")}{" "}{tr(" test cases ")}</button>
                    </div>
                  </section>
                  <div className={editing ? "case-grid editing" : "case-grid"}>
                    <section className="panel case-list">
                      <div className="panel-heading">
                        <h2>{tr("Test definitions")}</h2>
                        <span className="counter">
                          {
                            project.testCases.filter(
                              (t) => t.approved && !t.excluded,
                            ).length
                          }{" "}{tr(" approved / ")}{project.testCases.length}
                        </span>
                      </div>
                      {!project.testCases.length ? (
                        <div className="empty">
                          <ClipboardCheck size={36} />
                          <p>{tr(" Generate a design from your source requirements. ")}</p>
                        </div>
                      ) : (
                        project.testCases.map((t) => (
                          <article
                            className={
                              "test-row " +
                              (editing?.id === t.id ? "selected" : "")
                            }
                            key={t.id}
                          >
                            <div>
                              <div className="test-id">
                                <code>{t.id}</code>
                                <Badge value={t.priority} />
                                <Badge
                                  value={
                                    t.excluded
                                      ? "Excluded"
                                      : t.approved
                                        ? "Approved"
                                        : t.verificationStatus
                                  }
                                />
                              </div>
                              <h3>{t.title}</h3>
                              <p>
                                <span className={"method " + t.method}>
                                  {t.method}
                                </span>
                                <code>{tr(t.path || "Static review")}</code>
                              </p>
                              <small>{tr(" Requirement ")}{t.requirementId}{tr(" ·")}{" "}
                                {tr(String(t.executionMode))}{tr(" · ")}{tr(t.language)}
                              </small>
                            </div>
                            <div className="row-actions">
                              <button
                                className="quiet"
                                onClick={() => setEditing(structuredClone(t))}
                              >{tr(" Edit ")}</button>
                              <button
                                title={tr("Regenerate this test case")}
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    t.approved &&
                                    !confirm(
                                      tr("Regenerate this approved case? The regenerated case will need approval again."),
                                    )
                                  )
                                    return;
                                  void action(async () => {
                                    setProject(
                                      await api<Project>(`${root}/design`, {
                                        method: "POST",
                                        body: JSON.stringify({
                                          testId: t.id,
                                          useAi,
                                        }),
                                      }),
                                    );
                                    setNotice(
                                      tr("Case regenerated. Review and approve the new definition."),
                                    );
                                  });
                                }}
                              >
                                <RefreshCw size={14} />
                              </button>
                              <button
                                title={
                                  t.approved
                                    ? tr("Remove approval")
                                    : tr("Approve test")
                                }
                                aria-label={`${tr(t.approved ? "Unapprove" : "Approve")} ${t.id}`}
                                className={t.approved ? "approved-button" : ""}
                                disabled={busy}
                                onClick={() =>
                                  void action(() =>
                                    saveTest({ ...t, approved: !t.approved }),
                                  )
                                }
                              >
                                <Check size={16} />
                              </button>
                              <button
                                title={
                                  t.excluded ? tr("Include test") : tr("Exclude test")
                                }
                                aria-label={`${tr(t.excluded ? "Include" : "Exclude")} ${t.id}`}
                                onClick={() =>
                                  void action(() =>
                                    saveTest({ ...t, excluded: !t.excluded }),
                                  )
                                }
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </article>
                        ))
                      )}
                    </section>
                    {editing && (
                      <TestEditor
                        test={editing}
                        setTest={setEditing}
                        onSave={() => void action(() => saveTest(editing))}
                        onClose={() => setEditing(null)}
                        busy={busy}
                      />
                    )}
                  </div>
                </>
              )}
              {stage === 2 && (
                <div className="two-column">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        <Settings2 size={18} />{tr(" Target environment ")}</h2>
                      <Badge
                        value={
                          env.allowMutations
                            ? "Writes permitted"
                            : "Read-only default"
                        }
                      />
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action(async () => {
                          const p = await api<Project>(`${root}/settings`, {
                            method: "PUT",
                            body: JSON.stringify({
                              ...env,
                              authToken: env.authToken || "[STORED]",
                            }),
                          });
                          setProject(p);
                          setEnv({ ...p.settings, authToken: "" });
                          setPreflight(null);
                          setNotice(
                            tr("Environment saved. Run preflight to validate the current configuration."),
                          );
                        });
                      }}
                    >
                      <label>{tr(" Base URL ")}<input
                          type="url"
                          required
                          value={env.baseUrl}
                          onChange={(e) =>
                            setEnv({ ...env, baseUrl: e.target.value })
                          }
                        />
                        <small>{tr(" Private hosts are denied except the explicitly configured local fixture origin. ")}</small>
                      </label>
                      <label>{tr(" Target bearer token ")}<input
                          type="password"
                          autoComplete="off"
                          value={env.authToken}
                          onChange={(e) =>
                            setEnv({ ...env, authToken: e.target.value })
                          }
                          placeholder={tr("Leave blank to retain the stored secret")}
                        />
                      </label>
                      <label>{tr(" Preferred language ")}<select
                          value={env.language}
                          onChange={(e) =>
                            setEnv({ ...env, language: e.target.value })
                          }
                        >
                          <option value="csharp">{tr("C# · recommended")}</option>
                          <option value="dart">{tr("Dart")}</option>
                        </select>
                      </label>
                      <label className="check safety-check">
                        <input
                          type="checkbox"
                          checked={env.allowMutations}
                          onChange={(e) =>
                            setEnv({ ...env, allowMutations: e.target.checked })
                          }
                        />
                        <span>{tr(" This is an approved testing environment. Permit operations that modify target data. ")}</span>
                      </label>
                      <button className="primary" disabled={busy}>{tr(" Save environment ")}</button>
                    </form>
                    <details className="fixture-note"><summary>{tr("About the demonstration fixture")}</summary>
                      <ShieldCheck size={20} />
                      <div>
                        <strong>{tr("Nuzul demonstration fixture")}</strong>
                        <p>{tr(" The local fixture intentionally accepts invalid checkout dates. It is a controlled demonstration, not the deployed Nuzul Staff Console. ")}</p>
                      </div>
                    </details>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        <Activity size={18} />{tr(" Environment preflight ")}</h2>
                      {preflight && <Badge value={preflight.status} />}
                    </div>
                    <p className="muted">{tr(" Connectivity, target policy, runtime readiness, dependencies and execution permissions are checked independently of product assertions. ")}</p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () =>
                          setPreflight(
                            await api<Preflight>(`${root}/preflight`),
                          ),
                        )
                      }
                    >
                      <RefreshCw size={16} />{tr(" Run preflight ")}</button>
                    {preflight && (
                      <>
                        <div className="check-list">
                          {preflight.checks.map((c, i) => (
                            <article key={i}>
                              <div>
                                <strong>{tr(c.name)}</strong>
                                <p>{tr(c.message)}</p>
                              </div>
                              <Badge value={c.status} />
                            </article>
                          ))}
                        </div>
                        <h3>{tr("Language adapters")}</h3>
                        {preflight.adapters.map((a) => (
                          <article className="adapter" key={a.language}>
                            <div>
                              <strong>
                                {a.language === "csharp"
                                  ? tr("C# · recommended")
                                  : tr("Dart")}
                              </strong>
                              <Badge value={a.ready ? "Ready" : "Blocked"} />
                            </div>
                            <p>{tr(a.message)}</p>
                            <small>{a.capabilities.map(tr).join(" · ")}</small>
                          </article>
                        ))}
                      </>
                    )}
                  </section>
                </div>
              )}
              {stage === 3 && (
                <>
                  <section className="panel execution-toolbar">
                    <div>
                      <h2>{tr("Controlled test execution")}</h2>
                      <p className="muted">{tr(" No generated shell commands. Assertions, not AI, decide automated outcomes. ")}</p>
                    </div>
                    <div className="execution-options">
                      <label>{tr(" Runner ")}<select
                          value={env.language}
                          onChange={(e) =>
                            setEnv({ ...env, language: e.target.value })
                          }
                        >
                          <option value="csharp">{tr("C# · primary")}</option>
                          <option value="dart">{tr("Dart · secondary")}</option>
                        </select>
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={mutationConsent}
                          onChange={(e) => setMutationConsent(e.target.checked)}
                        />{tr(" Approve target writes for this run ")}</label>
                      <div className="button-row">
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            run?.status === "Running" ||
                            !project.testCases.some(
                              (t) => t.approved && !t.excluded,
                            )
                          }
                          onClick={() => void action(() => execute())}
                        >
                          <Play size={15} />{tr(" Run approved suite ")}</button>
                        <button
                          className="quiet"
                          disabled={
                            !selected.length || run?.status === "Running"
                          }
                          onClick={() => void action(() => execute(selected))}
                        >{tr(" Run selected (")}{selected.length}{tr(") ")}</button>
                        {run?.status === "Running" && (
                          <button
                            className="danger"
                            onClick={() =>
                              void action(async () =>
                                setRun(
                                  await api<Run>(
                                    `${root}/runs/${run.id}/cancel`,
                                    { method: "POST" },
                                  ),
                                ),
                              )
                            }
                          >
                            <Square size={14} />{tr(" Cancel ")}</button>
                        )}
                      </div>
                    </div>
                  </section>
                  <div className="two-column execution-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>{tr("Execution queue")}</h2>
                        <span className="counter">
                          {project.testCases.length}{tr(" definitions ")}</span>
                      </div>
                      <div className="queue">
                        {project.testCases.map((t) => (
                          <article key={t.id}>
                            <input
                              aria-label={`Select ${t.id}`}
                              type="checkbox"
                              checked={selected.includes(t.id)}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? [...selected, t.id]
                                    : selected.filter((id) => id !== t.id),
                                )
                              }
                              disabled={!t.approved || t.excluded}
                            />
                            <div>
                              <code>{t.id}</code>
                              <h3>{t.title}</h3>
                              <small>
                                {t.excluded
                                  ? tr("Excluded")
                                  : t.approved
                                    ? tr("Approved")
                                    : tr("Approval required")}{" "}{tr(" · ")}{t.method} {t.path}
                              </small>
                            </div>
                            <button
                              className="quiet"
                              title={tr("Execute one test in manual mode")}
                              disabled={
                                busy ||
                                !t.approved ||
                                t.excluded ||
                                run?.status === "Running"
                              }
                              onClick={() => setManualCase(t)}
                            >
                              <Play size={13} />{tr(" Manual ")}</button>
                          </article>
                        ))}
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>{tr("Latest run")}</h2>
                        {run && <Badge value={run.status} />}
                      </div>
                      {!run ? (
                        <div className="empty">
                          <Terminal size={35} />
                          <p>{tr("Execution evidence will appear here.")}</p>
                        </div>
                      ) : (
                        <>
                          <div className="run-meta">
                            <code>{run.id}</code>
                            <span>
                              {tr(run.language)}{tr(" ·")}{" "}
                              {new Date(run.startedAt).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB")}
                            </span>
                          </div>
                          <div className="result-list">
                            {run.results.map((r, i) => (
                              <button
                                key={i}
                                className="result-row"
                                onClick={() => {
                                  setActiveResult(r);
                                  setReviewOutcome(
                                    r.reviewedOutcome || r.outcome,
                                  );
                                  setObservations(r.observations || "");
                                  setEvidence(r.attachedEvidence || "");
                                }}
                              >
                                <span>
                                  <code>{r.testCaseId}</code>
                                  <small>{r.durationMs}{tr(" ms")}</small>
                                </span>
                                <Badge value={r.outcome} />
                                <ChevronRight size={14} />
                              </button>
                            ))}
                          </div>
                          {counts("Failed") > 0 && (
                            <button
                              className="quiet"
                              disabled={run.status === "Running"}
                              onClick={() =>
                                void action(() =>
                                  execute(
                                    run.results
                                      .filter((r) => r.outcome === "Failed")
                                      .map((r) => r.testCaseId),
                                  ),
                                )
                              }
                            >
                              <RefreshCw size={14} />{tr(" Repeat failed tests ")}</button>
                          )}
                        </>
                      )}
                    </section>
                  </div>
                  {manualCase && (
                    <section className="panel evidence-panel">
                      <div className="panel-heading">
                        <h2>{tr("Manual execution · ")}{manualCase.id}</h2>
                        <button
                          aria-label={tr("Close manual preview")}
                          onClick={() => setManualCase(null)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="evidence-grid">
                        <div>
                          <h3>{manualCase.title}</h3>
                          <p>
                            <strong>{tr("Expected:")}</strong>{" "}
                            {manualCase.expectedResult}
                          </p>
                          <ol>
                            {manualCase.steps.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ol>
                          <small>{tr(" Requirement ")}{manualCase.requirementId}{tr(" ·")}{" "}
                            {tr(manualCase.verificationStatus)}
                          </small>
                        </div>
                        <div>
                          <h3>{tr("Prepared request")}</h3>
                          <pre>
                            {manualCase.method} {env.baseUrl}
                            {manualCase.path}
                            {"\n"}
                            {manualCase.body || tr("(No body)")}
                          </pre>
                          <p className="muted">{tr(" Run this one case, inspect the response, then record observations and evidence below. ")}</p>
                        </div>
                      </div>
                      <button
                        className="primary"
                        disabled={busy || run?.status === "Running"}
                        onClick={() =>
                          void action(() => execute([manualCase.id], "Manual"))
                        }
                      >
                        <Play size={15} />{tr(" Execute this case ")}</button>
                    </section>
                  )}
                  <details
                    className={"console " + (expanded ? "expanded" : "")}
                  ><summary>{tr("Technical execution log")}</summary>
                    <div className="console-heading">
                      <h2>
                        <Terminal size={16} />{tr(" Execution console ")}<span>{tr("READ-ONLY")}</span>
                      </h2>
                      <div>
                        <select
                          aria-label={tr("Filter console")}
                          value={consoleFilter}
                          onChange={(e) => setConsoleFilter(e.target.value)}
                        >
                          {[
                            "All",
                            "Passed",
                            "Failed",
                            "Blocked",
                            "Skipped",
                            "Needs Review",
                          ].map((x) => (
                            <option key={x} value={x}>{tr(String(x))}</option>
                          ))}
                        </select>
                        <button
                          onClick={() =>
                            void action(async () => {
                              await navigator.clipboard.writeText(
                                JSON.stringify(run, null, 2),
                              );
                              setNotice("Execution output copied.");
                            })
                          }
                          title={tr("Copy output")}
                        >
                          <Copy size={15} />
                        </button>
                        <button onClick={() => setExpanded(!expanded)}>
                          {tr(expanded ? "Collapse" : "Expand")}
                        </button>
                      </div>
                    </div>
                    <div className="console-body">
                      {!run ? (
                        <p className="console-muted">{tr(" Waiting for a controlled execution… ")}</p>
                      ) : (
                        <>
                          <p className="console-muted">{tr(" [")}{run.startedAt}{tr("] adapter:")}{tr(run.language)}{tr(" run: ")}{run.id}{tr(" status:")}{tr(String(run.status))}
                          </p>
                          {run.results
                            .filter(
                              (r) =>
                                consoleFilter === "All" ||
                                r.outcome === consoleFilter,
                            )
                            .map((r, i) => (
                              <div className="console-entry" key={i}>
                                <p>
                                  <span
                                    className={
                                      r.outcome === "Passed"
                                        ? "console-pass"
                                        : r.outcome === "Failed"
                                          ? "console-fail"
                                          : "console-muted"
                                    }
                                  >{tr(" [")}{tr(r.outcome)}{tr("] ")}</span>{" "}
                                  {r.testCaseId} {r.request.method}{" "}
                                  {r.request.url}{tr(" (")}{r.durationMs}{tr("ms) ")}</p>
                                <p>{tr(" HTTP ")}{r.response.status}{tr(" ·")}{" "}
                                  {r.assertionOutcome}
                                </p>
                                <pre>{r.response.body}</pre>
                                {r.errorDetails && (
                                  <p className="console-fail">
                                    {r.errorDetails}
                                  </p>
                                )}
                                <small>{tr("Evidence: ")}{r.evidenceReference}</small>
                              </div>
                            ))}
                        </>
                      )}
                    </div>
                  </details>
                </>
              )}
              {stage === 4 && (
                <>
                  <div className="metrics">
                    {[
                      ["Total results", run?.results.length || 0],
                      ["Passed", counts("Passed")],
                      ["Failed", counts("Failed")],
                      ["Blocked", counts("Blocked")],
                      ["Skipped", counts("Skipped")],
                      ["Needs Review", counts("Needs Review")],
                    ].map(([name, n]) => (
                      <article
                        key={name}
                        className={String(name).toLowerCase().replace(" ", "-")}
                      >
                        <span>{tr(String(name))}</span>
                        <strong>{n}</strong>
                      </article>
                    ))}
                  </div>
                  <section className="panel report-bar">
                    <div>
                      <h2>{tr("Evidence-based reports")}</h2>
                      <p className="muted">{tr(" Editable exports include traceability, exact outcomes, environment limitations and confirmed findings. ")}</p>
                    </div>
                    <div className="button-row">
                      {["json", "html", "rtf"].map((format) => (
                        <button
                          key={format}
                          className="quiet"
                          disabled={busy}
                          onClick={() => void action(() => download(format))}
                        >
                          <Download size={15} />
                          {tr(format === "html" ? "HTML report" : format === "rtf" ? "Editable RTF" : "JSON data")}
                        </button>
                      ))}
                    </div>
                  </section>
                  <div className="two-column">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>{tr("Execution history")}</h2>
                        <span className="counter">
                          {project.runs.length}{tr(" runs ")}</span>
                      </div>
                      {project.runs.map((r) => (
                        <button
                          className={
                            "history-row " +
                            (r.id === run?.id ? "selected" : "")
                          }
                          key={r.id}
                          onClick={() => {
                            setRun(r);
                            setActiveResult(null);
                          }}
                        >
                          <div>
                            <code>{r.id}</code>
                            <small>
                              {tr(r.language)}{tr(" ·")}{" "}
                              {new Date(r.startedAt).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB")}{tr(" ·")}{" "}
                              {r.results.length}{tr(" results ")}</small>
                          </div>
                          <Badge value={r.status} />
                        </button>
                      ))}
                      {!project.runs.length && (
                        <p className="empty">{tr(" No execution history. Run an approved test first. ")}</p>
                      )}
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>{tr("Results & traceability")}</h2>
                        {run && <Badge value={run.status} />}
                      </div>
                      {run?.results.map((r, i) => (
                        <button
                          key={i}
                          className="result-row"
                          onClick={() => {
                            setActiveResult(r);
                            setReviewOutcome(r.reviewedOutcome || r.outcome);
                            setObservations(r.observations || "");
                            setEvidence(r.attachedEvidence || "");
                          }}
                        >
                          <span>
                            <code>{r.testCaseId}</code>
                            <small>
                              {project.testCases.find(
                                (t) => t.id === r.testCaseId,
                              )?.title || r.actualResult}
                            </small>
                          </span>
                          <Badge value={r.outcome} />
                          <ChevronRight size={14} />
                        </button>
                      ))}
                      <div className="defect-register">
                        <h3>{tr("Formal defect register")}</h3>
                        {run?.results
                          .filter((r) => r.outcome === "Failed")
                          .map((r, i) => {
                            const saved = project.defects?.find(
                              (d) =>
                                d.evidenceReference === r.evidenceReference,
                            );
                            return (
                              <article key={r.evidenceReference}>
                                <div>
                                  <code>
                                    {saved?.bugId || tr("Awaiting triage")}
                                  </code>
                                  <h3>
                                    {saved?.title ||
                                      project.testCases.find(
                                        (t) => t.id === r.testCaseId,
                                      )?.title ||
                                      r.testCaseId}
                                  </h3>
                                  <small>
                                    {tr(saved?.severity || "Needs triage")}{tr(" ·")}{" "}
                                    {tr(saved?.priority || "High")}{tr(" ·")}{" "}
                                    {tr(saved?.status || "Open")}
                                  </small>
                                </div>
                                <button
                                  className="quiet"
                                  onClick={() =>
                                    setDefect(
                                      saved || {
                                        evidenceReference: r.evidenceReference,
                                        title:
                                          project.testCases.find(
                                            (t) => t.id === r.testCaseId,
                                          )?.title || r.testCaseId,
                                        description:
                                          "Deterministic assertion mismatch: " +
                                          r.assertionOutcome,
                                        severity: "Needs triage",
                                        priority:
                                          project.testCases.find(
                                            (t) => t.id === r.testCaseId,
                                          )?.priority || "High",
                                        status: "Open",
                                        reproductionSteps:
                                          project.testCases.find(
                                            (t) => t.id === r.testCaseId,
                                          )?.steps || [],
                                      },
                                    )
                                  }
                                >{tr(" Triage ")}</button>
                              </article>
                            );
                          })}
                        {!run?.results.some((r) => r.outcome === "Failed") && (
                          <p className="muted">{tr(" No failed assertions in this run. ")}</p>
                        )}
                      </div>
                      <div className="limitation-note">
                        <strong>{tr("Interpretation boundary")}</strong>
                        <p>{tr(" Network, authentication and environment failures are not automatically product defects. AI suggestions are not confirmed causes. Monitoring and control continue throughout all stages. ")}</p>
                      </div>
                    </section>
                  </div>
                </>
              )}
              {activeResult && (
                <section className="panel evidence-panel">
                  <div className="panel-heading">
                    <h2>{tr("Evidence · ")}{activeResult.testCaseId}</h2>
                    <div className="button-row">
                      <Badge value={activeResult.outcome} />
                      {activeResult.reviewedOutcome && (
                        <span className="reviewed-outcome">{tr(" Human review:")}{" "}
                          <Badge value={activeResult.reviewedOutcome} />
                        </span>
                      )}
                      <button
                        onClick={() => setActiveResult(null)}
                        aria-label={tr("Close evidence")}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="evidence-grid">
                    <div>
                      <h3>{tr("Expected result")}</h3>
                      <p>{activeResult.expectedResult}</p>
                      <h3>{tr("Actual result")}</h3>
                      <p>{activeResult.actualResult}</p>
                      <h3>{tr("Assertion outcome")}</h3>
                      <pre>{activeResult.assertionOutcome}</pre>
                      {activeResult.errorDetails && (
                        <p className="error-text">
                          {activeResult.errorDetails}
                        </p>
                      )}
                      <small>
                        {activeResult.timestamp}{tr(" · ")}{activeResult.durationMs}{tr(" ms ")}<br />{tr(" Evidence: ")}{activeResult.evidenceReference}
                      </small>
                    </div>
                    <div>
                      <h3>{tr("Request")}</h3>
                      <pre>{JSON.stringify(activeResult.request, null, 2)}</pre>
                      <h3>{tr("Response")}</h3>
                      <pre>
                        {JSON.stringify(activeResult.response, null, 2)}
                      </pre>
                    </div>
                  </div>
                  <form
                    className="review-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        const r = await api<Run>(
                          `${root}/runs/${run!.id}/results/${activeResult.testCaseId}/review`,
                          {
                            method: "PUT",
                            body: JSON.stringify({
                              outcome: reviewOutcome,
                              observations,
                              evidence,
                            }),
                          },
                        );
                        setRun(r);
                        setActiveResult(
                          r.results.find(
                            (x) => x.testCaseId === activeResult.testCaseId,
                          ) || null,
                        );
                        setNotice(
                          tr("Review saved. Deterministic execution evidence remains attached."),
                        );
                      });
                    }}
                  >
                    <div className="form-row">
                      <p className="muted">{tr(" Your reviewed outcome is saved separately from the immutable automated assertion result. Static manual cases can receive a reviewed outcome. ")}</p>
                      <label>{tr(" Reviewed outcome ")}<select
                          value={reviewOutcome}
                          onChange={(e) => setReviewOutcome(e.target.value)}
                        >
                          {[
                            "Passed",
                            "Failed",
                            "Blocked",
                            "Skipped",
                            "Needs Review",
                          ].map((x) => (
                            <option key={x} value={x}>{tr(String(x))}</option>
                          ))}
                        </select>
                      </label>
                      <label>{tr(" Evidence reference or attachment URL ")}<input
                          value={evidence}
                          onChange={(e) => setEvidence(e.target.value)}
                          placeholder={tr("Local evidence reference")}
                        />
                      </label>
                    </div>
                    <label className="upload-control">
                      <Upload size={15} />{tr(" Attach evidence file (up to 700 KB) ")}<input
                        type="file"
                        accept="image/*,.txt,.json,.log,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 700000) {
                            setError("Evidence file must be at most 700 KB.");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            setEvidence(String(reader.result));
                            setNotice(
                              tr("Evidence file loaded. Save the review to attach it."),
                            );
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {evidence.startsWith("data:image/") && (
                      <img
                        className="source-image"
                        src={evidence}
                        alt={tr("Attached execution evidence")}
                      />
                    )}
                    <label>{tr(" Review observations ")}<textarea
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                        rows={3}
                        placeholder={tr("Record the observed behavior and what was verified. Do not infer a root cause.")}
                      />
                    </label>
                    <button className="primary" disabled={busy}>{tr(" Save evidence review ")}</button>
                  </form>
                </section>
              )}
              {defect && (
                <section className="panel defect-editor">
                  <div className="panel-heading">
                    <h2>{tr("Defect triage")}</h2>
                    <button
                      aria-label={tr("Close defect")}
                      onClick={() => setDefect(null)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        setProject(
                          await api<Project>(
                            `${root}/defects/${encodeURIComponent(defect.evidenceReference)}`,
                            { method: "PUT", body: JSON.stringify(defect) },
                          ),
                        );
                        setDefect(null);
                        setNotice("Formal defect triage saved for exports.");
                      });
                    }}
                  >
                    <label>{tr(" Defect title ")}<input
                        required
                        value={defect.title}
                        onChange={(e) =>
                          setDefect({ ...defect, title: e.target.value })
                        }
                      />
                    </label>
                    <label>{tr(" Description ")}<textarea
                        rows={3}
                        value={defect.description}
                        onChange={(e) =>
                          setDefect({ ...defect, description: e.target.value })
                        }
                      />
                    </label>
                    <div className="form-row">
                      <label>{tr(" Severity ")}<select
                          value={defect.severity}
                          onChange={(e) =>
                            setDefect({ ...defect, severity: e.target.value })
                          }
                        >
                          {[
                            "Needs triage",
                            "Critical",
                            "Major",
                            "Minor",
                            "Trivial",
                          ].map((v) => (
                            <option key={v} value={v}>{tr(String(v))}</option>
                          ))}
                        </select>
                      </label>
                      <label>{tr(" Priority ")}<select
                          value={defect.priority}
                          onChange={(e) =>
                            setDefect({ ...defect, priority: e.target.value })
                          }
                        >
                          {["Critical", "High", "Medium", "Low"].map((v) => (
                            <option key={v} value={v}>{tr(String(v))}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>{tr(" Status ")}<select
                        value={defect.status}
                        onChange={(e) =>
                          setDefect({ ...defect, status: e.target.value })
                        }
                      >
                        {[
                          "Open",
                          "In progress",
                          "Resolved",
                          "Closed",
                          "Rejected",
                        ].map((v) => (
                          <option key={v} value={v}>{tr(String(v))}</option>
                        ))}
                      </select>
                    </label>
                    <StringFields
                      label={tr("Reproduction steps")}
                      values={defect.reproductionSteps}
                      onChange={(reproductionSteps) =>
                        setDefect({ ...defect, reproductionSteps })
                      }
                    />
                    <button className="primary" disabled={busy}>{tr(" Save defect report ")}</button>
                  </form>
                </section>
              )}
            </>
          )}
          <footer className="footer">
            <span>{tr("Sarj QA Studio · Local-first engineering workspace")}</span>
            <details><summary>{tr("Workflow reference")}</summary><p>{tr(" Five-stage navigation is a simplified ISTQB activity mapping, not a replacement for the official process. ")}</p></details>
          </footer>
        </main>
      </div>
    </div></>
  );
}
function StringFields({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="repeatable">
      <legend>{tr(label)}</legend>
      {values.map((v, i) => (
        <div className="repeat-row" key={i}>
          <span>{i + 1}</span>
          <input
            aria-label={`${tr(label)} ${i + 1}`}
            value={v}
            onChange={(e) =>
              onChange(values.map((x, j) => (j === i ? e.target.value : x)))
            }
          />
          <button
            type="button"
            aria-label={`${tr("Remove")} ${tr(label)} ${i + 1}`}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() => onChange([...values, ""])}
      >
        <Plus size={15} />{tr(" Add ")}{tr(label)}
      </button>
    </fieldset>
  );
}
function TestEditor({
  test: t,
  setTest,
  onSave,
  onClose,
  busy,
}: {
  test: TestCase;
  setTest: (v: TestCase) => void;
  onSave: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const update = (p: Partial<TestCase>) => setTest({ ...t, ...p });
  return (
    <section className="panel test-editor">
      <div className="panel-heading">
        <h2>{tr("Edit ")}{t.id}</h2>
        <button onClick={onClose} aria-label={tr("Close editor")}>
          <X size={16} />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <label>{tr(" Title ")}<input
            required
            value={t.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </label>
        <label>{tr(" Requirement reference ")}<input
            value={t.requirementId}
            onChange={(e) => update({ requirementId: e.target.value })}
          />
        </label>
        <div className="form-row">
          <label>{tr(" Priority ")}<select
              value={t.priority}
              onChange={(e) => update({ priority: e.target.value })}
            >
              {["Critical", "High", "Medium", "Low"].map((x) => (
                <option key={x} value={x}>{tr(String(x))}</option>
              ))}
            </select>
          </label>
          <label>{tr(" Test type ")}<input
              value={t.testType}
              onChange={(e) => update({ testType: e.target.value })}
            />
          </label>
        </div>
        <div className="form-row">
          <label>{tr(" Execution mode ")}<select
              value={t.executionMode}
              onChange={(e) => update({ executionMode: e.target.value })}
            >
              <option value="Automated">{tr("Automated")}</option>
              <option value="Manual">{tr("Manual")}</option>
            </select>
          </label>
          <label>{tr(" Supported language ")}<select
              value={tr(t.language)}
              onChange={(e) => update({ language: e.target.value })}
            >
              <option value="csharp">{tr("C#")}</option>
              <option value="dart">{tr("Dart")}</option>
            </select>
          </label>
        </div>
        <label>{tr(" Verification status ")}<input
            value={t.verificationStatus}
            onChange={(e) => update({ verificationStatus: e.target.value })}
          />
        </label>
        <StringFields
          label={tr("Preconditions")}
          values={t.preconditions || []}
          onChange={(preconditions) => update({ preconditions })}
        />
        <StringFields
          label={tr("Steps")}
          values={t.steps || []}
          onChange={(steps) => update({ steps })}
        />
        <label>{tr(" Input data ")}<textarea
            rows={3}
            value={t.inputData}
            onChange={(e) => update({ inputData: e.target.value })}
          />
        </label>
        <label>{tr(" Expected result ")}<textarea
            required
            rows={3}
            value={t.expectedResult}
            onChange={(e) => update({ expectedResult: e.target.value })}
          />
        </label>
        <details className="advanced-fields"><summary>{tr("Advanced request & assertion settings")}</summary><div className="form-row request-fields">
          <label>{tr(" Method ")}<select
              value={t.method}
              onChange={(e) => update({ method: e.target.value })}
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
                (x) => (
                  <option key={x} value={x}>{tr(String(x))}</option>
                ),
              )}
            </select>
          </label>
          <label>{tr(" Endpoint path ")}<input
              value={t.path}
              onChange={(e) => update({ path: e.target.value })}
            />
          </label>
        </div>
        <label>{tr(" Request body (JSON) ")}<textarea
            rows={4}
            value={t.body || ""}
            onChange={(e) => update({ body: e.target.value })}
          />
        </label>
        <label>{tr(" Expected HTTP status ")}<input
            type="number"
            min={100}
            max={599}
            value={t.expectedStatus ?? ""}
            onChange={(e) =>
              update({
                expectedStatus: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <fieldset className="repeatable assertions">
          <legend>{tr("Deterministic assertions")}</legend>
          {t.assertions.map((a, i) => (
            <div className="assertion-row" key={i}>
              <select
                aria-label={`${tr("Assertion")} ${i + 1} · ${tr("kind")}`}
                value={a.kind}
                onChange={(e) =>
                  update({
                    assertions: t.assertions.map((x, j) =>
                      j === i ? { ...a, kind: e.target.value } : x,
                    ),
                  })
                }
              >
                <option value="status">{tr("HTTP status")}</option>
                <option value="jsonEquals">{tr("JSON equals")}</option>
                <option value="jsonExists">{tr("JSON exists")}</option>
              </select>
              <input
                aria-label={`${tr("Assertion")} ${i + 1} · ${tr("path")}`}
                placeholder={tr("JSON path")}
                value={a.path}
                onChange={(e) =>
                  update({
                    assertions: t.assertions.map((x, j) =>
                      j === i ? { ...a, path: e.target.value } : x,
                    ),
                  })
                }
              />
              <input
                aria-label={`${tr("Assertion")} ${i + 1} · ${tr("expected")}`}
                placeholder={tr("Expected value")}
                value={a.expected}
                onChange={(e) =>
                  update({
                    assertions: t.assertions.map((x, j) =>
                      j === i ? { ...a, expected: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                aria-label={`${tr("Remove")} ${tr("Assertion")} ${i + 1}`}
                onClick={() =>
                  update({ assertions: t.assertions.filter((_, j) => j !== i) })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            onClick={() =>
              update({
                assertions: [
                  ...t.assertions,
                  { kind: "jsonEquals", path: "", expected: "" } as Assertion,
                ],
              })
            }
          >
            <Plus size={15} />{tr(" Add assertion ")}</button>
        </fieldset>
        </details><div className="button-row">
          <label className="check">
            <input
              type="checkbox"
              checked={t.approved}
              onChange={(e) => update({ approved: e.target.checked })}
            />{tr(" Approved ")}</label>
          <label className="check">
            <input
              type="checkbox"
              checked={t.excluded}
              onChange={(e) => update({ excluded: e.target.checked })}
            />{tr(" Excluded ")}</label>
        </div>
        <button className="primary" disabled={busy}>{tr(" Save test definition ")}</button>
      </form>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
