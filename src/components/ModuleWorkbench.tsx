import { useEffect, useMemo, useState } from 'react';
import { Download, FileCode2, FilePlus2, FolderOpen, PackagePlus, Upload } from 'lucide-react';
import {
  exportModuleZip,
  importModuleZip,
  updateModuleFile,
  type StudioModuleKind,
  type StudioModulePackage,
} from '../engine/modulePackageEngine.ts';
import type { ModuleActivationConfig } from '../engine/moduleProcessingEngine.ts';

const STORAGE_KEY = 'grammar2json.modules.v1';
const SOURCE_PENDING = '// Loading built-in module source...';
const EMPTY_TEMPLATE = '<main data-module="{{moduleId}}">\n  <h1>{{moduleName}}</h1>\n</main>\n';
const sourceLoaders = import.meta.glob('../components/*.tsx', { query: '?raw', import: 'default' }) as
  Record<string, () => Promise<string>>;

function moduleIdFromPath(path: string): string {
  const file = path.split('/').pop()?.replace(/\.tsx$/, '') ?? 'workbench';
  return file.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workbench';
}

function createBuiltIns(): StudioModulePackage[] {
  return Object.keys(sourceLoaders).map((sourcePath) => {
    const id = moduleIdFromPath(sourcePath);
    const title = id.split('-').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
    return {
      manifest: {
        id,
        name: title,
        version: '1.0.0',
        kind: 'workbench',
        workbenchSlug: id,
        entrypoint: 'scripts/index.tsx',
      },
      files: {
        'scripts/index.tsx': SOURCE_PENDING,
        'templates/page.html': EMPTY_TEMPLATE,
        'styles/module.css': '',
      },
    };
  });
}

function loadSavedModules(): StudioModulePackage[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return createBuiltIns();
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((item) =>
      item && typeof item === 'object' && typeof item.manifest?.id === 'string' &&
      typeof item.manifest?.entrypoint === 'string' && item.files && typeof item.files === 'object'
    )) return createBuiltIns();
    return parsed as StudioModulePackage[];
  } catch {
    return createBuiltIns();
  }
}

function sourcePathForId(id: string): string | undefined {
  return Object.keys(sourceLoaders).find((path) => moduleIdFromPath(path) === id);
}

function fileKind(path: string): 'script' | 'template' | 'style' | 'asset' {
  if (path.startsWith('scripts/')) return 'script';
  if (path.startsWith('templates/')) return 'template';
  if (path.startsWith('styles/')) return 'style';
  return 'asset';
}

function download(bytes: Uint8Array, filename: string): void {
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ModuleWorkbench() {
  const [modules, setModules] = useState<StudioModulePackage[]>(loadSavedModules);
  const [activeId, setActiveId] = useState(modules[0]?.manifest.id ?? '');
  const [activeFile, setActiveFile] = useState('scripts/index.tsx');
  const [processingConfigText, setProcessingConfigText] = useState('{}');
  const [notice, setNotice] = useState('');
  const activeModule = useMemo(
    () => modules.find((pkg) => pkg.manifest.id === activeId),
    [modules, activeId]
  );
  const files = Object.keys(activeModule?.files ?? {}).sort();

  useEffect(() => {
    const path = activeModule && sourcePathForId(activeModule.manifest.id);
    if (!activeModule || !path || activeModule.files[activeModule.manifest.entrypoint] !== SOURCE_PENDING) return;
    let cancelled = false;
    void sourceLoaders[path]().then((source) => {
      if (cancelled) return;
      setModules((current) => current.map((pkg) => pkg.manifest.id === activeId
        && pkg.files[pkg.manifest.entrypoint] === SOURCE_PENDING
        ? { ...pkg, files: { ...pkg.files, [pkg.manifest.entrypoint]: source } }
        : pkg));
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Could not load module source.'));
    return () => { cancelled = true; };
  }, [activeId, activeModule]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
    } catch {
      setNotice('Could not save module changes to browser storage. Export a ZIP to keep them.');
    }
  }, [modules]);

  useEffect(() => {
    if (files.length && !files.includes(activeFile)) setActiveFile(files[0]);
  }, [activeFile, files]);

  useEffect(() => {
    setProcessingConfigText(JSON.stringify(activeModule?.manifest.processing ?? {}, null, 2));
  }, [activeId, activeModule?.manifest.processing]);

  const updateActive = (transform: (pkg: StudioModulePackage) => StudioModulePackage) => {
    if (!activeModule) return;
    try {
      const updated = transform(activeModule);
      setModules((current) => current.map((pkg) => pkg.manifest.id === activeId ? updated : pkg));
      setNotice('Module draft saved locally.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update module.');
    }
  };

  const addFile = (kind: 'script' | 'template' | 'style') => {
    if (!activeModule) return;
    const folder = kind === 'script' ? 'scripts' : kind === 'template' ? 'templates' : 'styles';
    const extension = kind === 'script' ? 'js' : kind === 'template' ? 'html' : 'css';
    let index = 1;
    let path = `${folder}/${kind}-${index}.${extension}`;
    while (Object.hasOwn(activeModule.files, path)) path = `${folder}/${kind}-${++index}.${extension}`;
    updateActive((pkg) => updateModuleFile(pkg, path, ''));
    setActiveFile(path);
  };

  const createModule = () => {
    let index = modules.length + 1;
    let id = `custom-module-${index}`;
    while (modules.some((pkg) => pkg.manifest.id === id)) id = `custom-module-${++index}`;
    const pkg: StudioModulePackage = {
      manifest: {
        id,
        name: `Custom Module ${index}`,
        version: '1.0.0',
        kind: 'website',
        entrypoint: 'scripts/index.js',
      },
      files: {
        'scripts/index.js': '',
        'templates/page.html': EMPTY_TEMPLATE,
        'styles/module.css': '',
      },
    };
    setModules((current) => [...current, pkg]);
    setActiveId(id);
    setActiveFile(pkg.manifest.entrypoint);
    setNotice('Created a new website module draft.');
  };

  const importZip = async (file?: File) => {
    if (!file) return;
    try {
      const pkg = await importModuleZip(file);
      setModules((current) => [...current.filter((item) => item.manifest.id !== pkg.manifest.id), pkg]);
      setActiveId(pkg.manifest.id);
      setActiveFile(pkg.manifest.entrypoint);
      setNotice(`Imported ${pkg.manifest.name} as an editable draft. Its scripts are not executed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import module ZIP.');
    }
  };

  const exportActive = async () => {
    if (!activeModule) return;
    try {
      download(await exportModuleZip(activeModule), `${activeModule.manifest.id}.zip`);
      setNotice(`Exported ${activeModule.manifest.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not export module ZIP.');
    }
  };

  const removeFile = (path: string) => {
    if (!activeModule || path === activeModule.manifest.entrypoint) return;
    const updated = { ...activeModule, files: { ...activeModule.files } };
    delete updated.files[path];
    setModules((current) => current.map((pkg) => pkg.manifest.id === activeId ? updated : pkg));
  };

  const applyProcessingConfig = () => {
    try {
      const parsed: unknown = JSON.parse(processingConfigText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Processing conditions must be a JSON object.');
      }
      updateActive((pkg) => ({
        ...pkg,
        manifest: {
          ...pkg.manifest,
          processing: Object.keys(parsed).length ? parsed as ModuleActivationConfig : undefined,
        },
      }));
      setNotice('Processing conditions updated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Invalid processing conditions.');
    }
  };

  if (!activeModule) return null;
  const content = activeModule.files[activeFile] ?? '';

  return (
    <section className="space-y-4" aria-label="Studio module workbench">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-blue-600" />
            <h1 className="text-sm font-semibold">Module Workbench</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">Edit named workbench, endpoint, and website module packages. Scripts are packaged as source and never executed on import.</p>
        </div>
        <div data-tour="view.modules.package" className="flex flex-wrap gap-2">
          <button type="button" onClick={createModule} className="rounded-lg border px-3 py-2 text-xs"><PackagePlus className="mr-1 inline h-3.5 w-3.5" />New module</button>
          <label className="cursor-pointer rounded-lg border px-3 py-2 text-xs">
            <Upload className="mr-1 inline h-3.5 w-3.5" />Import ZIP
            <input className="sr-only" type="file" accept=".zip,application/zip" onChange={(event) => {
              void importZip(event.target.files?.[0]);
              event.currentTarget.value = '';
            }} />
          </label>
          <button type="button" onClick={() => void exportActive()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white"><Download className="mr-1 inline h-3.5 w-3.5" />Export ZIP</button>
        </div>
      </header>

      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside data-tour="view.modules.list" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Modules ({modules.length})</div>
          <div className="space-y-1">
            {modules.map((pkg) => (
              <button key={pkg.manifest.id} type="button" onClick={() => setActiveId(pkg.manifest.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-xs ${pkg.manifest.id === activeId ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span className="block font-medium">{pkg.manifest.name}</span>
                <span className="mt-0.5 block text-[10px] text-slate-500">{pkg.manifest.kind} · v{pkg.manifest.version}</span>
              </button>
            ))}
          </div>
        </aside>

        <div data-tour="view.modules.editor" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-[11px] text-slate-500">Module name
              <input value={activeModule.manifest.name} onChange={(event) => updateActive((pkg) => ({
                ...pkg, manifest: { ...pkg.manifest, name: event.target.value },
              }))} className="mt-1 w-full rounded border bg-transparent px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100" />
            </label>
            <label className="text-[11px] text-slate-500">Version
              <input value={activeModule.manifest.version} onChange={(event) => updateActive((pkg) => ({
                ...pkg, manifest: { ...pkg.manifest, version: event.target.value },
              }))} className="mt-1 w-full rounded border bg-transparent px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100" />
            </label>
            <label className="text-[11px] text-slate-500">Module kind
              <select value={activeModule.manifest.kind} onChange={(event) => updateActive((pkg) => ({
                ...pkg, manifest: {
                  ...pkg.manifest,
                  kind: event.target.value as StudioModuleKind,
                  workbenchSlug: event.target.value === 'workbench' ? (pkg.manifest.workbenchSlug || pkg.manifest.id) : undefined,
                  routes: event.target.value === 'endpoint' ? (pkg.manifest.routes?.length ? pkg.manifest.routes : ['/api/custom']) : pkg.manifest.routes,
                },
              }))} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-xs text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                <option value="workbench">Workbench</option><option value="endpoint">Endpoint</option><option value="website">Website page</option>
              </select>
            </label>
            <label className="text-[11px] text-slate-500">Endpoint routes
              <input value={(activeModule.manifest.routes ?? []).join(', ')} onChange={(event) => updateActive((pkg) => ({
                ...pkg, manifest: {
                  ...pkg.manifest,
                  routes: event.target.value.split(',').map((route) => route.trim()).filter(Boolean),
                },
              }))} placeholder="/api/example" className="mt-1 w-full rounded border bg-transparent px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100" />
            </label>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="text-[11px] text-slate-500">Runtime injection conditions (JSON)
              <textarea value={processingConfigText} onChange={(event) => setProcessingConfigText(event.target.value)}
                spellCheck={false} aria-label="Runtime injection conditions"
                placeholder={'{\n  "routes": ["/api/example"],\n  "methods": ["POST"],\n  "blockScopes": ["request-handler"],\n  "callNames": ["submit"],\n  "properties": { "scope.mode": "safe" }\n}'}
                className="mt-1 min-h-28 w-full rounded border bg-slate-950 p-2 font-mono text-xs text-slate-100" />
            </label>
            <button type="button" onClick={applyProcessingConfig} className="self-end rounded border px-3 py-2 text-xs">Apply conditions</button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-200 py-2 dark:border-slate-800">
            <div className="flex flex-wrap gap-1">
              {files.map((path) => (
                <div key={path} className={`flex items-center rounded-md text-[11px] ${path === activeFile ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                  <button type="button" onClick={() => setActiveFile(path)} className="flex items-center gap-1 px-2 py-1.5">
                    <FileCode2 className="h-3 w-3" />{path}
                  </button>
                  {path !== activeModule.manifest.entrypoint && <button type="button" aria-label={`Remove ${path}`} onClick={() => removeFile(path)} className="px-1 text-slate-400 hover:text-red-500">×</button>}
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => addFile('script')} title="Add script" className="rounded border p-1.5"><FilePlus2 className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => addFile('template')} title="Add template fragment" className="rounded border p-1.5"><FolderOpen className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => addFile('style')} title="Add stylesheet" className="rounded border p-1.5">CSS</button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{activeFile} · {fileKind(activeFile)}</span>
            <span>Entrypoint: {activeModule.manifest.entrypoint}</span>
          </div>
          <textarea value={content} onChange={(event) => updateActive((pkg) => updateModuleFile(pkg, activeFile, event.target.value))}
            spellCheck={false} aria-label={`Edit ${activeFile}`}
            className="min-h-[360px] w-full resize-y rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-blue-500 dark:border-slate-700" />
          <p role="status" className="min-h-4 text-xs text-slate-500">{notice || 'Drafts are saved in this browser. Import never activates code; export a module ZIP to move it between installations.'}</p>
        </div>
      </div>
    </section>
  );
}
