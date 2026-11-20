import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Columns2,
  Download,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
} from 'lucide-react';
import {
  buildVirtualTree,
  editVirtualFile,
  hasVirtualConflict,
  resolveVirtualFile,
  virtualEditAllowed,
  type VirtualFile,
  type VirtualFiles,
  type VirtualTreeNode,
} from '../engine/virtualFiles';
import type { MutationPolicy } from '../types/studio';
import { GuidedHelp } from './GuidedHelp';

export function VirtualFilesWorkbench({
  files,
  setFiles,
  policy,
  onDownload,
  compactDrawer = false,
  onCollapse,
  splitWidth,
  onToggleSplitWidth,
}: {
  files: VirtualFiles;
  setFiles: Dispatch<SetStateAction<VirtualFiles>>;
  policy: MutationPolicy;
  onDownload: (content: string, filename: string, mime: string) => void;
  compactDrawer?: boolean;
  onCollapse?: () => void;
  splitWidth?: 'compact' | 'wide';
  onToggleSplitWidth?: () => void;
}) {
  const tree = useMemo(() => buildVirtualTree(files), [files]);
  const allPaths = useMemo(() => Object.keys(files), [files]);

  const [viewMode, setViewMode] = useState<'side-by-side' | 'diff'>(
    compactDrawer ? 'side-by-side' : 'diff'
  );
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [targetSlot, setTargetSlot] = useState<'left' | 'right'>('left');

  const [selectedLeft, setSelectedLeft] = useState('');
  const [selectedRight, setSelectedRight] = useState('');
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);

  const selectedLeftPath = Object.hasOwn(files, selectedLeft)
    ? selectedLeft
    : (allPaths[0] ?? '');
  const selectedRightPath = Object.hasOwn(files, selectedRight)
    ? selectedRight
    : (allPaths.find((p) => p !== selectedLeftPath) ?? allPaths[0] ?? '');

  const leftFile = selectedLeftPath ? files[selectedLeftPath] : undefined;
  const rightFile = selectedRightPath ? files[selectedRightPath] : undefined;
  const blockedLeft = leftFile ? !virtualEditAllowed(leftFile, policy) : false;

  const handleTreeSelect = (nodePath: string) => {
    if (viewMode === 'side-by-side' && targetSlot === 'right') {
      setSelectedRight(nodePath);
    } else {
      setSelectedLeft(nodePath);
    }
  };

  const renderTree = (nodes: VirtualTreeNode[]) =>
    nodes.map((node) =>
      node.children ? (
        <details key={node.path} open className="ml-2">
          <summary className="cursor-pointer py-0.5 font-medium text-slate-700 dark:text-slate-300">
            {node.name}/
          </summary>
          {renderTree(node.children)}
        </details>
      ) : (
        <button
          key={node.path}
          type="button"
          aria-pressed={selectedLeftPath === node.path || (viewMode === 'side-by-side' && selectedRightPath === node.path)}
          aria-label={`${node.name}${files[node.path].edit !== null ? ', edited copy' : ''}${
            hasVirtualConflict(files[node.path]) ? ', source changed' : ''
          }`}
          title={`${node.path}${files[node.path].edit !== null ? ' • edited copy' : ''}${
            hasVirtualConflict(files[node.path]) ? ' ⚠ source changed' : ''
          }`}
          onClick={() => handleTreeSelect(node.path)}
          className={`flex min-h-8 w-full items-center justify-between gap-1.5 truncate rounded px-2 py-1 text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
            selectedLeftPath === node.path
              ? 'bg-blue-100 font-medium text-blue-900 dark:bg-blue-900/60 dark:text-blue-100'
              : viewMode === 'side-by-side' && selectedRightPath === node.path
                ? 'bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <span className="truncate">
            {node.name}
            {files[node.path].edit !== null ? ' •' : ''}
            {hasVirtualConflict(files[node.path]) ? ' ⚠' : ''}
          </span>
          {viewMode === 'side-by-side' && (
            <span className="shrink-0 font-mono text-[10px] opacity-70">
              {selectedLeftPath === node.path ? 'L' : selectedRightPath === node.path ? 'R' : ''}
            </span>
          )}
        </button>
      )
    );

  const renderLiveFilePane = (
    slot: 'left' | 'right',
    pathKey: string,
    fileObj: VirtualFile | undefined,
    collapsed: boolean,
    setCollapsed: Dispatch<SetStateAction<boolean>>,
    onSelectPath: (p: string) => void
  ) => {
    const isBlocked = fileObj ? !virtualEditAllowed(fileObj, policy) : false;
    const textVal = fileObj ? (fileObj.edit ?? fileObj.source ?? '') : '';
    const lineCount = textVal ? textVal.split('\n').length : 0;

    return (
      <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/70">
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${slot} generated file pane`}
              className="rounded p-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                slot === 'left'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
              }`}
            >
              {slot === 'left' ? 'File A' : 'File B'}
            </span>
            <select
              aria-label={`Choose file for ${slot} live pane`}
              value={pathKey}
              onChange={(e) => onSelectPath(e.target.value)}
              className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-1 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {allPaths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {fileObj && (
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-slate-500">{lineCount}L</span>
              {fileObj.edit !== null && (
                <button
                  type="button"
                  title="Reset edited copy to live source"
                  disabled={!!isBlocked}
                  onClick={() => setFiles((prev) => resolveVirtualFile(prev, pathKey, 'source'))}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                title="Download file"
                disabled={!policy.allowExportMutation || !!isBlocked || hasVirtualConflict(fileObj)}
                onClick={() =>
                  onDownload(
                    textVal,
                    fileObj.filename || pathKey.split('/').pop() || 'artifact.txt',
                    'text/plain'
                  )
                }
                className="rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
              >
                <Download className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {!collapsed && fileObj && (
          <div className="space-y-1.5 p-2">
            {hasVirtualConflict(fileObj) && (
              <div className="flex flex-wrap items-center justify-between gap-1 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <span>Source changed since edit</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="underline"
                    disabled={!!isBlocked || fileObj.sourcePending}
                    onClick={() => setFiles((prev) => resolveVirtualFile(prev, pathKey, 'edit'))}
                  >
                    Keep edit
                  </button>
                  <button
                    type="button"
                    className="underline"
                    disabled={!!isBlocked || fileObj.sourcePending}
                    onClick={() => setFiles((prev) => resolveVirtualFile(prev, pathKey, 'source'))}
                  >
                    Use latest
                  </button>
                </div>
              </div>
            )}
            <textarea
              aria-label={`Live content for ${pathKey}`}
              readOnly={isBlocked}
              value={textVal}
              onChange={(event) =>
                setFiles((prev) => editVirtualFile(prev, pathKey, event.target.value))
              }
              className="h-64 w-full resize-y rounded border border-slate-200 bg-white p-2 font-mono text-[11px] leading-relaxed text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3.5 sm:p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base dark:text-slate-100">
            Generated files ({allPaths.length})
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${
                viewMode === 'side-by-side'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Columns2 className="h-3 w-3" /> Side-by-Side Files
            </button>
            <button
              type="button"
              onClick={() => setViewMode('diff')}
              className={`rounded-md px-2 py-0.5 font-medium ${
                viewMode === 'diff'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Source vs Copy
            </button>
          </div>

          <button
            type="button"
            onClick={() => setTreeCollapsed((v) => !v)}
            aria-expanded={!treeCollapsed}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
          >
            {treeCollapsed ? <PanelLeftOpen className="h-3 w-3" /> : <PanelLeftClose className="h-3 w-3" />}
            {treeCollapsed ? 'Show Tree' : 'Hide Tree'}
          </button>

          {onToggleSplitWidth && (
            <button
              type="button"
              onClick={onToggleSplitWidth}
              className="hidden rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 xl:inline-flex dark:border-slate-700 dark:text-slate-200"
            >
              {splitWidth === 'wide' ? 'Split 60/40' : 'Split 50/50'}
            </button>
          )}

          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Minimize2 className="h-3 w-3" /> Collapse
            </button>
          )}

          {!compactDrawer && <GuidedHelp context="virtual_files" />}
        </div>
      </div>

      {!compactDrawer && (
        <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          These are live workspace copies of generated outputs. Inspect two generated files side-by-side or compare read-only generated source against your editable copy.
        </p>
      )}

      <div
        className={`mt-3 grid gap-3 ${
          treeCollapsed
            ? 'grid-cols-1'
            : compactDrawer
              ? 'grid-cols-1'
              : 'md:grid-cols-[minmax(12rem,1fr)_3fr]'
        }`}
      >
        {!treeCollapsed && (
          <nav
            data-tour-id="view.virtual_files.tree"
            data-tour="files-tree"
            aria-label="Generated files"
            className={`${compactDrawer ? 'max-h-40' : 'max-h-96'} overflow-auto rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-xs dark:border-slate-800 dark:bg-slate-950/60`}
          >
            {viewMode === 'side-by-side' && allPaths.length > 0 && (
              <div className="mb-1.5 flex items-center justify-between gap-1 border-b border-slate-200 pb-1.5 text-[10px] text-slate-500 dark:border-slate-800">
                <span>Click loads into:</span>
                <div className="inline-flex rounded border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setTargetSlot('left')}
                    className={`rounded px-1.5 py-0.5 font-semibold ${
                      targetSlot === 'left'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    File A
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetSlot('right')}
                    className={`rounded px-1.5 py-0.5 font-semibold ${
                      targetSlot === 'right'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    File B
                  </button>
                </div>
              </div>
            )}
            {tree.length ? (
              renderTree(tree)
            ) : (
              <p className="p-2 text-slate-500">
                No generated files yet. Open a workbench that creates an output, and it will appear here.
              </p>
            )}
          </nav>
        )}

        <div data-tour-id="view.virtual_files.editor" data-tour="files-viewer">
          {viewMode === 'side-by-side' ? (
            allPaths.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800">
                No generated files yet. Interact with any workbench step to populate live files side-by-side.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {renderLiveFilePane(
                  'left',
                  selectedLeftPath,
                  leftFile,
                  leftPaneCollapsed,
                  setLeftPaneCollapsed,
                  setSelectedLeft
                )}
                {renderLiveFilePane(
                  'right',
                  selectedRightPath,
                  rightFile,
                  rightPaneCollapsed,
                  setRightPaneCollapsed,
                  setSelectedRight
                )}
              </div>
            )
          ) : leftFile ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="break-all text-xs">{leftFile.path}</strong>
                <span className="text-xs text-slate-500">
                  {leftFile.filename ? `Output: ${leftFile.filename} · ` : ''}
                  {leftFile.sourcePending
                    ? 'Awaiting source'
                    : leftFile.source === null
                      ? 'Source removed'
                      : leftFile.edit !== null
                        ? 'User edit'
                        : 'Source output'}
                  {hasVirtualConflict(leftFile) ? ' · source changed since edit' : ''}
                </span>
              </div>
              {blockedLeft && (
                <p className="text-sm text-amber-700">
                  Editing is disabled by the workspace rules for this file.
                </p>
              )}
              {leftFile.sourcePending && (
                <p className="text-sm text-amber-700">
                  This shows your saved copy and the source version it was based on. Open the workbench that creates this file to see its latest output.
                </p>
              )}
              {hasVirtualConflict(leftFile) && (
                <div
                  role="status"
                  className="my-2 rounded border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30"
                >
                  <p className="font-medium">The generated source has changed or was removed.</p>
                  <p className="mt-1">
                    Your edit is safe. Compare the two panes, then keep your edit or replace it with the latest source.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="min-h-10 rounded border border-amber-700 px-3 font-medium underline"
                      onClick={() =>
                        setFiles((prev) => resolveVirtualFile(prev, selectedLeftPath, 'edit'))
                      }
                      disabled={!!blockedLeft || leftFile.sourcePending}
                    >
                      Keep my edit
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded border border-amber-700 px-3 font-medium underline"
                      onClick={() =>
                        setFiles((prev) => resolveVirtualFile(prev, selectedLeftPath, 'source'))
                      }
                      disabled={!!blockedLeft || leftFile.sourcePending}
                    >
                      {leftFile.source === null ? 'Remove copy (source was removed)' : 'Use latest source'}
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                <label className="text-xs font-medium">
                  {leftFile.sourcePending
                    ? 'Saved source version (read-only)'
                    : 'Latest generated source (read-only)'}
                  <textarea
                    readOnly
                    aria-label={
                      leftFile.sourcePending
                        ? 'Saved source version, read-only'
                        : 'Latest generated source, read-only'
                    }
                    value={
                      leftFile.source ??
                      (leftFile.sourcePending ? '(no saved source version)' : '(source no longer produced)')
                    }
                    className="mt-1 h-64 w-full rounded border bg-slate-50 p-2 font-mono text-xs dark:bg-slate-950"
                  />
                </label>
                <label className="text-xs font-medium">
                  Your editable copy
                  <textarea
                    aria-label="Your editable copy"
                    disabled={!!blockedLeft}
                    value={leftFile.edit ?? leftFile.source ?? ''}
                    onChange={(event) =>
                      setFiles((prev) => editVirtualFile(prev, selectedLeftPath, event.target.value))
                    }
                    className="mt-1 h-64 w-full rounded border p-2 font-mono text-xs dark:bg-slate-950"
                  />
                </label>
              </div>
              <div
                data-tour-id="view.virtual_files.actions"
                className="mt-2 flex flex-wrap gap-3 text-xs"
              >
                <button
                  type="button"
                  className="min-h-9 underline"
                  disabled={!!blockedLeft || leftFile.edit === null}
                  onClick={() =>
                    setFiles((prev) => resolveVirtualFile(prev, selectedLeftPath, 'source'))
                  }
                >
                  {leftFile.source === null ? 'Remove my copy' : 'Reset copy to source'}
                </button>
                <button
                  type="button"
                  className="min-h-9 underline"
                  disabled={
                    !policy.allowExportMutation ||
                    !!blockedLeft ||
                    hasVirtualConflict(leftFile) ||
                    leftFile.sourcePending
                  }
                  onClick={() =>
                    onDownload(
                      leftFile.edit ?? leftFile.source ?? '',
                      leftFile.filename || leftFile.path.split('/').pop() || 'artifact.txt',
                      'text/plain'
                    )
                  }
                >
                  Download this copy
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Choose a generated file to compare its source with your editable copy.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
