# Current entry modes

Default reviewer demo: http://127.0.0.1:5288, no sign-in; same-origin mutations require X-Sarj-Request: studio. Data stays in .demo-data. Private Google deployments require a verified sole-owner cookie and same-origin mutations. The legacy developer key mode below is separate and not the default demo.

# Shared contract v1
Backend ASP.NET Core .NET 10, port 5188; frontend Vite port 5189 proxy /api to 5188. JSON camelCase, string enums. SQLite persistence. Auth all /api except /api/health with X-Studio-Key from NUZUL_STUDIO_KEY; frontend asks key (sessionStorage), backend script generates local key outside git. Local fixture localhost:5190 explicitly allowed only exact configured origin.
Project {id,name,sources:Source[],requirements:Requirement[],testCases:TestCase[],runs:Run[],settings:Settings}
Source {id,type,name,content}; Requirement {id,sourceId,reference,text,status} status Verified|Inferred / Needs Review|Unknown.
TestCase {id,title,requirementId,preconditions:string[],inputData:string,steps:string[],expectedResult,priority:Critical|High|Medium|Low,testType,executionMode:Automated|Manual,language:csharp|dart,verificationStatus,approved:bool,excluded:bool,method,path,body:string,expectedStatus:int?,assertions:Assertion[]}
Assertion {kind:status|jsonEquals|jsonExists,path:string,expected:string}; status compares expected HTTP, json paths dot notation (no $).
Settings {baseUrl,language,allowMutations:bool,authToken:string} authToken write-only masked in GET and never reports. Mutating suites require allowMutations true plus execute request allowMutations true.
Run {id,projectId,status:Running|Completed|Cancelled,language,startedAt,results:ExecutionRecord[]}
ExecutionRecord {testCaseId,outcome:Passed|Failed|Blocked|Skipped|Needs Review,request:{method,url,body},response:{status:int,body:string},expectedResult,actualResult,assertionOutcome,durationMs,timestamp,errorDetails,evidenceReference}
Routes:
GET /api/projects => Project[]; POST /api/projects {name} => Project; GET /api/projects/{id} => Project
POST /api/projects/{id}/sources {type,name,content} => Project (OpenAPI JSON/YAML, text, image metadata/data)
POST /api/projects/{id}/design {includeLowerPriorities?:bool,useAi?:bool} => Project
PUT /api/projects/{id}/tests/{testId} full TestCase => Project
PUT /api/projects/{id}/settings Settings => Project
GET /api/projects/{id}/preflight => {status,checks:[{name,status,message}],adapters:[{language,ready,capabilities:string[],message}]}
POST /api/projects/{id}/runs {testIds?:string[],language,mode:Automated|Manual,allowMutations:bool} => Run (async), GET /api/projects/{id}/runs/{runId} => Run; POST .../cancel => Run
PUT /api/projects/{id}/runs/{runId}/results/{testId}/review {outcome,observations,evidence?:string} => Run
GET /api/projects/{id}/reports/{format} format json|html|rtf => download
GET /api/settings => safe provider config; PUT /api/settings {providerUrl,model,apiKey,enabled} configurable OpenAI-compatible provider.
POST /api/projects/{id}/retrieve {query} => grounded chunks with source references.
Runner protocol: stdin JSON {baseUrl,authToken,allowMutations,tests:TestCase[]}; stdout JSON ExecutionRecord[]; one process per suite. Backend C# adapter executes deterministic HTTP directly using shared implementation (runners/csharp may use CLI project shared engine); Dart external process fixed executable and fixed script path. No arbitrary code/shell. Each request timeout <=10s, bounded output. Blocked for connectivity, auth 401/403, permission, unsupported; unknown oracle => Needs Review. Redirects off. Backend validates target origin and DNS before execution, disallow private networks except exact local fixture.
Fixture Node built-in HTTP port5190: /health GET200; /bookings GET200 array; POST /bookings valid=>201 object id,checkIn,checkOut,nights; deliberately accepts invalid checkOut before checkIn (201 instead of documented400). GET /bookings/{id} 200/404, PUT/PATCH supported. /protected GET401 without Bearer fixture-token,200 with. OpenAPI fixtures/nuzul.openapi.json authoritative.
Ownership: backend agent owns backend/ and runners/csharp + server APIs, reports+AI; runner agent owns runners/dart, fixtures/, scripts/runner-contract-test.mjs and runner docs; frontend agent owns frontend/ and design notes; lead owns scripts startup, integration tests, benchmark, root docs, integration fixes after coordination.

## Implemented additions
- Run captures `testCasesSnapshot`, `requirementsSnapshot`, `targetSnapshot` for historical report integrity.
- ExecutionRecord includes `reviewedOutcome`, `observations`, `attachedEvidence`, `reviewed`; automated `outcome` is not replaced by human review. Static human outcomes are explicitly labeled human.
- Project `defects` records generated formal IDs and editable triage. `PUT /api/projects/{id}/defects/{evidenceReference}` edits title/description/severity/priority/status/reproductionSteps for an actual failed evidence record.
- Design request optional `testId` individually regenerates a case and revokes its approval.
- Dart supports optional fixed `--ndjson` live output; ordinary CLI input/output remains one JSON array for parity and benchmark tools.
- Optional explicit `POST /api/projects/{id}/analyze {useAi:true}` analyzes bounded sources/text/images using the configured provider; all returned requirement drafts remain Inferred / Needs Review or Unknown, never Verified. No external inference was performed during this build.
