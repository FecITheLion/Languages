import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, Clapperboard, X } from 'lucide-react';
import {
  getGuidedHelpTour,
  type GuidedHelpContext,
  type GuidedHelpStep,
} from './guidedHelpContent';

interface GuidedHelpProps {
  context?: GuidedHelpContext | string;
  className?: string;
}

function shortLabel(text: string): string {
  return text.length > 23 ? `${text.slice(0, 20)}…` : text;
}

function TourIllustration({ step, index }: { step: GuidedHelpStep; index: number }) {
  const colors = ['#0f766e', '#4f46e5', '#c2410c'];
  const color = colors[index % colors.length];
  const positions = [42, 274, 506];
  const arrowId = `guided-help-arrow-${useId().replace(/:/g, '')}`;

  return (
    <svg
      aria-label={`How-to illustration: ${step.diagram.join(', then ')}`}
      className="h-auto w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
      role="img"
      viewBox="0 0 720 176"
    >
      <title>{`${step.title}: ${step.diagram.join(' → ')}`}</title>
      <desc>{step.description}</desc>
      <defs>
        <marker id={arrowId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="#94a3b8" />
        </marker>
      </defs>
      {positions.map((x, i) => (
        <g key={`${step.diagram[i]}-${i}`}>
          <rect
            x={x}
            y="53"
            width="172"
            height="70"
            rx="12"
            fill={i === 1 ? `${color}12` : '#f8fafc'}
            stroke={i === 1 ? color : '#cbd5e1'}
            strokeWidth={i === 1 ? '2' : '1.5'}
          />
          <circle cx={x + 19} cy="73" r="10" fill={i === 1 ? color : '#64748b'} />
          <text
            x={x + 19}
            y="77"
            fill="#fff"
            fontFamily="system-ui, sans-serif"
            fontSize="11"
            fontWeight="700"
            textAnchor="middle"
          >
            {i + 1}
          </text>
          <text
            x={x + 86}
            y="98"
            fill="#0f172a"
            fontFamily="system-ui, sans-serif"
            fontSize="13"
            fontWeight="650"
            textAnchor="middle"
          >
            {shortLabel(step.diagram[i])}
          </text>
          {i < 2 && (
            <path
              d={`M${x + 180} 88 H${x + 218}`}
              fill="none"
              markerEnd={`url(#${arrowId})`}
              stroke="#94a3b8"
              strokeWidth="2"
            />
          )}
        </g>
      ))}
      <text
        x="360"
        y="31"
        fill="#475569"
        fontFamily="system-ui, sans-serif"
        fontSize="12"
        fontWeight="600"
        textAnchor="middle"
      >
        {shortLabel(step.title)}
      </text>
      <text
        x="360"
        y="153"
        fill="#64748b"
        fontFamily="system-ui, sans-serif"
        fontSize="11"
        textAnchor="middle"
      >
        Follow the steps in order
      </text>
    </svg>
  );
}

function paintCanvas(
  canvas: HTMLCanvasElement,
  steps: GuidedHelpStep[],
  elapsed: number
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  const progress = Math.min(1, elapsed / 6);
  const active = Math.min(2, Math.floor(progress * 3));
  const colors = ['#0f766e', '#4f46e5', '#c2410c'];
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f8fafc');
  gradient.addColorStop(1, '#e2e8f0');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#0f172a';
  context.font = '600 23px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText('Guided how-to · ' + (steps[active]?.title ?? 'Studio'), width / 2, 48);

  const boxes = steps[active]?.diagram ?? ['Start', 'Work', 'Result'];
  const boxWidth = 210;
  const gap = 48;
  const total = boxWidth * 3 + gap * 2;
  const startX = (width - total) / 2;
  const boxY = 108;
  for (let i = 0; i < 3; i += 1) {
    const x = startX + i * (boxWidth + gap);
    context.fillStyle = i === 1 ? `${colors[active]}18` : '#fff';
    context.strokeStyle = i === 1 ? colors[active] : '#cbd5e1';
    context.lineWidth = i === 1 ? 4 : 2;
    context.beginPath();
    context.rect(x, boxY, boxWidth, 92);
    context.fill();
    context.stroke();
    context.fillStyle = '#334155';
    context.font = '600 17px system-ui, sans-serif';
    context.fillText(`${i + 1}. ${shortLabel(boxes[i])}`, x + boxWidth / 2, boxY + 53, boxWidth - 18);
    if (i < 2) {
      const arrowX = x + boxWidth + 8;
      context.strokeStyle = '#94a3b8';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(arrowX, boxY + 46);
      context.lineTo(arrowX + gap - 12, boxY + 46);
      context.lineTo(arrowX + gap - 22, boxY + 37);
      context.moveTo(arrowX + gap - 12, boxY + 46);
      context.lineTo(arrowX + gap - 22, boxY + 55);
      context.stroke();
    }
  }

  context.fillStyle = '#475569';
  context.font = '14px system-ui, sans-serif';
  context.fillText(steps[active]?.description ?? '', width / 2, 252, width - 80);
  context.fillStyle = '#cbd5e1';
  context.fillRect(100, 292, width - 200, 8);
  context.fillStyle = colors[active];
  context.fillRect(100, 292, (width - 200) * progress, 8);
}

export function GuidedHelp({ context = 'home', className = '' }: GuidedHelpProps) {
  const content = getGuidedHelpTour(context);
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [dialogPosition, setDialogPosition] = useState({ top: 16, left: 16 });
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const highlightedRef = useRef<HTMLElement | null>(null);
  const previousHighlightRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const animationRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const cancelledVideoRef = useRef(false);
  const videoFailedRef = useRef(false);
  const positionFrameRef = useRef<number | null>(null);
  const currentStep = content.steps[stepIndex];

  const stopVideo = (discard = false) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (recorderRef.current?.state === 'recording') {
      cancelledVideoRef.current = discard;
      recorderRef.current.stop();
    }
  };

  const closeTour = () => {
    stopVideo(true);
    setIsOpen(false);
  };

  useEffect(() => {
    stopVideo(true);
    setStepIndex(0);
    setIsOpen(false);
    setVideoStatus('');
    setVideoUrl(null);
  }, [context]);

  const positionDialogAwayFromTarget = () => {
    const panel = dialogRef.current;
    if (!panel) return;
    const margin = 16;
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = Math.min(panelRect.width, window.innerWidth - margin * 2);
    const panelHeight = Math.min(panelRect.height, window.innerHeight - margin * 2);
    const maxLeft = Math.max(margin, window.innerWidth - panelWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - panelHeight - margin);
    const targetRect = highlightedRef.current?.getBoundingClientRect();
    const positions = [
      { top: margin, left: margin },
      { top: margin, left: maxLeft },
      { top: maxTop, left: margin },
      { top: maxTop, left: maxLeft },
    ];

    if (targetRect) {
      const overlapArea = (position: { top: number; left: number }) => {
        const width = Math.max(0, Math.min(position.left + panelWidth, targetRect.right) - Math.max(position.left, targetRect.left));
        const height = Math.max(0, Math.min(position.top + panelHeight, targetRect.bottom) - Math.max(position.top, targetRect.top));
        return width * height;
      };
      positions.sort((a, b) => overlapArea(a) - overlapArea(b));
    }

    setDialogPosition(positions[0]);
  };

  useEffect(() => {
    if (!isOpen) return;
    const focusTarget = closeRef.current;
    focusTarget?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTour();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      launcherRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    const prior = highlightedRef.current;
    if (prior) {
      if (previousHighlightRef.current === null) prior.removeAttribute('data-tour-highlight');
      else prior.setAttribute('data-tour-highlight', previousHighlightRef.current);
    }
    highlightedRef.current = null;
    previousHighlightRef.current = null;
    if (!isOpen || !currentStep?.target) return;

    const visibleTargets = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-tour-id~="${currentStep.target}"]`)
    ).filter((element) => {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
    const target =
      visibleTargets.find((element) => element.getAttribute('data-tour-id') === currentStep.target) ??
      visibleTargets[0];
    if (!target) return;
    highlightedRef.current = target;
    previousHighlightRef.current = target.getAttribute('data-tour-highlight');
    target.setAttribute('data-tour-highlight', 'true');
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
    return () => {
      if (highlightedRef.current === target) {
        if (previousHighlightRef.current === null) target.removeAttribute('data-tour-highlight');
        else target.setAttribute('data-tour-highlight', previousHighlightRef.current);
        highlightedRef.current = null;
        previousHighlightRef.current = null;
      }
    };
  }, [isOpen, currentStep]);

  useEffect(() => {
    if (!isOpen) return;
    const schedulePosition = () => {
      if (positionFrameRef.current !== null) window.cancelAnimationFrame(positionFrameRef.current);
      positionFrameRef.current = window.requestAnimationFrame(() => {
        positionFrameRef.current = null;
        positionDialogAwayFromTarget();
      });
    };
    schedulePosition();
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    return () => {
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      if (positionFrameRef.current !== null) {
        window.cancelAnimationFrame(positionFrameRef.current);
        positionFrameRef.current = null;
      }
    };
  }, [isOpen, currentStep]);

  useEffect(
    () => () => {
      stopVideo(true);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl]
  );

  const moveTo = (nextIndex: number) => {
    setStepIndex(Math.max(0, Math.min(content.steps.length - 1, nextIndex)));
    setVideoStatus('');
  };

  const startTour = () => {
    setStepIndex(0);
    setVideoStatus('');
    setIsOpen(true);
  };

  const createVideo = () => {
    if (isRecording) return;
    if (
      typeof HTMLCanvasElement === 'undefined' ||
      typeof MediaRecorder === 'undefined' ||
      typeof HTMLCanvasElement.prototype.captureStream !== 'function'
    ) {
      setVideoStatus('This browser does not support local WebM recording. The illustrated steps above are still available.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 320;
    const chunks: BlobPart[] = [];
    let stream: MediaStream | null = null;

    try {
      if (!canvas.getContext('2d')) {
        setVideoStatus('This browser cannot draw the local video. The illustrated steps above are still available.');
        return;
      }
      stream = canvas.captureStream(12);
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
        (type) => MediaRecorder.isTypeSupported(type)
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      cancelledVideoRef.current = false;
      videoFailedRef.current = false;
      setIsRecording(true);
      setVideoStatus('Creating a silent tutorial clip locally in this browser…');
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        videoFailedRef.current = true;
        setIsRecording(false);
        setVideoStatus('The browser could not finish this local recording. The illustrated steps remain available.');
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        setIsRecording(false);
        recorderRef.current = null;
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        stream?.getTracks().forEach((track) => track.stop());
        if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
        if (chunks.length && !cancelledVideoRef.current && !videoFailedRef.current) {
          setVideoUrl(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })));
          setVideoStatus('Your silent WebM tutorial clip was created locally. Nothing was uploaded.');
        } else if (!cancelledVideoRef.current && !videoFailedRef.current) {
          setVideoStatus('No video frames were recorded. The illustrated steps remain available.');
        }
        cancelledVideoRef.current = false;
        videoFailedRef.current = false;
      };
      const startedAt = performance.now();
      const draw = (now: number) => {
        paintCanvas(canvas, content.steps, (now - startedAt) / 1000);
        if (now - startedAt < 6000) {
          animationRef.current = window.requestAnimationFrame(draw);
        }
      };
      animationRef.current = window.requestAnimationFrame(draw);
      recorder.start(250);
      timeoutRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 6400);
    } catch {
      setIsRecording(false);
      recorderRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      setVideoStatus('Local video recording is unavailable in this browser. The illustrated steps remain available.');
    }
  };

  return (
    <>
      <style>{`
        [data-tour-highlight="true"] {
          outline: 3px solid #0f766e !important;
          outline-offset: 3px !important;
          border-radius: 0.75rem;
          scroll-margin: 1rem;
          scroll-margin-block: 1rem;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-tour-highlight="true"] { scroll-behavior: auto !important; }
        }
      `}</style>
      <button
        ref={launcherRef}
        type="button"
        onClick={startTour}
        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-teal-400 dark:text-teal-200 dark:hover:bg-teal-950 ${className}`}
        aria-haspopup="dialog"
        aria-label={`Start guided tour: ${content.title}`}
      >
        <BookOpen aria-hidden="true" size={16} />
        <span>How to</span>
      </button>

      {isOpen && (
        <div
          className="pointer-events-none fixed inset-0 z-[100] bg-transparent"
        >
          <section
            ref={dialogRef}
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-description`}
            className="pointer-events-auto fixed w-[min(42rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-6"
            style={{
              top: dialogPosition.top,
              left: dialogPosition.left,
              maxHeight: 'calc(100dvh - 2rem)',
            }}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                  Guided tour · Step {stepIndex + 1} of {content.steps.length}
                </p>
                <h2 id={`${id}-title`} className="mt-1 text-xl font-bold">
                  {content.title}
                </h2>
                <p id={`${id}-description`} className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {content.summary}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={closeTour}
                aria-label="Close guided tour"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 dark:hover:bg-slate-800"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </header>

            <div className="mt-5" aria-live="polite">
              <h3 className="text-base font-semibold">{currentStep.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                {currentStep.description}
              </p>
              <div className="mt-4">
                <TourIllustration step={currentStep} index={stepIndex} />
              </div>
              {videoUrl && (
                <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <video
                    className="w-full rounded-lg bg-slate-950"
                    controls
                    playsInline
                    preload="metadata"
                    src={videoUrl}
                    aria-label={`Locally generated silent how-to video for ${content.title}`}
                    aria-describedby={`${id}-video-transcript`}
                  />
                  <ol id={`${id}-video-transcript`} className="sr-only">
                    {content.steps.map((videoStep) => (
                      <li key={videoStep.title}>
                        {videoStep.title}: {videoStep.description}
                      </li>
                    ))}
                  </ol>
                  <a
                    className="mt-2 inline-flex min-h-10 items-center rounded-md px-2 text-sm font-semibold text-teal-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 dark:text-teal-200"
                    href={videoUrl}
                    download={`${String(context).replace(/[^a-z0-9-]/gi, '-')}-how-to.webm`}
                  >
                    Download this local WebM
                  </a>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div
                className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                role="progressbar"
                aria-label="Guided tour progress"
                aria-valuemin={1}
                aria-valuemax={content.steps.length}
                aria-valuenow={stepIndex + 1}
                aria-valuetext={`Step ${stepIndex + 1} of ${content.steps.length}`}
              >
                <div
                  className="h-full rounded-full bg-teal-700 transition-[width] dark:bg-teal-400"
                  style={{ width: `${((stepIndex + 1) / content.steps.length) * 100}%` }}
                />
              </div>
              <button
                type="button"
                onClick={createVideo}
                disabled={isRecording}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 dark:border-slate-600 dark:hover:bg-slate-800"
                aria-label={isRecording ? 'Recording local silent WebM tutorial' : 'Create a local silent WebM tutorial video'}
              >
                <Clapperboard aria-hidden="true" size={16} />
                {isRecording ? 'Creating clip…' : videoUrl ? 'Re-create video' : 'Create video'}
              </button>
            </div>
            <p className="mt-2 min-h-5 text-xs text-slate-600 dark:text-slate-400" role="status" aria-live="polite">
              {videoStatus || 'Original illustrations are built in. Create video makes a short silent clip on this device; no prerecorded clips are bundled.'}
            </p>

            <footer className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-700">
              <button
                type="button"
                disabled={stepIndex === 0}
                onClick={() => moveTo(stepIndex - 1)}
                className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 dark:hover:bg-slate-800"
              >
                <ChevronLeft aria-hidden="true" size={17} />
                Previous
              </button>
              {stepIndex === content.steps.length - 1 ? (
                <button
                  type="button"
                  onClick={closeTour}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  <Check aria-hidden="true" size={16} />
                  Finish tour
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => moveTo(stepIndex + 1)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  Next
                  <ChevronRight aria-hidden="true" size={17} />
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
