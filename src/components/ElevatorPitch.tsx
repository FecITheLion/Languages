import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { ElevatorPitch as ElevatorPitchCopy } from '../data/workflowPitch';

interface ElevatorPitchProps {
  copy: ElevatorPitchCopy;
  compact?: boolean;
  headingLevel?: 'h1' | 'h2' | 'p';
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  onDismiss?: () => void;
}

export function ElevatorPitch({
  copy,
  compact = false,
  headingLevel = 'h2',
  className = '',
  collapsible = false,
  defaultCollapsed = false,
  onDismiss,
}: ElevatorPitchProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const Heading = headingLevel;
  const isCollapsed = collapsible && collapsed;
  return (
    <section
      aria-label={`${copy.title} overview`}
      className={`mb-4 rounded-xl border border-blue-100 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/20 ${
        isCollapsed ? 'px-3.5 py-2' : compact ? 'p-3.5' : 'p-4 sm:p-5'
      }${className ? ` ${className}` : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {collapsible && (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? `Expand ${copy.title}` : `Collapse ${copy.title}`}
              className="rounded p-0.5 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
            >
              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          <Heading
            className={`font-semibold text-slate-900 dark:text-slate-100 ${
              compact ? 'text-sm' : 'text-base'
            }`}
          >
            {copy.title}
          </Heading>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss ${copy.title}`}
            title="Dismiss"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-blue-100 hover:text-slate-700 dark:hover:bg-blue-900/40 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {!isCollapsed && (compact ? (
        <>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{copy.purpose}</p>
          <details className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            <summary className="cursor-pointer font-medium text-blue-700 dark:text-blue-300">Why use this and what comes next</summary>
            <p className="mt-1">{copy.value}</p>
            <p className="mt-1">{copy.nextStep}</p>
          </details>
        </>
      ) : <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            Purpose
          </dt>
          <dd className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300">{copy.purpose}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            Value
          </dt>
          <dd className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300">{copy.value}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            Next step
          </dt>
          <dd className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300">{copy.nextStep}</dd>
        </div>
      </dl>)}
    </section>
  );
}
