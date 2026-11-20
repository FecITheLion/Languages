import type { TopView, WorkflowSlug } from '../types/studio';

export type GuidedHelpContext = 'home' | 'virtual_files' | WorkflowSlug | Exclude<TopView, 'workbench' | 'files'>;

export interface GuidedHelpStep {
  title: string;
  description: string;
  target: string;
  diagram: [string, string, string];
}

export interface GuidedHelpTour {
  title: string;
  summary: string;
  steps: [GuidedHelpStep, GuidedHelpStep, GuidedHelpStep];
}

const step = (
  title: string,
  description: string,
  target: string,
  diagram: [string, string, string]
): GuidedHelpStep => ({ title, description, target, diagram });

const tour = (
  title: string,
  summary: string,
  steps: GuidedHelpTour['steps']
): GuidedHelpTour => ({ title, summary, steps });

export const GUIDED_HELP_CONTEXTS: GuidedHelpContext[] = [
  'home',
  'virtual_files',
  'dialect',
  'rule_props',
  'logic_calc',
  'schema',
  'mutations',
  'evaluator',
  'payload_io',
  'gdrive',
  'python_ast',
  'rust_ast',
  'wasm_wabt',
  'mcp_servers',
  'graph',
  'histolog',
  'api',
  'openapi',
  'dsl',
  'bundle',
];

const sharedFilesTour = tour('Shared virtual files', 'Compare generated outputs with your separate editable copies.', [
    step('Choose a generated file', 'Pick a file from the list. Some files appear after you visit the workbench that creates them; a JSON-LD package appears after export.', 'view.virtual_files.tree', ['Generated output', 'File list', 'Choose file']),
    step('Edit a separate copy', 'The left pane is the generated source and the right pane is your editable copy. Changes here do not change grammar or other source inputs.', 'view.virtual_files.editor', ['Generated source', 'Your copy', 'Separate edit']),
    step('Resolve a changed source', 'If a newer source arrives, compare both panes. Choose Keep my edit to keep your copy, or Use latest source to replace it. Browser autosave stores edits and their source versions, which may be sensitive; workspace snapshots may contain all outputs.', 'view.virtual_files.actions', ['Compare versions', 'Keep edit / use source', 'Download copy']),
]);

export const GUIDED_HELP_TOURS: Record<GuidedHelpContext, GuidedHelpTour> = {
  virtual_files: sharedFilesTour,
  home: tour('Studio home', 'Find your way through the grammar-to-output workflow.', [
    step(
      'Start with an example',
      'If this is your first visit, open Grammar & DAG and load the sample grammar. Selecting a pipeline card opens the matching workbench.',
      'home.pipeline',
      ['Pipeline cards', 'Pick a workbench', 'Workbench']
    ),
    step(
      'Follow the pipeline',
      'The cards are grouped into stages. Use the filters if you want to focus on one kind of task; the step rail and breadcrumbs show where you are.',
      'home.navigation',
      ['Stage filter', 'Pipeline steps', 'Breadcrumbs']
    ),
    step(
      'Check and explore',
      'Use Complete & Verify Step to check your current work and continue. The rule graph and other views are optional ways to explore what the studio creates.',
      'home.views',
      ['Workbench progress', 'Inspect outputs', 'Other views']
    ),
  ]),
  dialect: tour('Grammar dialect', 'Set the notation used to read and edit grammar rules.', [
    step(
      'Pick a notation',
      'Choose a dialect preset such as EBNF, BNF, PEG, Python PEG, Rust macro, or WAT S-expression. The preset supplies that notation’s operators and symbols.',
      'workbench.dialect.preset',
      ['Dialect preset', 'Grammar notation', 'Rule parser']
    ),
    step(
      'Review symbols',
      'Check the rule operator, choice delimiter, comment prefix, and enabled grammar symbols before interpreting the source. Presets can be adjusted to match your grammar.',
      'workbench.dialect.symbols',
      ['Operators', 'Symbols', 'Interpret rules']
    ),
    step(
      'Load or edit grammar',
      'Load the EBNF sample or edit the grammar. Rule parsing feeds the dependency graph and downstream schema and code-generation workbenches.',
      'workbench.dialect.grammar',
      ['Sample / source', 'Parsed rules', 'Downstream workbenches']
    ),
  ]),
  rule_props: tour('Rule properties', 'Set rule-level metadata and precedence.', [
    step(
      'Select a rule',
      'Choose a parsed grammar rule to inspect its properties. The available rules come from the active grammar and dialect.',
      'workbench.rule_props.rules',
      ['Active grammar', 'Select rule', 'Rule properties']
    ),
    step(
      'Set precedence',
      'Assign numeric precedence and associativity where those ordering hints are useful to generated consumers. These properties do not rewrite the grammar by themselves.',
      'workbench.rule_props.precedence',
      ['Rule', 'Precedence / associativity', 'Consumer metadata']
    ),
    step(
      'Apply ordering if needed',
      'Use the precedence ordering action when you want to reorder grammar rules. Rule properties also flow into generated representations.',
      'workbench.rule_props.actions',
      ['Property values', 'Apply order', 'Updated grammar / outputs']
    ),
  ]),
  logic_calc: tour('Logic & Lambda calculator', 'Compose logic expressions and reusable callbacks.', [
    step(
      'Choose a calculator',
      'Select the logic, relations, arithmetic, lambda/combinator, proof, or numeric template that matches the expression you want to explore.',
      'workbench.logic_calc.calculators',
      ['Calculator', 'Expression workspace', 'Result']
    ),
    step(
      'Compose and inspect',
      'Edit the expression and any labels or bindings. The calculator evaluates the supported expression and exposes the current result; it is not a general-purpose theorem prover.',
      'workbench.logic_calc.expression',
      ['Expression / bindings', 'Evaluate', 'Current result']
    ),
    step(
      'Sync deliberately',
      'Use the sync action to place the logic statement and label bindings into the active grammar. This replaces the grammar source with the synced statement and labels.',
      'workbench.logic_calc.sync',
      ['Calculator state', 'Sync to grammar', 'Grammar and derived outputs']
    ),
  ]),
  schema: tour('Schema workbench', 'Configure and inspect the generated JSON-LD schema.', [
    step(
      'Choose a schema preset',
      'Select a schema preset and adjust the schema.org type, schema name, and JSON Schema draft for the package you intend to generate.',
      'workbench.schema.config',
      ['Schema settings', 'Grammar rules', 'JSON-LD / schema']
    ),
    step(
      'Review generated structure',
      'Inspect the generated schema and its definitions and potential actions. The output reflects the current grammar, schema settings, rule properties, and enabled mutations.',
      'workbench.schema.output',
      ['Grammar + settings', 'Compile schema', 'Generated structure']
    ),
    step(
      'Open package and transform controls',
      'Use the Storage stage filter, then select Payload I/O in the pipeline to export a JSON-LD package, import a workspace, or translate to a supported target.',
      'workbench.schema.export',
      ['Generated schema', 'Payload I/O', 'Package / translation controls']
    ),
  ]),
  mutations: tour('Line mutations', 'Control permitted grammar-to-output line transformations.', [
    step(
      'Check rule locks',
      'The first rule row shows whether that declaration is locked. Use its Lock control to protect or unlock a rule; import/export permissions and allowed targets are configured separately in Schema.',
      'workbench.mutations.policy',
      ['Parsed rules', 'Lock / unlock declaration', 'Mutation controls']
    ),
    step(
      'Infer or edit mutations',
      'Auto-infer mutations from the current grammar or edit per-rule mutation settings. Reset restores the mutation values to their default state.',
      'workbench.mutations.rules',
      ['Grammar rules', 'Infer / edit mutations', 'Per-rule settings']
    ),
    step(
      'Check a specific target',
      'Only enabled mutations and allowed targets affect transforms. Inspect the generated target after changing policy; a mutation is not a general-purpose source rewrite.',
      'workbench.mutations.targets',
      ['Policy + mutations', 'Select transform', 'Target output']
    ),
  ]),
  evaluator: tour('Grammar evaluator', 'Try an input payload against a selected grammar rule.', [
    step(
      'Choose the start rule',
      'Select the rule to evaluate. The selected rule determines which part of the grammar is used as the entry point.',
      'workbench.evaluator.rule',
      ['Grammar rules', 'Start rule', 'Evaluation']
    ),
    step(
      'Enter a payload',
      'Provide the payload to test or load the empty payload example. The evaluator checks the input against the selected grammar; it does not execute generated application code.',
      'workbench.evaluator.payload',
      ['Input payload', 'Match selected rule', 'Evaluation result']
    ),
    step(
      'Read the result',
      'Inspect the match or failure details, then adjust the rule or payload and try again. A successful grammar match only confirms this input matches that rule.',
      'workbench.evaluator.result',
      ['Rule + payload', 'Evaluate', 'Match / failure details']
    ),
  ]),
  payload_io: tour('Workspace import & export', 'Move workspace and schema package files in and out.', [
    step(
      'Choose a file action',
      'Use the workspace controls for a complete workspace file, or the JSON-LD package controls for schema-oriented interchange.',
      'workbench.payload_io.actions',
      ['Workspace / package', 'Import or export', 'Local file']
    ),
    step(
      'Import intentionally',
      'Choose a supported file from your device. Import replaces or updates relevant workspace state; check the visible workspace after loading.',
      'workbench.payload_io.import',
      ['Local file', 'Import', 'Updated workspace']
    ),
    step(
      'Export a portable copy',
      'Export the current workspace or JSON-LD package when you want a file copy. Review what the selected format contains before sharing it.',
      'workbench.payload_io.export',
      ['Current workspace', 'Export format', 'Downloaded file']
    ),
  ]),
  gdrive: tour('Storage & snapshots', 'Save snapshots to the Demo Vault or Google Drive.', [
    step(
      'Choose a storage mode',
      'The Demo Vault is local to this app. Google Drive actions require signing in and are limited to files created by this app.',
      'workbench.gdrive.mode',
      ['Storage mode', 'Demo Vault / Drive', 'Snapshot list']
    ),
    step(
      'Save a named snapshot',
      'Enter a name and save the current workspace as a snapshot. Refresh the list to see available saved snapshots.',
      'workbench.gdrive.save',
      ['Workspace + name', 'Save snapshot', 'Saved snapshot']
    ),
    step(
      'Load or manage snapshots',
      'Load a snapshot to restore its workspace state, or use the provided overwrite and delete actions. Confirm the selected snapshot before destructive changes.',
      'workbench.gdrive.snapshots',
      ['Snapshot list', 'Load / manage', 'Restored workspace']
    ),
  ]),
  python_ast: tour('Python AST', 'Inspect and synchronize the generated Python syntax tree.', [
    step(
      'Start with a grammar',
      'Generate Python from the current grammar or load the Python grammar sample. The generated source is an output from this workspace, not a complete standalone Python parser.',
      'workbench.python_ast.source',
      ['Grammar', 'Generate Python', 'Python source']
    ),
    step(
      'Inspect the AST',
      'Review the parsed Python AST and its textual dump. Editing the source changes the input used for the next parse.',
      'workbench.python_ast.tree',
      ['Python source', 'Parse', 'AST / dump']
    ),
    step(
      'Choose a sync direction',
      'Unparse the AST to source when needed, or explicitly sync supported AST information back to the grammar. Check the grammar after syncing.',
      'workbench.python_ast.sync',
      ['AST', 'Unparse / sync', 'Source or grammar']
    ),
  ]),
  rust_ast: tour('Rust AST', 'Inspect and synchronize the generated Rust syntax tree.', [
    step(
      'Start with a grammar',
      'Generate Rust from the current workspace or load the Rust grammar sample. The generated source is a workspace representation, not a full Rust compiler.',
      'workbench.rust_ast.source',
      ['Grammar', 'Generate Rust', 'Rust source']
    ),
    step(
      'Inspect the parsed module',
      'Review the Rust syntax module and its AST dump. Use the source editor and parse action to inspect a changed source file.',
      'workbench.rust_ast.tree',
      ['Rust source', 'Parse', 'Module / AST dump']
    ),
    step(
      'Sync with care',
      'Use the explicit sync action to carry supported Rust AST information back into the grammar. Verify the resulting grammar and derived output.',
      'workbench.rust_ast.sync',
      ['Rust AST', 'Sync', 'Grammar / derived output']
    ),
  ]),
  wasm_wabt: tour('WASM / WABT', 'Generate or inspect WAT and compile it to a WASM binary.', [
    step(
      'Generate WAT',
      'Generate WAT from the current workspace, or edit and import WAT source for inspection.',
      'workbench.wasm_wabt.wat',
      ['Grammar / schema', 'Generate or edit WAT', 'WAT source']
    ),
    step(
      'Compile or decompile',
      'Compile WAT to a WASM result, or import a WASM file and decompile it to WAT where supported.',
      'workbench.wasm_wabt.compile',
      ['WAT / WASM input', 'Compile / decompile', 'WASM result / WAT']
    ),
    step(
      'Export the binary',
      'Review the compilation result before exporting the WASM binary. The tool reports compilation outcomes; it does not promise runtime behavior for arbitrary modules.',
      'workbench.wasm_wabt.export',
      ['Compilation result', 'Export binary', 'WASM file']
    ),
  ]),
  mcp_servers: tour('MCP servers', 'Inspect the Studio MCP connection and available tools.', [
    step(
      'Select a server context',
      'The active workbench selects the related MCP context; a pipeline context is available when no workbench-specific context applies.',
      'workbench.mcp_servers.context',
      ['Active workbench', 'MCP context', 'Available tools']
    ),
    step(
      'Inspect available tools',
      'Review tool descriptions and input requirements before invoking them. Server calls are lazy and may reflect the active workspace.',
      'workbench.mcp_servers.tools',
      ['Server context', 'Inspect tools', 'Tool inputs']
    ),
    step(
      'Call and review',
      'Invoke a tool intentionally and inspect its returned result. Treat tool output as a snapshot of the operation, not as a persistent workspace save.',
      'workbench.mcp_servers.invoke',
      ['Tool + inputs', 'Invoke', 'Returned result']
    ),
  ]),
  graph: tour('Rule dependency graph', 'Explore references and dependencies between grammar rules.', [
    step(
      'Read the connections',
      'Each node represents a parsed rule and edges show references between rules. Undefined references and cycles, if present, are useful to inspect.',
      'view.graph.canvas',
      ['Rule nodes', 'Reference edges', 'Dependencies']
    ),
    step(
      'Select a rule',
      'Select a node to focus on its relationships and rule details. The graph reflects the active grammar.',
      'view.graph.selection',
      ['Active grammar', 'Select node', 'Rule relationships']
    ),
    step(
      'Return to editing',
      'Open the relevant workbench to edit grammar or rule properties, then revisit the graph to inspect the updated relationships.',
      'view.graph.navigation',
      ['Graph finding', 'Open workbench', 'Updated graph']
    ),
  ]),
  histolog: tour('Histolog & diff', 'Inspect recorded workspace history and compare snapshots.', [
    step(
      'Choose an entry',
      'Browse available Histolog entries and select one to inspect. Availability depends on entries created or imported into this app.',
      'view.histolog.entries',
      ['History entries', 'Select entry', 'Entry details']
    ),
    step(
      'Compare states',
      'Use the available fields and diff view to inspect changes between recorded states. A diff describes the selected records, not unrecorded edits.',
      'view.histolog.diff',
      ['Recorded states', 'Compare', 'Diff']
    ),
    step(
      'Continue in the workbench',
      'Use the Workbench section in the top navigation to return to the active workflow. Histolog is for inspecting recorded states; make edits in a workbench.',
      'view.histolog.navigation',
      ['Diff finding', 'Open workbench', 'Active workspace']
    ),
  ]),
  api: tour('API Studio', 'Try an API request or build a routine that runs requests in order.', [
    step(
      'Choose what to try',
      'Choose Send a request to explore one operation, or Build a routine to arrange several requests. Available actions depend on the local Studio server.',
      'view.api.mode',
      ['Console / routine', 'Choose operation', 'Request or routine']
    ),
    step(
      'Review before sending',
      'Before sending, review the request details. In a routine, steps run from top to bottom; select a step to edit it or use Move up and Move down. Some requests can change workspace data.',
      'view.api.request',
      ['Method + URL + body', 'Send request', 'Response']
    ),
    step(
      'Inspect the response',
      'Review the HTTP status and response data (or routine results). Successful mutating requests are pulled back into Studio automatically when supported; use Sync Studio → API before a request when you need to publish current Studio state.',
      'view.api.response',
      ['Request response', 'Review status / data', 'Optional workspace sync']
    ),
  ]),
  openapi: tour('API description', 'Review and organize the available API endpoints.', [
    step(
      'Inspect the API description',
      'Review the available endpoints and their details. This description helps explain the API; viewing it does not send a request.',
      'view.openapi.document',
      ['Studio API', 'OpenAPI document', 'Endpoints / schemas']
    ),
    step(
      'Find an endpoint',
      'Use the endpoint list to find what you need. Reorder and combine are optional organization tools, and do not send requests.',
      'view.openapi.operations',
      ['Endpoint', 'Method + inputs', 'Response contract']
    ),
    step(
      'Try it in API Studio',
      'Move to API Studio to make an actual request and inspect its response. The live result can differ from the documented response examples.',
      'view.openapi.navigation',
      ['Documented operation', 'Open API Studio', 'Live response']
    ),
  ]),
  dsl: tour('DSL flows', 'Inspect and organize the configured workflow flows.', [
    step(
      'Review the flow list',
      'Inspect the configured DSL flows and their labels, methods, or associated workbench steps.',
      'view.dsl.flows',
      ['DSL source', 'Flow definitions', 'Pipeline steps']
    ),
    step(
      'Reorder or edit',
      'Use supported flow editing and reordering controls to change the pipeline sequence. Confirm the resulting order in the flow list.',
      'view.dsl.edit',
      ['Flow definitions', 'Edit / reorder', 'New flow order']
    ),
    step(
      'Follow a flow',
      'Select a flow step to open its workbench and inspect or perform that step’s actual operation.',
      'view.dsl.navigation',
      ['Selected flow', 'Open workbench', 'Step workspace']
    ),
  ]),
  bundle: tour('Export bundle', 'Choose and download a bundle of workspace artifacts.', [
    step(
      'Review bundle contents',
      'Inspect which current workspace artifacts are included in the export bundle before creating it.',
      'view.bundle.contents',
      ['Workspace artifacts', 'Review selection', 'Bundle contents']
    ),
    step(
      'Create the bundle',
      'Use the export action to package the selected artifacts. The exact files depend on the available options and workspace state.',
      'view.bundle.export',
      ['Selected artifacts', 'Create bundle', 'Download']
    ),
    step(
      'Verify the downloaded copy',
      'The live bundle summary reports how many generated files are included. After downloading, verify the archive in your file manager; bundle export does not save to Drive.',
      'view.bundle.verify',
      ['Generated file count', 'Download archive', 'Verify in file manager']
    ),
  ]),
};

export function getGuidedHelpTour(context: string | undefined): GuidedHelpTour {
  if (context && Object.prototype.hasOwnProperty.call(GUIDED_HELP_TOURS, context)) {
    return GUIDED_HELP_TOURS[context as GuidedHelpContext];
  }
  return GUIDED_HELP_TOURS.home;
}
