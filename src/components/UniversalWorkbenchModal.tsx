import { useEffect, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, Monitor, X } from 'lucide-react';
import type { DslFlowNode, ModalStructure, ViewportPreset } from '../types/studio';

interface UniversalWorkbenchModalProps {
  open: boolean;
  flow: DslFlowNode;
  totalSteps: number;
  structure: ModalStructure;
  viewport: ViewportPreset;
  onStructureChange: (s: ModalStructure) => void;
  onViewportChange: (v: ViewportPreset) => void;
  onPrevStep: () => void;
  onVerifyAndAdvance: () => void;
  onClose: () => void;
  children: ReactNode;
}

const STRUCTURE_OPTIONS: Array<{ id: ModalStructure; label: string }> = [
  { id: 'workbar', label: 'Menu Bar' },
  { id: 'calculator', label: 'Calculator' },
  { id: 'grid', label: 'Grid' },
  { id: 'split', label: 'Split' },
];

const VIEWPORT_OPTIONS: Array<{ id: ViewportPreset; label: string; width?: number; height?: number }> = [
  { id: 'responsive', label: 'Responsive (100%)' },
  { id: '375x667', label: '375 × 667 (Mobile)', width: 375, height: 667 },
  { id: '768x1024', label: '768 × 1024 (Tablet)', width: 768, height: 1024 },
  { id: '1024x768', label: '1024 × 768 (Compact)', width: 1024, height: 768 },
  { id: '1280x720', label: '1280 × 720 (HD)', width: 1280, height: 720 },
];

export function UniversalWorkbenchModal({
  open,
  flow,
  totalSteps,
  structure,
  viewport,
  onStructureChange,
  onViewportChange,
  onPrevStep,
  onVerifyAndAdvance,
  onClose,
  children,
}: UniversalWorkbenchModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const vpSpec = VIEWPORT_OPTIONS.find((v) => v.id === viewport);
  const frameStyle = vpSpec?.width
    ? { width: `min(100%, ${vpSpec.width}px)`, height: `min(68vh, ${vpSpec.height}px)` }
    : undefined;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-3 sm:p-5 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-wb-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-[1340px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 id="modal-wb-title" className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
              {flow.label}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                Step {flow.step} of {totalSteps}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{flow.id}</span>
              <span aria-hidden="true">·</span>
              <span>Target: {flow.lang}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal workbench"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Selectable Structure + Hardcoded Viewport Resolution Subbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Structure</span>
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
              {STRUCTURE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onStructureChange(opt.id)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    structure === opt.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <label htmlFor="modalViewportSelect" className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Viewport
            </label>
            <select
              id="modalViewportSelect"
              value={viewport}
              onChange={(e) => onViewportChange(e.target.value as ViewportPreset)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {VIEWPORT_OPTIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Viewport Constrained Body */}
        <div className="flex-1 overflow-auto bg-slate-100/70 p-4 sm:p-5 dark:bg-slate-950">
          <div
            style={frameStyle}
            className={`mx-auto transition-all duration-150 ${
              viewport !== 'responsive'
                ? 'overflow-auto rounded-xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900'
                : 'w-full rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            {viewport !== 'responsive' && (
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span className="font-mono tabular-nums">{viewport}</span>
                <span>Layout: {STRUCTURE_OPTIONS.find((s) => s.id === structure)?.label}</span>
              </div>
            )}
            {children}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={onPrevStep}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous Workbench
          </button>

          <button
            type="button"
            onClick={onVerifyAndAdvance}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            Complete, Verify &amp; Advance Next
          </button>
        </div>
      </div>
    </div>
  );
}
