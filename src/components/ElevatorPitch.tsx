import type { ElevatorPitch as ElevatorPitchCopy } from '../data/workflowPitch';

interface ElevatorPitchProps {
  copy: ElevatorPitchCopy;
  compact?: boolean;
  headingLevel?: 'h1' | 'h2' | 'p';
}

export function ElevatorPitch({
  copy,
  compact = false,
  headingLevel = 'h2',
}: ElevatorPitchProps) {
  const Heading = headingLevel;
  return (
    <section
      aria-label={`${copy.title} overview`}
      className={`rounded-xl border border-blue-100 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/20 ${
        compact ? 'p-3' : 'p-4 sm:p-5'
      }`}
    >
      <Heading
        className={`font-semibold text-slate-900 dark:text-slate-100 ${
          compact ? 'text-sm' : 'text-base'
        }`}
      >
        {copy.title}
      </Heading>
      {compact ? (
        <>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{copy.purpose}</p>
          <details className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            <summary className="cursor-pointer font-medium text-blue-700 dark:text-blue-300">Why use this and what comes next</summary>
            <p className="mt-1">{copy.value}</p>
            <p className="mt-1">{copy.nextStep}</p>
          </details>
        </>
      ) : <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
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
      </dl>}
    </section>
  );
}
