import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, File, Folder, RotateCcw } from 'lucide-react';
import { buildTree, type VfsState, type VfsTreeNode } from '../engine/virtualFsEngine';
import { GuideBanner } from './WorkbenchGuide';

function TreeRow({
  node,
  depth,
  selected,
  onSelect,
  collapsed,
  toggle,
}: {
  node: VfsTreeNode;
  depth: number;
  selected: string;
  onSelect: (p: string) => void;
  collapsed: Set<string>;
  toggle: (p: string) => void;
}) {
  const isCollapsed = collapsed.has(node.path);
  return (
    <>
      <button
        type="button"
        onClick={() => (node.isDir ? toggle(node.path) : onSelect(node.path))}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={`flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left font-mono text-xs ${
          selected === node.path ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
      >
        {node.isDir ? (isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <span className="w-3" />}
        {node.isDir ? <Folder className="h-3.5 w-3.5 text-amber-500" /> : <File className="h-3.5 w-3.5 text-slate-400" />}
        <span className="truncate">{node.name}</span>
      </button>
      {node.isDir && !isCollapsed && node.children.map((c) => (
        <TreeRow key={c.path} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} collapsed={collapsed} toggle={toggle} />
      ))}
    </>
  );
}

export function SharedFileTree({ vfs, onReset }: { vfs: VfsState; onReset: () => void }) {
  const tree = useMemo(() => buildTree(vfs.files), [vfs.files]);
  const paths = Object.keys(vfs.files);
  const [selected, setSelected] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'content' | 'diff'>('diff');
  const file = vfs.files[selected];

  const latestPatch = useMemo(() => {
    for (const s of vfs.submissions) {
      const c = s.changes.find((x) => x.path === selected && x.kind !== 'unchanged');
      if (c) return c.patch;
    }
    return '';
  }, [vfs.submissions, selected]);

  const toggle = (p: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  return (
    <div className="space-y-4">
      <GuideBanner guideId="files" />
      <div className="grid gap-4 lg:grid-cols-12">
        <section data-tour="files-tree" className="rounded-xl border border-slate-200 bg-white p-2 lg:col-span-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between px-2 py-1.5 text-xs text-slate-500">
            <span>{paths.length} files</span>
            {paths.length > 0 && (
              <button type="button" onClick={onReset} className="inline-flex items-center gap-1 hover:text-red-600">
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
          {paths.length === 0 ? (
            <p className="p-3 text-xs text-slate-500">Nothing yet. Open a workbench and choose “Complete, Verify &amp; Advance” or “Submit”.</p>
          ) : (
            tree.children.map((c) => (
              <TreeRow key={c.path} node={c} depth={0} selected={selected} onSelect={setSelected} collapsed={collapsed} toggle={toggle} />
            ))
          )}
        </section>

        <section data-tour="files-viewer" className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          {file ? (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 font-mono text-xs text-slate-700 dark:text-slate-300">
                  <span className="truncate">{file.path}</span>
                  <span className="ml-2 text-slate-400">r{file.revision} · {file.source}</span>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                  {(['diff', 'content'] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${view === v ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <pre className="max-h-[60vh] overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-200">
                {view === 'content' || !latestPatch
                  ? file.content
                  : latestPatch.split('\n').map((l, i) => (
                      <div key={i} className={l.startsWith('+') ? 'bg-emerald-900/40 text-emerald-300' : l.startsWith('-') ? 'bg-red-900/40 text-red-300' : ''}>
                        {l || ' '}
                      </div>
                    ))}
              </pre>
            </>
          ) : (
            <p className="p-4 text-xs text-slate-500">Select a file in the tree.</p>
          )}
        </section>

        <section data-tour="files-log" className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-3 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Submissions</h3>
          <ol className="max-h-[60vh] space-y-2 overflow-auto">
            {vfs.submissions.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700">
                <div className="flex justify-between font-medium text-slate-800 dark:text-slate-100">
                  <span>#{s.id} {s.label}</span>
                  <span className="font-mono text-slate-400">{new Date(s.at).toLocaleTimeString()}</span>
                </div>
                <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
                  {s.changes.map((c) => (
                    <li key={c.path}>
                      <button type="button" onClick={() => setSelected(c.path)} className="text-left hover:underline">
                        <span className={c.kind === 'added' ? 'text-emerald-600' : c.kind === 'modified' ? 'text-amber-600' : 'text-slate-400'}>
                          {c.kind === 'added' ? 'A' : c.kind === 'modified' ? 'M' : '='}
                        </span>{' '}
                        {c.path} {c.kind !== 'unchanged' && <span className="text-slate-400">+{c.added} −{c.removed}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
