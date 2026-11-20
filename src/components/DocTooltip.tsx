import { useEffect, useRef, useState } from 'react';
import { BookOpen, HelpCircle, X } from 'lucide-react';
import { STUDIO_DOCS, type StudioDocEntry } from '../data/studioDocs';

interface DocTooltipProps {
  docKey?: string;
  customDoc?: Omit<StudioDocEntry, 'key'>;
  align?: 'left' | 'right';
  size?: 'xs' | 'sm';
  label?: string;
}

export function DocTooltip({
  docKey,
  customDoc,
  align = 'left',
  size = 'xs',
  label,
}: DocTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  const doc = docKey ? STUDIO_DOCS[docKey] : customDoc;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!doc) return null;

  return (
    <span
      ref={rootRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPinned((prev) => {
            const next = !prev;
            setOpen(next);
            return next;
          });
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!pinned) setOpen(false);
        }}
        aria-label={`Documentation: ${doc.title}`}
        aria-expanded={open}
        title={`${doc.title} — Click to pin verbose docs`}
        className={`inline-flex items-center gap-1 rounded text-slate-400 transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-slate-500 dark:hover:text-blue-400 ${
          size === 'sm' ? 'p-1 text-xs' : 'p-0.5 text-[11px]'
        }`}
      >
        <HelpCircle className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
        {label && <span>{label}</span>}
      </button>

      {open && (
        <div
          role="tooltip"
          className={`absolute top-full z-50 mt-1.5 w-[min(88vw,340px)] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
                <BookOpen className="h-3 w-3 shrink-0" />
                <span>{doc.category}</span>
              </div>
              <div className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                {doc.title}
              </div>
            </div>
            {pinned && (
              <button
                type="button"
                onClick={() => {
                  setPinned(false);
                  setOpen(false);
                }}
                aria-label="Close documentation tooltip"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {doc.summary}
          </p>

          {doc.syntax && (
            <div className="mt-2">
              <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Syntax</div>
              <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap rounded-md bg-slate-950 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-slate-200">
                {doc.syntax}
              </pre>
            </div>
          )}

          {doc.example && (
            <div className="mt-2">
              <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Example</div>
              <div className="mt-0.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {doc.example}
              </div>
            </div>
          )}

          {doc.notes && (
            <p className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {doc.notes}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
