import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Download,
  Globe,
  GripVertical,
  Lock,
  Plus,
  Trash2,
  Undo2,
  Unlock,
} from 'lucide-react';
import {
  exportWorkspaceInLanguage,
  tokenizeAlternativeTokens,
} from '../engine/bidirectionalEngine';
import {
  evaluatePropertyValueWithCallbacks,
  formatGlobalCallbackCallTemplate,
  type GlobalCallbackDef,
} from '../engine/globalCallbacksEngine';
import type { LogicLabelBinding } from '../engine/logicLambdaEngine';
import {
  SUPPORTED_LANGUAGES,
  type DialectConfig,
  type ExportLanguage,
  type GrammarRule,
  type LineMutation,
  type MutationPolicy,
  type PrimaryLanguage,
  type RuleMergeStrategy,
  type RuleOrderConfig,
  type RulePropertyEntry,
  type SchemaConfig,
} from '../types/studio';
import { DocTooltip } from './DocTooltip';
import { HtmlCodeOutput } from './HtmlCodeOutput';

interface RulePropertiesWorkbenchProps {
  gridClass: string;
  primarySpan: string;
  secondarySpan: string;
  rules: GrammarRule[];
  dialect: DialectConfig;
  schemaConfig: SchemaConfig;
  mutations: Record<string, LineMutation>;
  mutationPolicy: MutationPolicy;
  ruleConfigs: Record<string, RuleOrderConfig>;
  grammarText: string;
  jsonText: string;
  watSource: string;
  mergeStrategy: RuleMergeStrategy;
  canUndo: boolean;
  onUndo: () => void;
  globalCallbacks?: GlobalCallbackDef[];
  logicLabels?: LogicLabelBinding[];
  onSaveGlobalCallback?: (input: {
    name: string;
    lambdaExpr: string;
    description?: string;
    source?: 'logic_calc' | 'rule_props' | 'manual';
  }) => void;
  onDeleteGlobalCallback?: (idOrName: string) => void;
  onUpdateRule: (
    originalName: string,
    patch: { name?: string; expression?: string; alternatives?: string[] }
  ) => void;
  onAddRule: (name: string, expression: string) => void;
  onDeleteRule: (name: string) => void;
  onUpdateRuleConfig: (ruleName: string, patch: Partial<RuleOrderConfig>) => void;
  onApplyPrecedenceOrder: () => void;
  onReorderRules: (sourceName: string, targetName: string, position: 'before' | 'after') => void;
  onMergeRules: (sourceName: string, targetName: string, strategy?: RuleMergeStrategy) => void;
  onToggleRuleLock: (ruleName: string) => void;
  primaryLanguage?: PrimaryLanguage;
  onExportTextFile: (content: string, filename: string, mime: string) => void;
}

const EXPORT_LANGUAGES: Array<{ id: ExportLanguage; label: string }> = [
  { id: 'grammar', label: 'Grammar' },
  ...SUPPORTED_LANGUAGES.map((l) => ({ id: l.exportId, label: l.shortLabel })),
];

export function RulePropertiesWorkbench({
  gridClass,
  primarySpan,
  secondarySpan,
  rules,
  dialect,
  schemaConfig,
  mutations,
  mutationPolicy,
  ruleConfigs,
  grammarText,
  jsonText,
  watSource,
  mergeStrategy,
  canUndo,
  onUndo,
  globalCallbacks = [],
  logicLabels = [],
  onSaveGlobalCallback,
  onDeleteGlobalCallback,
  onUpdateRule,
  onAddRule,
  onDeleteRule,
  onUpdateRuleConfig,
  onApplyPrecedenceOrder,
  onReorderRules,
  onMergeRules,
  onToggleRuleLock,
  primaryLanguage,
  onExportTextFile,
}: RulePropertiesWorkbenchProps) {
  const [selectedRuleName, setSelectedRuleName] = useState<string>(rules[0]?.name || '');
  const [nameDraft, setNameDraft] = useState<string>('');
  const [exprDraft, setExprDraft] = useState<string>('');
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleExpr, setNewRuleExpr] = useState('');
  const [showAddRule, setShowAddRule] = useState(false);
  const [showNewGlobalCb, setShowNewGlobalCb] = useState(false);
  const [newCbName, setNewCbName] = useState('');
  const [newCbExpr, setNewCbExpr] = useState('λx. x * 2');
  const [focusedPropId, setFocusedPropId] = useState<string | null>(null);

  const [exportLang, setExportLang] = useState<ExportLanguage>('python');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!primaryLanguage) return;
    const spec = SUPPORTED_LANGUAGES.find((l) => l.id === primaryLanguage);
    if (spec) setExportLang(spec.exportId);
  }, [primaryLanguage]);

  // Drag-and-drop state for rule list reorder / merge
  const [draggedRule, setDraggedRule] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    name: string;
    intent: 'before' | 'after' | 'merge';
  } | null>(null);

  // Drag state for branch token order of operations
  const [draggedToken, setDraggedToken] = useState<{ branchIdx: number; tokenIdx: number } | null>(null);

  const activeRule = useMemo(() => {
    const exact = rules.find((r) => r.name === selectedRuleName);
    return exact || rules[0] || null;
  }, [rules, selectedRuleName]);

  useEffect(() => {
    if (activeRule) {
      setSelectedRuleName(activeRule.name);
      setNameDraft(activeRule.name);
      setExprDraft(activeRule.expression);
    } else {
      setNameDraft('');
      setExprDraft('');
    }
  }, [activeRule?.name, activeRule?.expression]);

  const activeConfig: RuleOrderConfig = useMemo(() => {
    if (!activeRule) {
      return { precedence: 1, associativity: 'left', properties: [] };
    }
    const idx = rules.findIndex((r) => r.name === activeRule.name);
    return (
      ruleConfigs[activeRule.name] || {
        precedence: idx >= 0 ? idx + 1 : 1,
        associativity: 'left',
        properties: [],
      }
    );
  }, [activeRule, ruleConfigs, rules]);

  const isLocked = activeRule ? mutationPolicy.lockedRules.includes(activeRule.name) : false;

  const exportedArtifact = useMemo(
    () =>
      exportWorkspaceInLanguage(exportLang, {
        rules,
        dialect,
        schemaConfig,
        mutations,
        mutationPolicy,
        ruleConfigs,
        grammarText,
        jsonText,
        watSource,
      }),
    [exportLang, rules, dialect, schemaConfig, mutations, mutationPolicy, ruleConfigs, grammarText, jsonText, watSource]
  );

  const handleCommitNameAndExpr = () => {
    if (!activeRule || isLocked) return;
    const trimmedName = nameDraft.trim();
    const trimmedExpr = exprDraft.trim();
    if (!trimmedName || !trimmedExpr) return;
    if (trimmedName === activeRule.name && trimmedExpr === activeRule.expression) return;
    onUpdateRule(activeRule.name, { name: trimmedName, expression: trimmedExpr });
    setSelectedRuleName(trimmedName);
  };

  const handleMoveBranch = (branchIdx: number, delta: number) => {
    if (!activeRule || isLocked) return;
    const targetIdx = branchIdx + delta;
    if (targetIdx < 0 || targetIdx >= activeRule.alternatives.length) return;
    const nextAlts = [...activeRule.alternatives];
    const [moved] = nextAlts.splice(branchIdx, 1);
    nextAlts.splice(targetIdx, 0, moved);
    onUpdateRule(activeRule.name, { alternatives: nextAlts });
  };

  const handleEditBranch = (branchIdx: number, value: string) => {
    if (!activeRule || isLocked) return;
    const nextAlts = [...activeRule.alternatives];
    nextAlts[branchIdx] = value;
    onUpdateRule(activeRule.name, { alternatives: nextAlts });
  };

  const handleDeleteBranch = (branchIdx: number) => {
    if (!activeRule || isLocked || activeRule.alternatives.length <= 1) return;
    const nextAlts = activeRule.alternatives.filter((_, idx) => idx !== branchIdx);
    onUpdateRule(activeRule.name, { alternatives: nextAlts });
  };

  const handleAddBranch = () => {
    if (!activeRule || isLocked) return;
    const nextAlts = [...activeRule.alternatives, `'branch_${activeRule.alternatives.length + 1}'`];
    onUpdateRule(activeRule.name, { alternatives: nextAlts });
  };

  const handleReorderToken = (branchIdx: number, fromIdx: number, toIdx: number) => {
    if (!activeRule || isLocked || fromIdx === toIdx) return;
    const alt = activeRule.alternatives[branchIdx];
    if (!alt) return;
    const tokens = tokenizeAlternativeTokens(alt);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= tokens.length || toIdx >= tokens.length) return;
    const [moved] = tokens.splice(fromIdx, 1);
    tokens.splice(toIdx, 0, moved);
    const nextAlts = [...activeRule.alternatives];
    nextAlts[branchIdx] = tokens.join(' ');
    onUpdateRule(activeRule.name, { alternatives: nextAlts });
  };

  const handleAddProperty = () => {
    if (!activeRule || isLocked) return;
    const nextProps: RulePropertyEntry[] = [
      ...activeConfig.properties,
      { id: `prop_${Date.now()}`, name: 'operator', value: 'eval' },
    ];
    onUpdateRuleConfig(activeRule.name, { properties: nextProps });
  };

  const handleUpdateProperty = (propId: string, patch: Partial<RulePropertyEntry>) => {
    if (!activeRule || isLocked) return;
    const nextProps = activeConfig.properties.map((p) => (p.id === propId ? { ...p, ...patch } : p));
    onUpdateRuleConfig(activeRule.name, { properties: nextProps });
  };

  const handleRemoveProperty = (propId: string) => {
    if (!activeRule || isLocked) return;
    const nextProps = activeConfig.properties.filter((p) => p.id !== propId);
    onUpdateRuleConfig(activeRule.name, { properties: nextProps });
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportedArtifact.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked in strict iframe contexts
    }
  };

  const handleCreateRule = () => {
    if (!newRuleName.trim()) return;
    onAddRule(newRuleName.trim(), newRuleExpr.trim() || `'${newRuleName.trim()}'`);
    setSelectedRuleName(newRuleName.trim());
    setNewRuleName('');
    setNewRuleExpr('');
    setShowAddRule(false);
  };

  return (
    <div className={gridClass}>
      {/* PRIMARY PANE: PER-RULE PROPERTIES & ORDER OF OPERATIONS */}
      <div className={`${primarySpan} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              02. Rule Properties &amp; Order of Operations
            </h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Modify each rule&apos;s name, expression value, custom key/value properties, precedence, and token execution order.
            </p>
          </div>
          <div data-tour-id="workbench.rule_props.actions" className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onApplyPrecedenceOrder}
              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Sort by Precedence
            </button>
            <button
              type="button"
              onClick={() => setShowAddRule((s) => !s)}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Rule
            </button>
            {canUndo && (
              <button
                type="button"
                onClick={onUndo}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </button>
            )}
          </div>
        </div>

        {/* Inline Add New Rule Bar */}
        {showAddRule && (
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 sm:grid-cols-12 dark:border-blue-900/60 dark:bg-blue-950/30">
            <input
              type="text"
              value={newRuleName}
              onChange={(e) => setNewRuleName(e.target.value)}
              placeholder="rule_name"
              aria-label="New rule name"
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none sm:col-span-4 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <input
              type="text"
              value={newRuleExpr}
              onChange={(e) => setNewRuleExpr(e.target.value)}
              placeholder="'value_a' | 'value_b'"
              aria-label="New rule value expression"
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none sm:col-span-6 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={handleCreateRule}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 sm:col-span-2"
            >
              Create
            </button>
          </div>
        )}

        {/* Rule Selector Bar (with Drag-and-Drop Reorder & Merge) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Select a rule to edit · Drag edges to reorder or center to merge</span>
            <span className="font-mono tabular-nums">{rules.length} rules</span>
          </div>
          <div data-tour-id="workbench.rule_props.rules" className="flex flex-wrap gap-1.5">
            {rules.map((r, idx) => {
              const cfg = ruleConfigs[r.name];
              const isSelected = activeRule?.name === r.name;
              const isDragging = draggedRule === r.name;
              const intent = dropTarget?.name === r.name ? dropTarget.intent : null;
              return (
                <button
                  key={r.id}
                  type="button"
                  draggable
                  onClick={() => setSelectedRuleName(r.name)}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', r.name);
                    setDraggedRule(r.name);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!draggedRule || draggedRule === r.name) {
                      if (dropTarget) setDropTarget(null);
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
                    const nextIntent: 'before' | 'after' | 'merge' =
                      ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'merge';
                    if (!dropTarget || dropTarget.name !== r.name || dropTarget.intent !== nextIntent) {
                      setDropTarget({ name: r.name, intent: nextIntent });
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const src = draggedRule || e.dataTransfer.getData('text/plain');
                    const activeIntent = dropTarget?.name === r.name ? dropTarget.intent : 'merge';
                    setDraggedRule(null);
                    setDropTarget(null);
                    if (!src || src === r.name) return;
                    if (activeIntent === 'merge') {
                      onMergeRules(src, r.name, mergeStrategy);
                      setSelectedRuleName(r.name);
                    } else {
                      onReorderRules(src, r.name, activeIntent);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggedRule(null);
                    setDropTarget(null);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                    isDragging
                      ? 'opacity-40'
                      : intent === 'merge'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-200'
                        : isSelected
                          ? 'border-blue-600 bg-blue-50/70 font-semibold text-blue-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  } ${
                    intent === 'before'
                      ? 'border-l-4 border-l-blue-600'
                      : intent === 'after'
                        ? 'border-r-4 border-r-blue-600'
                        : ''
                  }`}
                >
                  <GripVertical className="h-3 w-3 text-slate-400" />
                  <span className="font-mono text-[10px] tabular-nums text-slate-400">
                    #{cfg?.precedence ?? idx + 1}
                  </span>
                  <span className="font-mono">{r.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Rule Detailed Properties & Operations Editor */}
        {!activeRule ? (
          <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            No grammar rules defined yet. Click Add Rule above to create one.
          </div>
        ) : (
          <div
            data-tour-id="workbench.rule_props.precedence"
            className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60"
          >
            {/* Name, Precedence & Associativity */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <label htmlFor="rulePropName" className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Rule Name (refactors references)
                </label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    id="rulePropName"
                    type="text"
                    disabled={isLocked}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={handleCommitNameAndExpr}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCommitNameAndExpr();
                    }}
                    className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="rulePropPrecedence" className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Op Precedence (#)
                </label>
                <input
                  id="rulePropPrecedence"
                  type="number"
                  min={1}
                  max={999}
                  disabled={isLocked}
                  value={activeConfig.precedence}
                  onChange={(e) => {
                    const num = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(num) && num >= 1) {
                      onUpdateRuleConfig(activeRule.name, { precedence: num });
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-4">
                <label htmlFor="rulePropAssoc" className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Associativity &amp; Actions
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  <select
                    id="rulePropAssoc"
                    disabled={isLocked}
                    value={activeConfig.associativity}
                    onChange={(e) =>
                      onUpdateRuleConfig(activeRule.name, {
                        associativity: e.target.value as RuleOrderConfig['associativity'],
                      })
                    }
                    className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="left">Left-to-Right</option>
                    <option value="right">Right-to-Left</option>
                    <option value="none">Non-Assoc</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => onToggleRuleLock(activeRule.name)}
                    title={isLocked ? 'Unlock rule' : 'Lock rule'}
                    className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {isLocked ? <Lock className="h-3.5 w-3.5 text-amber-600" /> : <Unlock className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    disabled={isLocked || rules.length <= 1}
                    onClick={() => onDeleteRule(activeRule.name)}
                    title="Delete rule"
                    className="rounded-md border border-slate-200 bg-white p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Full Expression Value */}
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="rulePropValue" className="font-medium text-slate-600 dark:text-slate-400">
                  Rule Expression Value
                </label>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleCommitNameAndExpr}
                  className="font-medium text-blue-600 hover:underline disabled:opacity-40 dark:text-blue-400"
                >
                  Apply Value
                </button>
              </div>
              <input
                id="rulePropValue"
                type="text"
                disabled={isLocked}
                value={exprDraft}
                onChange={(e) => setExprDraft(e.target.value)}
                onBlur={handleCommitNameAndExpr}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitNameAndExpr();
                }}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Branch Precedence & Token Order of Operations */}
            <div className="space-y-2 border-t border-slate-200/80 pt-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Branch &amp; Operation Token Order ({activeRule.alternatives.length})
                </span>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleAddBranch}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline disabled:opacity-40 dark:text-blue-400"
                >
                  <Plus className="h-3 w-3" />
                  Add Branch
                </button>
              </div>

              <div className="max-h-48 space-y-2 overflow-auto pr-0.5">
                {activeRule.alternatives.map((alt, branchIdx) => {
                  const tokens = tokenizeAlternativeTokens(alt);
                  return (
                    <div
                      key={`${activeRule.name}-b-${branchIdx}`}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-semibold tabular-nums text-slate-400">
                          B{branchIdx + 1}
                        </span>
                        <input
                          type="text"
                          disabled={isLocked}
                          aria-label={`Branch ${branchIdx + 1} expression`}
                          value={alt}
                          onChange={(e) => handleEditBranch(branchIdx, e.target.value)}
                          className="min-w-0 flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          disabled={isLocked || branchIdx === 0}
                          onClick={() => handleMoveBranch(branchIdx, -1)}
                          aria-label="Move branch up"
                          className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={isLocked || branchIdx === activeRule.alternatives.length - 1}
                          onClick={() => handleMoveBranch(branchIdx, 1)}
                          aria-label="Move branch down"
                          className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={isLocked || activeRule.alternatives.length <= 1}
                          onClick={() => handleDeleteBranch(branchIdx)}
                          aria-label="Delete branch"
                          className="rounded border border-slate-200 p-1 text-red-500 hover:bg-red-50 disabled:opacity-30 dark:border-slate-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      {tokens.length > 1 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-medium text-slate-400">Op sequence:</span>
                          {tokens.map((tok, tokIdx) => (
                            <div
                              key={`${branchIdx}-${tokIdx}-${tok}`}
                              draggable={!isLocked}
                              onDragStart={() => setDraggedToken({ branchIdx, tokenIdx: tokIdx })}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                if (draggedToken && draggedToken.branchIdx === branchIdx) {
                                  handleReorderToken(branchIdx, draggedToken.tokenIdx, tokIdx);
                                }
                                setDraggedToken(null);
                              }}
                              onDragEnd={() => setDraggedToken(null)}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            >
                              <span className="text-[9px] text-slate-400">{tokIdx + 1}.</span>
                              <span>{tok}</span>
                              {!isLocked && (
                                <span className="inline-flex items-center gap-0.5 pl-0.5">
                                  <button
                                    type="button"
                                    disabled={tokIdx === 0}
                                    onClick={() => handleReorderToken(branchIdx, tokIdx, tokIdx - 1)}
                                    aria-label={`Move token ${tok} left`}
                                    className="text-slate-400 hover:text-blue-600 disabled:opacity-25"
                                  >
                                    <ArrowLeft className="h-2.5 w-2.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={tokIdx === tokens.length - 1}
                                    onClick={() => handleReorderToken(branchIdx, tokIdx, tokIdx + 1)}
                                    aria-label={`Move token ${tok} right`}
                                    className="text-slate-400 hover:text-blue-600 disabled:opacity-25"
                                  >
                                    <ArrowRight className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Rule Properties (Name / Value Pairs with Global Callback Execution) */}
            <div className="space-y-2.5 border-t border-slate-200/80 pt-3 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Custom Rule Properties (Name / Value · Global Callbacks Enabled)
                </span>
                <div className="flex items-center gap-2">
                  {onSaveGlobalCallback && (
                    <button
                      type="button"
                      onClick={() => setShowNewGlobalCb((v) => !v)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      <Globe className="h-3 w-3" />
                      {showNewGlobalCb ? 'Close Global CB' : '+ Global Callback'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={handleAddProperty}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline disabled:opacity-40 dark:text-blue-400"
                  >
                    <Plus className="h-3 w-3" />
                    Add Property
                  </button>
                </div>
              </div>

              {/* Quick Create Local Global Callback */}
              {showNewGlobalCb && onSaveGlobalCallback && (
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 sm:grid-cols-12 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                  <input
                    type="text"
                    value={newCbName}
                    onChange={(e) => setNewCbName(e.target.value)}
                    placeholder="callback_name"
                    aria-label="Global callback name"
                    className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-emerald-500 focus:outline-none sm:col-span-4 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={newCbExpr}
                    onChange={(e) => setNewCbExpr(e.target.value)}
                    placeholder="λx. x * 1.08"
                    aria-label="Global callback lambda expression"
                    className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-emerald-500 focus:outline-none sm:col-span-6 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newCbName.trim() || !newCbExpr.trim()) return;
                      onSaveGlobalCallback({
                        name: newCbName.trim(),
                        lambdaExpr: newCbExpr.trim(),
                        source: 'rule_props',
                      });
                      setNewCbName('');
                      setShowNewGlobalCb(false);
                    }}
                    className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 sm:col-span-2"
                  >
                    Save
                  </button>
                </div>
              )}

              {/* Click-to-Call Local Global Callbacks Strip */}
              {globalCallbacks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white p-2 text-[11px] dark:border-slate-800 dark:bg-slate-900">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400">
                    <Globe className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    Call in property:
                  </span>
                  {globalCallbacks.map((cb) => {
                    const callSnippet = formatGlobalCallbackCallTemplate(cb);
                    return (
                      <span key={cb.id} className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={() => {
                            const targetProp =
                              activeConfig.properties.find((p) => p.id === focusedPropId) ||
                              activeConfig.properties[activeConfig.properties.length - 1];
                            if (targetProp) {
                              handleUpdateProperty(targetProp.id, {
                                value: targetProp.value.trim()
                                  ? `${targetProp.value} ${callSnippet}`
                                  : callSnippet,
                              });
                            } else {
                              onUpdateRuleConfig(activeRule.name, {
                                properties: [
                                  {
                                    id: `prop_${Date.now()}`,
                                    name: `${cb.name}_value`,
                                    value: callSnippet,
                                  },
                                ],
                              });
                            }
                          }}
                          title={`Insert ${callSnippet} (${cb.lambdaExpr})`}
                          className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-blue-600 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-400"
                        >
                          {callSnippet}
                        </button>
                        {onDeleteGlobalCallback && (
                          <button
                            type="button"
                            onClick={() => onDeleteGlobalCallback(cb.id)}
                            aria-label={`Delete global callback ${cb.name}`}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}

              {activeConfig.properties.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  No custom properties attached to <code className="font-mono">{activeRule.name}</code>. Add key/value properties or click any saved global callback above (e.g. <code className="font-mono">tax_fn (100)</code> or <code className="font-mono">{'Total: {{tax_fn (100)}}'}</code>).
                </div>
              ) : (
                <div className="space-y-2">
                  {activeConfig.properties.map((prop) => {
                    const resolved = evaluatePropertyValueWithCallbacks(
                      prop.value,
                      globalCallbacks,
                      logicLabels
                    );
                    return (
                      <div key={prop.id} className="space-y-1">
                        <div className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-12">
                          <input
                            type="text"
                            disabled={isLocked}
                            value={prop.name}
                            onFocus={() => setFocusedPropId(prop.id)}
                            onChange={(e) => handleUpdateProperty(prop.id, { name: e.target.value })}
                            placeholder="Property name"
                            aria-label="Custom property name"
                            className="min-h-[36px] rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:opacity-50 sm:col-span-4 sm:min-h-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <input
                            type="text"
                            disabled={isLocked}
                            value={prop.value}
                            onFocus={() => setFocusedPropId(prop.id)}
                            onChange={(e) => handleUpdateProperty(prop.id, { value: e.target.value })}
                            placeholder="Value or callback e.g. tax_fn (100)"
                            aria-label="Custom property value"
                            className="min-h-[36px] rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:opacity-50 sm:col-span-7 sm:min-h-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() => handleRemoveProperty(prop.id)}
                            aria-label="Remove property"
                            className="flex min-h-[36px] items-center justify-center rounded border border-slate-200 bg-white p-1 text-red-500 hover:bg-red-50 disabled:opacity-30 sm:col-span-1 sm:min-h-0 dark:border-slate-700 dark:bg-slate-900"
                          >
                            <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                          </button>
                        </div>
                        {resolved.hasCallbackCall && (
                          <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[11px]">
                            {resolved.ok ? (
                              <span className="text-emerald-700 dark:text-emerald-400">
                                → Resolved ({resolved.valueType}): <strong>{resolved.resolvedValue}</strong>
                                {resolved.usedCallbacks.length > 0 && (
                                  <span className="ml-1.5 text-slate-400">
                                    via {resolved.usedCallbacks.join(', ')}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-red-600 dark:text-red-400">
                                Callback error: {resolved.error}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECONDARY PANE: EXPORT IN SELECTED LANGUAGE */}
      <div className={`${secondarySpan} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Export in Language
            </div>
            <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {exportedArtifact.filename}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleCopyExport()}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              disabled={!mutationPolicy.allowExportMutation}
              onClick={() =>
                onExportTextFile(exportedArtifact.content, exportedArtifact.filename, exportedArtifact.mime)
              }
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>

        {/* Language Selector Dropdown + Quick Tabs (All 13 Formats) */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={exportLang}
            onChange={(e) => setExportLang(e.target.value as ExportLanguage)}
            aria-label="Export target language"
            className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none sm:min-h-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {EXPORT_LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.label}
              </option>
            ))}
          </select>
          <DocTooltip docKey="languageSelection" align="right" />
          <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto">
            {EXPORT_LANGUAGES.slice(0, 7).map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => setExportLang(lang.id)}
                className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  exportLang === lang.id
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        <HtmlCodeOutput
          title={exportedArtifact.filename}
          language={exportedArtifact.label}
          code={exportedArtifact.content}
          maxHeightClass="max-h-[420px]"
          onDownloadHtml={onExportTextFile}
        />
      </div>
    </div>
  );
}
