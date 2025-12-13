// ============================================
// PROJECT.md Types
// ============================================

export interface PhaseGates {
  ideation_complete: boolean;
  ideation_approved: boolean;
  ideation_approved_at?: string;
  spec_complete: boolean;
  spec_approved: boolean;
  spec_approved_at?: string;
  planning_complete: boolean;
  planning_approved: boolean;
  planning_approved_at?: string;
}

export interface ImplementationProgress {
  total_phases: number;
  completed_phases: number;
  current_impl_phase: number;
  current_impl_phase_name: string;
}

export interface CostTracking {
  total_tokens: number;
  total_cost_usd: number;
}

export interface AgentConfig {
  primary: 'claude-code';
  timeout_minutes: number;
}

export interface ProjectMeta {
  version: number;
  project_id: string;
  project_name: string;
  created: string;
  updated: string;
  current_phase: 1 | 2 | 3 | 'implementation';
  current_phase_name: string;
  phase_status: 'pending' | 'in_progress' | 'complete' | 'approved';
  gates: PhaseGates;
  implementation?: ImplementationProgress;
  cost: CostTracking;
  agent: AgentConfig;
}

export type TaskStatus = 'pending' | 'in_progress' | 'complete' | 'failed' | 'skipped';

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  depends_on: string[];
  acceptance_criteria: string[];
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  cost_usd?: number;
  commit_hash?: string;
  failure_reason?: string;
}

export interface ImplementationPhase {
  phase_number: number;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'complete';
  tasks: Task[];
}

export interface Approval {
  phase: string;
  status: 'pending' | 'approved';
  approved_at?: string;
  notes?: string;
}

export interface IdeationContent {
  problem_statement: string;
  target_users: string;
  use_cases: string[];
  success_criteria: string[];
  constraints: {
    must_have: string[];
    nice_to_have: string[];
    out_of_scope: string[];
  };
  raw_content: string;
}

export interface TechStackItem {
  layer: string;
  choice: string;
  rationale: string;
}

export interface SpecificationContent {
  architecture: string;
  tech_stack: TechStackItem[];
  data_models: string;
  api_contracts: string;
  ui_requirements: string;
  raw_content: string;
}

export interface ProjectDocument {
  meta: ProjectMeta;
  ideation: IdeationContent | null;
  specification: SpecificationContent | null;
  implementation_phases: ImplementationPhase[];
  approvals: Approval[];
}

// ============================================
// Task Result Types
// ============================================

export interface KeyDecision {
  decision: string;
  rationale: string;
}

export interface AcceptanceCriterionResult {
  criterion: string;
  met: boolean;
  notes?: string;
}

export interface ValidationResult {
  passed: boolean;
  validator_output: string;
  criteria_checked: number;
  criteria_passed: number;
}

export interface TaskResult {
  task_id: string;
  task_description: string;
  status: 'success' | 'failed';
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  summary: string;
  files_created: string[];
  files_modified: string[];
  files_deleted: string[];
  key_decisions: KeyDecision[];
  assumptions: string[];
  tests_added: number;
  tests_passing: number;
  tests_failing: number;
  test_output?: string;
  acceptance_criteria: AcceptanceCriterionResult[];
  validation: ValidationResult;
  tokens_used: number;
  cost_usd: number;
  failure_reason?: string;
  commit_hash?: string;
}

// ============================================
// Config Types
// ============================================

export interface GitConfig {
  enabled: boolean;
  auto_commit: boolean;
  branch_prefix: string;
}

export interface LLMConfig {
  provider: 'anthropic';
  model: string;
  max_tokens: number;
}

export interface OrchestratorConfig {
  project_dir: string;
  agent: AgentConfig;
  git: GitConfig;
  llm: LLMConfig;
}

export const DEFAULT_CONFIG: Omit<OrchestratorConfig, 'project_dir'> = {
  agent: {
    primary: 'claude-code',
    timeout_minutes: 10,
  },
  git: {
    enabled: true,
    auto_commit: true,
    branch_prefix: 'phase-',
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
  },
};

// ============================================
// Re-exports
// ============================================

export * from './errors.js';
