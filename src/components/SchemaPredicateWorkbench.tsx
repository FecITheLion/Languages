import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  Play,
  RotateCcw,
  Save,
  XCircle,
} from 'lucide-react';
import {
  DEFAULT_JSON_SCHEMA_SAMPLE,
  DEFAULT_SCHEMA_EBNF_GRAMMAR,
  DEFAULT_TEST_INSTANCE_SAMPLE,
  evaluateSchemaPredicateStudio,
  generateStandaloneSchemaPredicateHtml,
  SCHEMA_PREDICATE_PRESETS,
  type PredicateNodeEvaluation,
  type SchemaPredicateNode,
} from '../engine/schemaPredicateEngine';
import { resolveAssetUrl } from '../engine/runtimePaths';
import type { VirtualSubmission } from '../engine/virtualFiles';

interface SchemaPredicateWorkbenchProps {
  studioJsonText?: string;
  onSyncEbnfToGrammar?: (ebnfGrammar: string) => void;
  onSubmitArtifacts?: (owner: string, submissions: VirtualSubmission[]) => void;
  onDownloadFile: (content: string, filename: string, mime: string) => void;
  onNotify: (msg: string) => void;
}

function PredicateTreeBranch({
  node,
  nodeResults,
  depth = 0,
}: {
  node: SchemaPredicateNode;
  nodeResults?: Record<string, PredicateNodeEvaluation>;
  depth?: number;
}) {
  const status = nodeResults?.[node.path];
  return (
    <div style={{ paddingLeft: depth > 0 ? 18 : 0 }} className="relative space-y-1">
      {depth > 0 && (
        <span
          aria-hidden="true"
          className="font-mono text-xs text-slate-400 dark:text-slate-500"
        >
          └─{' '}
        </span>
      )}
      <div className="inline-flex flex-wrap items-center gap-1.5 font-mono text-xs">
        <span className="font-bold text-blue-600 dark:text-blue-400">{node.name}:</span>
        <span className="font-semibold text-pink-600 dark:text-pink-400">[{node.type}]</span>
        {node.isRequired && (
          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            required
          </span>
        )}
        {node.predicates.length > 0 && (
          <span className="text-emerald-700 dark:text-emerald-400">
            {'{ '}predicates: {JSON.stringify(node.predicates)}
            {' }'}
          </span>
        )}
        {status && (
          <span
            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              status.valid
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
            }`}
          >
            {status.valid ? '✓' : `✗ ${status.errors.length}`}
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="space-y-1 border-l border-slate-200 pl-2 dark:border-slate-800">
          {node.children.map((child) => (
            <PredicateTreeBranch
              key={child.path}
              node={child}
              nodeResults={nodeResults}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SchemaPredicateWorkbench({
  studioJsonText,
  onSyncEbnfToGrammar,
  onSubmitArtifacts,
  onDownloadFile,
  onNotify,
}: SchemaPredicateWorkbenchProps) {
  const [schemaText, setSchemaText] = useState(DEFAULT_JSON_SCHEMA_SAMPLE);
  const [instanceText, setInstanceText] = useState(DEFAULT_TEST_INSTANCE_SAMPLE);
  const [ebnfMode, setEbnfMode] = useState<'subset' | 'compiled'>('subset');
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);

  const studioResult = useMemo(
    () => evaluateSchemaPredicateStudio(schemaText, instanceText),
    [schemaText, instanceText]
  );

  const standaloneHtml = useMemo(
    () => generateStandaloneSchemaPredicateHtml(schemaText, instanceText),
    [schemaText, instanceText]
  );

  const validation = studioResult.validation;
  const isValid = Boolean(studioResult.ok && validation?.valid);

  const handleLoadStudioSchema = () => {
    if (!studioJsonText || !studioJsonText.trim()) {
      onNotify('Active Studio JSON-LD schema is empty.');
      return;
    }
    setSchemaText(studioJsonText);
    onNotify('Loaded active Studio Schema.org JSON-LD into Predicate Tree compiler.');
  };

  const handleSubmitToTree = () => {
    if (!onSubmitArtifacts) return;
    onSubmitArtifacts('schema-predicate', [
      {
        path: 'schema/json-schema.json',
        filename: 'json-schema.json',
        content: schemaText,
      },
      {
        path: 'schema/compiled-grammar.ebnf',
        filename: 'compiled-grammar.ebnf',
        content: studioResult.generatedEbnf || DEFAULT_SCHEMA_EBNF_GRAMMAR,
      },
      {
        path: 'schema/predicate-tree.txt',
        filename: 'predicate-tree.txt',
        content: studioResult.predicateTreeText || studioResult.parseError || '',
      },
      {
        path: 'schema/validation-report.json',
        filename: 'validation-report.json',
        content: JSON.stringify(
          {
            ok: studioResult.ok,
            valid: isValid,
            validation: studioResult.validation ?? null,
            parseError: studioResult.parseError ?? null,
          },
          null,
          2
        ),
      },
    ]);
    onNotify('Submitted JSON Schema EBNF & Predicate Tree artifacts to Shared Files.');
  };

  return (
    <div className="space-y-4">
      {/* Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              JSON Schema EBNF Parser &amp; Predicate Tree Studio
            </h3>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              PWA Ready
            </span>
            {studioResult.ok && validation ? (
              <span
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${
                  validation.valid
                    ? 'border-emerald-500/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-red-500/60 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                }`}
              >
                {validation.valid ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Validation Passed ({validation.passedPredicates}/
                    {validation.checkedPredicates} predicates)
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5" /> Validation Failed:{' '}
                    {validation.errors[0]?.message}
                  </>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded border border-red-500/60 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <XCircle className="h-3.5 w-3.5" /> Parse Error
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tokenizes JSON Schema constraints against EBNF productions, compiles a hierarchical Predicate Tree AST, and live-validates JSON instances.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {SCHEMA_PREDICATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setSchemaText(preset.schemaText);
                setInstanceText(preset.instanceText);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-950/40"
            >
              {preset.label}
            </button>
          ))}
          {studioJsonText && (
            <button
              type="button"
              onClick={handleLoadStudioSchema}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
            >
              <RotateCcw className="h-3 w-3" /> Load Active Studio Schema
            </button>
          )}
          {onSubmitArtifacts && (
            <button
              type="button"
              onClick={handleSubmitToTree}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <Save className="h-3 w-3" /> Submit to Shared Files
            </button>
          )}
        </div>
      </div>

      {/* 4-Panel 2x2 Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Panel 1: JSON Schema Input */}
        <section
          data-tour-id="view.schema_predicate.schema"
          className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-200">
            <span>1. JSON Schema Input</span>
            <button
              type="button"
              onClick={() => {
                const res = evaluateSchemaPredicateStudio(schemaText, instanceText);
                onNotify(
                  res.ok
                    ? res.validation?.valid
                      ? 'Predicate Tree compiled & JSON instance validated ✓'
                      : `Validation Failed: ${res.validation?.errors[0]?.message ?? 'Invalid instance'}`
                    : res.parseError || 'Schema parse error'
                );
              }}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
            >
              <Play className="h-3 w-3" /> Parse &amp; Validate
            </button>
          </div>
          <div className="p-3">
            <textarea
              aria-label="JSON Schema Input"
              rows={11}
              spellCheck={false}
              value={schemaText}
              onChange={(e) => setSchemaText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-700"
            />
          </div>
        </section>

        {/* Panel 2: EBNF Grammar Specification */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-200">
            <span>2. EBNF Grammar Specification</span>
            <div className="flex items-center gap-1.5">
              <div className="inline-flex rounded border border-slate-200 bg-white p-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setEbnfMode('subset')}
                  className={`rounded px-2 py-0.5 font-medium ${
                    ebnfMode === 'subset'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Subset Spec
                </button>
                <button
                  type="button"
                  onClick={() => setEbnfMode('compiled')}
                  className={`rounded px-2 py-0.5 font-medium ${
                    ebnfMode === 'compiled'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Compiled EBNF
                </button>
              </div>
              {onSyncEbnfToGrammar && (
                <button
                  type="button"
                  onClick={() => {
                    onSyncEbnfToGrammar(studioResult.generatedEbnf || DEFAULT_SCHEMA_EBNF_GRAMMAR);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  <FileCode2 className="h-3 w-3" /> Sync to Grammar Dialect
                </button>
              )}
            </div>
          </div>
          <div className="p-3">
            <textarea
              aria-label="EBNF Grammar Specification"
              readOnly
              rows={11}
              value={ebnfMode === 'subset' ? DEFAULT_SCHEMA_EBNF_GRAMMAR : studioResult.generatedEbnf}
              className="w-full rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-300 focus:outline-none dark:border-slate-700"
            />
          </div>
        </section>

        {/* Panel 3: Compiled Predicate Tree (AST) */}
        <section
          data-tour-id="view.schema_predicate.tree"
          className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-200">
            <span>3. Compiled Predicate Tree (AST)</span>
            <button
              type="button"
              onClick={() => {
                if (studioResult.predicateTreeText) {
                  void navigator.clipboard?.writeText(studioResult.predicateTreeText);
                  onNotify('Copied compiled predicate tree.');
                }
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <Copy className="h-3 w-3" /> Copy Tree
            </button>
          </div>
          <div className="min-h-[250px] max-h-[340px] flex-1 overflow-auto bg-slate-50/70 p-3.5 dark:bg-slate-950">
            {studioResult.predicateTree ? (
              <PredicateTreeBranch
                node={studioResult.predicateTree}
                nodeResults={validation?.nodeResults}
              />
            ) : (
              <div className="font-mono text-xs text-red-600 dark:text-red-400">
                {studioResult.parseError || 'Unable to parse schema.'}
              </div>
            )}
          </div>
        </section>

        {/* Panel 4: Test JSON Instance & Live Validation */}
        <section
          data-tour-id="view.schema_predicate.validator"
          className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-200">
            <span>4. Test JSON Instance</span>
            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
              Auto-evaluates against predicate tree
            </span>
          </div>
          <div className="space-y-2.5 p-3">
            <textarea
              aria-label="Test JSON Instance"
              rows={8}
              spellCheck={false}
              value={instanceText}
              onChange={(e) => setInstanceText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-700"
            />
            {studioResult.parseError ? (
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 font-mono text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
              >
                {studioResult.parseError}
              </div>
            ) : validation && validation.errors.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-red-300 bg-red-50/80 p-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {validation.errors.map((err, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2 font-mono text-[11px]">
                    <span>
                      <strong>{err.path}:</strong> {err.message}
                    </span>
                    <span className="shrink-0 opacity-75">{err.predicate}</span>
                  </div>
                ))}
              </div>
            ) : validation ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                All {validation.checkedPredicates} compiled AST predicate checks passed for this JSON instance.
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* Standalone Single-HTML PWA Export & Preview */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Standalone Single-HTML PWA Export with Live Preview
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Self-contained <code className="font-mono">schema-ebnf-predicate-studio.html</code> with inline PWA manifest and zero external dependencies.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowHtmlPreview((v) => !v)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              {showHtmlPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(standaloneHtml);
                onNotify('Copied single-file JSON Schema EBNF PWA HTML.');
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <Copy className="h-3.5 w-3.5" /> Copy Single HTML
            </button>
            <button
              type="button"
              onClick={() =>
                onDownloadFile(standaloneHtml, 'schema-ebnf-predicate-studio.html', 'text/html;charset=utf-8')
              }
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" /> Download Single HTML
            </button>
            <a
              href={resolveAssetUrl('schema-ebnf-predicate-studio.html')}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open Standalone Page
            </a>
          </div>
        </div>
        {showHtmlPreview && (
          <iframe
            title="JSON Schema EBNF Predicate Tree Studio Live Preview"
            sandbox="allow-scripts"
            srcDoc={standaloneHtml}
            className="h-[520px] w-full rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-700"
          />
        )}
      </div>
    </div>
  );
}
