import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { buildVirtualTree, editVirtualFile, hasVirtualConflict, resolveVirtualFile, virtualEditAllowed, type VirtualFiles, type VirtualTreeNode } from '../engine/virtualFiles';
import type { MutationPolicy } from '../types/studio';
import { GuidedHelp } from './GuidedHelp';

export function VirtualFilesWorkbench({ files, setFiles, policy, onDownload }: {
  files: VirtualFiles; setFiles: Dispatch<SetStateAction<VirtualFiles>>;
  policy: MutationPolicy; onDownload: (content: string, filename: string, mime: string) => void;
}) {
  const tree = useMemo(() => buildVirtualTree(files), [files]);
  const [selected, setSelected] = useState('');
  const selectedPath = Object.hasOwn(files, selected) ? selected : Object.keys(files)[0];
  const file = files[selectedPath];
  const blocked = file ? !virtualEditAllowed(file, policy) : false;
  const render = (nodes: VirtualTreeNode[]) => nodes.map(node => node.children ? (
    <details key={node.path} open className="ml-3"><summary className="cursor-pointer font-medium">{node.name}/</summary>{render(node.children)}</details>
  ) : <button key={node.path} type="button" onClick={() => setSelected(node.path)} className={`block w-full truncate rounded px-2 py-1 text-left ${selectedPath === node.path ? 'bg-blue-100 dark:bg-blue-900' : ''}`}>{node.name}{files[node.path].edit !== null ? ' •' : ''}{hasVirtualConflict(files[node.path]) ? ' ⚠' : ''}</button>);
  return <section className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Shared virtual files</h2><GuidedHelp context="virtual_files" /></div>
    <p className="mb-3 text-sm text-slate-500">Virtual workbench outputs, not disk files. Edits do not change workbench inputs or other exports. Browser autosave stores only edits and their source bases; those may contain sensitive data. Live outputs return when their workbenches submit them. Explicit workspace snapshots can include all current outputs, including sensitive API responses. History restore skips edits blocked by policy.</p>
    <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_3fr]">
      <nav data-tour-id="view.virtual_files.tree" aria-label="Virtual file tree" className="max-h-96 overflow-auto rounded border p-2 text-sm">{tree.length ? render(tree) : 'No outputs yet.'}</nav>
      <div data-tour-id="view.virtual_files.editor">{file ? <>
        <div className="flex flex-wrap items-center gap-2"><strong className="break-all">{file.path}</strong><span className="text-xs">{file.filename ? `Output: ${file.filename} · ` : ''}{file.sourcePending ? 'Awaiting source' : file.source === null ? 'Source removed' : file.edit !== null ? 'User edit' : 'Source output'}{hasVirtualConflict(file) ? ' · source changed since edit' : ''}</span></div>
        {blocked && <p className="text-sm text-amber-700">Editing disabled by mutation policy (locked rules or disallowed target).</p>}
        {file.sourcePending && <p className="text-sm text-amber-700">Showing the saved edit base, not the current source. Open the producing workbench to compare its output.</p>}
        {hasVirtualConflict(file) && <div className="my-2 rounded border border-amber-400 p-2 text-sm"><p>Source changed or disappeared. Your edit is preserved; compare before resolving.</p><button className="mr-3 underline" onClick={() => setFiles(prev => resolveVirtualFile(prev, selectedPath, 'edit'))} disabled={!!blocked || file.sourcePending}>Keep edit</button><button className="underline" onClick={() => setFiles(prev => resolveVirtualFile(prev, selectedPath, 'source'))} disabled={!!blocked || file.sourcePending}>Use source{file.source === null ? ' (remove file)' : ''}</button></div>}
        <div className="mt-2 grid gap-2 lg:grid-cols-2"><label className="text-sm">{file.sourcePending ? 'Saved edit base' : 'Latest source'}<textarea readOnly value={file.source ?? (file.sourcePending ? '(no saved base)' : '(source no longer produced)')} className="mt-1 h-64 w-full rounded border bg-slate-50 p-2 font-mono text-xs dark:bg-slate-950" /></label><label className="text-sm">Virtual copy<textarea aria-label="Virtual copy" disabled={!!blocked} value={file.edit ?? file.source ?? ''} onChange={e => setFiles(prev => editVirtualFile(prev, selectedPath, e.target.value))} className="mt-1 h-64 w-full rounded border p-2 font-mono text-xs dark:bg-slate-950" /></label></div>
        <div data-tour-id="view.virtual_files.actions" className="flex gap-4 text-sm"><button className="underline" disabled={!!blocked || file.edit === null} onClick={() => setFiles(prev => resolveVirtualFile(prev, selectedPath, 'source'))}>Discard edit</button><button className="underline" disabled={!policy.allowExportMutation || !!blocked || hasVirtualConflict(file) || file.sourcePending} onClick={() => onDownload(file.edit ?? file.source ?? '', file.filename || file.path.split('/').pop() || 'artifact.txt', 'text/plain')}>Download copy</button></div>
        {hasVirtualConflict(file) && <p className="text-sm text-amber-700">Resolve the conflict before downloading this copy.</p>}
        {!policy.allowExportMutation && <p className="text-sm text-amber-700">Download disabled by export mutation policy.</p>}
      </> : <p className="text-sm text-slate-500">Select a file to compare and edit its virtual copy.</p>}</div>
    </div>
  </section>;
}
