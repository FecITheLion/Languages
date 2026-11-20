import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  GitFork,
  GitMerge,
  GripVertical,
  Pencil,
  SplitSquareVertical,
  Trash2,
} from 'lucide-react';
import { DocTooltip } from './DocTooltip';

export interface DomEchelonItem {
  id: string;
  title?: string;
  label?: string;
  subtitle?: string;
  preview?: string;
  meta?: string;
  badge?: string;
  splitPoints?: Array<{ index: number; label: string }>;
  splitOptions?: Array<{ index: number; label: string }>;
  composite?: boolean;
}

export type EchelonDomItem = DomEchelonItem;

interface DomEchelonManipulatorProps {
  title: string;
  subtitle?: string;
  items: DomEchelonItem[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  onReorder: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
  onMerge?: (sourceId: string, targetId: string) => void;
  onSplit?: (targetId: string, splitIndex?: number, draggedSourceId?: string) => void;
  onEditInModal?: (id: string) => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
}

/**
 * Full-scale DOM Drag-and-Drop Manipulator supporting Order, Merge, and Biject/Split.
 * While dragging any element, temporary drop option places dynamically appear for:
 *  - Insert Before / Insert After (Order)
 *  - Merge Center Slot (Composite Merge)
 *  - Every possible Split / Biject boundary slot on each target element!
 */
export function DomEchelonManipulator({
  title,
  subtitle,
  items,
  activeId,
  onSelect,
  onReorder,
  onMerge,
  onSplit,
  onEditInModal,
  onDelete,
  emptyMessage = 'No items yet. Visit this workbench or add an item to get started.',
}: DomEchelonManipulatorProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const [mergeSources, setMergeSources] = useState<Record<string, string>>({});

  const clearDrag = () => {
    setDraggedId(null);
    setHoverZone(null);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggedId(id);
  };

  const resolveSource = (e: React.DragEvent): string =>
    draggedId || e.dataTransfer.getData('text/plain') || '';

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            <DocTooltip docKey="domDragSplitMerge" />
          </div>
          {subtitle && (
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">
          <span>
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {emptyMessage}
        </div>
      ) : (
        <>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
          {onSelect && 'Start by selecting an item to inspect it. '}Use <strong>Move up</strong> or <strong>Move down</strong> to change its place; changes apply right away.
        </p>
        <details className="text-xs text-slate-500 dark:text-slate-400">
          <summary className="min-h-10 cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Advanced: use drag and drop</summary>
          <p className="pb-2 leading-relaxed">
            Drag an item to the labeled positions that appear to move it, combine two items, or split an item at a boundary. The buttons under each item provide the same combine and split actions without dragging.
          </p>
        </details>
        <p className="sr-only" role="status" aria-live="polite">
          {draggedId ? 'Item selected for dragging. Drop it on a labeled position or action.' : ''}
        </p>
        <div className="space-y-2" role="list" aria-label={title}>
          {items.map((item, idx) => {
            const isDragged = draggedId === item.id;
            const isActive = activeId === item.id;
            const showTempZones = Boolean(draggedId && draggedId !== item.id);
            const displayTitle = item.title || item.label || item.id;
            const displaySubtitle = item.subtitle || item.preview;
            const rawSplits = item.splitPoints ?? item.splitOptions;
            const splitPoints =
              rawSplits && rawSplits.length > 0
                ? rawSplits
                : [
                    { index: 1, label: 'First / second part' },
                    { index: 2, label: 'Front / remaining part' },
                  ];
            const otherItems = items.filter((candidate) => candidate.id !== item.id);
            const mergeSourceId = otherItems.some((candidate) => candidate.id === mergeSources[item.id])
              ? mergeSources[item.id]
              : otherItems[0]?.id ?? '';

            const beforeKey = `${item.id}:before`;
            const mergeKey = `${item.id}:merge`;
            const afterKey = `${item.id}:after`;

            return (
              <div key={item.id} role="listitem" className="space-y-1">
                {/* Temporary Drop Zone: Insert Before */}
                {showTempZones && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setHoverZone(beforeKey);
                    }}
                    onDragLeave={() => setHoverZone((z) => (z === beforeKey ? null : z))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const src = resolveSource(e);
                      clearDrag();
                      if (src && src !== item.id) onReorder(src, item.id, 'before');
                    }}
                    className={`flex items-center justify-center rounded-md border border-dashed py-1 font-mono text-[10px] transition-colors ${
                      hoverZone === beforeKey
                        ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-slate-300 bg-slate-50/80 text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400'
                    }`}
                  >
                    Drop here to move before #{idx + 1} ({displayTitle})
                  </div>
                )}

                {/* Draggable DOM Element Card */}
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragEnd={clearDrag}
                  className={`rounded-lg border px-3 py-2 transition-colors ${
                    isDragged
                      ? 'border-blue-400 bg-blue-50/40 opacity-50 dark:border-blue-600 dark:bg-blue-950/30'
                      : isActive
                        ? 'border-blue-600 bg-blue-50/30 dark:border-blue-500 dark:bg-blue-950/25'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        title="Drag to reorder, combine, or split"
                        aria-hidden="true"
                        className="hidden shrink-0 cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing sm:inline-flex dark:text-slate-600 dark:hover:text-slate-300"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelect?.(item.id)}
                        disabled={!onSelect}
                        aria-pressed={onSelect ? isActive : undefined}
                        className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-blue-600"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] tabular-nums text-slate-400">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {displayTitle}
                          </span>
                          {item.badge && (
                            <span className="font-mono text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                              {item.badge}
                            </span>
                          )}
                          {item.composite && (
                            <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                              · merged
                            </span>
                          )}
                        </div>
                        {(displaySubtitle || item.meta) && (
                          <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {displaySubtitle}
                            {displaySubtitle && item.meta ? ' · ' : ''}
                            {item.meta}
                          </div>
                        )}
                      </button>
                    </div>

                    {/* Direct keyboard/mobile-accessible controls */}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => idx > 0 && onReorder(item.id, items[idx - 1].id, 'before')}
                        title="Move up"
                        aria-label={`Move ${displayTitle} up`}
                        className="min-h-10 min-w-10 rounded border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === items.length - 1}
                        onClick={() =>
                          idx < items.length - 1 && onReorder(item.id, items[idx + 1].id, 'after')
                        }
                        title="Move down"
                        aria-label={`Move ${displayTitle} down`}
                        className="min-h-10 min-w-10 rounded border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {(onMerge || onSplit || onEditInModal || onDelete) && (
                    <details className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                      <summary className="min-h-10 cursor-pointer py-2 text-xs font-medium text-blue-700 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-300 dark:hover:text-blue-200">
                        More actions
                      </summary>
                      <div className="space-y-2 pb-1">
                        {onMerge && items.length > 1 && (
                          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-2.5 dark:border-blue-900/50 dark:bg-blue-950/20">
                            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                              Combine another item into <strong>{displayTitle}</strong> to keep them together.
                            </p>
                            <label className="mt-2 block text-xs font-medium text-slate-700 dark:text-slate-200">
                              Choose an item
                              <select
                                aria-label={`Choose an item to combine into ${displayTitle}`}
                                value={mergeSourceId}
                                onChange={(event) =>
                                  setMergeSources((current) => ({ ...current, [item.id]: event.target.value }))
                                }
                                className="mt-1 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              >
                                {items.filter((candidate) => candidate.id !== item.id).map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.title || candidate.label || candidate.id}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                if (mergeSourceId) onMerge(mergeSourceId, item.id);
                              }}
                              className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 text-xs font-medium text-blue-800 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-200 dark:hover:bg-blue-950/50"
                            >
                              <GitMerge className="h-3.5 w-3.5" />
                              Combine selected item
                            </button>
                          </div>
                        )}
                        {onSplit && (
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                              Separate this item into parts
                              {splitPoints.length > 1 ? ' at a chosen point' : ''}.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {splitPoints.map((point) => (
                                <button
                                  key={point.index}
                                  type="button"
                                  onClick={() => onSplit(item.id, point.index)}
                                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
                                >
                                  <GitFork className="h-3.5 w-3.5" />
                                  {splitPoints.length > 1 ? `Split: ${point.label}` : 'Split this item'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {(onEditInModal || onDelete) && (
                          <div className="flex flex-wrap gap-2">
                            {onEditInModal && (
                              <button
                                type="button"
                                onClick={() => onEditInModal(item.id)}
                                title={`Edit ${displayTitle} in the workbench`}
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit in workbench
                              </button>
                            )}
                            {onDelete && (
                              <button
                                type="button"
                                onClick={() => onDelete(item.id)}
                                aria-label={`Remove ${displayTitle}`}
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-red-800 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Remove item
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </details>
                  )}

                  {/* LIVE TEMP DROP OPTION PLACES FOR MERGE + EVERY POSSIBLE SPLIT (VISIBLE WHILE DRAGGING) */}
                  {showTempZones && (onMerge || onSplit) && (
                    <div className="mt-2 grid grid-cols-1 gap-1.5 border-t border-slate-100 pt-2 sm:grid-cols-3 dark:border-slate-800">
                      {onMerge && (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setHoverZone(mergeKey);
                          }}
                          onDragLeave={() => setHoverZone((z) => (z === mergeKey ? null : z))}
                          onDrop={(e) => {
                            e.preventDefault();
                            const src = resolveSource(e);
                            clearDrag();
                            if (src && src !== item.id) onMerge(src, item.id);
                          }}
                          className={`flex items-center justify-center gap-1 rounded-md border border-dashed px-2 py-1.5 font-mono text-[10px] transition-colors ${
                            hoverZone === mergeKey
                              ? 'border-blue-600 bg-blue-100 font-semibold text-blue-800 dark:border-blue-400 dark:bg-blue-950/80 dark:text-blue-200'
                              : 'border-blue-300/80 bg-blue-50/40 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300'
                          }`}
                        >
                          <GitMerge className="h-3 w-3 shrink-0" />
                          <span>Combine with {displayTitle}</span>
                        </div>
                      )}

                      {onSplit &&
                        splitPoints.map((sp) => {
                          const splitKey = `${item.id}:split:${sp.index}`;
                          return (
                            <div
                              key={splitKey}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setHoverZone(splitKey);
                              }}
                              onDragLeave={() => setHoverZone((z) => (z === splitKey ? null : z))}
                              onDrop={(e) => {
                                e.preventDefault();
                                const src = resolveSource(e);
                                clearDrag();
                                if (src && src !== item.id) onSplit(item.id, sp.index, src);
                              }}
                              className={`flex items-center justify-center gap-1 rounded-md border border-dashed px-2 py-1.5 font-mono text-[10px] transition-colors ${
                                hoverZone === splitKey
                                  ? 'border-emerald-600 bg-emerald-100 font-semibold text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950/80 dark:text-emerald-200'
                                  : 'border-emerald-300/80 bg-emerald-50/40 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                              }`}
                            >
                              <SplitSquareVertical className="h-3 w-3 shrink-0" />
                              <span className="truncate">Split here: {sp.label}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Temporary Drop Zone: Insert After (shown on last item while dragging) */}
                {showTempZones && idx === items.length - 1 && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setHoverZone(afterKey);
                    }}
                    onDragLeave={() => setHoverZone((z) => (z === afterKey ? null : z))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const src = resolveSource(e);
                      clearDrag();
                      if (src && src !== item.id) onReorder(src, item.id, 'after');
                    }}
                    className={`flex items-center justify-center rounded-md border border-dashed py-1 font-mono text-[10px] transition-colors ${
                      hoverZone === afterKey
                        ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-slate-300 bg-slate-50/80 text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400'
                    }`}
                  >
                    Drop here to move after #{idx + 1} ({displayTitle})
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
