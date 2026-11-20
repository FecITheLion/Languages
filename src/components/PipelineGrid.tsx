import { useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  Columns3,
  Copy,
  Download,
  GitMerge,
  GripVertical,
  Hammer,
  LayoutGrid,
  Maximize2,
  Play,
  Rows3,
  Scissors,
  Server,
} from 'lucide-react';
import { PAGE_TO_MCP_SERVER, type StageProgressSummary } from '../engine/pipelineBreadcrumbs';
import type { FinalCompilerBuild } from '../engine/pipelineCompilerEngine';
import {
  SUPPORTED_LANGUAGES,
  type DslFlowNode,
  type McpServerId,
  type PipelineGridMode,
  type PipelineStage,
  type PrimaryLanguage,
  type WorkflowSlug,
} from '../types/studio';

interface PipelineGridProps {
  flows: DslFlowNode[];
  stageSummaries: StageProgressSummary[];
  activePage: WorkflowSlug;
  currentFlow: DslFlowNode;
  verifiedSteps: WorkflowSlug[];
  stageFilter: 'all' | PipelineStage;
  layoutMode: PipelineGridMode;
  primaryLanguage: PrimaryLanguage;
  finalCompiler: FinalCompilerBuild;
  onPrimaryLanguageChange: (lang: PrimaryLanguage) => void;
  onBuildStep: (page: WorkflowSlug) => void;
  onBuildAllSteps: () => void;
  onExportFinalCompiler: () => void;
  onCopyFinalCompiler: () => void;
  onSelectPage: (page: WorkflowSlug) => void;
  onOpenModalForPage: (page: WorkflowSlug) => void;
  onStageFilterChange: (stage: 'all' | PipelineStage) => void;
  onLayoutModeChange: (mode: PipelineGridMode) => void;
  onStepOffset: (offset: number) => void;
  onReorderFlows: (sourceFlowId: string, targetFlowId: string, position: 'before' | 'after') => void;
  onMergeFlows?: (sourceFlowId: string, targetFlowId: string) => void;
  onSplitFlow?: (flowId: string, splitIndex?: number) => void;
  onOpenMcpServer: (serverId: McpServerId) => void;
}

const LAYOUT_MODES: Array<{ id: PipelineGridMode; label: string; icon: typeof LayoutGrid }> = [
  { id: 'compact', label: 'Grid', icon: LayoutGrid },
  { id: 'lanes', label: 'Stage Lanes', icon: Columns3 },
  { id: 'rail', label: 'Rail', icon: Rows3 },
];

export function PipelineGrid({
  flows,
  stageSummaries,
  activePage,
  currentFlow,
  verifiedSteps,
  stageFilter,
  layoutMode,
  primaryLanguage,
  finalCompiler,
  onPrimaryLanguageChange,
  onBuildStep,
  onBuildAllSteps,
  onExportFinalCompiler,
  onCopyFinalCompiler,
  onSelectPage,
  onOpenModalForPage,
  onStageFilterChange,
  onLayoutModeChange,
  onStepOffset,
  onReorderFlows,
  onMergeFlows,
  onSplitFlow,
  onOpenMcpServer,
}: PipelineGridProps) {
  const [draggedFlowId, setDraggedFlowId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(
    null
  );
  const [showCompilerPreview, setShowCompilerPreview] = useState(false);
  const railScrollRef = useRef<HTMLDivElement | null>(null);

  const visibleFlows =
    stageFilter === 'all' ? flows : flows.filter((f) => f.stage === stageFilter);
  const verifiedSet = new Set(verifiedSteps);
  const passByFlowId = new Map(finalCompiler.passes.map((p) => [p.flowId, p]));
  const activeMcpServer = PAGE_TO_MCP_SERVER[activePage] || 'pipeline';
  const completionPct =
    flows.length > 0 ? Math.round((verifiedSteps.length / flows.length) * 100) : 0;

  const handleDragStart = (e: React.DragEvent, flowId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', flowId);
    setDraggedFlowId(flowId);
  };

  const handleDragOver = (e: React.DragEvent, flowId: string, vertical = false) => {
    e.preventDefault();
    if (!draggedFlowId || draggedFlowId === flowId) {
      if (dropTarget) setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const position: 'before' | 'after' = vertical
      ? e.clientY - rect.top < rect.height / 2
        ? 'before'
        : 'after'
      : e.clientX - rect.left < rect.width / 2
        ? 'before'
        : 'after';
    if (!dropTarget || dropTarget.id !== flowId || dropTarget.position !== position) {
      setDropTarget({ id: flowId, position });
    }
  };

  const handleDrop = (e: React.DragEvent, targetFlowId: string) => {
    e.preventDefault();
    const sourceId = draggedFlowId || e.dataTransfer.getData('text/plain');
    const pos = dropTarget?.id === targetFlowId ? dropTarget.position : 'before';
    setDraggedFlowId(null);
    setDropTarget(null);
    if (sourceId && sourceId !== targetFlowId) {
      onReorderFlows(sourceId, targetFlowId, pos);
    }
  };

  const clearDrag = () => {
    setDraggedFlowId(null);
    setDropTarget(null);
  };

  return (
    <section
      aria-label="Compiler Pipeline Grid"
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Row 1: Header + Build & Export Controls + Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              data-tour-id="home.pipeline"
              className="text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
              Compiler Pipeline Grid
            </h1>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              ·
            </span>
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {verifiedSteps.length}/{flows.length} built ({completionPct}%)
            </span>
            <span aria-hidden="true" className="hidden text-slate-300 sm:inline dark:text-slate-700">
              ·
            </span>
            <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">
              Next: <code className="font-mono text-slate-700 dark:text-slate-300">{currentFlow.next}</code>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Layout Mode Segmented Control */}
          <div
            className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950"
            role="group"
            aria-label="Pipeline Grid layout mode"
          >
            {LAYOUT_MODES.map((m) => {
              const Icon = m.icon;
              const isSelected = layoutMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onLayoutModeChange(m.id)}
                  className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => onStepOffset(-1)}
              aria-label="Previous pipeline step"
              className="inline-flex min-h-[36px] items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:min-h-0 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Prev</span>
            </button>
            <button
              type="button"
              onClick={() => onStepOffset(1)}
              aria-label="Next pipeline step"
              className="inline-flex min-h-[36px] items-center gap-1 border-l border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:min-h-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="hidden lg:inline">Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onOpenModalForPage(activePage)}
            className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Modal
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${
            finalCompiler.isComplete ? 'bg-emerald-500' : 'bg-blue-600 dark:bg-blue-500'
          }`}
          style={{ width: `${completionPct}%` }}
        />
      </div>

      {/* Temporary Drop Option Places for Biject/Split & Merge while dragging a Pipeline Step */}
      {draggedFlowId && (onSplitFlow || onMergeFlows) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-violet-400 bg-violet-50/70 px-3 py-2 text-xs dark:border-violet-600 dark:bg-violet-950/35">
          <span className="font-medium text-violet-800 dark:text-violet-200">
            Dragging <code className="font-mono">{draggedFlowId}</code> — Drop Options:
          </span>
          {onSplitFlow && (
            <>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const src = draggedFlowId || e.dataTransfer.getData('text/plain');
                  clearDrag();
                  if (src) onSplitFlow(src, 1);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-violet-500 bg-white px-2.5 py-1 font-medium text-violet-700 dark:bg-slate-900 dark:text-violet-300"
              >
                <Scissors className="h-3 w-3" />
                Biject Split (Pre + Post)
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const src = draggedFlowId || e.dataTransfer.getData('text/plain');
                  clearDrag();
                  if (src) onSplitFlow(src, 2);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-violet-500 bg-white px-2.5 py-1 font-medium text-violet-700 dark:bg-slate-900 dark:text-violet-300"
              >
                <Scissors className="h-3 w-3" />
                Split Parallel Branch
              </div>
            </>
          )}
          {onMergeFlows &&
            visibleFlows
              .filter((f) => f.id !== draggedFlowId)
              .slice(0, 3)
              .map((tgt) => (
                <div
                  key={`merge-${tgt.id}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const src = draggedFlowId || e.dataTransfer.getData('text/plain');
                    clearDrag();
                    if (src && src !== tgt.id) onMergeFlows(src, tgt.id);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-emerald-500 bg-white px-2.5 py-1 font-medium text-emerald-700 dark:bg-slate-900 dark:text-emerald-300"
                >
                  <GitMerge className="h-3 w-3" />
                  Merge into {tgt.label.replace(/^\d+\.\s*/, '')}
                </div>
              ))}
        </div>
      )}

      {/* Row 2: Stage Filter Strip + Active MCP Endpoint */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800/80">
        <div
          data-tour-id="home.navigation"
          className="no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950"
          role="group"
          aria-label="Filter pipeline by compiler stage"
        >
          <button
            type="button"
            onClick={() => onStageFilterChange('all')}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              stageFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            All <span className="font-mono tabular-nums opacity-70">({flows.length})</span>
          </button>
          {stageSummaries.map((st) => {
            const isSelected = stageFilter === st.stage;
            const isActiveStage = st.containsActive;
            return (
              <button
                key={st.stage}
                type="button"
                onClick={() => onStageFilterChange(st.stage)}
                data-tour-id={st.stage === 'storage' ? 'workbench.schema.export' : undefined}
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : isActiveStage
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-700'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {isActiveStage && (
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                )}
                {st.shortLabel}{' '}
                <span className="font-mono tabular-nums opacity-70">
                  {st.verifiedSteps}/{st.totalSteps}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => onOpenMcpServer(activeMcpServer)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] font-medium text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
          >
            <Server className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>MCP: /api/mcp/{activeMcpServer}</span>
          </button>
        </div>
      </div>

      {/* MODE 1: COMPACT 2-COLUMN GRID */}
      {layoutMode === 'compact' && (
        <div role="list" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleFlows.map((flow) => {
            const isActive = flow.page === activePage;
            const isBuilt = verifiedSet.has(flow.page);
            const pass = passByFlowId.get(flow.id);
            const isDragging = draggedFlowId === flow.id;
            const dropPos = dropTarget?.id === flow.id ? dropTarget.position : null;
            const stepNum = String(flow.step).padStart(2, '0');
            const shortTitle = flow.label.replace(/^\d+\.\s*/, '');

            return (
              <div
                key={flow.id}
                role="listitem"
                draggable
                onDragStart={(e) => handleDragStart(e, flow.id)}
                onDragOver={(e) => handleDragOver(e, flow.id, false)}
                onDrop={(e) => handleDrop(e, flow.id)}
                onDragEnd={clearDrag}
                className={`group relative flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                  isDragging
                    ? 'opacity-40'
                    : isActive
                      ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600/20 dark:border-blue-500 dark:bg-blue-950/35 dark:ring-blue-500/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/50'
                }`}
              >
                {dropPos === 'before' && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1 bottom-1 left-0 w-0.5 rounded-full bg-blue-600"
                  />
                )}
                {dropPos === 'after' && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1 right-0 bottom-1 w-0.5 rounded-full bg-blue-600"
                  />
                )}

                <span
                  title="Drag to reorder pipeline step"
                  className="shrink-0 cursor-grab text-slate-300 transition-colors group-hover:text-slate-500 active:cursor-grabbing dark:text-slate-700 dark:group-hover:text-slate-400"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>

                <button
                  type="button"
                  onClick={() => onSelectPage(flow.page)}
                  aria-current={isActive ? 'step' : undefined}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                      <span className="mr-1.5 font-mono tabular-nums text-slate-400 dark:text-slate-500">
                        {stepNum}
                      </span>
                      {shortTitle}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                        isBuilt
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {pass?.artifactTag || flow.stage}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {pass
                      ? `${pass.consumesArtifact ? `${pass.consumesArtifact} → ` : ''}${pass.passName} · ${pass.summary}`
                      : `${flow.stage} · ${flow.lang}`}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onBuildStep(flow.page)}
                  title={isBuilt ? `Rebuild ${shortTitle} pass` : `Build ${shortTitle} pass into final compiler`}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    isBuilt
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                  }`}
                >
                  {isBuilt ? <CheckCircle2 className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  <span>{isBuilt ? 'Built' : 'Build'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenModalForPage(flow.page)}
                  title={`Open ${shortTitle} in Modal Workbench`}
                  aria-label={`Open ${shortTitle} in Modal Workbench`}
                  className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* MODE 2: STAGE LANES (max 2 columns side-by-side) */}
      {layoutMode === 'lanes' && (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {stageSummaries
            .filter((s) => stageFilter === 'all' || s.stage === stageFilter)
            .map((stage) => (
              <div
                key={stage.stage}
                className={`flex flex-col rounded-lg border p-3 ${
                  stage.containsActive
                    ? 'border-blue-300 bg-blue-50/25 dark:border-blue-800 dark:bg-blue-950/20'
                    : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onStageFilterChange(stageFilter === stage.stage ? 'all' : stage.stage)
                    }
                    className="truncate text-left text-xs font-semibold text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
                  >
                    {stage.order}. {stage.shortLabel}
                  </button>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    {stage.verifiedSteps}/{stage.totalSteps}
                  </span>
                </div>

                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all dark:bg-blue-500"
                    style={{ width: `${stage.completionPct}%` }}
                  />
                </div>

                <div className="mt-2.5 flex flex-1 flex-col gap-1.5" role="list">
                  {stage.steps.map((step) => {
                    const isDragging = draggedFlowId === step.id;
                    const dropPos = dropTarget?.id === step.id ? dropTarget.position : null;
                    const shortTitle = step.label.replace(/^\d+\.\s*/, '');
                    const pass = passByFlowId.get(step.id);

                    return (
                      <div
                        key={step.id}
                        role="listitem"
                        draggable
                        onDragStart={(e) => handleDragStart(e, step.id)}
                        onDragOver={(e) => handleDragOver(e, step.id, true)}
                        onDrop={(e) => handleDrop(e, step.id)}
                        onDragEnd={clearDrag}
                        className={`relative flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors ${
                          isDragging
                            ? 'opacity-40'
                            : step.active
                              ? 'border-blue-600 bg-white text-slate-900 shadow-2xs dark:border-blue-500 dark:bg-slate-900 dark:text-slate-100'
                              : 'border-slate-200/80 bg-white/90 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        {dropPos === 'before' && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute top-0 right-1 left-1 h-0.5 rounded-full bg-blue-600"
                          />
                        )}
                        {dropPos === 'after' && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute right-1 bottom-0 left-1 h-0.5 rounded-full bg-blue-600"
                          />
                        )}
                        <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-slate-300 dark:text-slate-600" />
                        <button
                          type="button"
                          onClick={() => onSelectPage(step.page)}
                          aria-current={step.active ? 'step' : undefined}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate text-xs font-medium">
                            <span className="mr-1 font-mono text-[11px] tabular-nums text-slate-400">
                              {String(step.step).padStart(2, '0')}
                            </span>
                            {shortTitle}
                          </div>
                          {pass && (
                            <div className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                              {pass.summary}
                            </div>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onBuildStep(step.page)}
                          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                            step.verified
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300'
                          }`}
                        >
                          {step.verified ? '✓' : 'Build'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* MODE 3: HORIZONTAL RAIL (subtle edge fades + < / > scroll controls, no heavy scrollbar) */}
      {layoutMode === 'rail' && (
        <div className="relative mt-3 flex items-center gap-1">
          <button
            type="button"
            aria-label="Scroll pipeline rail left"
            onClick={() => railScrollRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
            className="inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white to-transparent dark:from-slate-900"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white to-transparent dark:from-slate-900"
            />
            <div
              ref={railScrollRef}
              role="list"
              className="no-scrollbar flex items-center gap-1.5 overflow-x-auto scroll-smooth px-2 py-0.5"
            >
              {visibleFlows.map((flow) => {
                const isActive = flow.page === activePage;
                const isVerified = verifiedSet.has(flow.page);
                const shortTitle = flow.label.replace(/^\d+\.\s*/, '');

                return (
                  <button
                    key={flow.id}
                    role="listitem"
                    type="button"
                    onClick={() => onSelectPage(flow.page)}
                    aria-current={isActive ? 'step' : undefined}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isActive ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {String(flow.step).padStart(2, '0')}
                    </span>
                    <span>{shortTitle}</span>
                    {isVerified && (
                      <CheckCircle2
                        className={`h-3.5 w-3.5 ${
                          isActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            aria-label="Scroll pipeline rail right"
            onClick={() => railScrollRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            className="inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Row 3: Final Compiler Builder & Target-Language Exporter */}
      <div className="mt-3 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Hammer className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Final Compiler Output
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                finalCompiler.isComplete
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`}
            >
              {finalCompiler.builtCount}/{finalCompiler.totalCount} passes
            </span>
            <code className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
              {finalCompiler.filename}
            </code>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              title="Controlled by the global Target Language selector in the top navbar"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <span className="text-[10px] uppercase tracking-wide text-slate-400">Target</span>
              <span>
                {SUPPORTED_LANGUAGES.find((l) => l.id === primaryLanguage)?.label || finalCompiler.languageLabel}
              </span>
            </span>

            <button
              type="button"
              onClick={onBuildAllSteps}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
            >
              <Play className="h-3.5 w-3.5" />
              Build All Steps
            </button>

            <button
              type="button"
              onClick={() => setShowCompilerPreview((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Code2 className="h-3.5 w-3.5" />
              {showCompilerPreview ? 'Hide Code' : 'Inspect'}
            </button>

            <button
              type="button"
              onClick={onCopyFinalCompiler}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </button>

            <button
              type="button"
              onClick={onExportFinalCompiler}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" />
              Export {finalCompiler.languageLabel}
            </button>
          </div>
        </div>

        {showCompilerPreview && (
          <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100 dark:border-slate-800">
            {finalCompiler.content}
          </pre>
        )}
      </div>
    </section>
  );
}
