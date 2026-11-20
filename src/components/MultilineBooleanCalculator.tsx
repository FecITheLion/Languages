import { Fragment, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  HelpCircle,
  Save,
  Table2,
  X,
} from 'lucide-react';
import {
  buildMultilineTruthTables,
  buildRowTruthTable,
  CALCULATOR_LABEL_CONVENTIONS,
  evaluateMultilineBooleanProgram,
  FORMAL_LOGIC_PRESETS,
  LOGIC_SYSTEM_CATEGORIES,
  type LabelConventionMeta,
} from '../engine/multilineBooleanEngine';
import {
  compileMultilineLogicToLanguage,
  compileMultilineLogicToPython,
  compileMultilineLogicToWasm,
} from '../engine/multilineLogicExport';
import { SUPPORTED_LANGUAGES, type PrimaryLanguage } from '../types/studio';
import type { VirtualSubmission } from '../engine/virtualFiles';

interface MultilineBooleanCalculatorProps {
  onSubmitArtifacts?: (owner: string, submissions: VirtualSubmission[]) => void;
  onDownloadFile: (content: string, filename: string, mime: string) => void;
  onNotify: (msg: string) => void;
}

function LabelWithConventionTooltip({ meta }: { meta: LabelConventionMeta }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{meta.label}</span>
        <span
          tabIndex={0}
          role="note"
          aria-label={meta.tooltip}
          title={`${meta.standardRef}\n\n${meta.tooltip}`}
          className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white"
        >
          <HelpCircle className="h-3 w-3" />
        </span>
      </div>
      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{meta.standardRef}</span>
    </div>
  );
}

function renderSyntaxTokens(text: string) {
  const regex =
    /\b(true|⊤)\b|\b(false|⊥)\b|\b(\d+(?:\.\d+)?)\b|(λ|=>)|(==|!=|<=|>=|<->|->|[=¬∧∨⊕→↔↑↓+\-*/%|&<>])/gi;
  const nodes: Array<{ key: string; cls?: string; text: string }> = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push({ key: `t-${idx++}`, text: text.slice(last, match.index) });
    }
    const [full, tTrue, tFalse, tNum, tLam, tOp] = match;
    const cls = tTrue
      ? 'font-bold text-emerald-600 dark:text-emerald-400'
      : tFalse
        ? 'font-bold text-rose-600 dark:text-rose-400'
        : tNum
          ? 'font-bold text-sky-600 dark:text-sky-400'
          : tLam
            ? 'font-bold text-violet-600 dark:text-violet-400'
            : tOp
              ? 'font-semibold text-blue-600 dark:text-blue-400'
              : undefined;
    nodes.push({ key: `m-${idx++}`, cls, text: full });
    last = match.index + full.length;
  }
  if (last < text.length) {
    nodes.push({ key: `tail-${idx}`, text: text.slice(last) });
  }
  return nodes.map((n) =>
    n.cls ? (
      <span key={n.key} className={n.cls}>
        {n.text}
      </span>
    ) : (
      <Fragment key={n.key}>{n.text}</Fragment>
    )
  );
}

function SyntaxHighlightedOutput({ text, isDefinition }: { text: string; isDefinition?: boolean }) {
  if (isDefinition) {
    const firstFalse = text.startsWith('false');
    if (text === 'true or false' || text === 'false or true') {
      return (
        <span className="font-mono text-xs">
          <span className={firstFalse ? 'font-bold text-rose-600 dark:text-rose-400' : 'font-bold text-emerald-600 dark:text-emerald-400'}>
            {firstFalse ? 'false' : 'true'}
          </span>{' '}
          <span className="text-slate-500">or</span>{' '}
          <span className={firstFalse ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-bold text-rose-600 dark:text-rose-400'}>
            {firstFalse ? 'true' : 'false'}
          </span>
        </span>
      );
    }
    return <span className="font-mono text-xs italic text-violet-600 dark:text-violet-300">{text}</span>;
  }
  const parts = text.split(/([A-Za-z_][A-Za-z0-9_]*\[line#\d+\]|\btrue\b|\bfalse\b|-?\d+(?:\.\d+)?)/g);
  return (
    <span className="font-mono text-xs">
      {parts.map((part, idx) => {
        if (!part) return null;
        if (/^[A-Za-z_][A-Za-z0-9_]*\[line#\d+\]$/.test(part)) {
          return (
            <span
              key={idx}
              className="mx-0.5 inline-block rounded border border-amber-400/70 bg-amber-100 px-1 py-0.5 font-semibold text-amber-900 dark:border-amber-600/60 dark:bg-amber-950/60 dark:text-amber-300"
            >
              {part}
            </span>
          );
        }
        if (part === 'true') {
          return (
            <span key={idx} className="font-bold text-emerald-600 dark:text-emerald-400">
              true
            </span>
          );
        }
        if (part === 'false') {
          return (
            <span key={idx} className="font-bold text-rose-600 dark:text-rose-400">
              false
            </span>
          );
        }
        if (/^-?\d+(?:\.\d+)?$/.test(part)) {
          return (
            <span key={idx} className="font-bold text-sky-600 dark:text-sky-400">
              {part}
            </span>
          );
        }
        return (
          <span key={idx} className="text-slate-800 dark:text-slate-100">
            {part}
          </span>
        );
      })}
    </span>
  );
}

function HighlightedCodeEditor({
  ariaLabel,
  value,
  onChange,
  rows,
  placeholder,
  textareaRef,
  activeSpan,
  ptrSpan,
  dragActive,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  ariaLabel: string;
  value: string;
  onChange: (next: string) => void;
  rows: number;
  placeholder: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  activeSpan?: { startLine: number; endLine: number; startOffset: number; endOffset: number } | null;
  ptrSpan?: { startLine: number; endLine: number; startOffset: number; endOffset: number } | null;
  dragActive?: boolean;
  onDragOver?: React.DragEventHandler<HTMLTextAreaElement>;
  onDragLeave?: React.DragEventHandler<HTMLTextAreaElement>;
  onDrop?: React.DragEventHandler<HTMLTextAreaElement>;
}) {
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const lines = value.split(/\r?\n/);

  const ranges: Array<{ start: number; end: number; cls: string }> = [];
  if (activeSpan) {
    ranges.push({
      start: activeSpan.startOffset,
      end: activeSpan.endOffset,
      cls: 'rounded-xs border-b-2 border-blue-500 bg-blue-500/20',
    });
  }
  if (
    ptrSpan &&
    (!activeSpan ||
      ptrSpan.startOffset !== activeSpan.startOffset ||
      ptrSpan.endOffset !== activeSpan.endOffset)
  ) {
    ranges.push({
      start: ptrSpan.startOffset,
      end: ptrSpan.endOffset,
      cls: 'rounded-xs border-b-2 border-amber-500 bg-amber-500/25',
    });
  }
  ranges.sort((a, b) => a.start - b.start);

  const renderBackdrop = () => {
    if (ranges.length === 0) {
      return renderSyntaxTokens(value || ' ');
    }
    const out: React.ReactNode[] = [];
    let cursor = 0;
    ranges.forEach((r, idx) => {
      if (r.start > cursor) {
        out.push(<Fragment key={`pre-${idx}`}>{renderSyntaxTokens(value.slice(cursor, r.start))}</Fragment>);
      }
      out.push(
        <span key={`hl-${idx}`} className={r.cls}>
          {renderSyntaxTokens(value.slice(r.start, r.end))}
        </span>
      );
      cursor = Math.max(cursor, r.end);
    });
    if (cursor < value.length) {
      out.push(<Fragment key="end">{renderSyntaxTokens(value.slice(cursor))}</Fragment>);
    }
    return out;
  };

  return (
    <div
      className={`relative flex overflow-hidden rounded-lg border font-mono text-xs leading-6 transition-colors ${
        dragActive
          ? 'border-blue-500 ring-2 ring-blue-500/40'
          : 'border-slate-200 dark:border-slate-700'
      } bg-slate-50 dark:bg-slate-950`}
    >
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="w-9 shrink-0 select-none overflow-hidden border-r border-slate-200 bg-slate-100 px-1.5 py-2 text-right text-[11px] text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
      >
        {lines.map((_, i) => {
          const lineNum = i + 1;
          const isPtr = ptrSpan && lineNum >= ptrSpan.startLine && lineNum <= ptrSpan.endLine;
          const isAct = activeSpan && lineNum >= activeSpan.startLine && lineNum <= activeSpan.endLine;
          return (
            <div
              key={i}
              className={`h-6 rounded-xs px-1 ${
                isPtr
                  ? 'bg-amber-500/25 font-bold text-amber-600 dark:text-amber-300'
                  : isAct
                    ? 'bg-blue-500/20 font-bold text-blue-600 dark:text-blue-400'
                    : ''
              }`}
            >
              {lineNum}
            </div>
          );
        })}
      </div>
      <div className="relative min-w-0 flex-1">
        <div
          ref={backdropRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-slate-900 dark:text-slate-100"
        >
          {renderBackdrop()}
        </div>
        <textarea
          ref={textareaRef}
          aria-label={ariaLabel}
          rows={rows}
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop;
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          placeholder={placeholder}
          className="relative w-full resize-y whitespace-pre-wrap break-words bg-transparent px-3 py-2 font-mono text-xs leading-6 text-transparent caret-blue-600 focus:outline-none dark:caret-blue-400"
        />
      </div>
    </div>
  );
}

export function MultilineBooleanCalculator({
  onSubmitArtifacts,
  onNotify,
}: MultilineBooleanCalculatorProps) {
  const [preInput, setPreInput] = useState('e=true');
  const [program, setProgram] = useState('a(b,c)=b & c\nd=false\na(e,d)');
  const [hoveredBlock, setHoveredBlock] = useState<number | null>(null);
  const [hoveredPointerTarget, setHoveredPointerTarget] = useState<number | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showCondensedStream, setShowCondensedStream] = useState(false);
  const [truthTableScope, setTruthTableScope] = useState<'focused' | 'matrix'>('focused');
  const [traditionFilter, setTraditionFilter] = useState<'all' | 'formal' | 'informal'>('all');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    classical: true,
    lambda_calculus: true,
    arithmetic: true,
  });
  const [targetLang, setTargetLang] = useState<PrimaryLanguage>('typescript');
  const [exportModal, setExportModal] = useState<{
    kind: 'lang' | 'py' | 'wasm';
    title: string;
    badge: string;
    filename: string;
    mime: string;
    status: string;
    error: boolean;
    code: string;
    wasmBinary?: Uint8Array;
  } | null>(null);

  const programRef = useRef<HTMLTextAreaElement | null>(null);

  const evalResult = useMemo(
    () => evaluateMultilineBooleanProgram(preInput, program),
    [preInput, program]
  );

  const activeBlock = hoveredBlock ?? selectedBlock;

  const focusedLine = useMemo(() => {
    if (activeBlock !== null) {
      const candidate = evalResult.alignedLines.find((l) => l.blockIndex === activeBlock);
      if (candidate?.ast) return candidate;
    }
    const exprs = evalResult.alignedLines.filter((l) => l.kind === 'expression' && l.ast);
    if (exprs.length > 0) return exprs[exprs.length - 1];
    const assigns = evalResult.alignedLines.filter((l) => l.kind === 'assignment' && l.ast);
    return assigns[assigns.length - 1] ?? null;
  }, [activeBlock, evalResult]);

  const rowTruthTable = useMemo(
    () => buildRowTruthTable(focusedLine, evalResult),
    [focusedLine, evalResult]
  );

  const truthTables = useMemo(
    () => buildMultilineTruthTables(preInput, program, evalResult),
    [preInput, program, evalResult]
  );

  const visibleCategories = useMemo(
    () =>
      traditionFilter === 'all'
        ? LOGIC_SYSTEM_CATEGORIES
        : LOGIC_SYSTEM_CATEGORIES.filter((c) => c.tradition === traditionFilter),
    [traditionFilter]
  );

  const activeSpan = useMemo(
    () =>
      activeBlock !== null
        ? evalResult.blocks.find((b) => b.blockIndex === activeBlock) ?? null
        : null,
    [activeBlock, evalResult.blocks]
  );

  const ptrSpan = useMemo(
    () =>
      hoveredPointerTarget !== null
        ? evalResult.blocks.find((b) => b.blockIndex === hoveredPointerTarget) ?? null
        : null,
    [hoveredPointerTarget, evalResult.blocks]
  );

  const insertAtCursor = (snippet: string) => {
    const el = programRef.current;
    if (!el) {
      setProgram((prev) => `${prev}${snippet}`);
      return;
    }
    const start = el.selectionStart ?? program.length;
    const end = el.selectionEnd ?? program.length;
    const next = program.slice(0, start) + snippet + program.slice(end);
    setProgram(next);
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const handleSubmitToFiles = () => {
    if (!onSubmitArtifacts) return;
    onSubmitArtifacts('formal-logic', [
      {
        path: 'logic/pre-input.env',
        filename: 'pre-input.env',
        content: preInput,
      },
      {
        path: 'logic/program.logic',
        filename: 'program.logic',
        content: program,
      },
      {
        path: 'logic/evaluation-trace.json',
        filename: 'evaluation-trace.json',
        content: JSON.stringify(
          {
            alignedOutputText: evalResult.alignedOutputText,
            pointerOutputText: evalResult.pointerOutputText,
            postOutput: evalResult.postOutput,
            alignedLines: evalResult.alignedLines.map((l) => ({
              line: l.startLine,
              kind: l.kind,
              outputText: l.outputText,
              annotatedText: l.annotatedText,
            })),
          },
          null,
          2
        ),
      },
    ]);
    onNotify('Submitted Formal Logic, Arithmetic & Lambda evaluation trace to Shared Files.');
  };

  const downloadBinaryBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportPython = () => {
    try {
      const { code, statementCount } = compileMultilineLogicToPython(preInput, program);
      setExportModal({
        kind: 'py',
        title: 'Export Python 3',
        badge: 'logic_program.py',
        filename: 'logic_program.py',
        mime: 'text/x-python',
        status: `Compiled ${statementCount} statement(s) to standalone Python 3.`,
        error: false,
        code,
      });
    } catch (err) {
      setExportModal({
        kind: 'py',
        title: 'Export Python 3',
        badge: 'error',
        filename: 'logic_program.py',
        mime: 'text/x-python',
        status: `Python compilation failed: ${err instanceof Error ? err.message : String(err)}`,
        error: true,
        code: '',
      });
    }
  };

  const handleExportWasm = async () => {
    try {
      const { binary, wat } = compileMultilineLogicToWasm(preInput, program);
      const inst = await WebAssembly.instantiate(binary as BufferSource);
      const mainFn = inst.instance.exports.main as (() => number) | undefined;
      const mainRes = mainFn ? mainFn() : 0;
      setExportModal({
        kind: 'wasm',
        title: 'Export WebAssembly',
        badge: 'logic_program.wasm',
        filename: 'logic_program.wat',
        mime: 'text/plain',
        status: `Valid WASM binary (${binary.length} bytes). Live WebAssembly.instantiate() -> main() = ${mainRes}`,
        error: false,
        code: wat,
        wasmBinary: binary,
      });
    } catch (err) {
      setExportModal({
        kind: 'wasm',
        title: 'Export WebAssembly',
        badge: 'error',
        filename: 'logic_program.wat',
        mime: 'text/plain',
        status: `WASM compilation failed: ${err instanceof Error ? err.message : String(err)}`,
        error: true,
        code: '// Tip: WASM export supports named callables, non-curried lambdas, boolean logic, ternaries, and +, -, *, / arithmetic.',
      });
    }
  };

  const handleConvertToLanguage = async (lang: PrimaryLanguage = targetLang) => {
    if (lang === 'wasm') {
      await handleExportWasm();
      return;
    }
    try {
      const out = compileMultilineLogicToLanguage(lang, preInput, program);
      setExportModal({
        kind: 'lang',
        title: `Convert Raw Logic -> ${out.label}`,
        badge: out.filename,
        filename: out.filename,
        mime: out.mime,
        status: `Converted ${out.statementCount} raw logic statement(s) to ${out.label}.`,
        error: false,
        code: out.code,
      });
    } catch (err) {
      setExportModal({
        kind: 'lang',
        title: `Convert Raw Logic -> ${lang.toUpperCase()}`,
        badge: 'error',
        filename: `logic_program.${lang}`,
        mime: 'text/plain',
        status: `Conversion failed: ${err instanceof Error ? err.message : String(err)}`,
        error: true,
        code: '',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header + 4 Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span className="mr-1 font-mono text-blue-600 dark:text-blue-400">⊢</span>
              Formal Logic, Arithmetic &amp; Lambda Workbench
            </h4>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Live Evaluator + Range + Truth Table
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Supports codomain range analysis, 1/0 boolean↔arithmetic crossovers, λ currying, SSA line pointers (<code className="font-mono">[line#N]</code>), and multiline block highlighting.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FORMAL_LOGIC_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setPreInput(preset.preInput);
                setProgram(preset.program);
                setSelectedBlock(null);
                setHoveredBlock(null);
                setHoveredPointerTarget(null);
              }}
              title={preset.description}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500"
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPreInput('');
              setProgram('');
              setSelectedBlock(null);
              setHoveredBlock(null);
              setHoveredPointerTarget(null);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-rose-400 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Clear
          </button>
          <div className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50/70 p-0.5 dark:border-blue-800 dark:bg-blue-950/30">
            <select
              aria-label="Convert raw logic target language"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value as PrimaryLanguage)}
              className="rounded-md bg-white px-2 py-1 font-mono text-xs font-medium text-slate-800 focus:outline-none dark:bg-slate-900 dark:text-slate-100"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.shortLabel} ({lang.extension})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleConvertToLanguage(targetLang)}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" /> Convert
            </button>
          </div>
          <button
            type="button"
            onClick={handleExportPython}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Download className="h-3.5 w-3.5" /> .py
          </button>
          <button
            type="button"
            onClick={() => void handleExportWasm()}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
          >
            <Download className="h-3.5 w-3.5" /> .wasm
          </button>
          {onSubmitArtifacts && (
            <button
              type="button"
              onClick={handleSubmitToFiles}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <Save className="h-3.5 w-3.5" /> Submit to Shared Files
            </button>
          )}
        </div>
      </div>

      {/* Workbench Shell: Left Sidebar Taxonomy + Right Two-Column Workspace */}
      <div className="grid gap-4 xl:grid-cols-12">
        {/* LEFT SIDEBAR: OPERATOR TAXONOMY PALETTE */}
        <aside
          data-tour-id="view.formal_logic.palette"
          className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 xl:col-span-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <LabelWithConventionTooltip meta={CALCULATOR_LABEL_CONVENTIONS.symbolPalette} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Drag any symbol to Formula Buffer or click to insert.
            </span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-950">
              {(['all', 'formal', 'informal'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTraditionFilter(mode)}
                  className={`rounded-md px-2 py-0.5 font-medium capitalize ${
                    traditionFilter === mode
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
            {visibleCategories.map((cat) => {
              const open = Boolean(expandedCategories[cat.id]);
              return (
                <div
                  key={cat.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setExpandedCategories((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))
                    }
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {cat.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                        cat.tradition === 'formal'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                      }`}
                    >
                      {cat.tradition} · {cat.items.length}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-slate-200 px-2.5 py-2 dark:border-slate-800">
                      <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">{cat.description}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {cat.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', item.insert);
                            }}
                            onClick={() => insertAtCursor(item.insert)}
                            title={`${item.name} (${item.codePoint})\nText Syntax: ${item.textRepresentation}\nEffect on Output: ${item.outputEffect}`}
                            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-xs font-medium text-slate-800 shadow-2xs transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-blue-950/40"
                          >
                            <span className="min-w-[24px] shrink-0 text-center font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                              {item.unicode}
                            </span>
                            <span className="truncate text-[11px] text-slate-600 dark:text-slate-300">
                              {item.name.split('(')[0].trim()}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* RIGHT MAIN AREA: TWO-COLUMN WORKSPACE */}
        <div className="grid grid-cols-1 gap-4 xl:col-span-8">
          {/* COLUMN 1: PRE-INPUT & FORMULA/LAMBDA BUFFER */}
          <div
            data-tour-id="view.formal_logic.buffer"
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="space-y-2">
              <LabelWithConventionTooltip meta={CALCULATOR_LABEL_CONVENTIONS.preInput} />
              <HighlightedCodeEditor
                ariaLabel={CALCULATOR_LABEL_CONVENTIONS.preInput.label}
                rows={2}
                value={preInput}
                onChange={setPreInput}
                placeholder={'e=true\nx=10'}
              />
              {evalResult.preInput.errors.length > 0 ? (
                <div role="alert" className="rounded border border-red-300 bg-red-50 px-2.5 py-1.5 font-mono text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {evalResult.preInput.errors.join(' ')}
                </div>
              ) : (
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Valid literal bindings:{' '}
                  {evalResult.preInput.typedEntries
                    .map((e) => `${e.name}=${String(e.value)}`)
                    .join(', ') || 'none'}
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <LabelWithConventionTooltip meta={CALCULATOR_LABEL_CONVENTIONS.programInput} />
                <span className="rounded-full border border-slate-200 px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {evalResult.blocks.length} block{evalResult.blocks.length === 1 ? '' : 's'}
                </span>
              </div>
              <HighlightedCodeEditor
                textareaRef={programRef}
                ariaLabel={CALCULATOR_LABEL_CONVENTIONS.programInput.label}
                rows={9}
                value={program}
                onChange={setProgram}
                activeSpan={activeSpan}
                ptrSpan={ptrSpan}
                dragActive={dragActive}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const snippet = e.dataTransfer.getData('text/plain');
                  if (snippet) insertAtCursor(snippet);
                }}
                placeholder={'a(b,c)=b & c\nd=false\na(e,d)'}
              />
              {evalResult.errors.length > 0 && (
                <div role="alert" className="rounded border border-red-300 bg-red-50 px-2.5 py-1.5 font-mono text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {evalResult.errors.join(' | ')}
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 2: OUTPUT TRACE, POST-OUTPUT & LIVE TRUTH TABLE */}
          <div
            data-tour-id="view.formal_logic.trace"
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
          >
            {/* Evaluation Trace */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <LabelWithConventionTooltip meta={CALCULATOR_LABEL_CONVENTIONS.alignedOutput} />
                <button
                  type="button"
                  onClick={() => setShowCondensedStream((v) => !v)}
                  className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  {showCondensedStream ? 'Hide SSA Stream' : 'Show Condensed SSA'}
                </button>
              </div>
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs dark:border-slate-800 dark:bg-slate-950">
                {evalResult.alignedLines.length === 0 ? (
                  <div className="p-2 text-slate-500">Enter rules or expressions to evaluate.</div>
                ) : (
                  evalResult.alignedLines.map((line) => {
                    const isSelected = selectedBlock === line.blockIndex;
                    const isHovered = hoveredBlock === line.blockIndex;
                    const isPtrTarget =
                      hoveredPointerTarget === line.blockIndex && !isSelected && !isHovered;
                    return (
                      <div
                        key={line.blockIndex}
                        role="button"
                        tabIndex={0}
                        onMouseEnter={() => {
                          setHoveredBlock(line.blockIndex);
                        }}
                        onMouseLeave={() => {
                          setHoveredBlock(null);
                          setHoveredPointerTarget(null);
                        }}
                        onClick={() =>
                          setSelectedBlock((prev) =>
                            prev === line.blockIndex ? null : line.blockIndex
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedBlock((prev) =>
                              prev === line.blockIndex ? null : line.blockIndex
                            );
                          }
                        }}
                        className={`flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${
                          isSelected || isHovered
                            ? 'border-blue-500 bg-blue-500/15'
                            : isPtrTarget
                              ? 'border-amber-500 bg-amber-500/15'
                              : 'border-slate-200 bg-white hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                            line#{line.blockIndex + 1}
                          </span>
                          <SyntaxHighlightedOutput
                            text={line.outputText}
                            isDefinition={line.kind === 'definition'}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-right text-[11px] text-slate-500 dark:text-slate-400">
                          {line.referencedPointers.some((r) => !r.fromPreInput && r.targetOutputLine !== null) ? (
                            <span className="inline-flex flex-wrap items-center gap-1">
                              <span>{line.sourceCompact}</span>
                              {line.referencedPointers
                                .filter((r) => !r.fromPreInput && r.targetOutputLine !== null)
                                .map((ptr, pIdx) => (
                                  <span
                                    key={pIdx}
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      setHoveredBlock(line.blockIndex);
                                      setHoveredPointerTarget(ptr.targetInputBlockIndex);
                                    }}
                                    onMouseLeave={() => setHoveredPointerTarget(null)}
                                    className="rounded border border-amber-400/60 bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-200 dark:border-amber-600/60 dark:bg-amber-950/60 dark:text-amber-300"
                                  >
                                    {ptr.name}[line#{ptr.targetOutputLine}]
                                  </span>
                                ))}
                              <span>=</span>
                              <SyntaxHighlightedOutput text={line.outputText} />
                            </span>
                          ) : (
                            <span>{line.annotatedText}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {showCondensedStream && (
                <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/40 p-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <LabelWithConventionTooltip meta={CALCULATOR_LABEL_CONVENTIONS.pointerOutput} />
                  {evalResult.condensedLines.map((c) => (
                    <div
                      key={c.pointerLineNumber}
                      className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 font-mono text-xs dark:bg-slate-900"
                    >
                      <span className="text-[10px] text-slate-500">line#{c.pointerLineNumber}</span>
                      <span className="min-w-0 flex-1">
                        <SyntaxHighlightedOutput text={c.text} />
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {c.kind === 'assignment' ? 'pointer target' : 'call result'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Post-Output Entrypoint Result */}
            <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <LabelWithConventionTooltip meta={CALCULATOR_LABEL_CONVENTIONS.postOutput} />
                <span className="rounded border border-slate-200 px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {evalResult.postOutput.sourceExpression || 'No entrypoint'}
                </span>
              </div>
              <div
                aria-label="Post-output entrypoint result"
                className="flex items-center justify-between rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-emerald-50/60 p-3 dark:border-blue-900/50 dark:from-blue-950/30 dark:to-emerald-950/20"
              >
                <div
                  className={`font-mono text-2xl font-bold ${
                    evalResult.postOutput.value === true
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : evalResult.postOutput.valueKind === 'number'
                        ? 'text-sky-600 dark:text-sky-400'
                        : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {evalResult.postOutput.displayValue}
                </div>
                <div className="text-right font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {evalResult.postOutput.annotatedExpression || 'Add a callable call or expression'}
                </div>
              </div>
            </div>

            {/* Live Truth Table */}
            <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <LabelWithConventionTooltip meta={CALCULATOR_LABEL_CONVENTIONS.truthTable} />
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex rounded border border-slate-200 bg-slate-100 p-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-950">
                    <button
                      type="button"
                      onClick={() => setTruthTableScope('focused')}
                      className={`rounded px-2 py-0.5 font-medium ${
                        truthTableScope === 'focused'
                          ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                          : 'text-slate-500'
                      }`}
                    >
                      Focused Row
                    </button>
                    <button
                      type="button"
                      onClick={() => setTruthTableScope('matrix')}
                      className={`rounded px-2 py-0.5 font-medium ${
                        truthTableScope === 'matrix'
                          ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                          : 'text-slate-500'
                      }`}
                    >
                      Full Matrix
                    </button>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {truthTableScope === 'focused'
                      ? rowTruthTable.classification
                      : truthTables.programTable.classification}
                  </span>
                </div>
              </div>

              {truthTableScope === 'focused' ? (
                <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  {rowTruthTable.headers.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500 dark:text-slate-400">
                      {rowTruthTable.constantSummary
                        ? `No free boolean variables for ${rowTruthTable.targetLabel}. Result: ${rowTruthTable.constantSummary}`
                        : 'Select or hover an expression line to inspect its truth table.'}
                    </div>
                  ) : rowTruthTable.classification === 'Capped' ? (
                    <div className="p-3 text-xs text-amber-600 dark:text-amber-400">
                      Truth table capped at 6 variables (64 rows).
                    </div>
                  ) : (
                    <table className="w-full border-collapse font-mono text-xs">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800">
                          {rowTruthTable.headers.map((h) => (
                            <th key={h} className="border-b border-slate-200 px-2.5 py-1.5 text-center text-blue-600 dark:border-slate-700 dark:text-blue-400">
                              {h}
                            </th>
                          ))}
                          <th className="border-b border-slate-200 px-2.5 py-1.5 text-center text-blue-600 dark:border-slate-700 dark:text-blue-400">
                            {rowTruthTable.targetLabel}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowTruthTable.rows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={
                              row.isActiveRow
                                ? 'bg-blue-50 font-semibold ring-1 ring-inset ring-blue-500 dark:bg-blue-950/50'
                                : 'border-t border-slate-100 dark:border-slate-800/80'
                            }
                          >
                            {row.inputs.map((b, bIdx) => (
                              <td
                                key={bIdx}
                                className={`px-2.5 py-1.5 text-center ${
                                  b
                                    ? 'font-bold text-emerald-600 dark:text-emerald-400'
                                    : 'font-bold text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {b ? 'T' : 'F'}
                              </td>
                            ))}
                            <td className="px-2.5 py-1.5 text-center">
                              <SyntaxHighlightedOutput text={row.resultText} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="max-h-60 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full border-collapse font-mono text-xs">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800">
                          {truthTables.programTable.headers.map((h) => (
                            <th key={h} className="border-b border-slate-200 px-2.5 py-1.5 text-left dark:border-slate-700">
                              {h}
                            </th>
                          ))}
                          {truthTables.programTable.rows[0]?.outputs.map((o, idx) => (
                            <th key={idx} className="border-b border-slate-200 px-2.5 py-1.5 text-left dark:border-slate-700">
                              {o.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {truthTables.programTable.rows.map((row, idx) => (
                          <tr
                            key={idx}
                            className={
                              row.isActiveRow
                                ? 'bg-emerald-50/90 font-semibold dark:bg-emerald-950/40'
                                : 'border-t border-slate-100 dark:border-slate-800/80'
                            }
                          >
                            {row.inputs.map((v, iIdx) => (
                              <td key={iIdx} className={`px-2.5 py-1 ${v ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {String(v)}
                              </td>
                            ))}
                            {row.outputs.map((o, oIdx) => (
                              <td key={oIdx} className="px-2.5 py-1">
                                <SyntaxHighlightedOutput text={o.value} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {truthTables.callableTables.map((ct) => (
                    <div key={ct.title} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1 font-mono font-semibold text-violet-600 dark:text-violet-300">
                          <Table2 className="h-3.5 w-3.5" /> {ct.title}
                        </span>
                        <span className="text-[10px] text-slate-500">{ct.classification}</span>
                      </div>
                      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
                        <table className="w-full border-collapse font-mono text-xs">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-950">
                              {ct.headers.map((h) => (
                                <th key={h} className="border-b border-slate-200 px-2 py-1 text-left dark:border-slate-800">
                                  {h}
                                </th>
                              ))}
                              <th className="border-b border-slate-200 px-2 py-1 text-left dark:border-slate-800">
                                {ct.rows[0]?.outputs[0]?.label}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {ct.rows.map((r, rIdx) => (
                              <tr key={rIdx} className="border-t border-slate-100 dark:border-slate-800/70">
                                {r.inputs.map((v, iIdx) => (
                                  <td key={iIdx} className="px-2 py-1">{String(v)}</td>
                                ))}
                                <td className="px-2 py-1">
                                  <SyntaxHighlightedOutput text={r.outputs[0]?.value || ''} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {exportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setExportModal(null);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <span>{exportModal.title}</span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {exportModal.badge}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setExportModal(null)}
                aria-label="Close export modal"
                className="rounded-md p-1 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
              <div
                className={`rounded-lg border px-3 py-2 font-mono text-xs ${
                  exportModal.error
                    ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                }`}
              >
                {exportModal.status}
              </div>
              {exportModal.code && (
                <pre className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100 dark:border-slate-800">
                  {exportModal.code}
                </pre>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950">
              {!exportModal.error && exportModal.code && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(exportModal.code);
                    onNotify(exportModal.kind === 'py' ? 'Copied Python 3 source.' : 'Copied WAT source.');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <Copy className="h-3.5 w-3.5" /> {exportModal.kind === 'py' ? 'Copy Code' : 'Copy .wat'}
                </button>
              )}
              {!exportModal.error && (exportModal.kind === 'py' || exportModal.kind === 'lang') && (
                <button
                  type="button"
                  onClick={() =>
                    downloadBinaryBlob(new Blob([exportModal.code], { type: exportModal.mime }), exportModal.filename)
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Download className="h-3.5 w-3.5" /> Download {exportModal.filename}
                </button>
              )}
              {!exportModal.error && exportModal.kind === 'wasm' && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      downloadBinaryBlob(new Blob([exportModal.code], { type: 'text/plain' }), 'logic_program.wat')
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <Download className="h-3.5 w-3.5" /> Download .wat
                  </button>
                  {exportModal.wasmBinary && (
                    <button
                      type="button"
                      onClick={() =>
                        downloadBinaryBlob(
                          new Blob([exportModal.wasmBinary as BlobPart], { type: 'application/wasm' }),
                          'logic_program.wasm'
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
                    >
                      <Download className="h-3.5 w-3.5" /> Download logic_program.wasm
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
