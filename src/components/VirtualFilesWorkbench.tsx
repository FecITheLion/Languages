import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  buildVirtualTree,
  editVirtualFile,
  hasVirtualConflict,
  resolveVirtualFile,
  virtualEditAllowed,
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
}: {
  files: VirtualFiles;
  setFiles: Dispatch<SetStateAction<VirtualFiles>>;
  policy: MutationPolicy;
  onDownload: (content: string, filename: string, mime: string) => void;
}) {
  const tree = useMemo(() => buildVirtualTree(files), [files]);
  const [selected, setSelected] = useState('');
  const selectedPath = Object.hasOwn(files, selected) ? selected : Object.keys(files)[0];
  const file = files[selectedPath];
  const blocked = file ? !virtualEditAllowed(file, policy) : false;

  const render = (nodes: VirtualTreeNode[]) =>
    nodes.map((node) =>
      node.children ? (
        <details key={node.path} open className="ml-3">
          <summary className="cursor-pointer font-medium">{node.name}/</summary>
          {render(node.children)}
        </details>
      ) : (
        <button
          key={node.path}
          type="button"
          aria-pressed={selectedPath === node.path}
          aria-label={`${node.name}${files[node.path].edit !== null ? ', edited copy' : ''}${
            hasVirtualConflict(files[node.path]) ? ', source changed' : ''
          }`}
          title={`${node.name}${files[node.path].edit !== null ? ' • edited copy' : ''}${
            hasVirtualConflict(files[node.path]) ? ' ⚠ source changed' : ''
          }`}
          onClick={() => setSelected(node.path)}
          className={`block min-h-10 w-full truncate rounded px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
            selectedPath === node.path ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
        >
          {node.name}
          {files[node.path].edit !== null ? ' •' : ''}
          {hasVirtualConflict(files[node.path]) ? ' ⚠' : ''}
        </button>
      )
    );

  return (
    <section className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Shared virtual files</h2>
        <GuidedHelp context="virtual_files" />
      </div>
      <p className="mb-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        These are workspace copies of generated outputs, not files on your device. Editing a copy
        does not change grammar or other source inputs. If a newer output arrives, compare it with
        your copy before deciding what to keep. Browser autosave stores edits and the source versions
        they were based on; avoid sensitive data on shared devices. A full workspace snapshot can
        include all outputs, including API responses.
      </p>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        In the file list, a dot marks a copy you have edited and a warning mark means its source has
        changed.
      </p>
      <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_3fr]">
        <nav
          data-tour-id="view.virtual_files.tree"
          data-tour="files-tree"
          aria-label="Generated files"
          className="max-h-96 overflow-auto rounded border p-2 text-sm"
        >
          {tree.length ? (
            render(tree)
          ) : (
            <p className="p-2 text-slate-500">
              No generated files yet. Open a workbench that creates an output, and it will appear
              here.
            </p>
          )}
        </nav>
        <div data-tour-id="view.virtual_files.editor" data-tour="files-viewer">
          {file ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="break-all">{file.path}</strong>
                <span className="text-xs">
                  {file.filename ? `Output: ${file.filename} · ` : ''}
                  {file.sourcePending
                    ? 'Awaiting source'
                    : file.source === null
                      ? 'Source removed'
                      : file.edit !== null
                        ? 'User edit'
                        : 'Source output'}
                  {hasVirtualConflict(file) ? ' · source changed since edit' : ''}
                </span>
              </div>
              {blocked && (
                <p className="text-sm text-amber-700">
                  Editing is disabled by the workspace rules for this file.
                </p>
              )}
              {file.sourcePending && (
                <p className="text-sm text-amber-700">
                  This shows your saved copy and the source version it was based on. Open the
                  workbench that creates this file to see its latest output.
                </p>
              )}
              {hasVirtualConflict(file) && (
                <div
                  role="status"
                  className="my-2 rounded border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30"
                >
                  <p className="font-medium">The generated source has changed or was removed.</p>
                  <p className="mt-1">
                    Your edit is safe. Compare the two panes, then keep your edit or replace it
                    with the latest source.
                  </p>
                  {file.sourcePending && (
                    <p className="mt-1">
                      Open the workbench that creates this file to load its latest source before
                      choosing.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="min-h-10 rounded border border-amber-700 px-3 font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
                      onClick={() =>
                        setFiles((prev) => resolveVirtualFile(prev, selectedPath, 'edit'))
                      }
                      disabled={!!blocked || file.sourcePending}
                    >
                      Keep my edit
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded border border-amber-700 px-3 font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
                      onClick={() =>
                        setFiles((prev) => resolveVirtualFile(prev, selectedPath, 'source'))
                      }
                      disabled={!!blocked || file.sourcePending}
                    >
                      {file.source === null
                        ? 'Remove copy (source was removed)'
                        : 'Use latest source'}
                    </button>
                  </div>
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Compare the read-only generated source on the left with your editable copy on the
                right. Changes here stay separate from the source inputs.
              </p>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                <label className="text-sm font-medium">
                  {file.sourcePending
                    ? 'Saved source version (read-only)'
                    : 'Latest generated source (read-only)'}
                  <textarea
                    readOnly
                    aria-label={
                      file.sourcePending
                        ? 'Saved source version, read-only'
                        : 'Latest generated source, read-only'
                    }
                    value={
                      file.source ??
                      (file.sourcePending
                        ? '(no saved source version)'
                        : '(source no longer produced)')
                    }
                    className="mt-1 h-64 w-full rounded border bg-slate-50 p-2 font-mono text-xs dark:bg-slate-950"
                  />
                </label>
                <label className="text-sm font-medium">
                  Your editable copy
                  <textarea
                    aria-label="Your editable copy"
                    disabled={!!blocked}
                    value={file.edit ?? file.source ?? ''}
                    onChange={(event) =>
                      setFiles((prev) => editVirtualFile(prev, selectedPath, event.target.value))
                    }
                    className="mt-1 h-64 w-full rounded border p-2 font-mono text-xs dark:bg-slate-950"
                  />
                </label>
              </div>
              <div
                data-tour-id="view.virtual_files.actions"
                className="flex flex-wrap gap-3 text-sm"
              >
                <button
                  type="button"
                  className="min-h-10 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  disabled={!!blocked || file.edit === null}
                  onClick={() =>
                    setFiles((prev) => resolveVirtualFile(prev, selectedPath, 'source'))
                  }
                >
                  {file.source === null ? 'Remove my copy' : 'Reset copy to source'}
                </button>
                <button
                  type="button"
                  className="min-h-10 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  disabled={
                    !policy.allowExportMutation || !!blocked || hasVirtualConflict(file) || file.sourcePending
                  }
                  onClick={() =>
                    onDownload(
                      file.edit ?? file.source ?? '',
                      file.filename || file.path.split('/').pop() || 'artifact.txt',
                      'text/plain'
                    )
                  }
                >
                  Download this copy
                </button>
              </div>
              {hasVirtualConflict(file) && (
                <p className="text-sm text-amber-700">
                  Resolve the conflict before downloading this copy.
                </p>
              )}
              {!policy.allowExportMutation && (
                <p className="text-sm text-amber-700">Downloading is disabled by workspace rules.</p>
              )}
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
