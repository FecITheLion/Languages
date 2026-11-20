import type { WorkflowSlug } from '../types/studio';

export type GuideId = WorkflowSlug | 'home' | 'files';

export interface TourStep {
  /** CSS selector of the element to spotlight; omitted = centered card. */
  target?: string;
  title: string;
  body: string;
}

export interface HowToFrame {
  title: string;
  caption: string;
  /** Optional real screenshot; otherwise a generated storyboard card is drawn. */
  imageSrc?: string;
}

export interface GuideEntry {
  id: GuideId;
  title: string;
  /** One-line elevator pitch headline. */
  headline: string;
  /** Problem → outcome in two sentences. */
  pitch: string;
  proof: string[];
  /** Where this workbench's output lands in the shared file tree. */
  outputs: string[];
  tour: TourStep[];
  frames: HowToFrame[];
  /** Drop an mp4 at this URL to replace the animated storyboard with real video. */
  videoSrc?: string;
}

const modalTour = (body: string): TourStep[] => [
  { target: '[data-tour="modal-header"]', title: 'Where you are', body: 'Each workbench is one step of the compiler pipeline. The header shows the step, its id and the target language.' },
  { target: '[data-tour="modal-structure"]', title: 'Pick your layout', body: 'Switch between Menu Bar, Calculator, Grid and Split layouts and preview at fixed device sizes.' },
  { target: '[data-tour="modal-body"]', title: 'Do the work', body: body },
  { target: '[data-tour="modal-footer"]', title: 'Submit to the shared tree', body: 'Verify & Advance (or Submit) merges this workbench output into the shared file tree and records a diff.' },
];

const frames = (a: [string, string], b: [string, string], c: [string, string]): HowToFrame[] =>
  [a, b, c].map(([title, caption]) => ({ title, caption }));

export const GUIDES: Record<GuideId, GuideEntry> = {
  home: {
    id: 'home',
    title: 'Grammar2JSON Studio',
    headline: 'From grammar to running code in twelve verified steps.',
    pitch:
      'Hand-writing parsers, schemas, ASTs and WASM by hand drifts out of sync. Studio keeps every stage bidirectional and merges each result into one shared file tree with a diff.',
    proof: ['12 pipeline workbenches, one verified chain', 'Shared file tree with per-submission diffs', 'Installable offline PWA on a PHP core'],
    outputs: ['src/', 'module/', 'diff/'],
    tour: [
      { target: '[data-tour="nav"]', title: 'Primary navigation', body: 'Workbench, Graph, History, API Studio, Shared Files and Specs live here.' },
      { target: '[data-tour="toolbar"]', title: 'Workspace toolbar', body: 'Search, switch languages, undo/redo Histolog generations and copy deep links.' },
      { target: '[data-tour="pipeline"]', title: 'The pipeline', body: 'Pick any step, or open it as a modal workbench. Verified steps turn green.' },
      { target: '[data-tour="pitch"]', title: 'Elevator pitch', body: 'Every workbench opens with a pitch, a live tour and a how-to so you know why it exists in seconds.' },
    ],
    frames: frames(
      ['Write a grammar', 'Start with the Dialect and Rules workbenches.'],
      ['Verify each step', 'Complete & Verify merges output into the shared tree.'],
      ['Ship it', 'Download the PHP project ZIP or install the PWA.']
    ),
  },
  files: {
    id: 'files',
    title: 'Shared Files',
    headline: 'One abstract file tree every workbench writes into.',
    pitch: 'Workbenches no longer keep private outputs. Each submission is merged into one virtual tree and logged as a patch, so you always see what changed and who changed it.',
    proof: ['engine / data / module / diff layers', 'Per-file revisions and line diffs', 'Mirrored to the PHP core when installed'],
    outputs: ['diff/NNNN-<workbench>.patch'],
    tour: [
      { target: '[data-tour="files-tree"]', title: 'The tree', body: 'Every file any workbench has submitted, grouped by layer.' },
      { target: '[data-tour="files-viewer"]', title: 'Content & diff', body: 'Toggle between file content and the latest diff for the selected file.' },
      { target: '[data-tour="files-log"]', title: 'Submission log', body: 'Each submission lists the files it added or modified.' },
    ],
    frames: frames(
      ['Submit', 'Finish a workbench step.'],
      ['Browse', 'Open the file in the tree.'],
      ['Diff', 'Switch to Diff to see exactly what mutated.']
    ),
  },
  dialect: {
    id: 'dialect', title: 'Dialect',
    headline: 'Pick the grammar notation once; everything else follows.',
    pitch: 'EBNF, BNF, PEG, Python PEG, Rust macro or WAT s-expressions: choosing a dialect keeps parsing and export consistent downstream.',
    proof: ['6 dialect presets', 'Live grammar editing', 'Feeds every later stage'],
    outputs: ['src/data/grammar.g2j', 'src/data/dialect.json'],
    tour: modalTour('Choose a dialect preset, then edit the grammar text. Diagnostics update live.'),
    frames: frames(['Choose preset', 'Select EBNF, PEG, etc.'], ['Edit grammar', 'Type rules in the editor.'], ['Verify', 'At least one rule is required.']),
  },
  rule_props: {
    id: 'rule_props', title: 'Rule Properties',
    headline: 'Tune each rule without rewriting the grammar.',
    pitch: 'Lock, override patterns and order rules individually so refactors stay safe and reviewable.',
    proof: ['Per-rule overrides', 'Lock to prevent mutation', 'Dependency graph aware'],
    outputs: ['src/data/ruleConfigs.json'],
    tour: modalTour('Select a rule and adjust its properties and pattern override.'),
    frames: frames(['Select a rule', 'Pick it from the list.'], ['Set properties', 'Override pattern, lock or reorder.'], ['Submit', 'Configs merge into the tree.']),
  },
  logic_calc: {
    id: 'logic_calc', title: 'Logic Lambda',
    headline: 'Compute with logic statements and Cauchy sequences.',
    pitch: 'Evaluate logic expressions, label bindings and sequences, then export them as code for any target.',
    proof: ['Lambda statement evaluator', 'Cauchy sequence support', 'Multi-target export'],
    outputs: ['src/engine/logicLambdaEngine.ts'],
    tour: modalTour('Enter a logic statement and bind labels to see evaluated results.'),
    frames: frames(['Write a statement', 'Use the calculator layout.'], ['Bind labels', 'Map labels to values.'], ['Export', 'Copy or submit the engine.']),
  },
  schema: {
    id: 'schema', title: 'Schema.org JSON-LD',
    headline: 'Turn a grammar into a Schema.org JSON-LD vocabulary.',
    pitch: 'Generate DefinedTermSet or SoftwareSourceCode JSON-LD live, so docs and search engines understand your language.',
    proof: ['3 schema presets', 'Live JSON validation', 'Bidirectional with the grammar'],
    outputs: ['src/data/schema.jsonld'],
    tour: modalTour('Pick a schema preset and name it. Invalid JSON blocks verification.'),
    frames: frames(['Pick preset', 'Hybrid, DefinedTermSet or SoftwareSource.'], ['Review JSON-LD', 'Check the Live Mirror.'], ['Verify', 'Valid JSON is required.']),
  },
  mutations: {
    id: 'mutations', title: 'Mutations',
    headline: 'Change the grammar line by line, with a safety net.',
    pitch: 'Apply, preview and revert controlled line mutations under an explicit mutation policy.',
    proof: ['Policy-controlled edits', 'Undo/redo via Histolog', 'Every mutation logged'],
    outputs: ['src/data/mutations.json'],
    tour: modalTour('Queue a mutation, preview its effect, then apply it.'),
    frames: frames(['Queue', 'Describe the change.'], ['Preview', 'See the resulting grammar.'], ['Apply', 'Mutation is logged and submitted.']),
  },
  evaluator: {
    id: 'evaluator',  title: 'Evaluator',
    headline: 'Prove the grammar works against real input.',
    pitch: 'Choose a start rule, paste a payload and get a step-by-step trace of how it matches.',
    proof: ['Trace per step', 'Start-rule selection', 'Instant feedback'],
    outputs: ['src/data/evaluation.json'],
    tour: modalTour('Pick the start rule and payload, then read the trace.'),
    frames: frames(['Choose rule', 'Select the start rule.'], ['Paste payload', 'Enter sample input.'], ['Read trace', 'Check each matched step.']),
  },
  payload_io: {
    id: 'payload_io', title: 'Payload I/O',
    headline: 'Move payloads in and out without friction.',
    pitch: 'Import, edit and export payloads as JSON so fixtures stay shareable.',
    proof: ['Import & export', 'Shared with evaluator', 'Deep-linkable'],
    outputs: ['src/data/payload.json'],
    tour: modalTour('Paste or edit the payload and export it.'),
    frames: frames(['Import', 'Paste payload JSON.'], ['Edit', 'Adjust the values.'], ['Export', 'Download or submit.']),
  },
  gdrive: {
    id: 'gdrive', title: 'Google Drive Vault',
    headline: 'Back up the whole workspace to your own Drive.',
    pitch: 'Sign in, save named vault snapshots and restore them on any device.',
    proof: ['Named snapshots', 'Confirmation on destructive ops', 'Works with the PWA offline cache'],
    outputs: ['module/vault.g2j.json'],
    tour: modalTour('Sign in, name your vault, then save or load a snapshot.'),
    frames: frames(['Sign in', 'Authorize Google Drive.'], ['Name vault', 'Use a .g2j.json name.'], ['Save', 'Snapshot goes to Drive and the tree.']),
  },
  python_ast: {
    id: 'python_ast', title: 'Python AST',
    headline: 'See your grammar as a Python AST and source.',
    pitch: 'Edit Python and inspect the AST side by side to generate a parser skeleton.',
    proof: ['AST inspector', 'Source round-trip', 'At least one statement required'],
    outputs: ['src/engine/generated.py'],
    tour: modalTour('Edit Python source; the AST updates live.'),
    frames: frames(['Edit source', 'Type Python.'], ['Inspect AST', 'Expand nodes.'], ['Verify', 'Needs a statement.']),
  },
  rust_ast: {
    id: 'rust_ast', title: 'Rust AST',
    headline: 'Generate Rust structs, consts and functions.',
    pitch: 'Model your language in Rust and inspect its module outline instantly.',
    proof: ['Module outline', 'Struct/const/fn detection', 'Source round-trip'],
    outputs: ['src/engine/generated.rs'],
    tour: modalTour('Edit Rust source; the item list updates live.'),
    frames: frames(['Edit source', 'Type Rust.'], ['Inspect items', 'See structs and fns.'], ['Verify', 'Needs one item.']),
  },
  wasm_wabt: {
    id: 'wasm_wabt', title: 'WASM / WABT',
    headline: 'Compile WAT to a valid WebAssembly binary.',
    pitch: 'Write WAT, validate it and see the exports so your grammar can run anywhere.',
    proof: ['WAT validation', 'Export table', 'Binary size feedback'],
    outputs: ['src/engine/generated.wat'],
    tour: modalTour('Edit WAT; compilation result and exports update live.'),
    frames: frames(['Edit WAT', 'Write the module.'], ['Compile', 'Check validity.'], ['Verify', 'A valid binary is required.']),
  },
  mcp_servers: {
    id: 'mcp_servers', title: 'MCP Servers',
    headline: 'Expose the pipeline to AI clients over MCP.',
    pitch: 'Start lazy MCP servers and export ready-made client configs so assistants can call your tools.',
    proof: ['Lazy server registry', 'Client config export', 'JSON-RPC tooling'],
    outputs: ['module/mcp.manifest.json'],
    tour: modalTour('Pick a server, inspect its tools and export a client config.'),
    frames: frames(['Pick server', 'Choose from the list.'], ['Inspect tools', 'Review definitions.'], ['Export', 'Copy client config.']),
  },
};

export function getGuide(id: string): GuideEntry {
  return GUIDES[id as GuideId] ?? GUIDES.home;
}
