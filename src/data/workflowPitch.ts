import type { WorkflowSlug } from '../types/studio.ts';

export interface ElevatorPitch {
  title: string;
  purpose: string;
  value: string;
  nextStep: string;
}

export type StandalonePitchKey = 'graph' | 'histolog' | 'api' | 'specs';

export const STUDIO_HOME_PITCH: ElevatorPitch = {
  title: 'Start with a small example',
  purpose: 'Describe a format with grammar rules, then see how the studio checks and transforms it.',
  value: 'Work one step at a time; each workbench builds on the same shared workspace.',
  nextStep: 'Open Grammar & DAG, load the example, and follow the next step. Guided help offers a short tour.',
};

export const WORKBENCH_PITCHES: Record<WorkflowSlug, Pick<ElevatorPitch, 'purpose' | 'value'>> = {
  dialect: {
    purpose: 'Define the grammar dialect and the rules that describe valid input.',
    value: 'A clear grammar becomes the shared source for evaluation, schemas, and generated targets.',
  },
  rule_props: {
    purpose: 'Tune rule precedence, ordering, composition, and export behavior.',
    value: 'Make parsing intent explicit and keep generated language targets consistent.',
  },
  logic_calc: {
    purpose: 'Express and evaluate symbolic logic, arithmetic, and reusable lambda callbacks.',
    value: 'Turn business conditions into inspectable results that can be reused across the studio.',
  },
  schema: {
    purpose: 'Describe the data model as Schema.org JSON-LD and set its mutation policy.',
    value: 'Give generated artifacts a portable, machine-readable contract with clear edit boundaries.',
  },
  mutations: {
    purpose: 'Review and control line-level changes to the schema and generated declarations.',
    value: 'Preserve intentional edits while making transformations traceable and reversible.',
  },
  evaluator: {
    purpose: 'Run sample payloads through the grammar and inspect the parser trace.',
    value: 'Catch mismatches early and see why an input succeeds or fails.',
  },
  python_ast: {
    purpose: 'Generate, inspect, and round-trip the Python AST for the current workspace.',
    value: 'Move from grammar and schema definitions to executable Python structures.',
  },
  rust_ast: {
    purpose: 'Generate and inspect Rust declarations and their parsed syntax tree.',
    value: 'Produce typed Rust artifacts while keeping them tied to the shared schema.',
  },
  wasm_wabt: {
    purpose: 'Generate WAT, compile it to WebAssembly, and inspect the resulting module.',
    value: 'Validate a compact portable runtime target before exporting or running it.',
  },
  mcp_servers: {
    purpose: 'Invoke and configure the workspace’s on-demand MCP tool servers.',
    value: 'Expose the same live rules and artifacts to compatible clients through MCP.',
  },
  payload_io: {
    purpose: 'Import, package, and export the workspace and its selected artifacts.',
    value: 'Make a validated result easy to share, archive, or use in another tool.',
  },
  gdrive: {
    purpose: 'Save, load, and manage workspace snapshots in the Demo Vault or Google Drive.',
    value: 'Keep work recoverable and available across sessions.',
  },
};

export const STANDALONE_PITCHES: Record<StandalonePitchKey, ElevatorPitch> = {
  graph: {
    title: 'See how grammar rules connect',
    purpose: 'Explore dependencies between rules and spot missing or circular structure.',
    value: 'Understand the impact of a rule before changing it.',
    nextStep: 'Select a rule to inspect it, or open it in the workbench to make a change.',
  },
  histolog: {
    title: 'Track and recover workspace changes',
    purpose: 'Capture checkpoints, compare generations, and restore a prior workspace state.',
    value: 'Make iteration safer with a reviewable history of what changed.',
    nextStep: 'Capture a checkpoint before a larger edit, then compare it with the latest generation.',
  },
  api: {
    title: 'Try the studio through its API',
    purpose: 'Send requests to the live workspace endpoints and inspect their responses.',
    value: 'Validate integrations against the same rules and state used by the UI.',
    nextStep: 'Choose an endpoint collection, run a request, and inspect the response.',
  },
  specs: {
    title: 'Make the workflow and contracts portable',
    purpose: 'Inspect the OpenAPI contract, edit workflow DSL, or assemble a shareable bundle.',
    value: 'Keep integrations and workflow definitions discoverable alongside the workspace.',
    nextStep: 'Start with OpenAPI to explore routes, or use the DSL tab to adjust workflow steps.',
  },
};

export function getWorkbenchPitch(
  page: WorkflowSlug,
  title: string,
  nextLabel: string
): ElevatorPitch {
  return {
    title,
    ...WORKBENCH_PITCHES[page],
    nextStep: `When ready, choose “Complete & Verify Step” to check this step and continue to ${nextLabel}.`,
  };
}
