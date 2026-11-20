import { useMemo, useState } from 'react';
import { Download, FileCode, RotateCcw } from 'lucide-react';
import { buildPhpProjectFiles } from '../engine/phpZipPackager';
import type { OpenApiSpec, ParsedDsl, WorkflowSlug, WorkspaceSnapshot } from '../types/studio';

interface OpenApiInspectorProps {
  spec: OpenApiSpec;
  onJumpToPage: (page: WorkflowSlug) => void;
}

export function OpenApiInspector({ spec, onJumpToPage }: OpenApiInspectorProps) {
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{spec.info.title}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            OpenAPI {spec.openapi} · Version {spec.info.version} · {Object.keys(spec.paths).length} controlled endpoints
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
            onClick={() => setViewMode('json')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              viewMode === 'json'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Raw openapi.json
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Operation</th>
                <th className="px-4 py-3 font-medium">DSL Flow</th>
                <th className="px-4 py-3 font-medium">Language</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {Object.entries(spec.paths).map(([route, methods]) =>
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
                          <button
                            type="button"
                            onClick={() => onJumpToPage(slug)}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Open Step
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">API Route</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="max-h-[600px] overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-200 dark:border-slate-800">
          {JSON.stringify(spec, null, 2)}
        </pre>
      )}
    </div>
  );
}

interface DslInspectorProps {
  dslSource: string;
  parsedDsl: ParsedDsl;
  onChangeDsl: (src: string) => void;
  onResetDsl: () => void;
  onJumpToPage: (page: WorkflowSlug) => void;
}

export function DslInspector({
  dslSource,
  parsedDsl,
  onChangeDsl,
  onResetDsl,
  onJumpToPage,
}: DslInspectorProps) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="space-y-3 lg:col-span-7">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">dsl/flows.dsl Editor</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Edit workflow nodes, step ordering, verification rules, and bidirectional codec edges live.
            </p>
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

        <textarea
          rows={18}
          value={dslSource}
          onChange={(e) => onChangeDsl(e.target.value)}
          spellCheck={false}
          className="w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-800"
        />
      </div>

      <div className="space-y-5 lg:col-span-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Active Flow Nodes</span>
            <span className="font-mono tabular-nums text-slate-500">{parsedDsl.flows.length} steps</span>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {parsedDsl.flows.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 py-2.5 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{f.label}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    {f.id} → {f.next} · verify={f.verify}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onJumpToPage(f.page)}
                  className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Open
                </button>
              </div>
            ))}
          </div>
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
  openapi: OpenApiSpec;
  dslSource: string;
  snapshot: WorkspaceSnapshot;
  onDownloadZip: () => void;
}

export function BundleInspector({ openapi, dslSource, snapshot, onDownloadZip }: BundleInspectorProps) {
  const files = useMemo(
    () => buildPhpProjectFiles(openapi, dslSource, snapshot),
    [openapi, dslSource, snapshot]
  );
  const [selectedPath, setSelectedPath] = useState(files[0]?.path || '');

  const activeFile = files.find((f) => f.path === selectedPath) || files[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            PHP / HTML / OpenAPI / DSL Project Package
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Inspect all {files.length} generated files (including completed pages, workflow engine, and zip_project.php) before downloading the archive.
          </p>
        </div>
        <button
          type="button"
          onClick={onDownloadZip}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Download className="h-4 w-4" />
          Download grammar2json_openapi_studio.zip
        </button>
      </div>

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

        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-950 lg:col-span-8 dark:border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 font-mono text-xs text-slate-400">
            <span>{activeFile?.path}</span>
            <span className="tabular-nums">{activeFile?.content.length.toLocaleString()} chars</span>
          </div>
          <pre className="max-h-[520px] flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
            {activeFile?.content}
          </pre>
        </div>
      </div>
    </div>
  );
}
