import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  BookmarkCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Download,
  Globe,
  History,
  LayoutGrid,
  Lock,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Rows3,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { executeWasmExport } from '../engine/bidirectionalEngine';
import {
  formatGlobalCallbackCallTemplate,
  mergeGlobalCallbacksWithLabels,
  type GlobalCallbackDef,
} from '../engine/globalCallbacksEngine';
import {
  CAUCHY_SEQUENCE_PRESETS,
  DEFAULT_CAUCHY_CONFIG,
  analyzeLabelSuggestions,
  evaluateCauchySequence,
  evaluateLogicStatement,
  exportLogicStatement,
  extractLambdaParamsAndBody,
  formatLogicAst,
  formatNamedCallbackSignature,
  LOGIC_CALCULATOR_PRESETS,
  parseExportedLogicArtifact,
  translateLambdaCallsToNamedCallbacks,
  type CauchyParamStyle,
  type CauchySequenceConfig,
  type LabelSuggestion,
  type LabelSuggestionOption,
  type LogicCallbackHooks,
  type LogicExportTarget,
  type LogicLabelBinding,
} from '../engine/logicLambdaEngine';
import type { AutocompleteSuggestion, ReferencedModuleExport } from '../engine/moduleAutocompleteEngine';
import type { StudioLintIssue } from '../engine/htmlOutputFormatter';
import { DocTooltip } from './DocTooltip';
import { HtmlCodeOutput } from './HtmlCodeOutput';
import { AutocompleteField } from './AutocompleteField';
import type { DialectConfig, GrammarRule, MutationPolicy, PrimaryLanguage } from '../types/studio';

interface LogicLambdaWorkbenchProps {
  gridClass: string;
  primarySpan: string;
  secondarySpan: string;
  mutationPolicy: MutationPolicy;
  primaryLanguage?: PrimaryLanguage;
  grammarText?: string;
  rules?: GrammarRule[];
  dialect?: DialectConfig;
  sampleInput?: string;
  initialStatement?: string;
  initialLabels?: LogicLabelBinding[];
  globalCallbacks?: GlobalCallbackDef[];
  autocompleteSuggestions?: AutocompleteSuggestion[];
  lintIssues?: StudioLintIssue[];
  onRippleModuleExport?: (exp: ReferencedModuleExport, moduleName?: string) => void;
  onSaveGlobalCallback?: (input: {
    name: string;
    lambdaExpr: string;
    description?: string;
    source?: 'logic_calc' | 'rule_props' | 'manual';
  }) => void;
  onDeleteGlobalCallback?: (idOrName: string) => void;
  onLogicStateChange?: (statement: string, labels: LogicLabelBinding[]) => void;
  onExportTextFile: (content: string, filename: string, mime: string) => void;
  onSyncLogicToGrammar: (statement: string, labels: LogicLabelBinding[]) => void;
  onNotify: (msg: string) => void;
}

type KeypadLayoutMode = 'grid' | 'lanes' | 'rail';
type KeypadCategoryId = 'logic' | 'compare' | 'arith' | 'lambda' | 'laws' | 'numeric';

interface KeypadSymbolItem {
  sym: string;
  insert: string;
  label: string;
  hint?: string;
}

interface KeypadCategoryDef {
  id: KeypadCategoryId;
  title: string;
  shortTitle: string;
  stageLane: 'logic' | 'arith' | 'lambda';
  columns: 3 | 4;
  items: KeypadSymbolItem[];
}

const KEYPAD_CATEGORIES: KeypadCategoryDef[] = [
  {
    id: 'logic',
    title: 'Propositional & Quantifier Logic',
    shortTitle: 'Logic',
    stageLane: 'logic',
    columns: 4,
    items: [
      { sym: '¬', insert: '¬', label: 'Logical NOT' },
      { sym: '∧', insert: ' ∧ ', label: 'Logical AND' },
      { sym: '∨', insert: ' ∨ ', label: 'Logical OR' },
      { sym: '⊕', insert: ' ⊕ ', label: 'Logical XOR' },
      { sym: '→', insert: ' → ', label: 'Implies' },
      { sym: '↔', insert: ' ↔ ', label: 'If and Only If (IFF)' },
      { sym: '≡', insert: ' ≡ ', label: 'Logical Equivalence' },
      { sym: '¬( )', insert: '¬()', label: 'Negated Group' },
      { sym: '⊤', insert: '⊤', label: 'Boolean True (⊤)' },
      { sym: '⊥', insert: '⊥', label: 'Boolean False (⊥)' },
      { sym: '∀x.', insert: '∀x. ', label: 'Universal Quantifier (For All)' },
      { sym: '∃x.', insert: '∃x. ', label: 'Existential Quantifier (Exists)' },
    ],
  },
  {
    id: 'compare',
    title: 'Relations & Grouping',
    shortTitle: 'Compare',
    stageLane: 'arith',
    columns: 4,
    items: [
      { sym: '=', insert: ' = ', label: 'Equal' },
      { sym: '≠', insert: ' ≠ ', label: 'Not Equal' },
      { sym: '<', insert: ' < ', label: 'Less Than' },
      { sym: '≤', insert: ' ≤ ', label: 'Less Than or Equal' },
      { sym: '>', insert: ' > ', label: 'Greater Than' },
      { sym: '≥', insert: ' ≥ ', label: 'Greater Than or Equal' },
      { sym: '(', insert: '(', label: 'Open Parenthesis' },
      { sym: ')', insert: ')', label: 'Close Parenthesis' },
    ],
  },
  {
    id: 'arith',
    title: 'Arithmetic Pad',
    shortTitle: 'Arith',
    stageLane: 'arith',
    columns: 4,
    items: [
      { sym: '7', insert: '7', label: 'Digit 7' },
      { sym: '8', insert: '8', label: 'Digit 8' },
      { sym: '9', insert: '9', label: 'Digit 9' },
      { sym: '/', insert: ' / ', label: 'Divide' },
      { sym: '4', insert: '4', label: 'Digit 4' },
      { sym: '5', insert: '5', label: 'Digit 5' },
      { sym: '6', insert: '6', label: 'Digit 6' },
      { sym: '*', insert: ' * ', label: 'Multiply' },
      { sym: '1', insert: '1', label: 'Digit 1' },
      { sym: '2', insert: '2', label: 'Digit 2' },
      { sym: '3', insert: '3', label: 'Digit 3' },
      { sym: '-', insert: ' - ', label: 'Subtract' },
      { sym: '0', insert: '0', label: 'Digit 0' },
      { sym: '%', insert: ' % ', label: 'Modulo' },
      { sym: '^', insert: ' ^ ', label: 'Exponent Power' },
      { sym: '+', insert: ' + ', label: 'Add' },
    ],
  },
  {
    id: 'lambda',
    title: 'Lambda & Combinators (λ)',
    shortTitle: 'Lambda λ',
    stageLane: 'lambda',
    columns: 4,
    items: [
      { sym: 'λx.', insert: 'λx. ', label: 'Unary Lambda Abstraction' },
      { sym: 'λx.λy.', insert: 'λx. λy. ', label: 'Curried Binary Lambda' },
      { sym: 'λcb.λv.', insert: 'λcb. λv. ', label: 'Higher-Order Callback Lambda' },
      { sym: 'cb(v)', insert: 'cb(v)', label: 'Callback Application' },
      { sym: 'I', insert: '(λx. x)', label: 'Identity Combinator I = λx. x' },
      { sym: 'K', insert: '(λx. λy. x)', label: 'Constant Combinator K = λx. λy. x' },
      { sym: 'B', insert: '(λf. λg. λx. f(g(x)))', label: 'Composition Combinator B' },
      { sym: 'W', insert: '(λf. λx. f(x)(x))', label: 'Duplication Combinator W' },
      { sym: 'C', insert: '(λf. λx. λy. f(y)(x))', label: 'Flip Combinator C' },
      { sym: 'S', insert: '(λx. λy. λz. x(z)(y(z)))', label: 'Substitution Combinator S' },
      { sym: '2×', insert: '(λf. λx. f(f(x)))', label: 'Church Numeral 2 (Apply Twice)' },
      { sym: 'apply', insert: '(λcb. λv. cb(v))', label: 'Apply Callback Combinator' },
    ],
  },
  {
    id: 'laws',
    title: 'Logic Laws & Proofs',
    shortTitle: 'Laws',
    stageLane: 'logic',
    columns: 3,
    items: [
      { sym: '¬(p∧q)', insert: '¬(p ∧ q)', label: 'De Morgan Conjunction' },
      { sym: '¬(p∨q)', insert: '¬(p ∨ q)', label: 'De Morgan Disjunction' },
      { sym: 'p∨¬p', insert: '(p ∨ ¬p)', label: 'Law of Excluded Middle' },
      { sym: 'p→q', insert: '(p → q)', label: 'Material Implication' },
      { sym: 'p↔q', insert: '(p ↔ q)', label: 'Biconditional Equivalence' },
      { sym: 'MP', insert: '(((p → q) ∧ p) → q)', label: 'Modus Ponens Tautology' },
    ],
  },
  {
    id: 'numeric',
    title: 'Numeric & Cauchy Templates',
    shortTitle: 'Cauchy',
    stageLane: 'lambda',
    columns: 3,
    items: [
      { sym: 'x²', insert: '(x ^ 2)', label: 'Square Expression' },
      { sym: '√x', insert: '(x ^ 0.5)', label: 'Square Root Expression' },
      { sym: '1/x', insert: '(1 / x)', label: 'Reciprocal' },
      { sym: 'mid', insert: '(left + right) / 2', label: 'Directional Midpoint' },
      { sym: 'even', insert: '((x % 2) = 0)', label: 'Even Parity Predicate' },
      { sym: '0..100', insert: '((x ≥ 0) ∧ (x ≤ 100))', label: 'Closed Interval Predicate' },
    ],
  },
];

const KEYPAD_LAYOUT_MODES: Array<{ id: KeypadLayoutMode; label: string; shortLabel: string; icon: typeof LayoutGrid }> = [
  { id: 'grid', label: 'Grid', shortLabel: 'Grid', icon: LayoutGrid },
  { id: 'lanes', label: 'Stage Lanes', shortLabel: 'Lanes', icon: Columns3 },
  { id: 'rail', label: 'Rail', shortLabel: 'Rail', icon: Rows3 },
];

const KEYPAD_STAGE_LANES: Array<{ id: 'logic' | 'arith' | 'lambda'; label: string }> = [
  { id: 'logic', label: 'Logic & Laws' },
  { id: 'arith', label: 'Arithmetic & Relations' },
  { id: 'lambda', label: 'Lambda & Numeric' },
];

interface LogicStatementHistoryEntry {
  id: string;
  statement: string;
  labels: LogicLabelBinding[];
  resultPreview: string;
  timestamp: string;
  pinned?: boolean;
}

const LOGIC_HISTORY_STORAGE_KEY = 'grammar2json_logic_stmt_history_v1';

function loadLogicStatementHistory(): LogicStatementHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOGIC_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is LogicStatementHistoryEntry =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as LogicStatementHistoryEntry).statement === 'string' &&
          typeof (item as LogicStatementHistoryEntry).id === 'string'
      )
      .slice(0, 40);
  } catch {
    return [];
  }
}

function saveLogicStatementHistory(entries: LogicStatementHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOGIC_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, 40)));
  } catch {
    // Ignore storage quota errors
  }
}

const EXPORT_TARGETS: Array<{ id: LogicExportTarget; label: string }> = [
  { id: 'python', label: 'Python (.py)' },
  { id: 'jsonld', label: 'JSON-LD (.jsonld)' },
  { id: 'rust', label: 'Rust (.rs)' },
  { id: 'wat', label: 'WABT (.wat)' },
  { id: 'wasm', label: 'WASM (.wasm)' },
  { id: 'typescript', label: 'TypeScript (.ts)' },
  { id: 'javascript', label: 'JavaScript (.mjs)' },
  { id: 'go', label: 'Go (.go)' },
  { id: 'java', label: 'Java (.java)' },
  { id: 'cpp', label: 'C++ (.hpp)' },
  { id: 'csharp', label: 'C# (.cs)' },
  { id: 'php', label: 'PHP (.php)' },
  { id: 'sql', label: 'SQL (.sql)' },
  { id: 'swift', label: 'Swift (.swift)' },
  { id: 'kotlin', label: 'Kotlin (.kt)' },
  { id: 'ruby', label: 'Ruby (.rb)' },
  { id: 'scala', label: 'Scala (.scala)' },
  { id: 'haskell', label: 'Haskell (.hs)' },
  { id: 'elixir', label: 'Elixir (.ex)' },
  { id: 'lua', label: 'Lua (.lua)' },
  { id: 'zig', label: 'Zig (.zig)' },
  { id: 'dart', label: 'Dart (.dart)' },
  { id: 'ocaml', label: 'OCaml (.ml)' },
];

interface TraceOperatorDoc {
  symbol: string;
  name: string;
  category: string;
  arity: string;
  detail: string;
}

const BETA_TRACE_OPERATOR_DOCS: Record<string, TraceOperatorDoc> = {
  '¬': { symbol: '¬', name: 'Logical Negation (NOT)', category: 'Propositional Logic', arity: 'Unary prefix', detail: 'Inverts boolean truth value: ¬⊤ ↦ ⊥, ¬⊥ ↦ ⊤.' },
  '∧': { symbol: '∧', name: 'Logical Conjunction (AND)', category: 'Propositional Logic', arity: 'Binary infix', detail: 'True only when both operands evaluate to ⊤.' },
  '∨': { symbol: '∨', name: 'Logical Disjunction (OR)', category: 'Propositional Logic', arity: 'Binary infix', detail: 'True when at least one operand evaluates to ⊤.' },
  '⊕': { symbol: '⊕', name: 'Exclusive Disjunction (XOR)', category: 'Propositional Logic', arity: 'Binary infix', detail: 'True when operands have differing boolean values.' },
  '→': { symbol: '→', name: 'Material Implication (IMPLIES)', category: 'Propositional Logic', arity: 'Binary infix', detail: 'Equivalent to (¬A ∨ B); false only when A is ⊤ and B is ⊥.' },
  '↔': { symbol: '↔', name: 'Biconditional (IFF)', category: 'Propositional Logic', arity: 'Binary infix', detail: 'True when both operands share identical truth values.' },
  '≡': { symbol: '≡', name: 'Logical Equivalence', category: 'Propositional Logic', arity: 'Binary infix', detail: 'Checks structural / truth equivalence between propositions.' },
  '∀': { symbol: '∀', name: 'Universal Quantifier (FORALL)', category: 'Predicate Logic', arity: 'Binder', detail: 'Asserts predicate holds for all boolean assignments of the bound variable.' },
  '∃': { symbol: '∃', name: 'Existential Quantifier (EXISTS)', category: 'Predicate Logic', arity: 'Binder', detail: 'Asserts predicate holds for at least one assignment of the bound variable.' },
  'λ': { symbol: 'λ', name: 'Lambda Abstraction', category: 'Lambda Calculus', arity: 'Binder (λparam. body)', detail: 'Constructs a lexically scoped closure capturing free variables in the current environment.' },
  '↦': { symbol: '↦', name: 'Beta-Reduction Step', category: 'Lambda Calculus', arity: 'Reduction relation', detail: 'Substitutes an argument value into a lambda body (β-reduction) or evaluates an operator.' },
  '+': { symbol: '+', name: 'Addition', category: 'Arithmetic', arity: 'Binary infix', detail: 'Computes the numeric sum of left and right operands.' },
  '-': { symbol: '-', name: 'Subtraction / Negation', category: 'Arithmetic', arity: 'Binary / Unary', detail: 'Computes arithmetic difference or unary numeric negation.' },
  '*': { symbol: '*', name: 'Multiplication', category: 'Arithmetic', arity: 'Binary infix', detail: 'Computes the numeric product of left and right operands.' },
  '/': { symbol: '/', name: 'Division', category: 'Arithmetic', arity: 'Binary infix', detail: 'Computes floating-point quotient; guards against division by zero.' },
  '%': { symbol: '%', name: 'Modulo / Remainder', category: 'Arithmetic', arity: 'Binary infix', detail: 'Computes remainder after integer/numeric division.' },
  '^': { symbol: '^', name: 'Exponentiation', category: 'Arithmetic', arity: 'Binary right-assoc', detail: 'Raises the left base operand to the right exponent power.' },
  '=': { symbol: '=', name: 'Equality Comparison', category: 'Comparison', arity: 'Binary infix', detail: 'Returns ⊤ when left and right values are equal.' },
  '≠': { symbol: '≠', name: 'Inequality Comparison', category: 'Comparison', arity: 'Binary infix', detail: 'Returns ⊤ when left and right values differ.' },
  '<': { symbol: '<', name: 'Less Than', category: 'Comparison', arity: 'Binary infix', detail: 'Returns ⊤ when left numeric operand is strictly smaller than right.' },
  '≤': { symbol: '≤', name: 'Less Than or Equal', category: 'Comparison', arity: 'Binary infix', detail: 'Returns ⊤ when left numeric operand is less than or equal to right.' },
  '>': { symbol: '>', name: 'Greater Than', category: 'Comparison', arity: 'Binary infix', detail: 'Returns ⊤ when left numeric operand is strictly greater than right.' },
  '≥': { symbol: '≥', name: 'Greater Than or Equal', category: 'Comparison', arity: 'Binary infix', detail: 'Returns ⊤ when left numeric operand is greater than or equal to right.' },
  '->': { symbol: '->', name: 'Hook / Callback Dispatch', category: 'Lifecycle Callback', arity: 'Dispatch arrow', detail: 'Invokes a registered lifecycle hook callback with the evaluated result.' },
};

const HOOK_DOCS: Record<string, string> = {
  onFinalResult: 'Lifecycle callback hook invoked unconditionally after the statement completes evaluation.',
  onLogicTrue: 'Lifecycle callback hook invoked whenever the final evaluated result is boolean TRUE (⊤).',
  onLogicFalse: 'Lifecycle callback hook invoked whenever the final evaluated result is boolean FALSE (⊥).',
};

function mapPrimaryToLogicTarget(lang?: PrimaryLanguage): LogicExportTarget {
  if (!lang) return 'python';
  if (lang === 'json') return 'jsonld';
  if (lang === 'wasm') return 'wat';
  return lang as LogicExportTarget;
}

export function LogicLambdaWorkbench({
  gridClass,
  primarySpan,
  secondarySpan,
  mutationPolicy,
  primaryLanguage,
  grammarText,
  rules,
  dialect,
  sampleInput,
  initialStatement,
  initialLabels,
  globalCallbacks = [],
  autocompleteSuggestions = [],
  lintIssues = [],
  onRippleModuleExport,
  onSaveGlobalCallback,
  onDeleteGlobalCallback,
  onLogicStateChange,
  onExportTextFile,
  onSyncLogicToGrammar,
  onNotify,
}: LogicLambdaWorkbenchProps) {
  const initial = LOGIC_CALCULATOR_PRESETS[0];
  const [statement, setStatement] = useState(initialStatement ?? initial.statement);
  const [labels, setLabels] = useState<LogicLabelBinding[]>(initialLabels ?? initial.labels);
  const [callbackHooks, setCallbackHooks] = useState<LogicCallbackHooks>({
    onFinalResult: '',
    onLogicTrue: '',
    onLogicFalse: '',
  });
  const [cauchyConfig, setCauchyConfig] = useState<CauchySequenceConfig>(DEFAULT_CAUCHY_CONFIG);
  const [activeTab, setActiveTab] = useState<'export' | 'trace' | 'truth'>('export');
  const [exportTarget, setExportTarget] = useState<LogicExportTarget>(() =>
    mapPrimaryToLogicTarget(primaryLanguage)
  );
  const [outputViewMode, setOutputViewMode] = useState<'html' | 'edit'>('html');
  const [codeDraft, setCodeDraft] = useState('');
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [parseFeedback, setParseFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [wasmRunResult, setWasmRunResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Square calculator keypad layout mode (Grid, Stage Lanes, Rail) & active Rail category
  const [keypadLayoutMode, setKeypadLayoutMode] = useState<KeypadLayoutMode>('grid');
  const [activeRailCategory, setActiveRailCategory] = useState<KeypadCategoryId>('logic');

  // Dedicated History stack for the Logic / Arithmetic / Lambda Statement
  const [stmtHistory, setStmtHistory] = useState<LogicStatementHistoryEntry[]>(() => {
    const saved = loadLogicStatementHistory();
    if (saved.length > 0) return saved;
    const initStmt = initialStatement ?? initial.statement;
    const initLabels = initialLabels ?? initial.labels;
    return [
      {
        id: `lhist_init_${Date.now()}`,
        statement: initStmt,
        labels: initLabels.map((l) => ({ ...l })),
        resultPreview: 'initial',
        timestamp: new Date().toISOString(),
        pinned: false,
      },
    ];
  });
  const [stmtHistoryCursor, setStmtHistoryCursor] = useState<number>(0);
  const [showStmtHistory, setShowStmtHistory] = useState(false);
  const suppressStmtHistoryRef = useRef(false);

  const stmtInputRef = useRef<HTMLInputElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  // Sync external Undo/Redo/Clear/Restore updates into local inputs & outputs cleanly
  useEffect(() => {
    if (typeof initialStatement === 'string' && initialStatement !== statement) {
      setStatement(initialStatement);
      setIsEditingCode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStatement]);

  useEffect(() => {
    if (initialLabels && JSON.stringify(initialLabels) !== JSON.stringify(labels)) {
      setLabels(initialLabels);
      setIsEditingCode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLabels]);

  useEffect(() => {
    if (primaryLanguage) {
      setExportTarget(mapPrimaryToLogicTarget(primaryLanguage));
    }
  }, [primaryLanguage]);

  useEffect(() => {
    onLogicStateChange?.(statement, labels);
  }, [statement, labels, onLogicStateChange]);

  const effectiveLabels = useMemo(
    () => mergeGlobalCallbacksWithLabels(globalCallbacks, labels),
    [globalCallbacks, labels]
  );

  const cauchyEval = useMemo(
    () => (cauchyConfig.enabled ? evaluateCauchySequence(cauchyConfig, effectiveLabels) : null),
    [cauchyConfig, effectiveLabels]
  );

  const lambdaLabels = useMemo(
    () => effectiveLabels.filter((l) => l.kind === 'lambda' && l.name.trim()),
    [effectiveLabels]
  );

  const evalRes = useMemo(
    () => evaluateLogicStatement(statement, effectiveLabels, callbackHooks),
    [statement, effectiveLabels, callbackHooks]
  );

  const suggestions = useMemo(
    () =>
      analyzeLabelSuggestions(statement, effectiveLabels, {
        lockedNames: mutationPolicy.lockedRules,
        allowMutation: mutationPolicy.allowImportMutation,
      }),
    [statement, effectiveLabels, mutationPolicy.lockedRules, mutationPolicy.allowImportMutation]
  );

  const namedTranslation = useMemo(
    () => translateLambdaCallsToNamedCallbacks(statement, effectiveLabels),
    [statement, effectiveLabels]
  );

  const exported = useMemo(
    () =>
      exportLogicStatement(exportTarget, statement, effectiveLabels, evalRes, cauchyConfig, {
        grammarText,
        rules,
        dialect,
        sampleInput,
      }),
    [exportTarget, statement, effectiveLabels, evalRes, cauchyConfig, grammarText, rules, dialect, sampleInput]
  );

  useEffect(() => {
    if (!isEditingCode) {
      setCodeDraft(exported.content);
    }
  }, [exported.content, isEditingCode]);

  useEffect(() => {
    setIsEditingCode(false);
    setParseFeedback(null);
    setWasmRunResult(null);
  }, [exportTarget]);

  // Record debounced snapshots into the Logic / Arithmetic / Lambda Statement history stack
  useEffect(() => {
    if (suppressStmtHistoryRef.current) {
      suppressStmtHistoryRef.current = false;
      return;
    }
    const trimmed = statement.trim();
    if (!trimmed) return;
    const timer = window.setTimeout(() => {
      setStmtHistory((prev) => {
        const currentEntry = prev[stmtHistoryCursor];
        if (currentEntry && currentEntry.statement.trim() === trimmed) {
          return prev;
        }
        const entry: LogicStatementHistoryEntry = {
          id: `lhist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          statement,
          labels: labels.map((l) => ({ ...l })),
          resultPreview: evalRes.ok ? evalRes.displayValue : 'error',
          timestamp: new Date().toISOString(),
          pinned: false,
        };
        const next = [entry, ...prev.filter((e) => e.statement.trim() !== trimmed || e.pinned)].slice(0, 40);
        saveLogicStatementHistory(next);
        setStmtHistoryCursor(0);
        return next;
      });
    }, 550);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statement]);

  const handleRestoreStatementHistory = (idx: number, includeLabels = false) => {
    const entry = stmtHistory[idx];
    if (!entry) return;
    suppressStmtHistoryRef.current = true;
    setStmtHistoryCursor(idx);
    setStatement(entry.statement);
    if (includeLabels && entry.labels.length > 0) {
      setLabels(entry.labels.map((l) => ({ ...l })));
    }
    setIsEditingCode(false);
    setParseFeedback(null);
    onNotify(`Restored logic statement from history (${new Date(entry.timestamp).toLocaleTimeString()}).`);
  };

  const handleStepStatementHistory = (delta: number) => {
    const nextIdx = stmtHistoryCursor + delta;
    if (nextIdx < 0 || nextIdx >= stmtHistory.length) return;
    handleRestoreStatementHistory(nextIdx, false);
  };

  const handlePinCurrentStatement = () => {
    const trimmed = statement.trim();
    if (!trimmed) return;
    setStmtHistory((prev) => {
      const existingIdx = prev.findIndex((e) => e.statement.trim() === trimmed);
      let next: LogicStatementHistoryEntry[];
      if (existingIdx >= 0) {
        next = prev.map((e, i) => (i === existingIdx ? { ...e, pinned: !e.pinned } : e));
      } else {
        const entry: LogicStatementHistoryEntry = {
          id: `lhist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          statement,
          labels: labels.map((l) => ({ ...l })),
          resultPreview: evalRes.ok ? evalRes.displayValue : 'error',
          timestamp: new Date().toISOString(),
          pinned: true,
        };
        next = [entry, ...prev].slice(0, 40);
      }
      saveLogicStatementHistory(next);
      return next;
    });
    onNotify('Saved logic statement snapshot to history.');
  };

  const handleTogglePinHistoryEntry = (id: string) => {
    setStmtHistory((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e));
      saveLogicStatementHistory(next);
      return next;
    });
  };

  const handleDeleteHistoryEntry = (id: string) => {
    setStmtHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveLogicStatementHistory(next);
      setStmtHistoryCursor((c) => Math.min(c, Math.max(0, next.length - 1)));
      return next;
    });
  };

  const handleClearUnpinnedHistory = () => {
    setStmtHistory((prev) => {
      const next = prev.filter((e) => e.pinned);
      saveLogicStatementHistory(next);
      setStmtHistoryCursor(0);
      return next;
    });
    onNotify('Cleared unpinned logic statement history.');
  };

  const insertSymbol = (text: string) => {
    const el = stmtInputRef.current;
    if (!el) {
      setStatement((prev) => `${prev}${text}`);
      return;
    }
    const start = el.selectionStart ?? statement.length;
    const end = el.selectionEnd ?? statement.length;
    const next = `${statement.slice(0, start)}${text}${statement.slice(end)}`;
    setStatement(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const caret = start + text.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const handleLoadPreset = (presetId: string) => {
    const found = LOGIC_CALCULATOR_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setStatement(found.statement);
    setLabels(found.labels.map((l) => ({ ...l })));
    setIsEditingCode(false);
    setParseFeedback(null);
    onNotify(`Loaded logic & lambda preset: ${found.label}.`);
  };

  const handleAddLabel = (kind: LogicLabelBinding['kind']) => {
    const idx = labels.length + 1;
    const next: LogicLabelBinding =
      kind === 'lambda'
        ? { id: `lbl_${Date.now()}`, name: `fn_${idx}`, value: 'λx. x + 1', kind: 'lambda' }
        : kind === 'boolean'
          ? { id: `lbl_${Date.now()}`, name: `flag_${idx}`, value: 'true', kind: 'boolean' }
          : { id: `lbl_${Date.now()}`, name: `val_${idx}`, value: '10', kind: 'number' };
    setLabels((prev) => [...prev, next]);
  };

  const handleUpdateLabel = (id: string, patch: Partial<LogicLabelBinding>) => {
    setLabels((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleRemoveLabel = (id: string) => {
    setLabels((prev) => prev.filter((l) => l.id !== id));
  };

  const handleApplySuggestion = (suggestion: LabelSuggestion, option: LabelSuggestionOption) => {
    if (!suggestion.permitted) {
      onNotify(suggestion.lockReason || 'Suggestion blocked by x-mutation-policy.');
      return;
    }
    if (suggestion.existingLabelId) {
      handleUpdateLabel(suggestion.existingLabelId, { value: option.value, kind: option.kind });
      onNotify(`Updated "${suggestion.name}" to ${option.value}.`);
    } else {
      const next: LogicLabelBinding = {
        id: `lbl_sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: suggestion.name,
        kind: option.kind,
        value: option.value,
      };
      setLabels((prev) => [...prev, next]);
      onNotify(
        option.signature
          ? `Defined callback ${option.signature} := ${option.value}.`
          : `Bound label "${suggestion.name}" = ${option.value} (${option.kind}).`
      );
    }
    setIsEditingCode(false);
  };

  const handleApplyNamedTranslation = () => {
    if (!namedTranslation.ok) return;
    if (namedTranslation.liftedLabels.length > 0 && !mutationPolicy.allowImportMutation) {
      onNotify('Lifting anonymous lambdas into labels is disabled by x-mutation-policy.');
      return;
    }
    setStatement(namedTranslation.translatedStatement);
    if (namedTranslation.liftedLabels.length > 0) {
      setLabels((prev) => {
        const existingNames = new Set(prev.map((l) => l.name.trim()));
        const additions = namedTranslation.liftedLabels.filter((l) => !existingNames.has(l.name.trim()));
        return [...prev, ...additions];
      });
    }
    setIsEditingCode(false);
    onNotify(
      namedTranslation.liftedLabels.length > 0
        ? `Translated calls to name (param1, param2) and lifted ${namedTranslation.liftedLabels.length} inline λ callback(s).`
        : 'Translated lambda calls to named callback structure name (param1, param2).'
    );
  };

  const handleExportDownload = () => {
    if (!mutationPolicy.allowExportMutation) {
      onNotify('Export mutation is disabled by x-mutation-policy.');
      return;
    }
    if (exportTarget === 'wasm' && exported.wasm?.valid) {
      const blob = new Blob([new Uint8Array(exported.wasm.bytes)], { type: 'application/wasm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exported.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onNotify(`Exported ${exported.wasm.sizeBytes}-byte compiled WASM binary (${exported.filename}).`);
      return;
    }
    onExportTextFile(codeDraft || exported.content, exported.filename, exported.mime);
  };

  const handleParseDraft = () => {
    if (!mutationPolicy.allowImportMutation) {
      setParseFeedback({ ok: false, text: 'Import mutation is disabled by x-mutation-policy.' });
      return;
    }
    const res = parseExportedLogicArtifact(codeDraft);
    if (!res.ok) {
      setParseFeedback({ ok: false, text: res.error });
      return;
    }
    setStatement(res.statement);
    if (res.labels.length > 0) {
      setLabels(res.labels);
    }
    setIsEditingCode(false);
    setParseFeedback({
      ok: true,
      text: `Parsed ${res.detectedFormat} into calculator (${res.labels.length} label/callback binding${res.labels.length === 1 ? '' : 's'}).`,
    });
    onNotify(`Parsed ${res.detectedFormat} into Logic & Lambda Calculator.`);
  };

  const handleImportFile = async (file: File) => {
    if (!mutationPolicy.allowImportMutation) {
      onNotify('Import mutation is disabled by x-mutation-policy.');
      return;
    }
    const isBinaryWasm = file.name.toLowerCase().endsWith('.wasm');
    const payload = isBinaryWasm ? new Uint8Array(await file.arrayBuffer()) : await file.text();
    const res = parseExportedLogicArtifact(payload);
    if (!res.ok) {
      setParseFeedback({ ok: false, text: res.error });
      return;
    }
    setStatement(res.statement);
    if (res.labels.length > 0) {
      setLabels(res.labels);
    }
    setIsEditingCode(false);
    setParseFeedback({
      ok: true,
      text: `Imported & parsed ${file.name} (${res.detectedFormat}).`,
    });
    onNotify(`Parsed ${file.name} into Logic & Lambda Calculator.`);
  };

  const handleRunCompiledWasm = async () => {
    if (!exported.wasm?.valid) return;
    const res = await executeWasmExport(exported.wasm.bytes, 'eval_logic', []);
    if (res.ok) {
      setWasmRunResult(`eval_logic() => ${res.value}`);
    } else {
      setWasmRunResult(`Error: ${res.error}`);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeDraft || exported.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  return (
    <div className={gridClass}>
      <input
        ref={importFileRef}
        type="file"
        accept=".py,.jsonld,.json,.rs,.wat,.wasm,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportFile(f);
          e.target.value = '';
        }}
      />

      {/* PRIMARY PANE: SYMBOLIC LOGIC + LABELED ARITHMETIC + LAMBDA CALLBACK BUILDER */}
      <div className={`${primarySpan} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              03. Symbolic Logic, Arithmetic &amp; Lambda Calculus Calculator
            </h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Build and evaluate propositional logic statements, labeled arithmetic, and higher-order λ callbacks, then export or parse across Python, JSON-LD, Rust, WABT, and WASM.
            </p>
          </div>
          <select
            aria-label="Load logic calculator preset"
            defaultValue={LOGIC_CALCULATOR_PRESETS[0].id}
            onChange={(e) => handleLoadPreset(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {LOGIC_CALCULATOR_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                Preset: {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Statement Input + Built-in Statement History */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label htmlFor="logicStatementInput" className="font-medium text-slate-700 dark:text-slate-300">
              Logic / Arithmetic / Lambda Statement
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Statement History Navigation */}
              <div className="inline-flex items-center rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  disabled={stmtHistoryCursor >= stmtHistory.length - 1}
                  onClick={() => handleStepStatementHistory(1)}
                  title="Previous statement in history"
                  className="inline-flex items-center gap-0.5 border-r border-slate-200 px-1.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="h-3 w-3" />
                  <span className="hidden sm:inline">Older</span>
                </button>
                <button
                  type="button"
                  disabled={stmtHistoryCursor <= 0}
                  onClick={() => handleStepStatementHistory(-1)}
                  title="Newer statement in history"
                  className="inline-flex items-center gap-0.5 border-r border-slate-200 px-1.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <span className="hidden sm:inline">Newer</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={handlePinCurrentStatement}
                  title="Save / Pin current statement to history"
                  className="inline-flex items-center gap-1 border-r border-slate-200 px-1.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Pin className="h-3 w-3" />
                  <span className="hidden md:inline">Pin</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowStmtHistory((v) => !v)}
                  title="Toggle statement history drawer"
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                    showStmtHistory
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <History className="h-3 w-3" />
                  <span>History</span>
                  <span className="font-mono text-[10px] tabular-nums opacity-80">({stmtHistory.length})</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => onSyncLogicToGrammar(statement, labels)}
                className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Sync to Studio Grammar
              </button>
            </div>
          </div>

          <input
            ref={stmtInputRef}
            id="logicStatementInput"
            type="text"
            value={statement}
            onChange={(e) => {
              setStatement(e.target.value);
              setIsEditingCode(false);
            }}
            spellCheck={false}
            placeholder="e.g. (apply_discount(double)(price) ≥ 80) ∧ ¬(tax > 15)"
            className="w-full rounded-lg border border-slate-200 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-800"
          />

          {/* Statement History Drawer */}
          {showStmtHistory && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/90 p-2.5 dark:border-slate-800 dark:bg-slate-950/80">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Statement History ({stmtHistory.length}) · Position {stmtHistoryCursor + 1}/{Math.max(1, stmtHistory.length)}
                </span>
                <button
                  type="button"
                  onClick={handleClearUnpinnedHistory}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  Clear Unpinned
                </button>
              </div>
              {stmtHistory.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-slate-500">No saved statements yet.</p>
              ) : (
                <div className="max-h-44 space-y-1 overflow-auto pr-0.5">
                  {stmtHistory.map((entry, idx) => {
                    const isActive = idx === stmtHistoryCursor && entry.statement === statement;
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs ${
                          isActive
                            ? 'border-blue-400 bg-blue-50/70 dark:border-blue-700 dark:bg-blue-950/40'
                            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleRestoreStatementHistory(idx, false)}
                          className="min-w-0 flex-1 text-left"
                          title="Click to load statement"
                        >
                          <div className="truncate font-mono text-[11px] font-medium text-slate-900 dark:text-slate-100">
                            {entry.statement}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            <span>⇒ {entry.resultPreview}</span>
                            <span>·</span>
                            <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                            {entry.labels.length > 0 && (
                              <>
                                <span>·</span>
                                <span>{entry.labels.length} labels</span>
                              </>
                            )}
                          </div>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          {entry.labels.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRestoreStatementHistory(idx, true)}
                              title="Restore both statement and labels"
                              className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-400"
                            >
                              +Labels
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleTogglePinHistoryEntry(entry.id)}
                            title={entry.pinned ? 'Unpin statement' : 'Pin statement'}
                            className={`rounded border p-1 ${
                              entry.pinned
                                ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                                : 'border-slate-200 text-slate-400 hover:text-slate-600 dark:border-slate-700'
                            }`}
                          >
                            <Pin className="h-2.5 w-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHistoryEntry(entry.id)}
                            title="Remove from history"
                            className="rounded border border-slate-200 p-1 text-slate-400 hover:text-red-600 dark:border-slate-700"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Square Calculator Keypad ordered by Grid, Stage Lanes, or Rail */}
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Calculator Keypad · {KEYPAD_CATEGORIES.length} Categories
            </span>
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
              {KEYPAD_LAYOUT_MODES.map((m) => {
                const Icon = m.icon;
                const active = keypadLayoutMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setKeypadLayoutMode(m.id)}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{m.label}</span>
                    <span className="sm:hidden">{m.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {keypadLayoutMode === 'grid' && (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {KEYPAD_CATEGORIES.map((cat) => (
                <div
                  key={cat.id}
                  className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {cat.title}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">{cat.items.length}</span>
                  </div>
                  <div
                    className={`grid gap-1.5 ${cat.columns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}
                  >
                    {cat.items.map((item) => (
                      <button
                        key={`${cat.id}-${item.sym}`}
                        type="button"
                        title={item.label}
                        onClick={() => insertSymbol(item.insert)}
                        className="flex min-h-[38px] items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1.5 font-mono text-xs font-semibold text-slate-800 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-blue-500 dark:hover:bg-blue-950/50 dark:hover:text-blue-300"
                      >
                        {item.sym}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {keypadLayoutMode === 'lanes' && (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {KEYPAD_STAGE_LANES.map((lane) => {
                const laneCats = KEYPAD_CATEGORIES.filter((c) => c.stageLane === lane.id);
                return (
                  <div
                    key={lane.id}
                    className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="border-b border-slate-100 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:border-slate-800 dark:text-blue-400">
                      {lane.label}
                    </div>
                    {laneCats.map((cat) => (
                      <div key={cat.id} className="space-y-1.5">
                        <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                          {cat.shortTitle}
                        </div>
                        <div
                          className={`grid gap-1 ${cat.columns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}
                        >
                          {cat.items.map((item) => (
                            <button
                              key={`${cat.id}-${item.sym}`}
                              type="button"
                              title={item.label}
                              onClick={() => insertSymbol(item.insert)}
                              className="flex min-h-[36px] items-center justify-center rounded border border-slate-200 bg-slate-50 px-1 py-1 font-mono text-[11px] font-semibold text-slate-800 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-blue-950/50"
                            >
                              {item.sym}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {keypadLayoutMode === 'rail' && (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
              <div className="flex flex-row gap-1 overflow-x-auto pb-1 sm:col-span-4 sm:flex-col sm:overflow-visible sm:pb-0">
                {KEYPAD_CATEGORIES.map((cat) => {
                  const active = activeRailCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveRailCategory(cat.id)}
                      className={`flex shrink-0 items-center justify-between rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                        active
                          ? 'border-blue-500 bg-blue-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{cat.shortTitle}</span>
                      <span className={`ml-2 font-mono text-[10px] ${active ? 'text-blue-100' : 'text-slate-400'}`}>
                        {cat.items.length}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 sm:col-span-8 dark:border-slate-800 dark:bg-slate-900">
                {(() => {
                  const activeCat =
                    KEYPAD_CATEGORIES.find((c) => c.id === activeRailCategory) ?? KEYPAD_CATEGORIES[0];
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {activeCat.title}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {activeCat.columns} per row
                        </span>
                      </div>
                      <div
                        className={`grid gap-2 ${activeCat.columns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}
                      >
                        {activeCat.items.map((item) => (
                          <button
                            key={`${activeCat.id}-${item.sym}`}
                            type="button"
                            title={item.label}
                            onClick={() => insertSymbol(item.insert)}
                            className="flex min-h-[48px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 font-mono text-sm font-semibold text-slate-900 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-blue-500 dark:hover:bg-blue-950/50 dark:hover:text-blue-300"
                          >
                            <span>{item.sym}</span>
                            <span className="mt-0.5 max-w-full truncate font-sans text-[9px] font-normal text-slate-400">
                              {item.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Live Evaluated Output Card */}
        <div
          className={`flex items-start justify-between gap-3 rounded-lg border p-3.5 ${
            evalRes.ok
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-red-200 bg-red-50/70 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {evalRes.ok ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <div className="min-w-0">
              <div className="font-mono text-base font-bold tabular-nums">
                {evalRes.ok ? evalRes.displayValue : evalRes.error}
              </div>
              {evalRes.ast && (
                <div className="mt-0.5 truncate font-mono text-[11px] opacity-80">
                  AST: {formatLogicAst(evalRes.ast)}
                </div>
              )}
            </div>
          </div>
          <span className="shrink-0 font-mono text-[11px] uppercase opacity-75">
            {evalRes.valueType}
          </span>
        </div>

        {/* Smart Permitted Label & Callback Suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Permitted Label &amp; Callback Suggestions ({suggestions.length})
              </div>
              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                {mutationPolicy.allowImportMutation ? 'policy: allowed' : 'policy: read-only'}
              </span>
            </div>
            <div className="space-y-1.5">
              {suggestions.map((sug) => (
                <div
                  key={sug.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{sug.name}</span>
                      <span className="text-[10px] uppercase text-blue-600 dark:text-blue-400">
                        {sug.inferredKind}
                        {sug.expectedArity ? `/${sug.expectedArity}` : ''}
                      </span>
                      {!sug.permitted && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                          <Lock className="h-2.5 w-2.5" />
                          locked
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {sug.permitted ? sug.reason : sug.lockReason || sug.reason}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {sug.options.map((opt) => (
                      <button
                        key={`${sug.id}-${opt.value}`}
                        type="button"
                        disabled={!sug.permitted}
                        onClick={() => handleApplySuggestion(sug, opt)}
                        title={
                          sug.permitted
                            ? `Apply ${sug.name} := ${opt.value}`
                            : sug.lockReason || 'Locked by mutation policy'
                        }
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-medium text-slate-800 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Named Callback Translation Strip: name (param1, param2) */}
        {(namedTranslation.callbacks.length > 0 || namedTranslation.callCount > 0) && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <ArrowRightLeft className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Named Callbacks · <code className="font-mono text-[11px] font-normal text-slate-500 dark:text-slate-400">name (param1, param2)</code>
              </div>
              {namedTranslation.changed && (
                <button
                  type="button"
                  onClick={handleApplyNamedTranslation}
                  className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                >
                  Apply Named Calls
                </button>
              )}
            </div>
            <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              <span className="mr-1.5 text-[10px] uppercase text-slate-400">Translated:</span>
              {namedTranslation.translatedStatement}
            </div>
            {namedTranslation.callbacks.length > 0 && (
              <div className="divide-y divide-slate-200/70 rounded border border-slate-200 bg-white font-mono text-[11px] dark:divide-slate-800/70 dark:border-slate-800 dark:bg-slate-900">
                {namedTranslation.callbacks.map((cb) => (
                  <div
                    key={`${cb.source}-${cb.name}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5"
                  >
                    <span className="text-slate-800 dark:text-slate-200">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{cb.signature}</span>
                      <span className="mx-1.5 text-slate-400">↦</span>
                      <span>{cb.body}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {cb.source === 'lifted' && (
                        <span className="text-[10px] uppercase text-amber-600 dark:text-amber-400">
                          lifted inline λ
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => insertSymbol(cb.signature)}
                        className="text-[10px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Insert call
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Labels & Lambda Callbacks Table */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Labels &amp; Lambda Callbacks ({labels.length})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleAddLabel('number')}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Plus className="h-3 w-3" />
                Number
              </button>
              <button
                type="button"
                onClick={() => handleAddLabel('boolean')}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Plus className="h-3 w-3" />
                Bool
              </button>
              <button
                type="button"
                onClick={() => handleAddLabel('lambda')}
                className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-3 w-3" />
                λ Callback
              </button>
            </div>
          </div>

          <div className="max-h-56 space-y-1.5 overflow-auto pr-0.5">
            {labels.map((lbl) => {
              const isLocked = mutationPolicy.lockedRules.includes(lbl.name.trim());
              const unwrappedLambda =
                lbl.kind === 'lambda' ? extractLambdaParamsAndBody(lbl.value) : null;
              const lambdaSig = unwrappedLambda
                ? formatNamedCallbackSignature(lbl.name.trim() || 'cb', unwrappedLambda.params)
                : lbl.kind === 'lambda'
                  ? `${lbl.name.trim() || 'cb'} (param1)`
                  : null;
              const normalizedBool = lbl.value.trim().toLowerCase();
              const isBoolTrue = normalizedBool === 'true' || normalizedBool === '⊤' || normalizedBool === '1';
              const isBoolFalse = normalizedBool === 'false' || normalizedBool === '⊥' || normalizedBool === '0';

              return (
                <div
                  key={lbl.id}
                  className="space-y-1 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-12">
                    <input
                      type="text"
                      value={lbl.name}
                      disabled={isLocked}
                      onChange={(e) => handleUpdateLabel(lbl.id, { name: e.target.value })}
                      aria-label="Label identifier"
                      className="min-h-[36px] rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-60 sm:col-span-3 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <select
                      value={lbl.kind}
                      disabled={isLocked}
                      aria-label={`Kind for ${lbl.name}`}
                      onChange={(e) =>
                        handleUpdateLabel(lbl.id, { kind: e.target.value as LogicLabelBinding['kind'] })
                      }
                      className="min-h-[36px] rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-800 focus:border-blue-500 focus:outline-none disabled:opacity-60 sm:col-span-3 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="lambda">λ Callback</option>
                    </select>
                    <input
                      type="text"
                      value={lbl.value}
                      disabled={isLocked}
                      placeholder={
                        lbl.kind === 'boolean'
                          ? 'true | false | cb (x)'
                          : lbl.kind === 'lambda'
                            ? 'λparam1. λparam2. ...'
                            : '0 or tax_fn (100)'
                      }
                      onChange={(e) => handleUpdateLabel(lbl.id, { value: e.target.value })}
                      aria-label={`Value for ${lbl.name}`}
                      className="min-h-[36px] rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-60 sm:col-span-4 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <div className="flex items-center justify-end gap-1 sm:col-span-2">
                      {lbl.kind === 'lambda' && onSaveGlobalCallback && (
                        <button
                          type="button"
                          title={`Save ${lbl.name} to Local Global Callbacks`}
                          onClick={() =>
                            onSaveGlobalCallback({
                              name: lbl.name,
                              lambdaExpr: lbl.value,
                              source: 'logic_calc',
                            })
                          }
                          className="inline-flex min-h-[32px] items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50/70 px-1.5 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 sm:min-h-0 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          <BookmarkCheck className="h-3 w-3" />
                          <span className="sm:hidden">Save Global</span>
                        </button>
                      )}
                      <button
                        type="button"
                        title={`Insert ${lambdaSig || lbl.name} into statement`}
                        onClick={() => insertSymbol(lambdaSig || lbl.name)}
                        className="min-h-[32px] rounded border border-slate-200 px-2 py-1 font-mono text-[10px] font-medium text-blue-600 hover:bg-blue-50 sm:min-h-0 sm:px-1.5 dark:border-slate-700 dark:text-blue-400"
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => handleRemoveLabel(lbl.id)}
                        aria-label={`Delete ${lbl.name}`}
                        className="min-h-[32px] rounded border border-slate-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40 sm:min-h-0 sm:p-1 dark:border-slate-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {/* Inline permitted suggestions & callback signature */}
                  {lbl.kind === 'boolean' && !isLocked && (
                    <div className="flex items-center justify-between gap-2 pl-0.5 text-[10px]">
                      <span className="text-slate-400">
                        {!isBoolTrue && !isBoolFalse ? 'Undefined boolean — select value:' : 'Quick toggle:'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateLabel(lbl.id, { value: 'true' })}
                          className={`rounded border px-1.5 py-0.5 font-mono font-medium transition-colors ${
                            isBoolTrue
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                          }`}
                        >
                          true
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateLabel(lbl.id, { value: 'false' })}
                          className={`rounded border px-1.5 py-0.5 font-mono font-medium transition-colors ${
                            isBoolFalse
                              ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                          }`}
                        >
                          false
                        </button>
                      </div>
                    </div>
                  )}
                  {lbl.kind === 'lambda' && lambdaSig && (
                    <div className="flex items-center justify-between gap-2 pl-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      <span>
                        Named callback: <strong className="text-slate-700 dark:text-slate-200">{lambdaSig}</strong>
                      </span>
                      {isLocked && (
                        <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                          <Lock className="h-2.5 w-2.5" />
                          locked
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Saved Local Global Callbacks Strip */}
          {globalCallbacks.length > 0 && (
            <div className="space-y-2 rounded-lg border border-blue-200/80 bg-blue-50/40 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                  <Globe className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Saved Local Global Callbacks ({globalCallbacks.length})
                  <DocTooltip docKey="globalCallbacks" />
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Auto-available in statements &amp; properties
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {globalCallbacks.map((cb) => (
                  <div
                    key={cb.id}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
                  >
                    <button
                      type="button"
                      onClick={() => insertSymbol(formatGlobalCallbackCallTemplate(cb))}
                      title={`Insert ${cb.name} (${cb.lambdaExpr})`}
                      className="font-medium text-blue-700 hover:underline dark:text-blue-300"
                    >
                      {cb.name}({cb.params.join(', ')})
                    </button>
                    {onDeleteGlobalCallback && (
                      <button
                        type="button"
                        onClick={() => onDeleteGlobalCallback(cb.id)}
                        aria-label={`Remove global callback ${cb.name}`}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cauchy Sequencing Option (_# / left-right / Given Parameter Names) */}
          <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={cauchyConfig.enabled}
                  onChange={(e) =>
                    setCauchyConfig((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Cauchy Sequence Convergence Analyzer</span>
                <DocTooltip docKey="cauchySequence" />
              </label>
              <div className="flex flex-wrap items-center gap-1">
                {CAUCHY_SEQUENCE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setCauchyConfig({ ...preset.config, enabled: true })}
                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {cauchyConfig.enabled && (
              <div className="space-y-2.5 border-t border-slate-200/80 pt-2.5 dark:border-slate-800">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="cauchy-style"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                    >
                      Parameter Naming Style
                    </label>
                    <select
                      id="cauchy-style"
                      value={cauchyConfig.paramStyle}
                      onChange={(e) =>
                        setCauchyConfig((prev) => ({
                          ...prev,
                          paramStyle: e.target.value as CauchyParamStyle,
                        }))
                      }
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="positional">Positional (_1, _2, ...)</option>
                      <option value="directional">Directional (left, right, mid)</option>
                      <option value="named">Given Parameter Names</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="cauchy-seeds"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                    >
                      Initial Seed Terms
                    </label>
                    <input
                      id="cauchy-seeds"
                      type="text"
                      value={cauchyConfig.seedValues}
                      onChange={(e) =>
                        setCauchyConfig((prev) => ({ ...prev, seedValues: e.target.value }))
                      }
                      placeholder="0, 1"
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  {cauchyConfig.paramStyle === 'named' ? (
                    <div>
                      <label
                        htmlFor="cauchy-names"
                        className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                      >
                        Given Parameter Names
                      </label>
                      <input
                        id="cauchy-names"
                        type="text"
                        value={cauchyConfig.customParamNames}
                        onChange={(e) =>
                          setCauchyConfig((prev) => ({ ...prev, customParamNames: e.target.value }))
                        }
                        placeholder="a, b"
                        className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label
                          htmlFor="cauchy-iter"
                          className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                        >
                          Iterations
                        </label>
                        <input
                          id="cauchy-iter"
                          type="number"
                          min={2}
                          max={80}
                          value={cauchyConfig.maxIterations}
                          onChange={(e) =>
                            setCauchyConfig((prev) => ({
                              ...prev,
                              maxIterations: Number(e.target.value) || 20,
                            }))
                          }
                          className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="cauchy-eps"
                          className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                        >
                          Epsilon (ε)
                        </label>
                        <input
                          id="cauchy-eps"
                          type="number"
                          step="0.0001"
                          value={cauchyConfig.epsilon}
                          onChange={(e) =>
                            setCauchyConfig((prev) => ({
                              ...prev,
                              epsilon: Number(e.target.value) || 0.0001,
                            }))
                          }
                          className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="cauchy-expr"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                  >
                    Recurrence Expression{' '}
                    {cauchyEval && (
                      <span className="font-mono text-blue-600 dark:text-blue-400">
                        (active params: {cauchyEval.resolvedParamNames.join(', ')})
                      </span>
                    )}
                  </label>
                  <AutocompleteField
                    inputId="cauchy-expr"
                    value={cauchyConfig.recurrenceExpr}
                    onChange={(nextVal) =>
                      setCauchyConfig((prev) => ({ ...prev, recurrenceExpr: nextVal }))
                    }
                    suggestions={autocompleteSuggestions}
                    onRippleModuleExport={onRippleModuleExport}
                    placeholder="(left + right) / 2  or  (_1 + _2) / 2"
                    className="mt-1 w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                {cauchyEval && (
                  <div className="rounded-md border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900">
                    {cauchyEval.ok ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5 font-mono text-[11px]">
                          <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {cauchyEval.converged
                              ? `Cauchy Converged at N=${cauchyEval.cauchyIndexN} · Limit ≈ ${cauchyEval.limitEstimate?.toFixed(6)}`
                              : `Not yet within ε=${cauchyConfig.epsilon} · Tail diameter = ${cauchyEval.tailDiameter?.toExponential(2)}`}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            Last 4 terms:{' '}
                            {cauchyEval.steps
                              .slice(-4)
                              .map((s) => `a_${s.n}=${s.value.toFixed(5)}`)
                              .join(', ')}
                          </div>
                        </div>
                        {cauchyEval.limitEstimate !== null && (
                          <button
                            type="button"
                            onClick={() => {
                              const valStr = Number(cauchyEval.limitEstimate!.toFixed(6)).toString();
                              setLabels((prev) => {
                                const exists = prev.some((l) => l.name === 'cauchy_limit');
                                return exists
                                  ? prev.map((l) =>
                                      l.name === 'cauchy_limit'
                                        ? { ...l, kind: 'number', value: valStr }
                                        : l
                                    )
                                  : [
                                      ...prev,
                                      {
                                        id: `lbl_cauchy_${Date.now()}`,
                                        name: 'cauchy_limit',
                                        kind: 'number',
                                        value: valStr,
                                      },
                                    ];
                              });
                              onNotify(`Bound cauchy_limit = ${valStr} into Logic Labels.`);
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                          >
                            <BookmarkCheck className="h-3 w-3" />
                            Bind cauchy_limit
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-red-600 dark:text-red-400">{cauchyEval.error}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lambda Callback Hooks (onFinalResult / onLogicTrue / onLogicFalse) */}
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Lambda Callback Hooks
              </span>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {lambdaLabels.length} λ closure{lambdaLabels.length === 1 ? '' : 's'} available
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  ['onFinalResult', 'onFinalResult'],
                  ['onLogicTrue', 'onLogicTrue'],
                  ['onLogicFalse', 'onLogicFalse'],
                ] as const
              ).map(([hookKey, label]) => (
                <div key={hookKey}>
                  <label
                    htmlFor={`hook-${hookKey}`}
                    className="block font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400"
                  >
                    {label}
                  </label>
                  <select
                    id={`hook-${hookKey}`}
                    value={callbackHooks[hookKey] || ''}
                    onChange={(e) =>
                      setCallbackHooks((prev) => ({ ...prev, [hookKey]: e.target.value }))
                    }
                    className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="">None</option>
                    {lambdaLabels.map((cb) => (
                      <option key={cb.id} value={cb.name}>
                        {cb.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {evalRes.hookExecutions && evalRes.hookExecutions.length > 0 && (
              <div className="space-y-1 border-t border-slate-200/80 pt-2 font-mono text-[11px] dark:border-slate-800">
                {evalRes.hookExecutions.map((hx, idx) => (
                  <div key={`${hx.hook}-${idx}`} className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                    <span>
                      <span className="text-blue-600 dark:text-blue-400">{hx.hook}</span> · {hx.callbackName}({hx.input})
                    </span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">↦ {hx.output}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECONDARY PANE: EXPORT & PARSE (PYTHON / JSON-LD / RUST / WABT / WASM) + TRACE + TRUTH TABLE */}
      <div className={`${secondarySpan} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                activeTab === 'export'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              Export &amp; Parse
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('trace')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                activeTab === 'trace'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              β-Trace ({evalRes.trace.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('truth')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                activeTab === 'truth'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              Truth Table
            </button>
          </div>
        </div>

        {activeTab === 'export' ? (
          <div className="flex flex-1 flex-col gap-2.5">
            {/* 23-Target Language Selector + HTML vs Syntax-Colored Editable Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-center gap-1.5">
                <label htmlFor="logic-export-lang" className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Target Language
                </label>
                <select
                  id="logic-export-lang"
                  value={exportTarget}
                  onChange={(e) => setExportTarget(e.target.value as LogicExportTarget)}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {EXPORT_TARGETS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setOutputViewMode('html')}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    outputViewMode === 'html'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  HTML Output
                </button>
                <button
                  type="button"
                  onClick={() => setOutputViewMode('edit')}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    outputViewMode === 'edit'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Edit &amp; Parse
                </button>
              </div>
            </div>

            {/* Export / Parse / Upload / Execute Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportDownload}
                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-3.5 w-3.5" />
                Export {exported.filename}
              </button>
              <button
                type="button"
                onClick={handleParseDraft}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Parse Code
              </button>
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload File
              </button>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              {(exportTarget === 'wasm' || exportTarget === 'wat') && exported.wasm?.valid && (
                <button
                  type="button"
                  onClick={() => void handleRunCompiledWasm()}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  <Play className="h-3 w-3" />
                  Run WASM ({exported.wasm.sizeBytes}B)
                </button>
              )}
            </div>

            {wasmRunResult && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 font-mono text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                WebAssembly runtime: {wasmRunResult}
              </div>
            )}

            {parseFeedback && (
              <div
                className={`rounded-md border px-2.5 py-1.5 text-xs ${
                  parseFeedback.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
                }`}
              >
                {parseFeedback.text}
              </div>
            )}

            {outputViewMode === 'html' ? (
              <HtmlCodeOutput
                title={exported.filename}
                code={codeDraft}
                language={exportTarget}
                lintIssues={lintIssues}
                maxHeightClass="max-h-[340px]"
              />
            ) : (
              <AutocompleteField
                multiline
                rows={14}
                syntaxMode={exportTarget === 'jsonld' ? 'json' : 'code'}
                value={codeDraft}
                onChange={(nextVal) => {
                  setCodeDraft(nextVal);
                  setIsEditingCode(true);
                }}
                suggestions={autocompleteSuggestions}
                onRippleModuleExport={onRippleModuleExport}
                ariaLabel="Exported or pasteable logic artifact"
                className="min-h-[280px]"
              />
            )}
          </div>
        ) : activeTab === 'trace' ? (
          <div className="max-h-96 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs text-slate-200 dark:border-slate-800">
            <div className="mb-2 border-b border-slate-800 pb-1.5 font-sans text-[11px] text-slate-400">
              Hover any highlighted <span className="font-mono text-amber-300">operator</span> or{' '}
              <span className="font-mono text-violet-300">callback / label</span> token to inspect formal reduction details.
            </div>
            {evalRes.trace.length === 0 ? (
              <div className="text-slate-400">Enter a statement to inspect λ β-reduction and logic evaluation steps.</div>
            ) : (
              evalRes.trace.map((step) => {
                const labelByName = new Map(effectiveLabels.map((l) => [l.name.trim(), l]));
                const globalByName = new Map(globalCallbacks.map((cb) => [cb.name.trim(), cb]));

                const renderInteractiveTraceText = (rawText: string) => {
                  const regex = /(->|[¬∧∨⊕→↔≡∀∃λ↦+\-*/%^=≠<≤>≥]|[A-Za-z_][A-Za-z0-9_]*)/g;
                  const pieces: Array<{ text: string; key: number }> = [];
                  let lastIdx = 0;
                  let m: RegExpExecArray | null;
                  let idx = 0;
                  while ((m = regex.exec(rawText)) !== null) {
                    if (m.index > lastIdx) {
                      pieces.push({ text: rawText.slice(lastIdx, m.index), key: idx++ });
                    }
                    pieces.push({ text: m[0], key: idx++ });
                    lastIdx = m.index + m[0].length;
                  }
                  if (lastIdx < rawText.length) {
                    pieces.push({ text: rawText.slice(lastIdx), key: idx++ });
                  }

                  return pieces.map((part) => {
                    const tok = part.text;
                    const opDoc = BETA_TRACE_OPERATOR_DOCS[tok];
                    if (opDoc) {
                      return (
                        <span
                          key={part.key}
                          tabIndex={0}
                          className="group/tok relative inline-block cursor-help rounded px-0.5 font-semibold text-amber-300 underline decoration-amber-400/60 decoration-dotted underline-offset-2 hover:bg-amber-950/60 focus:bg-amber-950/60 focus:outline-none"
                        >
                          {tok}
                          <span
                            role="tooltip"
                            className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-1.5 w-64 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-left font-sans text-[11px] font-normal text-slate-200 opacity-0 shadow-xl transition-opacity group-hover/tok:visible group-hover/tok:opacity-100 group-focus/tok:visible group-focus/tok:opacity-100"
                          >
                            <span className="flex items-center justify-between gap-2 font-semibold text-amber-300">
                              <span>{opDoc.name}</span>
                              <span className="font-mono text-[10px] text-slate-400">{opDoc.arity}</span>
                            </span>
                            <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-slate-400">
                              {opDoc.category}
                            </span>
                            <span className="mt-1 block leading-relaxed text-slate-200">{opDoc.detail}</span>
                          </span>
                        </span>
                      );
                    }

                    const hookDoc = HOOK_DOCS[tok];
                    const globCb = globalByName.get(tok);
                    const lbl = labelByName.get(tok);
                    if (hookDoc || globCb || lbl) {
                      const badge = hookDoc
                        ? 'Lifecycle Hook'
                        : globCb
                          ? 'Global λ Callback'
                          : lbl?.kind === 'lambda'
                            ? 'Lambda Callback'
                            : `Label (${lbl?.kind})`;
                      const exprDetail = hookDoc
                        ? hookDoc
                        : globCb
                          ? `${globCb.name}(${globCb.params.join(', ')}) = ${globCb.lambdaExpr}${globCb.description ? ` — ${globCb.description}` : ''}`
                          : `${lbl?.name} = ${lbl?.value}`;
                      return (
                        <span
                          key={part.key}
                          tabIndex={0}
                          className="group/tok relative inline-block cursor-help rounded px-0.5 font-semibold text-violet-300 underline decoration-violet-400/70 decoration-dotted underline-offset-2 hover:bg-violet-950/60 focus:bg-violet-950/60 focus:outline-none"
                        >
                          {tok}
                          <span
                            role="tooltip"
                            className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-1.5 w-72 -translate-x-1/2 rounded-lg border border-violet-700/70 bg-slate-900 p-2.5 text-left font-sans text-[11px] font-normal text-slate-200 opacity-0 shadow-xl transition-opacity group-hover/tok:visible group-hover/tok:opacity-100 group-focus/tok:visible group-focus/tok:opacity-100"
                          >
                            <span className="flex items-center justify-between gap-2 font-semibold text-violet-300">
                              <span className="font-mono">{tok}</span>
                              <span className="text-[10px] text-slate-400">{badge}</span>
                            </span>
                            <span className="mt-1 block break-words font-mono text-[11px] leading-relaxed text-slate-200">
                              {exprDetail}
                            </span>
                          </span>
                        </span>
                      );
                    }

                    return <span key={part.key}>{tok}</span>;
                  });
                };

                return (
                  <div key={step.step} className="flex items-start gap-2 py-1 leading-relaxed">
                    <span className="w-6 shrink-0 tabular-nums text-slate-500">#{step.step}</span>
                    <span
                      className={`w-16 shrink-0 uppercase ${
                        step.kind === 'callback'
                          ? 'text-violet-400'
                          : step.kind === 'beta'
                            ? 'text-blue-400'
                            : step.kind === 'logic'
                              ? 'text-emerald-400'
                              : step.kind === 'bind'
                                ? 'text-slate-400'
                                : 'text-amber-300'
                      }`}
                    >
                      {step.kind}
                    </span>
                    <span className="flex-1 text-slate-300">
                      {renderInteractiveTraceText(step.expression)}{' '}
                      {renderInteractiveTraceText('↦')}{' '}
                      <span className="font-semibold text-white">
                        {renderInteractiveTraceText(step.result)}
                      </span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="max-h-96 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
            {!evalRes.truthTable ? (
              <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
                Add 1–4 Boolean labels (e.g., <code className="font-mono">P</code>, <code className="font-mono">Q</code>) referenced in a boolean statement to generate a complete propositional truth table.
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    {evalRes.truthTable.variables.map((v) => (
                      <th key={v} className="px-3 py-2 font-semibold">
                        {v}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-blue-600 dark:text-blue-400">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                  {evalRes.truthTable.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-100/70 dark:hover:bg-slate-900/60">
                      {evalRes.truthTable!.variables.map((v) => (
                        <td key={v} className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                          {row.assignments[v] ? '⊤' : '⊥'}
                        </td>
                      ))}
                      <td
                        className={`px-3 py-1.5 text-right font-semibold ${
                          row.result === '⊤'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {row.result}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
