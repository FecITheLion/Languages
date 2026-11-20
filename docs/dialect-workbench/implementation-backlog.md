Given the architecture we just established, I’d turn this into an implementation backlog with three parallel concerns: **shell/layout, state/services, and reusable UI contracts**. The key constraint is to preserve the current dialect behavior while progressively replacing its presentation and DOM coupling.

# 1. Phased engineering tickets

## Phase 0: Baseline and contract freeze

### DWB-001: Inventory current Dialect functionality

**Goal:** Prevent functionality from disappearing during the redesign.

**Tasks**

- Inventory current inputs, buttons, panels and dialogs.
- Inventory API requests/endpoints.
- Identify URL/query-string dependencies.
- Identify DOM-dependent state.
- Identify validation/output behaviors.
- Map each existing control to its destination component.
- Flag controls as `keep`, `merge`, `move` or `remove`.

**Acceptance**

- Every existing user-facing function has an explicit disposition.
- No UI element disappears accidentally.

---

### DWB-002: Define canonical Dialect domain model

**Goal:** Make UI components consume a stable data structure instead of interpreting backend responses independently.

Suggested model:

type DialectId = string;

interface Dialect {
  id: DialectId;
  name: string;
  uri?: string;
  kind: "builtin" | "custom";

  definition: DialectDefinition;

  metadata: {
    description?: string;
    version?: string;
  };
}

interface DialectDefinition {
  grammar?: unknown;
  keywords: DialectKeyword[];
  examples: DialectExample[];
}

interface DialectKeyword {
  name: string;
  enabled: boolean;
  definition?: unknown;
}

interface DialectExample {
  id: string;
  name: string;
  source: string;
}

Do not force current backend objects to match this immediately. Put normalization at the repository boundary.

---

# Phase 1: Workbench shell

### DWB-101: Create `DialectWorkbench`

Create the structural shell:

Workbench
├── Header
├── Navigator
├── Workspace
├── Inspector
└── StatusBar

**Acceptance**

- Existing dialect page operates inside the new shell.
- Shell contains no dialect business logic.
- Desktop/mobile structure doesn't require separate markup trees.

---

### DWB-102: Create desktop grid

Default:

240px | minmax(0, 1fr) | 320px

Conceptually:

.dialect-workbench {
    display: grid;
    grid-template:
        "header header header" auto
        "nav main inspector" minmax(0, 1fr)
        "status status status" auto
        / 240px minmax(0, 1fr) 320px;
}

**Acceptance**

- Editor consumes remaining width.
- Navigator and Inspector are independently collapsible.
- Page itself doesn't gain horizontal scrolling.

---

### DWB-103: Consolidate header commands

Actions become:

**Primary**

- Save

**Secondary**

- Validate
- Test

**Overflow**

- Duplicate
- Import
- Export
- Delete

Remove duplicated Save/Validate controls elsewhere.

---

### DWB-104: Add status bar

Expose:

dialect | validity | dirty state | keywords | references

Status bar must display state, not own it.

---

# Phase 2: Navigator

### DWB-201: Extract `DialectNavigator`

Responsibilities:

- dialect discovery
- selection
- filtering
- creation entry point

Not responsible for editing.

---

### DWB-202: Implement dialect search/filtering

Support:

Search dialects...
─────────────────
All
Built-in
Custom

Filtering stays client-side when the loaded collection already contains the necessary items.

---

### DWB-203: Create `DialectListItem`

Each entry can expose:

- name
- selected
- dirty
- validity
- built-in/custom

Avoid stuffing management buttons into every row.

---

### DWB-204: Add navigation responsive modes

Desktop       persistent
Tablet        collapsible
Mobile        drawer

Selection should automatically return focus to the workspace when appropriate.

---

# Phase 3: Workspace

### DWB-301: Create workspace tabs

Start with:

Definition
Grammar
Keywords
Examples
Tests
Generated

Tabs with no meaningful independent workflow should be removed rather than preserved just because they existed previously.

---

### DWB-302: Extract Definition editor

Contract:

interface DefinitionEditorProps {
  value: DialectDefinition;
  readOnly?: boolean;

  onChange(value: DialectDefinition): void;
}

It should know nothing about saving or HTTP.

---

### DWB-303: Extract Keyword editor

interface KeywordEditorProps {
  keywords: DialectKeyword[];

  onAdd(): void;
  onChange(index: number, keyword: DialectKeyword): void;
  onRemove(index: number): void;
}

---

### DWB-304: Extract Examples/Tests

Keep **example definitions** separate from **test execution results**.

That prevents persisted data and transient runtime state from becoming intertwined.

---

### DWB-305: Add dirty tracking

Track dirty state from canonical state rather than classes on HTML elements.

Target behavior:

edit
 ↓
store becomes dirty
 ↓
header shows ● Modified
 ↓
Save enabled
 ↓
save succeeds
 ↓
store establishes new clean baseline

---

# Phase 4: Inspector

### DWB-401: Create `DialectInspector`

Initial sections:

Problems
Resolved
References
Output

---

### DWB-402: Consolidate diagnostics

Define one representation:

type DiagnosticSeverity =
  | "error"
  | "warning"
  | "info";

interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  message: string;

  source?: {
    tab?: WorkspaceTab;
    path?: string;
    line?: number;
    column?: number;
  };
}

This allows validators, parsers and test infrastructure to share the same Problems UI.

---

### DWB-403: Add diagnostic navigation

Clicking:

Unknown keyword "foo"
Definition · line 24

should call:

onNavigate(diagnostic)

rather than manipulating the editor directly.

---

### DWB-404: Create Resolved view

The distinction should remain explicit:

Definition = authored
Resolved   = derived

The resolved representation should therefore remain read-only unless a future workflow explicitly requires editing it.

---

### DWB-405: Consolidate generated output

Move debug, generated and machine-oriented representations away from the main editor and into `Output`.

---

# Phase 5: State architecture

### DWB-501: Introduce `DialectStore`

Suggested state shape:

interface DialectWorkbenchState {
  dialects: Dialect[];
  selectedId: DialectId | null;

  baseline: Dialect | null;
  current: Dialect | null;

  diagnostics: Diagnostic[];
  resolved: unknown;
  references: DialectReference[];

  tests: TestResult[];

  activeTab: WorkspaceTab;
  inspectorTab: InspectorTab;

  dirty: boolean;
  loading: boolean;
  saving: boolean;
  validating: boolean;
  testing: boolean;
}

---

### DWB-502: Eliminate DOM-backed state

Remove patterns like:

element.dataset.currentDialect
hiddenInput.value
document.querySelector(...).textContent

as sources of application truth.

The DOM becomes a projection of state.

---

### DWB-503: Introduce deterministic commands

Prefer:

selectDialect(id)
updateDefinition(value)
validateDialect()
runTests()
saveDialect()
resetDialect()

over components directly coordinating unrelated UI elements.

---

# Phase 6: Service extraction

### DWB-601: Define repository boundary

interface DialectRepository {
  list(): Promise<DialectSummary[]>;

  get(id: DialectId): Promise<Dialect>;

  save(
    id: DialectId,
    dialect: Dialect
  ): Promise<Dialect>;

  create(
    input: CreateDialectInput
  ): Promise<Dialect>;

  delete(id: DialectId): Promise<void>;
}

The transport mechanism stays outside components.

---

### DWB-602: Define validation service

interface DialectValidator {
  validate(
    dialect: Dialect
  ): Promise<ValidationResult>;
}

interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}

---

### DWB-603: Define resolver service

interface DialectResolver {
  resolve(
    dialect: Dialect
  ): Promise<ResolutionResult>;
}

interface ResolutionResult {
  value: unknown;
  references: DialectReference[];
  diagnostics: Diagnostic[];
}

---

### DWB-604: Define test runner

interface DialectTestRunner {
  run(
    dialect: Dialect,
    tests: DialectTest[]
  ): Promise<TestResult[]>;
}

---

# Phase 7: Cleanup

### DWB-701: Remove obsolete cards

- Remove one-control cards.
- Remove duplicate headings.
- Remove repeated explanatory prose.
- Remove duplicate action bars.
- Remove old validation panels.
- Remove old generated-output panels.

---

### DWB-702: Remove legacy DOM coordination

Acceptance target:

View
  ↓
Command
  ↓
Store
  ↓
Service
  ↓
Store
  ↓
View

---

# Phase 8: Productivity/accessibility

### DWB-801

Keyboard-accessible workbench.

### DWB-802

Unsaved-changes guard.

### DWB-803

Resizable Navigator/Inspector.

### DWB-804

`Ctrl+K` command palette.

### DWB-805

Diagnostic jump-to-source.

### DWB-806

Accessibility and responsive audit.

---

# 2. Visual design specification

## Design direction

**Dense engineering workbench, not dashboard.**

Reduce:

- large cards
- excessive border radii
- oversized headings
- decorative whitespace

Increase:

- hierarchy
- information density
- editor space
- state visibility
- predictable alignment

---

## Layout tokens

--nav-width: 240px;
--inspector-width: 320px;

--header-height: 56px;
--status-height: 28px;
--toolbar-height: 40px;

--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;

Use these as tokens, not component-specific magic numbers.

---

## Surface hierarchy

### Surface 0

Application background.

### Surface 1

Navigator, editor, inspector.

### Surface 2

Toolbars, selected sections, menus.

### Surface 3

Dialogs/popovers.

Avoid placing every section inside another visible card.

---

## Typography

### Page identity

18–20px
600

### Panel headings

11–12px
600
uppercase
slight letter spacing

### UI text

13–14px
400–500

### Code/editor

13–14px
monospace

---

## Control sizing

Standard control:

height: 32–36px

Primary toolbar commands:

height: 32px

Avoid oversized 44–50px desktop controls unless touch behavior requires them.

---

## State language

Use consistent semantics:

✓ Valid
● Modified
× Error
! Warning
○ Running

Don't rely solely on color.

---

## Selected Navigator item

Use:

subtle background
+ accent leading border
+ higher-contrast text

Avoid turning every selected row into a large pill.

---

## Tabs

Use understated editor-style tabs:

Definition  Grammar  Keywords  Examples  Tests  Generated
──────────

Prefer an active underline/border rather than button-shaped pills.

---

## Problems

Severity should establish hierarchy:

ERROR
Unknown keyword "foo"
Definition · 24:8

WARNING
Reference could not be resolved
Grammar · 41:2

Make the whole diagnostic row actionable.

---

# 3. Public component APIs

The important rule is:

> **Presentation components emit intent. Containers/store execute behavior.**

## `DialectWorkbench`

interface DialectWorkbenchProps {
  repository: DialectRepository;
  validator: DialectValidator;
  resolver: DialectResolver;
  testRunner: DialectTestRunner;

  initialDialectId?: DialectId;
}

This should be the composition root.

---

## `WorkbenchHeader`

interface WorkbenchHeaderProps {
  dialect: DialectSummary | null;

  dirty: boolean;
  valid?: boolean;

  saving: boolean;
  validating: boolean;
  testing: boolean;

  onSave(): void;
  onValidate(): void;
  onTest(): void;

  onCommand?(command: WorkbenchCommand): void;
}

---

## `DialectNavigator`

interface DialectNavigatorProps {
  dialects: DialectSummary[];
  selectedId: DialectId | null;

  query: string;
  filter: DialectFilter;

  collapsed?: boolean;

  onQueryChange(query: string): void;
  onFilterChange(filter: DialectFilter): void;
  onSelect(id: DialectId): void;
  onCreate(): void;
  onToggleCollapse?(): void;
}

---

## `DialectWorkspace`

interface DialectWorkspaceProps {
  dialect: Dialect | null;

  activeTab: WorkspaceTab;
  readOnly?: boolean;

  onTabChange(tab: WorkspaceTab): void;
  onChange(dialect: Dialect): void;
}

---

## `WorkspaceTabs`

type WorkspaceTab =
  | "definition"
  | "grammar"
  | "keywords"
  | "examples"
  | "tests"
  | "generated";

interface WorkspaceTabsProps {
  value: WorkspaceTab;
  tabs: readonly WorkspaceTab[];

  onChange(tab: WorkspaceTab): void;
}

---

## `DialectInspector`

type InspectorTab =
  | "problems"
  | "resolved"
  | "references"
  | "output";

interface DialectInspectorProps {
  activeTab: InspectorTab;

  diagnostics: Diagnostic[];
  resolved?: unknown;
  references: DialectReference[];
  output?: unknown;

  collapsed?: boolean;

  onTabChange(tab: InspectorTab): void;
  onDiagnosticSelect(diagnostic: Diagnostic): void;
  onToggleCollapse?(): void;
}

---

## `ProblemsPanel`

interface ProblemsPanelProps {
  diagnostics: Diagnostic[];

  selectedId?: string;

  onSelect(diagnostic: Diagnostic): void;
}

Notice what isn't here:

editor
repository
fetch()
document.querySelector()

That's deliberate.

---

## `WorkbenchStatusBar`

interface WorkbenchStatusBarProps {
  dialectName?: string;

  valid?: boolean;
  dirty: boolean;

  keywordCount?: number;
  referenceCount?: number;

  operation?:
    | "idle"
    | "loading"
    | "saving"
    | "validating"
    | "testing";
}

Pure presentation.

---

# 4. Event/command API

I'd normalize component events into workbench commands instead of accumulating unrelated callbacks indefinitely:

type WorkbenchCommand =
  | { type: "dialect.select"; id: DialectId }
  | { type: "dialect.create" }
  | { type: "dialect.delete"; id: DialectId }
  | { type: "dialect.save" }
  | { type: "dialect.validate" }
  | { type: "dialect.test" }

  | { type: "workspace.tab"; tab: WorkspaceTab }

  | {
      type: "inspector.tab";
      tab: InspectorTab;
    }

  | {
      type: "diagnostic.navigate";
      diagnosticId: string;
    };

That becomes especially useful if your Languages workbench eventually has sibling pages besides Dialect.

The same outer workbench architecture can then evolve toward:

LanguageWorkbench
│
├── Shared Workbench Shell
│
├── Dialect Module
├── Grammar Module
├── Schema Module
├── AST Module
├── Validator Module
└── Generator Module

without reimplementing Navigator/Inspector/status/command behavior for every tool.

## Recommended ticket dependency chain

DWB-001 ─ DWB-002
             │
             ▼
          DWB-101
             │
     ┌───────┼────────┐
     ▼       ▼        ▼
 DWB-201  DWB-301  DWB-401
     │       │        │
     └───────┼────────┘
             ▼
          DWB-501
             │
     ┌───────┴────────┐
     ▼                ▼
 DWB-601..604      DWB-701
     │                │
     └───────┬────────┘
             ▼
          DWB-801..806

The critical architectural checkpoint is **DWB-501**. Once the canonical store exists, the Navigator, editors, Inspector, validation, tests and persistence stop needing to coordinate through the DOM. That is where this changes from a visual redesign into a maintainable **Languages Workbench architecture** that you can reuse for the schema/AST/validator/generator portions of the application.