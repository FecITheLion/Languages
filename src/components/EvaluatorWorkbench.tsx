import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  XCircle,
} from 'lucide-react';
import type {
  DialectConfig,
  EvaluationResult,
  EvaluationTraceStep,
  GrammarRule,
} from '../types/studio';

interface EvaluatorWorkbenchProps {
  gridClass: string;
  primarySpan: string;
  secondarySpan: string;
  rules: GrammarRule[];
  dialect: DialectConfig;
  evalRule: string;
  evalPayload: string;
  evalResult: EvaluationResult;
  onEvalRuleChange: (rule: string) => void;
  onEvalPayloadChange: (payload: string) => void;
}

type TraceFilterMode = 'all' | 'nonterminals' | 'constraints' | 'backtracks';

interface PayloadPreset {
  id: string;
  label: string;
  payload: string;
  tone: 'valid' | 'neutral' | 'fail';
}

function buildPayloadPresets(rules: GrammarRule[], activeRule: GrammarRule | undefined): PayloadPreset[] {
  const byName = new Map(rules.map((r) => [r.name, r]));
  const hasSchemaRoot = byName.has('schema_root') && byName.has('username') && byName.has('age');
  if (hasSchemaRoot) {
    const hasActive = byName.has('active');
    const presets: PayloadPreset[] = [
      {
        id: 'valid',
        label: 'Valid',
        payload: hasActive ? '{"Alice",25,true}' : '{"Alice",25}',
        tone: 'valid',
      },
    ];
    if (hasActive) {
      presets.push({
        id: 'omit-optional',
        label: 'Omit optional [active]',
        payload: '{"Alice",25,}',
        tone: 'neutral',
      });
    }
    presets.push(
      {
        id: 'fail-minlen',
        label: 'Fail minLength<3',
        payload: hasActive ? '{"Al",25,true}' : '{"Al",25}',
        tone: 'fail',
      },
      {
        id: 'fail-age',
        label: 'Fail age<18',
        payload: hasActive ? '{"Alice",12,true}' : '{"Alice",12}',
        tone: 'fail',
      }
    );
    return presets;
  }

  // Generic presets inferred from active rule literals / constraints
  const presets: PayloadPreset[] = [];
  if (activeRule && activeRule.literals.length > 0) {
    presets.push({
      id: 'first-lit',
      label: `Valid (${activeRule.literals[0]})`,
      payload: activeRule.literals[0],
      tone: 'valid',
    });
  } else {
    presets.push({
      id: 'sample-num',
      label: 'Valid (42)',
      payload: '42',
      tone: 'valid',
    });
  }
  const minLenC = activeRule?.constraints?.find((c) => c.kind === 'minLength');
  if (minLenC) {
    presets.push({
      id: 'fail-minlen-gen',
      label: `Fail minLength<${minLenC.value}`,
      payload: 'a',
      tone: 'fail',
    });
  }
  const minC = activeRule?.constraints?.find((c) => c.kind === 'min');
  if (minC) {
    presets.push({
      id: 'fail-min-gen',
      label: `Fail min<${minC.value}`,
      payload: String(Number(minC.value) - 1),
      tone: 'fail',
    });
  }
  presets.push({
    id: 'empty',
    label: 'Empty',
    payload: '',
    tone: 'neutral',
  });
  return presets;
}

export function EvaluatorWorkbench({
  gridClass,
  primarySpan,
  secondarySpan,
  rules,
  dialect,
  evalRule,
  evalPayload,
  evalResult,
  onEvalRuleChange,
  onEvalPayloadChange,
}: EvaluatorWorkbenchProps) {
  const [showSyntaxRef, setShowSyntaxRef] = useState(false);
  const [traceFilter, setTraceFilter] = useState<TraceFilterMode>('all');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<number>>(new Set());
  const [hoveredStepIdx, setHoveredStepIdx] = useState<number | null>(null);
  const [pinnedStepIdx, setPinnedStepIdx] = useState<number | null>(null);

  const activeRule = useMemo(
    () => rules.find((r) => r.name === evalRule) || rules[0],
    [rules, evalRule]
  );

  const presets = useMemo(
    () => buildPayloadPresets(rules, activeRule),
    [rules, activeRule]
  );

  const activeRulePreview = useMemo(() => {
    if (!activeRule) return '';
    const op = dialect.ruleOperator || '::=';
    const cStr =
      activeRule.constraints && activeRule.constraints.length > 0
        ? ` (* ${activeRule.constraints.map((c) => c.raw).join(', ')} *)`
        : '';
    return `${activeRule.name} ${op} ${activeRule.expression}${cStr}`;
  }, [activeRule, dialect.ruleOperator]);

  // Compute parent-child subtree ranges for collapsible tree rendering
  const traceMeta = useMemo(() => {
    const trace = evalResult.trace;
    return trace.map((step, idx) => {
      let childEnd = idx;
      for (let j = idx + 1; j < trace.length; j += 1) {
        if (trace[j].depth > step.depth) {
          childEnd = j;
        } else {
          break;
        }
      }
      return {
        index: idx,
        step,
        hasChildren: childEnd > idx,
        descendantCount: childEnd - idx,
        childEnd,
      };
    });
  }, [evalResult.trace]);

  const visibleTraceRows = useMemo(() => {
    const hiddenIndices = new Set<number>();
    if (traceFilter === 'all') {
      for (const meta of traceMeta) {
        if (collapsedNodes.has(meta.index) && meta.hasChildren) {
          for (let j = meta.index + 1; j <= meta.childEnd; j += 1) {
            hiddenIndices.add(j);
          }
        }
      }
    }

    return traceMeta.filter(({ index, step }) => {
      if (hiddenIndices.has(index)) return false;
      if (traceFilter === 'nonterminals') {
        return step.kind === 'nonterminal' || (!step.kind && !step.rule.startsWith('"') && !step.rule.startsWith('['));
      }
      if (traceFilter === 'constraints') {
        return step.kind === 'constraint' || step.note.toLowerCase().includes('constraint');
      }
      if (traceFilter === 'backtracks') {
        return !step.matched || step.kind === 'backtrack';
      }
      return true;
    });
  }, [traceMeta, collapsedNodes, traceFilter]);

  const activeStep: EvaluationTraceStep | null = useMemo(() => {
    const idx = hoveredStepIdx ?? pinnedStepIdx;
    if (idx === null) return null;
    return evalResult.trace[idx] || null;
  }, [hoveredStepIdx, pinnedStepIdx, evalResult.trace]);

  const highlightSpan = useMemo(() => {
    if (!activeStep) return null;
    if (
      typeof activeStep.startOffset === 'number' &&
      typeof activeStep.endOffset === 'number'
    ) {
      return { start: activeStep.startOffset, end: activeStep.endOffset };
    }
    if (activeStep.consumed) {
      const idx = evalPayload.indexOf(activeStep.consumed);
      if (idx >= 0) return { start: idx, end: idx + activeStep.consumed.length };
    }
    return null;
  }, [activeStep, evalPayload]);

  const toggleCollapse = (idx: number) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const isConstraintFailure =
    !evalResult.matched && (evalResult.constraintsFailed ?? 0) > 0;

  return (
    <div className={gridClass}>
      <div className={`${primarySpan} space-y-3.5`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              06. Recursive Grammar Evaluator &amp; Trace
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Backtracking longest-match parser with EBNF <code className="font-mono">(* constraint *)</code> validation and live span inspection.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSyntaxRef((v) => !v)}
            aria-expanded={showSyntaxRef}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Info className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            <span>Syntax Reference</span>
            {showSyntaxRef ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        </div>

        {showSyntaxRef && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 font-mono text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            <span><strong className="text-slate-800 dark:text-slate-200">Repeat:</strong> + * ? {'{m,n}'} {'{e}'} [e]</span>
            <span><strong className="text-slate-800 dark:text-slate-200">Choice:</strong> (a | b)</span>
            <span><strong className="text-slate-800 dark:text-slate-200">Lookahead:</strong> (?=e) (?!e) &amp;e !e</span>
            <span><strong className="text-slate-800 dark:text-slate-200">Lookbehind:</strong> (?&lt;=e) (?&lt;!e)</span>
            <span><strong className="text-slate-800 dark:text-slate-200">Class/Regex:</strong> [0-9] [^a-z] . /re/ ^ $</span>
            <span><strong className="text-slate-800 dark:text-slate-200">Constraints:</strong> (* minLength&gt;=3, min&gt;=18, /re/ *)</span>
          </div>
        )}

        {/* Merged Start Rule Combobox (<input list="...">) */}
        <div>
          <label htmlFor="evalRuleCombo" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Start Rule
          </label>
          <input
            id="evalRuleCombo"
            list="evalRuleOptions"
            data-tour-id="workbench.evaluator.rule"
            type="text"
            value={evalRule}
            onChange={(e) => onEvalRuleChange(e.target.value)}
            placeholder="Pick or type a rule name..."
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <datalist id="evalRuleOptions">
            {rules.map((r) => (
              <option key={r.id} value={r.name} />
            ))}
          </datalist>
        </div>

        {/* Inline Active Start Rule EBNF Preview */}
        {activeRulePreview && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 font-mono text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
            <span className="mr-2 text-[10px] font-sans font-semibold uppercase tracking-wide text-slate-400">
              Production
            </span>
            <span className="break-all">{activeRulePreview}</span>
          </div>
        )}

        {/* Evaluation Payload + One-Click Test Presets + Live Span Highlight */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="evalPayloadInput" className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Evaluation Payload
            </label>
            <div className="flex flex-wrap items-center gap-1">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onEvalPayloadChange(p.payload);
                    setHoveredStepIdx(null);
                    setPinnedStepIdx(null);
                  }}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    p.tone === 'valid'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : p.tone === 'fail'
                        ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            id="evalPayloadInput"
            data-tour-id="workbench.evaluator.payload"
            rows={3}
            value={evalPayload}
            onChange={(e) => onEvalPayloadChange(e.target.value)}
            placeholder="Enter test string..."
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          {/* Interactive Payload Span Highlighter (activated on trace row hover/click) */}
          {highlightSpan && (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50/70 px-2.5 py-1.5 font-mono text-xs dark:border-blue-900/60 dark:bg-blue-950/30">
              <div className="min-w-0 break-all text-slate-700 dark:text-slate-300">
                <span>{evalPayload.slice(0, highlightSpan.start)}</span>
                <mark className="rounded bg-blue-600 px-0.5 font-semibold text-white">
                  {evalPayload.slice(highlightSpan.start, highlightSpan.end) || '∅'}
                </mark>
                <span>{evalPayload.slice(highlightSpan.end)}</span>
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                [{highlightSpan.start}..{highlightSpan.end}] {activeStep?.rule}
              </span>
            </div>
          )}
        </div>

        {/* Result Banner with Constraint Counts & Failure Distinction */}
        <div
          data-tour-id="workbench.evaluator.result"
          className={`flex items-start gap-3 rounded-lg border p-3.5 ${
            evalResult.matched
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
              : isConstraintFailure
                ? 'border-orange-300 bg-orange-50/80 text-orange-950 dark:border-orange-900/70 dark:bg-orange-950/35 dark:text-orange-200'
                : 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
          }`}
        >
          {evalResult.matched ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : isConstraintFailure ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600 dark:text-orange-400" />
          ) : (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div className="min-w-0 text-sm">
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              <span>{evalResult.summary}</span>
              {isConstraintFailure && (
                <span className="rounded bg-orange-200/80 px-1.5 py-0.5 font-mono text-[10px] uppercase text-orange-900 dark:bg-orange-900/70 dark:text-orange-200">
                  Schema Constraint Failed
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs opacity-90">{evalResult.detail}</div>
          </div>
        </div>
      </div>

      {/* Right Column: Collapsible Recursive Expansion Trace Tree */}
      <div className={`${secondarySpan} flex flex-col`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Recursive Expansion Trace
          </span>
          <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {evalResult.trace.length} steps · {evalResult.backtracks ?? 0} backtracks ·{' '}
            {(evalResult.durationMs ?? 0.1).toFixed(2)}ms
          </span>
        </div>

        {/* Trace Filter Toggles */}
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {(
            [
              ['all', 'All'],
              ['nonterminals', 'Non-terminals'],
              ['constraints', 'Constraints'],
              ['backtracks', 'Backtracks'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTraceFilter(id)}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                traceFilter === id
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          onMouseLeave={() => setHoveredStepIdx(null)}
          className="max-h-80 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-200 dark:border-slate-800"
        >
          {visibleTraceRows.length === 0 ? (
            <div className="text-slate-400">
              {evalResult.trace.length === 0
                ? 'Enter a payload to inspect recursive descent steps.'
                : `No trace rows match the "${traceFilter}" filter.`}
            </div>
          ) : (
            visibleTraceRows.map(({ index, step, hasChildren, descendantCount }) => {
              const isCollapsed = collapsedNodes.has(index);
              const isSelected = pinnedStepIdx === index || hoveredStepIdx === index;
              const offsetTag =
                typeof step.startOffset === 'number' && typeof step.endOffset === 'number'
                  ? `[${step.startOffset}..${step.endOffset}]`
                  : '';

              return (
                <div
                  key={`${step.rule}-${index}`}
                  onMouseEnter={() => setHoveredStepIdx(index)}
                  onClick={() => setPinnedStepIdx((prev) => (prev === index ? null : index))}
                  style={{ paddingLeft: `${Math.min(step.depth, 10) * 14}px` }}
                  className={`flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 leading-relaxed transition-colors ${
                    isSelected ? 'bg-blue-900/50' : 'hover:bg-slate-900'
                  }`}
                >
                  {traceFilter === 'all' && hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapse(index);
                      }}
                      aria-label={isCollapsed ? `Expand ${step.rule}` : `Collapse ${step.rule}`}
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                    >
                      {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  ) : (
                    <span className="inline-block w-4 shrink-0" />
                  )}

                  <span
                    className={
                      step.kind === 'constraint'
                        ? step.matched
                          ? 'text-cyan-400'
                          : 'text-orange-400'
                        : step.matched
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                    }
                  >
                    {step.kind === 'constraint'
                      ? step.matched
                        ? 'CHECK'
                        : 'FAIL '
                      : step.matched
                        ? 'MATCH'
                        : 'MISS '}
                  </span>
                  <span className="text-blue-300">{step.rule}</span>
                  {step.consumed && <span className="text-slate-200">"{step.consumed}"</span>}
                  {offsetTag && <span className="text-[10px] text-slate-500">{offsetTag}</span>}
                  {isCollapsed && hasChildren && (
                    <span className="rounded bg-slate-800 px-1 text-[10px] text-slate-300">
                      +{descendantCount}
                    </span>
                  )}
                  <span className="truncate text-slate-500">— {step.note}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
