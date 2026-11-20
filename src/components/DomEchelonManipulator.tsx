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
  emptyMessage = 'No DOM elements available in this echelon.',
}: DomEchelonManipulatorProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<string | null>(null);

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
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            <DocTooltip docKey="domDragSplitMerge" />
          </div>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          <span>
            {items.length} node{items.length === 1 ? '' : 's'}
          </span>
          {draggedId && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                Dragging — drop on Before, Merge, or any Temp Split slot
              </span>
            </>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-2" role="list">
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
                    { index: 1, label: 'Biject Left / Right' },
                    { index: 2, label: 'Split Head / Tail' },
                  ];

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
                    Drop here to insert before #{idx + 1} ({displayTitle})
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
                        title="Drag to reorder, merge, or drop on a split boundary"
                        className="shrink-0 cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing dark:text-slate-600 dark:hover:text-slate-300"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelect?.(item.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] tabular-nums text-slate-400">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
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
                        className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
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
                        className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      {onSplit && (
                        <button
                          type="button"
                          onClick={() => onSplit(item.id, splitPoints[0]?.index ?? 1)}
                          title="Biject / Split this element"
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
                        >
                          <GitFork className="h-3 w-3" />
                          <span>Biject / Split</span>
                        </button>
                      )}
                      {onEditInModal && (
                        <button
                          type="button"
                          onClick={() => onEditInModal(item.id)}
                          title={`Edit ${displayTitle} in modal`}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Edit</span>
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(item.id)}
                          title={`Remove ${displayTitle}`}
                          aria-label={`Remove ${displayTitle}`}
                          className="rounded border border-slate-200 p-1 text-slate-400 hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:hover:border-red-800 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

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
                          <span>Merge into {displayTitle}</span>
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
                              <span className="truncate">Split: {sp.label}</span>
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
                    Drop here to append after #{idx + 1} ({displayTitle})
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
