import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Compass, Film, ImageIcon, Pause, Play, X } from 'lucide-react';
import { getGuide, type GuideEntry } from '../data/workbenchGuides';
import { resolveAssetUrl } from '../engine/runtimePaths';

const btn =
  'inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

export function LiveTour({ guide, onClose, modal }: { guide: GuideEntry; onClose: () => void; modal: boolean }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = guide.tour[i];

  const pageTargets: Record<string, string> = {
    '[data-tour="modal-header"]': '[data-tour="pipeline"]',
    '[data-tour="modal-structure"]': '[data-tour="pipeline"]',
    '[data-tour="modal-body"]': '[data-tour="workbench-body"]',
    '[data-tour="modal-footer"]': '[data-tour="workbench-verify"]',
  };
  const target = modal || !step.target ? step.target : (pageTargets[step.target] ?? step.target);
  const measure = useCallback(() => {
    const el = target ? document.querySelector(target) : null;
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [target]);

  useLayoutEffect(() => {
    if (target) document.querySelector(target)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    measure();
    const t = window.setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure, target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, guide.tour.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guide.tour.length, onClose]);

  const last = i === guide.tour.length - 1;
  const cardStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 340)),
        top: rect.bottom + 14 + 190 > window.innerHeight ? Math.max(12, rect.top - 200) : rect.bottom + 14,
      }
    : { position: 'fixed', left: '50%', top: '40%', transform: 'translateX(-50%)' };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`${guide.title} live tour`}>
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-lg ring-2 ring-blue-500"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(2,6,23,0.6)',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-950/60" />
      )}
      <div style={cardStyle} className="w-[min(92vw,326px)] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
          <span className="font-mono">
            {i + 1}/{guide.tour.length}
          </span>
          <button type="button" onClick={onClose} aria-label="End tour" className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{step.body}</p>
        <div className="mt-3 flex justify-between">
          <button type="button" className={btn} disabled={i === 0} onClick={() => setI(i - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <button
            type="button"
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
            onClick={() => (last ? onClose() : setI(i + 1))}
          >
            {last ? 'Done' : 'Next'} {!last && <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function StoryboardImage({ index, total, title, caption, outputs, src }: { index: number; total: number; title: string; caption: string; outputs: string[]; src?: string }) {
  const [imgError, setImgError] = useState(false);
  if (src && !imgError) {
    return (
      <img
        src={resolveAssetUrl(src)}
        alt={`${title}: ${caption}`}
        loading="lazy"
        decoding="async"
        onError={() => setImgError(true)}
        className="h-full w-full rounded-lg object-cover"
      />
    );
  }
  return (
    <svg viewBox="0 0 480 270" role="img" aria-label={`Step ${index + 1} of ${total}: ${title}. ${caption}`} className="h-full w-full rounded-lg">
      <defs>
        <linearGradient id={`g${index}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <rect width="480" height="270" fill={`url(#g${index})`} />
      <text x="28" y="96" fontSize="64" fontWeight="700" fill="#93c5fd" fontFamily="monospace">{index + 1}</text>
      <text x="28" y="140" fontSize="22" fontWeight="700" fill="#fff" fontFamily="sans-serif">{title.slice(0, 34)}</text>
      <text x="28" y="168" fontSize="13" fill="#cbd5e1" fontFamily="sans-serif">{caption.slice(0, 64)}</text>
      <text x="28" y="244" fontSize="12" fill="#7dd3fc" fontFamily="monospace">→ {outputs[0] ?? 'shared tree'}</text>
    </svg>
  );
}

export function HowToPanel({ guide, mode, onClose }: { guide: GuideEntry; mode: 'video' | 'images'; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(mode === 'video');
  const [videoFailed, setVideoFailed] = useState(false);
  const total = guide.frames.length;
  const realVideo = mode === 'video' && guide.videoSrc && !videoFailed;

  useEffect(() => {
    if (!playing || realVideo) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % total), 2600);
    return () => window.clearInterval(t);
  }, [playing, realVideo, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const f = guide.frames[i];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3" role="dialog" aria-modal="true" aria-label={`${guide.title} how-to`}>
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {guide.title} — {mode === 'video' ? 'Video how-to' : 'Image how-to'}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close how-to" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="aspect-video overflow-hidden rounded-lg bg-slate-900">
          {realVideo ? (
            <video src={guide.videoSrc} preload="none" controls autoPlay muted playsInline className="h-full w-full" onError={() => setVideoFailed(true)} />
          ) : (
            <StoryboardImage index={i} total={total} title={f.title} caption={f.caption} outputs={guide.outputs} src={f.imageSrc} />
          )}
        </div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
          <strong>{f.title}.</strong> {f.caption}
        </p>
        {!realVideo && (
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1.5">
              <button type="button" className={btn} onClick={() => setI((i - 1 + total) % total)} aria-label="Previous frame">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {mode === 'video' && (
                <button type="button" className={btn} onClick={() => setPlaying((p) => !p)}>
                  {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {playing ? 'Pause' : 'Play'}
                </button>
              )}
              <button type="button" className={btn} onClick={() => setI((i + 1) % total)} aria-label="Next frame">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="font-mono text-[11px] text-slate-500">
              {i + 1}/{total}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Elevator pitch + Live Tour + Video/Image how-to for one workbench (or the home page). */
export function GuideBanner({ guideId, variant = 'compact', modal = false }: { guideId: string; variant?: 'hero' | 'compact'; modal?: boolean }) {
  const guide = getGuide(guideId);
  const [tour, setTour] = useState(false);
  const [howto, setHowto] = useState<null | 'video' | 'images'>(null);
  const [collapsed, setCollapsed] = useState(false);
  const hero = variant === 'hero';

  return (
    <section
      data-tour="pitch"
      aria-label={`${guide.title} elevator pitch`}
      className={`rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white dark:border-blue-900/60 dark:from-blue-950/40 dark:to-slate-900 ${hero ? 'p-4 sm:p-5' : 'p-3 sm:p-4'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className={`${hero ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'} font-bold tracking-tight text-slate-900 dark:text-slate-100`}>
          {guide.headline}
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="rounded-md border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
        >
          {collapsed ? 'Expand guide' : 'Minimize'}
        </button>
      </div>
      {!collapsed && (
        <>
          <p className={`mt-1.5 max-w-3xl leading-relaxed text-slate-600 dark:text-slate-300 ${hero ? 'text-sm' : 'text-xs'}`}>{guide.pitch}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {guide.proof.map((p) => (
              <li key={p} className="rounded-full border border-blue-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300">
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={btn} onClick={() => setTour(true)}>
              <Compass className="h-3.5 w-3.5" /> Live tour
            </button>
            <button type="button" className={btn} onClick={() => setHowto('video')}>
              <Film className="h-3.5 w-3.5" /> Video how-to
            </button>
            <button type="button" className={btn} onClick={() => setHowto('images')}>
              <ImageIcon className="h-3.5 w-3.5" /> Image how-to
            </button>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">→ {guide.outputs.join(', ')}</span>
          </div>
        </>
      )}
      {tour && <LiveTour guide={guide} modal={modal} onClose={() => setTour(false)} />}
      {howto && <HowToPanel guide={guide} mode={howto} onClose={() => setHowto(null)} />}
    </section>
  );
}
