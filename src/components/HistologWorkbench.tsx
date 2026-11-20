import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BookmarkPlus,
  Check,
  Copy,
  Download,
  FileDiff,
  GitCommitHorizontal,
  History,
  Link2,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { DocTooltip } from './DocTooltip';
import {
  HISTOLOG_FIELD_KEYS,
  HISTOLOG_FIELD_LABELS,
  diffHistologSnapshots,
  exportHistologCustom,
  queryHistologIndex,
  type HistologEntry,
  type HistologExportFormat,
  type HistologFieldKey,
  type HistologIndex,
} from '../engine/histologEngine';

interface HistologWorkbenchProps {
  entries: HistologEntry[];
  index: HistologIndex;
  schemaName: string;
  initialFromGen?: number;
  initialToGen?: number;
  onCaptureCheckpoint: (note?: string) => void;
  onRestoreGeneration: (entry: HistologEntry) => void;
  onRestoreSection?: (entry: HistologEntry, field: HistologFieldKey) => void;
  onClearSection?: (field: HistologFieldKey) => void;
  onClearEntireEngine?: () => void;
  onImportHistolog: (
    rawText: string,
    mode: 'replace' | 'merge'
  ) => { ok: true; message: string } | { ok: false; error: string };
  onDownloadFile: (content: string, filename: string, mime: string) => void;
  onCopyDiffLink?: (fromGen: number, toGen: number) => void;
}

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

export function HistologWorkbench({
  entries,
  index,
  schemaName,
  initialFromGen,
  initialToGen,
  onCaptureCheckpoint,
  onRestoreGeneration,
  onRestoreSection,
  onClearSection,
  onClearEntireEngine,
  onImportHistolog,
  onDownloadFile,
  onCopyDiffLink,
}: HistologWorkbenchProps) {
  const latestGen = entries.length > 0 ? entries[entries.length - 1].generation : 0;
  const prevGen = entries.length > 1 ? entries[entries.length - 2].generation : latestGen;

  const [fromGen, setFromGen] = useState<number>(
    typeof initialFromGen === 'number' ? initialFromGen : prevGen
  );
  const [toGen, setToGen] = useState<number>(
    typeof initialToGen === 'number' ? initialToGen : latestGen
  );
  const [activeField, setActiveField] = useState<'all' | HistologFieldKey>('all');
  const [changedOnly, setChangedOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [fieldFilter, setFieldFilter] = useState<'all' | HistologFieldKey>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [checkpointNote, setCheckpointNote] = useState('');
  const [mobilePane, setMobilePane] = useState<'timeline' | 'diff'>('timeline');

  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [copiedPatch, setCopiedPatch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveFromEntry =
    entries.find((e) => e.generation === fromGen) || entries[Math.max(0, entries.length - 2)] || entries[0];
  const effectiveToEntry =
    entries.find((e) => e.generation === toGen) || entries[entries.length - 1] || entries[0];

  const fieldDiffs = useMemo(() => {
    if (!effectiveFromEntry || !effectiveToEntry) return [];
    return diffHistologSnapshots(effectiveFromEntry.snapshot, effectiveToEntry.snapshot);
  }, [effectiveFromEntry, effectiveToEntry]);

  const visibleDiffs = useMemo(() => {
    const base =
      activeField === 'all' ? fieldDiffs : fieldDiffs.filter((d) => d.field === activeField);
    if (activeField === 'all') {
      const changed = base.filter((d) => d.changed);
      return changed.length > 0 ? changed : base.slice(0, 1);
    }
    return base;
  }, [fieldDiffs, activeField]);

  const filteredEntries = useMemo(() => {
    return queryHistologIndex(entries, index, {
      text: searchQuery,
      symbol: symbolFilter,
      field: fieldFilter,
      source: sourceFilter,
    }).slice().reverse();
  }, [entries, index, searchQuery, symbolFilter, fieldFilter, sourceFilter]);

  const allSources = useMemo(() => Object.keys(index.bySource).sort(), [index.bySource]);

  const totalDiffAdded = useMemo(
    () => fieldDiffs.reduce((sum, d) => sum + d.added, 0),
    [fieldDiffs]
  );
  const totalDiffRemoved = useMemo(
    () => fieldDiffs.reduce((sum, d) => sum + d.removed, 0),
    [fieldDiffs]
  );

  const handleExport = (format: HistologExportFormat) => {
    const res = exportHistologCustom(
      entries,
      index,
      schemaName,
      format,
      effectiveFromEntry?.generation,
      effectiveToEntry?.generation
    );
    onDownloadFile(res.content, res.filename, res.mime);
  };

  const handleCopyPatch = async () => {
    const res = exportHistologCustom(
      entries,
      index,
      schemaName,
      'patch-diff',
      effectiveFromEntry?.generation,
      effectiveToEntry?.generation
    );
    try {
      await navigator.clipboard.writeText(res.content);
      setCopiedPatch(true);
      window.setTimeout(() => setCopiedPatch(false), 1800);
    } catch {
      // Ignore restricted clipboard
    }
  };

  const handleRunImport = (raw: string) => {
    const res = onImportHistolog(raw, importMode);
    if (res.ok) {
      setImportStatus({ ok: true, text: res.message });
      setImportText('');
    } else {
      setImportStatus({ ok: false, text: res.error });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      handleRunImport(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <section className="space-y-4">
      {/* Header & Custom Import/Export Controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <History className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Histolog Generational Index &amp; Historical Diff
              </h1>
              <DocTooltip docKey="histologUndoRedo" />
              {onClearEntireEngine && (
                <button
                  type="button"
                  onClick={onClearEntireEngine}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear Entire Engine
                </button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                G0–G{latestGen} ({index.totalGenerations} gen{index.totalGenerations === 1 ? '' : 's'})
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{index.uniqueSymbols.length} indexed symbols</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                +{index.totalAdditions}
              </span>
              <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                -{index.totalDeletions}
              </span>
            </div>
          </div>

          {/* Checkpoint Capture */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCaptureCheckpoint(checkpointNote.trim() || undefined);
              setCheckpointNote('');
            }}
            className="flex w-full items-center gap-2 lg:w-auto"
          >
            <input
              type="text"
              value={checkpointNote}
              onChange={(e) => setCheckpointNote(e.target.value)}
              placeholder="Checkpoint note (e.g., Added lookahead rule)..."
              aria-label="Checkpoint note"
              className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none sm:min-h-0 lg:w-64 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 sm:min-h-0"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save Gen
            </button>
          </form>
        </div>

        {/* Custom Import / Export Action Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-slate-500 dark:text-slate-400">Export:</span>
            <button
              type="button"
              onClick={() => handleExport('histolog-json')}
              className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              .histolog.json
            </button>
            <button
              type="button"
              onClick={() => handleExport('histolog-ndjson')}
              className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              .histolog.ndjson
            </button>
            <button
              type="button"
              onClick={() => handleExport('patch-diff')}
              className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FileDiff className="h-3.5 w-3.5" />
              .diff.patch
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.ndjson,.histolog,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Archive
            </button>
            <button
              type="button"
              onClick={() => setImportOpen((o) => !o)}
              className={`inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors sm:min-h-0 ${
                importOpen
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Custom Import
            </button>
            {onCopyDiffLink && effectiveFromEntry && effectiveToEntry && (
              <button
                type="button"
                onClick={() => onCopyDiffLink(effectiveFromEntry.generation, effectiveToEntry.generation)}
                className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-400 dark:hover:bg-blue-950/40"
              >
                <Link2 className="h-3.5 w-3.5" />
                Copy Diff Link
              </button>
            )}
          </div>
        </div>

        {/* Custom Import Panel (Paste JSON / NDJSON + Merge vs Replace) */}
        {importOpen && (
          <div className="mt-3 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Paste custom <code className="font-mono">.histolog.json</code> or{' '}
                <code className="font-mono">.histolog.ndjson</code>
              </span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    importMode === 'merge'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  Merge &amp; Re-index
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    importMode === 'replace'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  Replace Timeline
                </button>
              </div>
            </div>
            <textarea
              rows={5}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              spellCheck={false}
              placeholder='{"format":"grammar2json-histolog","entries":[...]} or NDJSON lines...'
              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {importStatus ? (
                <span
                  className={`text-xs font-medium ${
                    importStatus.ok
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {importStatus.text}
                </span>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Recomputes generational lineage and inverted symbol index automatically.
                </span>
              )}
              <button
                type="button"
                onClick={() => handleRunImport(importText)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 sm:min-h-0"
              >
                <Upload className="h-3.5 w-3.5" />
                Import &amp; Index
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Pane Toggle (< lg) */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 lg:hidden dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setMobilePane('timeline')}
          className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            mobilePane === 'timeline'
              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Generations &amp; Index ({filteredEntries.length})
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('diff')}
          className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            mobilePane === 'diff'
              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Diff G{effectiveFromEntry?.generation ?? 0} → G{effectiveToEntry?.generation ?? 0}
        </button>
      </div>

      {/* Main 2-Column Layout: Left Generational Timeline & Index | Right Diff Viewer */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* LEFT PANE: Inverted Index & Timeline */}
        <div
          className={`${
            mobilePane === 'timeline' ? 'flex' : 'hidden lg:flex'
          } flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900`}
        >
          {/* Search & Index Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search generations, symbols, fingerprints..."
                aria-label="Search Histolog index"
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                aria-label="Filter by indexed symbol"
                className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="all">All Symbols ({index.uniqueSymbols.length})</option>
                {index.uniqueSymbols.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym} ({index.bySymbol[sym]?.length || 0}g)
                  </option>
                ))}
              </select>

              <select
                value={fieldFilter}
                onChange={(e) => setFieldFilter(e.target.value as 'all' | HistologFieldKey)}
                aria-label="Filter by artifact field"
                className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="all">All Artifacts</option>
                {HISTOLOG_FIELD_KEYS.map((f) => (
                  <option key={f} value={f}>
                    {HISTOLOG_FIELD_LABELS[f]} ({index.byField[f]?.length || 0})
                  </option>
                ))}
              </select>

              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                aria-label="Filter by source"
                className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="all">All Sources</option>
                {allSources.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cross-Generation Inverted Symbol Index Strip */}
          {index.uniqueSymbols.length > 0 && (
            <div className="border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>Indexed Symbols Across Generations</span>
                {symbolFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSymbolFilter('all')}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Clear symbol filter
                  </button>
                )}
              </div>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
                {index.uniqueSymbols.slice(0, 24).map((sym) => {
                  const gens = index.bySymbol[sym] || [];
                  const isActive = symbolFilter === sym;
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setSymbolFilter(isActive ? 'all' : sym)}
                      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                        isActive
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                      }`}
                    >
                      <span>{sym}</span>
                      <span className="tabular-nums opacity-75">
                        G{gens.join(',')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Generational Log */}
          <div className="max-h-[480px] divide-y divide-slate-100 overflow-auto border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {filteredEntries.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No generations match the current Histolog index filters.
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const isBase = effectiveFromEntry?.generation === entry.generation;
                const isTarget = effectiveToEntry?.generation === entry.generation;
                return (
                  <div
                    key={entry.id}
                    className={`space-y-1.5 py-2.5 ${
                      isTarget
                        ? 'bg-blue-50/40 px-2 dark:bg-blue-950/25'
                        : isBase
                          ? 'bg-slate-50/70 px-2 dark:bg-slate-800/30'
                          : 'px-1'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                          <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            G{entry.generation}
                          </span>
                          {entry.parentGeneration !== null && (
                            <span className="font-mono text-[11px] tabular-nums text-slate-400">
                              ← G{entry.parentGeneration}
                            </span>
                          )}
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                            ·
                          </span>
                          <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                            {entry.summary}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{entry.source}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{formatShortTime(entry.timestamp)}</span>
                          <span aria-hidden="true">·</span>
                          <span>#{entry.fingerprint}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                            +{entry.additions}
                          </span>
                          <span className="tabular-nums text-red-600 dark:text-red-400">
                            -{entry.deletions}
                          </span>
                        </div>
                      </div>
                    </div>

                    {entry.touchedSymbols.length > 0 && (
                      <div className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        Symbols: {entry.touchedSymbols.slice(0, 6).join(', ')}
                        {entry.touchedSymbols.length > 6 ? ` +${entry.touchedSymbols.length - 6}` : ''}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setFromGen(entry.generation);
                          setMobilePane('diff');
                        }}
                        className={`min-h-[32px] rounded border px-2 py-0.5 text-[11px] font-medium transition-colors sm:min-h-0 ${
                          isBase
                            ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                        }`}
                      >
                        Base
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setToGen(entry.generation);
                          setMobilePane('diff');
                        }}
                        className={`min-h-[32px] rounded border px-2 py-0.5 text-[11px] font-medium transition-colors sm:min-h-0 ${
                          isTarget
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                        }`}
                      >
                        Target
                      </button>
                      <button
                        type="button"
                        onClick={() => onRestoreGeneration(entry)}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-blue-400"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Historical Diff Viewer */}
        <div
          className={`${
            mobilePane === 'diff' ? 'flex' : 'hidden lg:flex'
          } flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900`}
        >
          {/* Diff Comparison Selector Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={effectiveFromEntry?.generation ?? 0}
                onChange={(e) => setFromGen(Number(e.target.value))}
                aria-label="Base generation"
                className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {entries.map((e) => (
                  <option key={e.id} value={e.generation}>
                    Base: G{e.generation} ({e.summary.slice(0, 26)})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  const prevFrom = effectiveFromEntry?.generation ?? 0;
                  const prevTo = effectiveToEntry?.generation ?? 0;
                  setFromGen(prevTo);
                  setToGen(prevFrom);
                }}
                aria-label="Swap base and target generations"
                className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </button>

              <select
                value={effectiveToEntry?.generation ?? 0}
                onChange={(e) => setToGen(Number(e.target.value))}
                aria-label="Target generation"
                className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {entries.map((e) => (
                  <option key={e.id} value={e.generation}>
                    Target: G{e.generation} ({e.summary.slice(0, 26)})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                +{totalDiffAdded}
              </span>
              <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                -{totalDiffRemoved}
              </span>
              <button
                type="button"
                onClick={() => setChangedOnly((c) => !c)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              >
                {changedOnly ? 'Changed Only' : 'Full Context'}
              </button>
              <button
                type="button"
                onClick={() => void handleCopyPatch()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              >
                {copiedPatch ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                {copiedPatch ? 'Copied' : 'Patch'}
              </button>
            </div>
          </div>

          {/* Artifact Field Tabs (Horizontally Scrollable on Mobile) */}
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setActiveField('all')}
              className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                activeField === 'all'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
              }`}
            >
              All Changed ({fieldDiffs.filter((d) => d.changed).length})
            </button>
            {fieldDiffs.map((diff) => (
              <button
                key={diff.field}
                type="button"
                onClick={() => setActiveField(diff.field)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeField === diff.field
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                }`}
              >
                <span>{diff.label}</span>
                {diff.changed && (
                  <span className="font-mono text-[10px] tabular-nums opacity-85">
                    +{diff.added}/-{diff.removed}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Unified Diff Code Panels */}
          <div className="max-h-[480px] space-y-3 overflow-auto">
            {visibleDiffs.map((diff) => {
              const displayLines = changedOnly
                ? diff.lines.filter((line, idx) => {
                    if (line.kind !== 'context') return true;
                    const prev = diff.lines[idx - 1];
                    const next = diff.lines[idx + 1];
                    return (
                      (prev && prev.kind !== 'context') ||
                      (next && next.kind !== 'context')
                    );
                  })
                : diff.lines;

              return (
                <div
                  key={diff.field}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-[11px] text-slate-300">
                    <span>
                      {diff.label} (Generation {effectiveFromEntry?.generation ?? 0} → Generation{' '}
                      {effectiveToEntry?.generation ?? 0})
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">
                        {diff.changed ? (
                          <>
                            <span className="text-emerald-400">+{diff.added}</span>{' '}
                            <span className="text-red-400">-{diff.removed}</span>
                          </>
                        ) : (
                          <span className="text-slate-500">unchanged</span>
                        )}
                      </span>
                      {onRestoreSection && effectiveFromEntry && (
                        <button
                          type="button"
                          onClick={() => onRestoreSection(effectiveFromEntry, diff.field)}
                          className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-sans text-[10px] font-medium text-blue-300 hover:border-blue-500 hover:text-white"
                        >
                          Restore Section to G{effectiveFromEntry.generation}
                        </button>
                      )}
                      {onClearSection && (
                        <button
                          type="button"
                          onClick={() => onClearSection(diff.field)}
                          className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-sans text-[10px] font-medium text-red-300 hover:border-red-500 hover:text-white"
                        >
                          Clear Section
                        </button>
                      )}
                    </div>
                  </div>

                  {!diff.changed ? (
                    <div className="px-3 py-4 font-mono text-xs text-slate-500">
                      Identical in G{effectiveFromEntry?.generation ?? 0} and G
                      {effectiveToEntry?.generation ?? 0}.
                    </div>
                  ) : (
                    <div className="overflow-x-auto font-mono text-[11px] leading-5">
                      {displayLines.map((line, i) => (
                        <div
                          key={`${diff.field}-${i}`}
                          className={`flex whitespace-pre ${
                            line.kind === 'added'
                              ? 'bg-emerald-950/60 text-emerald-200'
                              : line.kind === 'removed'
                                ? 'bg-red-950/60 text-red-200'
                                : 'text-slate-300'
                          }`}
                        >
                          <span className="w-9 shrink-0 select-none border-r border-slate-800/80 px-1.5 text-right tabular-nums text-slate-500">
                            {line.oldLine ?? ''}
                          </span>
                          <span className="w-9 shrink-0 select-none border-r border-slate-800/80 px-1.5 text-right tabular-nums text-slate-500">
                            {line.newLine ?? ''}
                          </span>
                          <span className="w-5 shrink-0 select-none text-center font-semibold">
                            {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
                          </span>
                          <span className="pr-3">{line.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
