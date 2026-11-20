import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Play,
  Plus,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { executeWasmExport } from '../engine/bidirectionalEngine';
import {
  evaluateLogicStatement,
  exportLogicStatement,
  formatLogicAst,
  LOGIC_CALCULATOR_PRESETS,
  parseExportedLogicArtifact,
  type LogicCallbackHooks,
  type LogicExportTarget,
  type LogicLabelBinding,
} from '../engine/logicLambdaEngine';
import type { MutationPolicy } from '../types/studio';

interface LogicLambdaWorkbenchProps {
  gridClass: string;
  primarySpan: string;
  secondarySpan: string;
  mutationPolicy: MutationPolicy;
  initialStatement?: string;
  initialLabels?: LogicLabelBinding[];
  onLogicStateChange?: (statement: string, labels: LogicLabelBinding[]) => void;
  onExportTextFile: (content: string, filename: string, mime: string) => void;
  onSyncLogicToGrammar: (statement: string, labels: LogicLabelBinding[]) => void;
  onNotify: (msg: string) => void;
}

const LOGIC_SYMBOLS = [
  { sym: '¬', label: 'NOT' },
  { sym: '∧', label: 'AND' },
  { sym: '∨', label: 'OR' },
  { sym: '⊕', label: 'XOR' },
  { sym: '→', label: 'IMPLIES' },
  { sym: '↔', label: 'IFF' },
  { sym: '≡', label: 'EQUIV' },
  { sym: '∀', label: 'FORALL' },
  { sym: '∃', label: 'EXISTS' },
  { sym: '⊤', label: 'TRUE' },
  { sym: '⊥', label: 'FALSE' },
  { sym: '=', label: 'EQ' },
  { sym: '≠', label: 'NEQ' },
  { sym: '<', label: 'LT' },
  { sym: '≤', label: 'LTE' },
  { sym: '>', label: 'GT' },
  { sym: '≥', label: 'GTE' },
];

const ARITH_LAMBDA_SYMBOLS = [
  { sym: '+', label: 'Add' },
  { sym: '-', label: 'Sub' },
  { sym: '*', label: 'Mul' },
  { sym: '/', label: 'Div' },
  { sym: '%', label: 'Mod' },
  { sym: '^', label: 'Pow' },
  { sym: '(', label: 'Open' },
  { sym: ')', label: 'Close' },
  { sym: 'λx. ', label: 'Lambda' },
  { sym: 'λcb. λv. ', label: 'Callback λ' },
];

const EXPORT_TARGETS: Array<{ id: LogicExportTarget; label: string }> = [
  { id: 'python', label: 'Python' },
  { id: 'jsonld', label: 'JSON-LD' },
  { id: 'rust', label: 'Rust' },
  { id: 'wat', label: 'WABT (.wat)' },
  { id: 'wasm', label: 'WASM (.wasm)' },
];

export function LogicLambdaWorkbench({
  gridClass,
  primarySpan,
  secondarySpan,
  mutationPolicy,
  initialStatement,
  initialLabels,
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
  const [activeTab, setActiveTab] = useState<'export' | 'trace' | 'truth'>('export');
  const [exportTarget, setExportTarget] = useState<LogicExportTarget>('python');
  const [codeDraft, setCodeDraft] = useState('');
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [parseFeedback, setParseFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [wasmRunResult, setWasmRunResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const stmtInputRef = useRef<HTMLInputElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    onLogicStateChange?.(statement, labels);
  }, [statement, labels, onLogicStateChange]);

  const lambdaLabels = useMemo(() => labels.filter((l) => l.kind === 'lambda' && l.name.trim()), [labels]);

  const evalRes = useMemo(
    () => evaluateLogicStatement(statement, labels, callbackHooks),
    [statement, labels, callbackHooks]
  );

  const exported = useMemo(
    () => exportLogicStatement(exportTarget, statement, labels, evalRes),
    [exportTarget, statement, labels, evalRes]
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

        {/* Statement Input */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <label htmlFor="logicStatementInput" className="font-medium text-slate-700 dark:text-slate-300">
              Logic / Arithmetic / Lambda Statement
            </label>
            <button
              type="button"
              onClick={() => onSyncLogicToGrammar(statement, labels)}
              className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Sync to Studio Grammar
            </button>
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
        </div>

        {/* Interactive Symbol Keypad */}
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Logic:
            </span>
            {LOGIC_SYMBOLS.map((item) => (
              <button
                key={item.sym}
                type="button"
                title={item.label}
                onClick={() =>
                  insertSymbol(
                    item.sym === '¬' || item.sym === '⊤' || item.sym === '⊥'
                      ? item.sym
                      : item.sym === '∀' || item.sym === '∃'
                        ? `${item.sym}x. `
                        : ` ${item.sym} `
                  )
                }
                className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-medium text-slate-800 transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {item.sym}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Arith / λ:
            </span>
            {ARITH_LAMBDA_SYMBOLS.map((item) => (
              <button
                key={item.sym}
                type="button"
                title={item.label}
                onClick={() =>
                  insertSymbol(
                    ['(', ')', 'λx. ', 'λcb. λv. '].includes(item.sym) ? item.sym : ` ${item.sym} `
                  )
                }
                className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-medium text-slate-800 transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {item.sym.trim()}
              </button>
            ))}
          </div>
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

          <div className="max-h-48 space-y-1.5 overflow-auto pr-0.5">
            {labels.map((lbl) => (
              <div
                key={lbl.id}
                className="grid grid-cols-12 items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
              >
                <input
                  type="text"
                  value={lbl.name}
                  onChange={(e) => handleUpdateLabel(lbl.id, { name: e.target.value })}
                  aria-label="Label identifier"
                  className="col-span-3 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <select
                  value={lbl.kind}
                  aria-label={`Kind for ${lbl.name}`}
                  onChange={(e) =>
                    handleUpdateLabel(lbl.id, { kind: e.target.value as LogicLabelBinding['kind'] })
                  }
                  className="col-span-3 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="lambda">λ Callback</option>
                </select>
                <input
                  type="text"
                  value={lbl.value}
                  onChange={(e) => handleUpdateLabel(lbl.id, { value: e.target.value })}
                  aria-label={`Value for ${lbl.name}`}
                  className="col-span-4 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    title={`Insert ${lbl.name} into statement`}
                    onClick={() => insertSymbol(lbl.kind === 'lambda' ? `${lbl.name}()` : lbl.name)}
                    className="rounded border border-slate-200 px-1.5 py-1 font-mono text-[10px] font-medium text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-400"
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveLabel(lbl.id)}
                    aria-label={`Delete ${lbl.name}`}
                    className="rounded border border-slate-200 p-1 text-red-500 hover:bg-red-50 dark:border-slate-700"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
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
            {/* 5 Target Language Switcher */}
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
              {EXPORT_TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setExportTarget(t.id)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    exportTarget === t.id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
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

            <textarea
              value={codeDraft}
              onChange={(e) => {
                setCodeDraft(e.target.value);
                setIsEditingCode(true);
              }}
              spellCheck={false}
              rows={14}
              aria-label="Exported or pasteable logic artifact"
              className="min-h-[280px] w-full flex-1 rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-800"
            />
          </div>
        ) : activeTab === 'trace' ? (
          <div className="max-h-96 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs text-slate-200 dark:border-slate-800">
            {evalRes.trace.length === 0 ? (
              <div className="text-slate-400">Enter a statement to inspect λ β-reduction and logic evaluation steps.</div>
            ) : (
              evalRes.trace.map((step) => (
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
                    {step.expression} <span className="text-slate-500">↦</span>{' '}
                    <span className="font-semibold text-white">{step.result}</span>
                  </span>
                </div>
              ))
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
