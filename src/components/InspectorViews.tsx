import { useEffect, useMemo, useState } from 'react';
import { Download, FileCode, Maximize2, RotateCcw } from 'lucide-react';
import { buildPhpProjectFiles } from '../engine/phpZipPackager';
import type { StudioLintIssue } from '../engine/htmlOutputFormatter';
import type { AutocompleteSuggestion, ReferencedModuleExport } from '../engine/moduleAutocompleteEngine';
import { DomEchelonManipulator, type EchelonDomItem } from './DomEchelonManipulator';
import { HtmlCodeOutput } from './HtmlCodeOutput';
import { AutocompleteField } from './AutocompleteField';
import { DocTooltip } from './DocTooltip';
import type { OpenApiSpec, ParsedDsl, WorkflowSlug, WorkspaceSnapshot } from '../types/studio';

interface OpenApiInspectorProps {
  onSubmitArtifacts: (owner: string, submissions: import('../engine/virtualFiles').VirtualSubmission[]) => void;
  spec: OpenApiSpec;
  onJumpToPage: (page: WorkflowSlug) => void;
  onOpenEditModal?: (page: WorkflowSlug) => void;
  onMutateOpenApiEndpoints?: (nextOrder: string[], note: string) => void;
  lintIssues?: StudioLintIssue[];
}

export function OpenApiInspector({
  onSubmitArtifacts,
  spec,
  onJumpToPage,
  onOpenEditModal,
  onMutateOpenApiEndpoints,
  lintIssues = [],
}: OpenApiInspectorProps) {
  const [viewMode, setViewMode] = useState<'table' | 'dom' | 'html'>('table');
  const [customPathOrder, setCustomPathOrder] = useState<string[] | null>(null);
  const [mergedRoutes, setMergedRoutes] = useState<Record<string, string[]>>({});
  const [splitRoutes, setSplitRoutes] = useState<Record<string, string[]>>({});

  const allRoutes = useMemo(() => {
    const base = Object.keys(spec.paths);
    if (!customPathOrder) return base;
    const valid = customPathOrder.filter((r) => base.includes(r));
    const missing = base.filter((r) => !valid.includes(r));
    return [...valid, ...missing];
  }, [spec.paths, customPathOrder]);

  const effectiveSpec = useMemo(() => {
    const orderedPaths: OpenApiSpec['paths'] = {};
    for (const route of allRoutes) {
      const entry = spec.paths[route];
      if (!entry) continue;
      if (splitRoutes[route]?.length) {
        splitRoutes[route].forEach((subRoute, idx) => {
          orderedPaths[subRoute] = {
            ...entry,
            ...(Object.fromEntries(
              Object.entries(entry).map(([m, op]) => [
                m,
                { ...op, operationId: `${op.operationId}_part_${idx + 1}`, summary: `${op.summary} (Part ${idx + 1})` },
              ])
            )),
          };
        });
      } else {
        orderedPaths[route] = entry;
      }
    }
    return {
      ...spec,
      paths: orderedPaths,
      'x-merged-routes': Object.keys(mergedRoutes).length > 0 ? mergedRoutes : undefined,
    };
  }, [spec, allRoutes, mergedRoutes, splitRoutes]);
  useEffect(() => {
    onSubmitArtifacts('openapi-inspector', [{ path: 'specs/inspected-openapi.json', content: JSON.stringify(effectiveSpec, null, 2) }]);
  }, [onSubmitArtifacts, effectiveSpec]);

  const domItems: EchelonDomItem[] = useMemo(
    () =>
      allRoutes.map((route) => {
        const methods = spec.paths[route] || {};
        const methodNames = Object.keys(methods).map((m) => m.toUpperCase());
        const firstOp = Object.values(methods)[0];
        const segments = route.split('/').filter(Boolean);
        return {
          id: route,
          label: route,
          meta: `${methodNames.join(', ')} · ${firstOp?.['x-language'] || 'api'}`,
          preview: firstOp?.summary || route,
          splitOptions:
            segments.length >= 2
              ? segments.slice(0, -1).map((seg, idx) => ({
                  index: idx + 1,
                  label: `Split after /${seg}`,
                }))
              : [
                  { index: 1, label: 'Biject Read / Write Endpoints' },
                ],
        };
      }),
    [allRoutes, spec.paths]
  );

  const handleReorderRoute = (src: string, tgt: string, pos: 'before' | 'after') => {
    const next = allRoutes.filter((r) => r !== src);
    const idx = next.indexOf(tgt);
    if (idx === -1) return;
    next.splice(pos === 'after' ? idx + 1 : idx, 0, src);
    setCustomPathOrder(next);
    onMutateOpenApiEndpoints?.(next, `Reordered OpenAPI route ${src} ${pos} ${tgt}`);
  };

  const handleMergeRoute = (src: string, tgt: string) => {
    const next = allRoutes.filter((r) => r !== src);
    setCustomPathOrder(next);
    setMergedRoutes((prev) => ({
      ...prev,
      [tgt]: Array.from(new Set([...(prev[tgt] || []), src])),
    }));
    onMutateOpenApiEndpoints?.(next, `Merged OpenAPI route ${src} into ${tgt}`);
  };

  const handleSplitRoute = (route: string, splitIndex = 1) => {
    const segs = route.split('/').filter(Boolean);
    const left = segs.length >= 2 ? `/${segs.slice(0, splitIndex).join('/')}` : `${route}/read`;
    const right = segs.length >= 2 ? `/${segs.slice(splitIndex).join('/')}` : `${route}/mutate`;
    setSplitRoutes((prev) => ({ ...prev, [route]: [left, right] }));
    onMutateOpenApiEndpoints?.(allRoutes, `Bijected OpenAPI route ${route} → ${left} + ${right}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h2
              data-tour-id="view.openapi.document"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {spec.info.title}
            </h2>
            <DocTooltip docKey="domDragSplitMerge" />
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            OpenAPI {spec.openapi} · Version {spec.info.version} · {Object.keys(effectiveSpec.paths).length} live synchronized endpoints
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              viewMode === 'table'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Operations Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode('dom')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              viewMode === 'dom'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            DOM Order / Merge / Split
          </button>
          <button
            type="button"
            onClick={() => setViewMode('html')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              viewMode === 'html'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            HTML openapi.json
          </button>
        </div>
      </div>

      <div data-tour-id="view.openapi.operations">
      {viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Operation</th>
                <th className="px-4 py-3 font-medium">DSL Flow</th>
                <th className="px-4 py-3 font-medium">Language</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {Object.entries(effectiveSpec.paths).map(([route, methods]) =>
                Object.entries(methods).map(([method, op]) => {
                  const match = route.match(/page=([a-z_]+)/);
                  const slug = match?.[1] as WorkflowSlug | undefined;
                  return (
                    <tr key={`${method}-${route}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono text-xs text-slate-800 dark:text-slate-200">
                        <span className="mr-2 font-semibold text-blue-600 dark:text-blue-400">
                          {method.toUpperCase()}
                        </span>
                        {route}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100">{op.summary}</div>
                        <div className="font-mono text-[11px] text-slate-500">{op.operationId}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {op['x-dsl-flow'] || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {op['x-language'] || 'api'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {slug ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onJumpToPage(slug)}
                              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Open Step
                            </button>
                            {onOpenEditModal && (
                              <button
                                type="button"
                                onClick={() => onOpenEditModal(slug)}
                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                              >
                                <Maximize2 className="h-3 w-3" />
                                Edit in Modal
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">REST / HATEOAS Route</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : viewMode === 'dom' ? (
        <DomEchelonManipulator
          title="OpenAPI Endpoint DOM Interface"
          subtitle="Drag any endpoint to reorder, merge into another route, or drop onto a temporary split boundary"
          items={domItems}
          onReorder={handleReorderRoute}
          onMerge={handleMergeRoute}
          onSplit={handleSplitRoute}
          onEditInModal={(route: string) => {
            const match = route.match(/page=([a-z_]+)/);
            const slug = (match?.[1] as WorkflowSlug | undefined) || 'dialect';
            onOpenEditModal?.(slug);
          }}
        />
      ) : (
        <HtmlCodeOutput
          title="openapi.json"
          code={JSON.stringify(effectiveSpec, null, 2)}
          language="json"
          lintIssues={lintIssues}
          maxHeightClass="max-h-[560px]"
        />
      )}
      </div>
    </div>
  );
}

interface DslInspectorProps {
  dslSource: string;
  parsedDsl: ParsedDsl;
  onChangeDsl: (src: string) => void;
  onResetDsl: () => void;
  onJumpToPage: (page: WorkflowSlug) => void;
  onOpenEditModal?: (page: WorkflowSlug) => void;
  onReorderFlows?: (sourceFlowId: string, targetFlowId: string, position: 'before' | 'after') => void;
  onMergeFlows?: (sourceFlowId: string, targetFlowId: string) => void;
  onSplitFlow?: (flowId: string, splitIndex?: number) => void;
  autocompleteSuggestions?: AutocompleteSuggestion[];
  onRippleModuleExport?: (exp: ReferencedModuleExport, moduleName?: string) => void;
}

export function DslInspector({
  dslSource,
  parsedDsl,
  onChangeDsl,
  onResetDsl,
  onJumpToPage,
  onOpenEditModal,
  onReorderFlows,
  onMergeFlows,
  onSplitFlow,
  autocompleteSuggestions = [],
  onRippleModuleExport,
}: DslInspectorProps) {
  const [dslView, setDslView] = useState<'edit' | 'html'>('edit');

  const flowDomItems: EchelonDomItem[] = useMemo(
    () =>
      parsedDsl.flows.map((f) => ({
        id: f.id,
        label: f.label,
        meta: `${f.id} → ${f.next} · stage=${f.stage} · verify=${f.verify}`,
        preview: `page=${f.page} · lang=${f.lang}`,
        splitOptions: [
          { index: 1, label: `Biject ${f.id} → pre + post verify` },
          { index: 2, label: `Split ${f.id} into parallel branch` },
        ],
      })),
    [parsedDsl.flows]
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div data-tour-id="view.dsl.edit" className="space-y-3 lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">dsl/flows.dsl Editor</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Syntax-colored, autocomplete-enabled workflow DSL. Edits ripple across the Pipeline Grid, Breadcrumbs, and OpenAPI spec.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setDslView('edit')}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  dslView === 'edit' ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-500'
                }`}
              >
                Edit DSL
              </button>
              <button
                type="button"
                onClick={() => setDslView('html')}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  dslView === 'html' ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-500'
                }`}
              >
                HTML Output
              </button>
            </div>
            <button
              type="button"
              onClick={onResetDsl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset DSL
            </button>
          </div>
        </div>

        {dslView === 'edit' ? (
          <AutocompleteField
            multiline
            rows={18}
            syntaxMode="dsl"
            value={dslSource}
            onChange={onChangeDsl}
            suggestions={autocompleteSuggestions}
            onRippleModuleExport={onRippleModuleExport}
            ariaLabel="dsl/flows.dsl source editor"
            className="min-h-[360px]"
          />
        ) : (
          <HtmlCodeOutput
            title="dsl/flows.dsl"
            code={dslSource}
            language="dsl"
            maxHeightClass="max-h-[420px]"
          />
        )}
      </div>

      <div data-tour-id="view.dsl.navigation" className="space-y-4 lg:col-span-5">
        <div data-tour-id="view.dsl.flows">
        <DomEchelonManipulator
          title="DSL Flow Nodes — Drag to Order, Merge & Split"
          subtitle="Dragging a flow reveals temporary drop targets for reordering, merging, and biject/splitting"
          items={flowDomItems}
          onReorder={(src, tgt, pos) => onReorderFlows?.(src, tgt, pos)}
          onMerge={onMergeFlows}
          onSplit={onSplitFlow}
          onEditInModal={(flowId: string) => {
            const found = parsedDsl.flows.find((f) => f.id === flowId);
            if (found) {
              if (onOpenEditModal) onOpenEditModal(found.page);
              else onJumpToPage(found.page);
            }
          }}
        />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Bidirectional Mutation Graph</span>
            <span className="font-mono tabular-nums text-slate-500">{parsedDsl.edges.length} edges</span>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {parsedDsl.edges.map((edge) => (
              <div key={edge.codec} className="flex items-center justify-between gap-2 py-2 text-xs">
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{edge.relation}</span>
                <span className="font-mono text-slate-500">{edge.codec}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface BundleInspectorProps {
  onSubmitArtifacts: (owner: string, submissions: import('../engine/virtualFiles').VirtualSubmission[]) => void;
  openapi: OpenApiSpec;
  dslSource: string;
  snapshot: WorkspaceSnapshot;
  onDownloadZip: () => void;
  onOpenEditModal?: (page: WorkflowSlug) => void;
  lintIssues?: StudioLintIssue[];
}

export function BundleInspector({
  onSubmitArtifacts,
  openapi,
  dslSource,
  snapshot,
  onDownloadZip,
  onOpenEditModal,
  lintIssues = [],
}: BundleInspectorProps) {
  const baseFiles = useMemo(
    () => buildPhpProjectFiles(openapi, dslSource, snapshot),
    [openapi, dslSource, snapshot]
  );

  const [fileOrder, setFileOrder] = useState<string[] | null>(null);
  const [mergedFiles, setMergedFiles] = useState<Record<string, string>>({});
  const [splitFiles, setSplitFiles] = useState<Record<string, Array<{ path: string; content: string }>>>({});
  const [bundleMode, setBundleMode] = useState<'tree' | 'dom'>('tree');

  const files = useMemo(() => {
    const expanded = baseFiles.flatMap((f) => {
      if (splitFiles[f.path]) return splitFiles[f.path];
      if (mergedFiles[f.path]) return [{ path: f.path, content: `${f.content}\n\n${mergedFiles[f.path]}` }];
      return [f];
    });
    if (!fileOrder) return expanded;
    const byPath = new Map(expanded.map((f) => [f.path, f]));
    const ordered = fileOrder.map((p) => byPath.get(p)).filter((f): f is { path: string; content: string } => Boolean(f));
    const rest = expanded.filter((f) => !fileOrder.includes(f.path));
    return [...ordered, ...rest];
  }, [baseFiles, fileOrder, mergedFiles, splitFiles]);

  useEffect(() => {
    const snapshotPath = 'grammar2json-studio/workspace.g2j.json';
    const excluded = new Set([snapshotPath]);
    for (const [path, parts] of Object.entries(splitFiles)) {
      if (path === snapshotPath || mergedFiles[path]) parts.forEach(part => excluded.add(part.path));
    }
    onSubmitArtifacts('bundle', files
      .filter(file => !excluded.has(file.path) && !mergedFiles[file.path])
      .map(file => ({ path: `bundle/${file.path}`, content: file.content })));
  }, [onSubmitArtifacts, files, splitFiles, mergedFiles]);

  const [selectedPath, setSelectedPath] = useState(files[0]?.path || '');
  const activeFile = files.find((f) => f.path === selectedPath) || files[0];

  const handleReorderFile = (src: string, tgt: string, pos: 'before' | 'after') => {
    const paths = files.map((f) => f.path).filter((p) => p !== src);
    const idx = paths.indexOf(tgt);
    if (idx === -1) return;
    paths.splice(pos === 'after' ? idx + 1 : idx, 0, src);
    setFileOrder(paths);
  };

  const handleMergeFile = (src: string, tgt: string) => {
    const srcFile = files.find((f) => f.path === src);
    if (!srcFile) return;
    setMergedFiles((prev) => ({
      ...prev,
      [tgt]: `${prev[tgt] || ''}\n/* Merged from ${src} */\n${srcFile.content}`,
    }));
    setFileOrder(files.map((f) => f.path).filter((p) => p !== src));
    setSelectedPath(tgt);
  };

  const handleSplitFile = (path: string) => {
    const f = files.find((item) => item.path === path);
    if (!f) return;
    const lines = f.content.split('\n');
    const mid = Math.max(1, Math.ceil(lines.length / 2));
    const extIdx = path.lastIndexOf('.');
    const base = extIdx > 0 ? path.slice(0, extIdx) : path;
    const ext = extIdx > 0 ? path.slice(extIdx) : '';
    const partA = { path: `${base}.part1${ext}`, content: lines.slice(0, mid).join('\n') };
    const partB = { path: `${base}.part2${ext}`, content: lines.slice(mid).join('\n') };
    setSplitFiles((prev) => ({ ...prev, [path]: [partA, partB] }));
    setSelectedPath(partA.path);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            PHP / HTML / OpenAPI / DSL Project Package
          </h2>
          <p
            data-tour-id="view.bundle.verify"
            className="mt-0.5 text-xs text-slate-500 dark:text-slate-400"
          >
            Live bundle of {files.length} generated files updated from every grammar, logic, callback, and DSL mutation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setBundleMode('tree')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                bundleMode === 'tree'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              File Inspector
            </button>
            <button
              type="button"
              onClick={() => setBundleMode('dom')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                bundleMode === 'dom'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              DOM Order / Merge / Split
            </button>
          </div>
          <button
            type="button"
            onClick={onDownloadZip}
            data-tour-id="view.bundle.export"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Download className="h-3.5 w-3.5" />
            Download grammar2json_openapi_studio.zip
          </button>
        </div>
      </div>

      <div data-tour-id="view.bundle.contents">
      {bundleMode === 'dom' ? (
        <DomEchelonManipulator
          title="Export Bundle Artifact DOM Interface"
          subtitle="Drag bundle files to reorder packaging sequence, merge two files, or split a file into reversible halves"
          items={files.map((f) => ({
            id: f.path,
            label: f.path.replace(/^grammar2json-studio\//, ''),
            meta: `${f.content.split('\n').length} lines · ${f.content.length.toLocaleString()} chars`,
            preview: f.content.split('\n').slice(0, 2).join(' '),
            splitOptions: [{ index: 1, label: 'Biject file into part1 + part2' }],
          }))}
          onReorder={handleReorderFile}
          onMerge={handleMergeFile}
          onSplit={(path) => handleSplitFile(path)}
          onEditInModal={() => onOpenEditModal?.('payload_io')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-400">
              Archive File Tree ({files.length} files)
            </div>
            <div className="max-h-[520px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800/70">
              {files.map((file) => {
                const selected = activeFile?.path === file.path;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left font-mono text-xs transition-colors ${
                      selected
                        ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <FileCode className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{file.path.replace(/^grammar2json-studio\//, '')}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-8">
            <HtmlCodeOutput
              title={activeFile?.path || 'bundle-file'}
              code={activeFile?.content || ''}
              language={
                activeFile?.path.endsWith('.json')
                  ? 'json'
                  : activeFile?.path.endsWith('.php')
                    ? 'php'
                    : activeFile?.path.endsWith('.dsl')
                      ? 'dsl'
                      : 'code'
              }
              lintIssues={lintIssues}
              maxHeightClass="max-h-[520px]"
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

interface SpecsBundleViewProps {
  onSubmitArtifacts: (owner: string, submissions: import('../engine/virtualFiles').VirtualSubmission[]) => void;
  activeSubTab: 'openapi' | 'dsl' | 'bundle';
  onSubTabChange: (tab: 'openapi' | 'dsl' | 'bundle') => void;
  openapi: OpenApiSpec;
  dslSource: string;
  parsedDsl: ParsedDsl;
  snapshot: WorkspaceSnapshot;
  lintIssues?: StudioLintIssue[];
  autocompleteSuggestions?: AutocompleteSuggestion[];
  onRippleModuleExport?: (exp: ReferencedModuleExport, moduleName?: string) => void;
  onChangeDsl: (src: string) => void;
  onResetDsl: () => void;
  onJumpToPage: (page: WorkflowSlug) => void;
  onOpenEditModal: (page: WorkflowSlug) => void;
  onReorderFlows: (sourceFlowId: string, targetFlowId: string, position: 'before' | 'after') => void;
  onMergeFlows: (sourceFlowId: string, targetFlowId: string) => void;
  onSplitFlow: (flowId: string, splitIndex?: number) => void;
  onDownloadZip: () => void;
  onNotify: (msg: string) => void;
}

export function SpecsBundleView({
  onSubmitArtifacts,
  activeSubTab,
  onSubTabChange,
  openapi,
  dslSource,
  parsedDsl,
  snapshot,
  lintIssues = [],
  autocompleteSuggestions = [],
  onRippleModuleExport,
  onChangeDsl,
  onResetDsl,
  onJumpToPage,
  onOpenEditModal,
  onReorderFlows,
  onMergeFlows,
  onSplitFlow,
  onDownloadZip,
  onNotify,
}: SpecsBundleViewProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Specifications, DSL Flows &amp; Export Bundle
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Unified inspector cross-referenced with Workbench modal editing and live child-mutation sync.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
          {(
            [
              ['openapi', 'OpenAPI Specification'],
              ['dsl', 'DSL Flows'],
              ['bundle', 'Export Bundle'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onSubTabChange(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeSubTab === id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeSubTab === 'openapi' && (
        <OpenApiInspector
          onSubmitArtifacts={onSubmitArtifacts}
          spec={openapi}
          onJumpToPage={onJumpToPage}
          onOpenEditModal={onOpenEditModal}
          onMutateOpenApiEndpoints={(_next, note) => onNotify(note)}
          lintIssues={lintIssues}
        />
      )}
      {activeSubTab === 'dsl' && (
        <DslInspector
          dslSource={dslSource}
          parsedDsl={parsedDsl}
          onChangeDsl={onChangeDsl}
          onResetDsl={onResetDsl}
          onJumpToPage={onJumpToPage}
          onOpenEditModal={onOpenEditModal}
          onReorderFlows={onReorderFlows}
          onMergeFlows={onMergeFlows}
          onSplitFlow={onSplitFlow}
          autocompleteSuggestions={autocompleteSuggestions}
          onRippleModuleExport={onRippleModuleExport}
        />
      )}
      {activeSubTab === 'bundle' && (
        <BundleInspector
          onSubmitArtifacts={onSubmitArtifacts}
          openapi={openapi}
          dslSource={dslSource}
          snapshot={snapshot}
          onDownloadZip={onDownloadZip}
          onOpenEditModal={onOpenEditModal}
          lintIssues={lintIssues}
        />
      )}
    </section>
  );
}
