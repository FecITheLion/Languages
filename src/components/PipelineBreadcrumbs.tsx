import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Home,
  Server,
} from 'lucide-react';
import type { PipelineBreadcrumbsResult } from '../engine/pipelineBreadcrumbs';
import type { BreadcrumbItem, BreadcrumbSibling, PipelineStage, TopView, WorkflowSlug } from '../types/studio';

interface PipelineBreadcrumbsProps {
  breadcrumbs: PipelineBreadcrumbsResult;
  onNavigate: (target: {
    topView?: TopView;
    stageFilter?: 'all' | PipelineStage;
    page?: WorkflowSlug;
  }) => void;
  onOpenPipelineMcp: () => void;
  onExportJsonLd: (content: string, filename: string, mime: string) => void;
}

export function PipelineBreadcrumbs({
  breadcrumbs,
  onNavigate,
  onOpenPipelineMcp,
  onExportJsonLd,
}: PipelineBreadcrumbsProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showJsonLd, setShowJsonLd] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const jsonLdString = JSON.stringify(breadcrumbs.jsonLd, null, 2);

  // Sync W3C Schema.org BreadcrumbList structured data into document.head
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const scriptId = 'studio-breadcrumb-jsonld';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = scriptId;
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }
    scriptEl.textContent = jsonLdString;
  }, [jsonLdString]);

  // Dismiss sibling dropdown or JSON-LD popover on outside click or Escape
  useEffect(() => {
    if (!openMenuId && !showJsonLd) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
        setShowJsonLd(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuId(null);
        setShowJsonLd(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId, showJsonLd]);

  const handleCrumbClick = (item: BreadcrumbItem) => {
    setOpenMenuId(null);
    if (item.kind === 'root') {
      onNavigate({ topView: 'workbench', stageFilter: 'all' });
      return;
    }
    if (item.kind === 'view' && item.targetTopView) {
      onNavigate({
        topView: item.targetTopView,
        stageFilter: item.targetStage,
      });
      return;
    }
    if (item.kind === 'stage' && item.targetStage) {
      onNavigate({
        topView: 'workbench',
        stageFilter: item.targetStage,
      });
      return;
    }
    if (item.kind === 'step' && item.targetPage) {
      onNavigate({
        topView: 'workbench',
        page: item.targetPage,
      });
    }
  };

  const handleSiblingSelect = (sibling: BreadcrumbSibling) => {
    setOpenMenuId(null);
    onNavigate({
      topView: sibling.targetTopView,
      stageFilter: sibling.targetStage,
      page: sibling.targetPage,
    });
  };

  const handleCopyJsonLd = async () => {
    try {
      await navigator.clipboard.writeText(jsonLdString);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore restricted iframe clipboard error
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900"
    >
      {/* WAI-ARIA 1.2 Breadcrumb Landmark */}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-x-auto no-scrollbar sm:overflow-visible">
        <ol className="flex flex-nowrap items-center gap-1 text-xs sm:flex-wrap">
          {breadcrumbs.items.map((item, idx) => {
            const hasSiblings = Boolean(item.siblings && item.siblings.length > 1);
            const isMenuOpen = openMenuId === item.id;
            const isLast = idx === breadcrumbs.items.length - 1;

            return (
              <li key={item.id} className="relative flex items-center gap-1">
                {idx > 0 && (
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600"
                    aria-hidden="true"
                  />
                )}

                <div className="inline-flex items-center">
                  {isLast && !hasSiblings ? (
                    <span
                      aria-current="page"
                      className="max-w-[220px] truncate px-1.5 py-0.5 font-medium text-slate-900 dark:text-slate-100"
                    >
                      {item.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCrumbClick(item)}
                      aria-current={item.current ? 'page' : undefined}
                      className={`inline-flex max-w-[240px] items-center gap-1 truncate rounded px-1.5 py-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 ${
                        item.current
                          ? 'font-semibold text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800'
                          : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                      }`}
                    >
                      {item.kind === 'root' && (
                        <Home className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                      )}
                      <span className="truncate">{item.label}</span>
                    </button>
                  )}

                  {hasSiblings && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowJsonLd(false);
                        setOpenMenuId(isMenuOpen ? null : item.id);
                      }}
                      aria-expanded={isMenuOpen}
                      aria-haspopup="menu"
                      aria-label={`Switch ${item.kind}`}
                      className={`rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
                        isMenuOpen ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100' : ''
                      }`}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Sibling Navigation Menu */}
                {hasSiblings && isMenuOpen && item.siblings && (
                  <div
                    role="menu"
                    className="absolute top-full left-0 z-30 mt-1.5 min-w-[230px] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="px-2.5 py-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                      Jump to {item.kind}
                    </div>
                    {item.siblings.map((sib) => (
                      <button
                        key={sib.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleSiblingSelect(sib)}
                        className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                          sib.active
                            ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{sib.label}</span>
                        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums text-slate-400">
                          {sib.sublabel}
                          {sib.verified && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Right-aligned unboxed progress metrics & Schema.org / Pipeline MCP triggers */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        {breadcrumbs.activeFlow && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              Step {String(breadcrumbs.activeFlow.step).padStart(2, '0')}/{breadcrumbs.totalCount}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {breadcrumbs.verifiedCount}/{breadcrumbs.totalCount} verified ({breadcrumbs.completionPct}%)
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOpenMenuId(null);
              setShowJsonLd((prev) => !prev);
            }}
            aria-expanded={showJsonLd}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
              showJsonLd
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Code2 className="h-3 w-3" />
            BreadcrumbList
          </button>

          <button
            type="button"
            onClick={onOpenPipelineMcp}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-400 dark:hover:bg-blue-950/40"
          >
            <Server className="h-3 w-3" />
            /api/mcp/pipeline
          </button>
        </div>
      </div>

      {/* Schema.org BreadcrumbList JSON-LD Inspector Popover */}
      {showJsonLd && (
        <div className="absolute top-full right-4 z-30 mt-2 w-[min(92vw,480px)] rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Schema.org BreadcrumbList (JSON-LD)
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Live WAI-ARIA + W3C structured navigation synced to &lt;head&gt; &amp; /api/mcp/pipeline
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleCopyJsonLd()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() =>
                  onExportJsonLd(jsonLdString, 'pipeline.breadcrumbs.jsonld', 'application/ld+json')
                }
                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-3 w-3" />
                Export
              </button>
            </div>
          </div>
          <pre className="max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
            {jsonLdString}
          </pre>
        </div>
      )}
    </div>
  );
}
