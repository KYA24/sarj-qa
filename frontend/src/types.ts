export type Source = {
  id: string;
  type: string;
  name: string;
  content: string;
};
export type Requirement = {
  id: string;
  sourceId: string;
  reference: string;
  text: string;
  status: string;
};
export type Assertion = { kind: string; path: string; expected: string };
export type TestCase = {
  id: string;
  title: string;
  requirementId: string;
  preconditions: string[];
  inputData: string;
  steps: string[];
  expectedResult: string;
  priority: string;
  testType: string;
  executionMode: string;
  language: string;
  verificationStatus: string;
  approved: boolean;
  excluded: boolean;
  method: string;
  path: string;
  body: string;
  expectedStatus: number | null;
  assertions: Assertion[];
};
export type Settings = {
  baseUrl: string;
  language: string;
  allowMutations: boolean;
  authToken: string;
};
export type Result = {
  testCaseId: string;
  outcome: string;
  request: { method: string; url: string; body: string };
  response: { status: number; body: string };
  expectedResult: string;
  actualResult: string;
  assertionOutcome: string;
  durationMs: number;
  timestamp: string;
  errorDetails: string;
  evidenceReference: string;
  reviewedOutcome?: string;
  observations?: string;
  attachedEvidence?: string;
};
export type Run = {
  id: string;
  projectId: string;
  status: string;
  language: string;
  startedAt: string;
  results: Result[];
};
export type Project = {
  archived?: boolean;
  archiveReason?: string;
  id: string;
  name: string;
  sources: Source[];
  requirements: Requirement[];
  testCases: TestCase[];
  runs: Run[];
  settings: Settings;
  defects?: Defect[];
};
export type Preflight = {
  status: string;
  checks: { name: string; status: string; message: string }[];
  adapters: {
    language: string;
    ready: boolean;
    capabilities: string[];
    message: string;
  }[];
};

export type Defect = {
  bugId?: string;
  evidenceReference: string;
  title: string;
  description: string;
  severity: string;
  priority: string;
  status: string;
  reproductionSteps: string[];
};
