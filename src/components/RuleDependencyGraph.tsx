import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  GitMerge,
  Lock,
  Play,
  PlusCircle,
  Undo2,
  Unlock,
} from 'lucide-react';
import type { RuleDependencyGraphData, RuleGraphNode, RuleMergeStrategy } from '../types/studio';

interface RuleDependencyGraphProps {
  graph: RuleDependencyGraphData;
  compact?: boolean;
  mergeStrategy?: RuleMergeStrategy;
  onMergeStrategyChange?: (strategy: RuleMergeStrategy) => void;
  onReorderRules?: (sourceName: string, targetName: string, position: 'before' | 'after') => void;
  onMergeRules?: (sourceName: string, targetName: string, strategy?: RuleMergeStrategy) => void;
  canUndo?: boolean;
  onUndo?: () => void;
  onSelectRuleForEval?: (ruleName: string) => void;
  onToggleRuleLock?: (ruleName: string) => void;
  onAutoStubMissingRules?: (missingNames: string[]) => void;
}

interface SvgDragState {
  sourceId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
}

type SvgDropIntent =
  | { targetId: string; kind: 'merge' }
  | { targetId: string; kind: 'before' | 'after' };

const NODE_W = 168;
const NODE_H = 60;
const COL_GAP = 72;
const ROW_GAP = 28;
const PAD_X = 28;
const PAD_Y = 38;

const MERGE_STRATEGIES: Array<{ id: RuleMergeStrategy; label: string }> = [
  { id: 'choice', label: 'Choice (|)' },
  { id: 'sequence', label: 'Sequence' },
  { id: 'inline', label: 'Inline' },
];

export function RuleDependencyGraph({
  graph,
  compact = false,
  mergeStrategy = 'choice',
  onMergeStrategyChange,
  onReorderRules,
  onMergeRules,
  canUndo = false,
  onUndo,
  onSelectRuleForEval,
  onToggleRuleLock,
  onAutoStubMissingRules,
}: RuleDependencyGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<SvgDragState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const canDragNodes = Boolean(onReorderRules || onMergeRules);

  const activeNode: RuleGraphNode | null = useMemo(() => {
    if (selectedNodeId) {
      const found = graph.nodes.find((n) => n.id === selectedNodeId);
      if (found) return found;
    }
    return graph.nodes[0] || null;
  }, [graph.nodes, selectedNodeId]);

  // Compute node coordinates by topological layer
  const layout = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const levelCounts = new Map<number, number>();
    let maxLevel = 0;

    for (const node of graph.nodes) {
      maxLevel = Math.max(maxLevel, node.level);
      levelCounts.set(node.level, (levelCounts.get(node.level) || 0) + 1);
    }

    const maxRows = Math.max(1, ...Array.from(levelCounts.values()));
    const svgWidth = Math.max(540, PAD_X * 2 + (maxLevel + 1) * NODE_W + maxLevel * COL_GAP);
    const svgHeight = Math.max(230, PAD_Y * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP);

    for (const node of graph.nodes) {
      const countInCol = levelCounts.get(node.level) || 1;
      const colHeight = countInCol * NODE_H + (countInCol - 1) * ROW_GAP;
      const startY = (svgHeight - colHeight) / 2;
      const x = PAD_X + node.level * (NODE_W + COL_GAP);
      const y = startY + node.orderInLevel * (NODE_H + ROW_GAP);
      positions.set(node.id, { x, y });
    }

    return { positions, svgWidth, svgHeight };
  }, [graph.nodes]);

  const toSvgCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * layout.svgWidth,
      y: ((clientY - rect.top) / rect.height) * layout.svgHeight,
    };
  };

  // Compute live drop intent during SVG drag
  const dropIntent: SvgDropIntent | null = useMemo(() => {
    if (!dragState || !dragState.isDragging) return null;
    const { currentX, currentY, sourceId } = dragState;

    for (const node of graph.nodes) {
      if (node.id === sourceId || node.isMissing) continue;
      const pos = layout.positions.get(node.id);
      if (!pos) continue;

      const withinX = currentX >= pos.x - 10 && currentX <= pos.x + NODE_W + 10;
      const withinY = currentY >= pos.y - 12 && currentY <= pos.y + NODE_H + 12;
      if (!withinX || !withinY) continue;

      const relY = (currentY - pos.y) / NODE_H;
      if (relY < 0.25 && onReorderRules) {
        return { targetId: node.id, kind: 'before' };
      }
      if (relY > 0.75 && onReorderRules) {
        return { targetId: node.id, kind: 'after' };
      }
      if (onMergeRules) {
        return { targetId: node.id, kind: 'merge' };
      }
      if (onReorderRules) {
        return { targetId: node.id, kind: relY < 0.5 ? 'before' : 'after' };
      }
    }
    return null;
  }, [dragState, graph.nodes, layout.positions, onMergeRules, onReorderRules]);

  const handleNodePointerDown = (e: React.PointerEvent<SVGGElement>, node: RuleGraphNode) => {
    if (e.button !== 0) return;
    if (!canDragNodes || node.isMissing) {
      setSelectedNodeId(node.id);
      return;
    }
    const coords = toSvgCoords(e.clientX, e.clientY);
    if (!coords) {
      setSelectedNodeId(node.id);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({
      sourceId: node.id,
      startX: coords.x,
      startY: coords.y,
      currentX: coords.x,
      currentY: coords.y,
      isDragging: false,
    });
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    const coords = toSvgCoords(e.clientX, e.clientY);
    if (!coords) return;
    const dist = Math.hypot(coords.x - dragState.startX, coords.y - dragState.startY);
    setDragState((prev) =>
      prev
        ? {
            ...prev,
            currentX: coords.x,
            currentY: coords.y,
            isDragging: prev.isDragging || dist > 6,
          }
        : null
    );
  };

  const handleSvgPointerUp = () => {
    if (!dragState) return;
    if (!dragState.isDragging) {
      setSelectedNodeId(dragState.sourceId);
      setDragState(null);
      return;
    }

    if (dropIntent) {
      if (dropIntent.kind === 'merge' && onMergeRules) {
        onMergeRules(dragState.sourceId, dropIntent.targetId, mergeStrategy);
        setSelectedNodeId(dropIntent.targetId);
      } else if ((dropIntent.kind === 'before' || dropIntent.kind === 'after') && onReorderRules) {
        onReorderRules(dragState.sourceId, dropIntent.targetId, dropIntent.kind);
        setSelectedNodeId(dragState.sourceId);
      }
    }
    setDragState(null);
  };

  const upstreamCallers = useMemo(() => {
    if (!activeNode) return [];
    return graph.edges.filter((e) => e.to === activeNode.id).map((e) => e.from);
  }, [graph.edges, activeNode]);

  const downstreamDeps = useMemo(() => {
    if (!activeNode) return [];
    return graph.edges.filter((e) => e.from === activeNode.id).map((e) => e.to);
  }, [graph.edges, activeNode]);

  if (graph.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        No grammar rules parsed yet. Add rules in the Live Mirror or load a dialect preset to render the dependency graph.
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Header summary strip (unboxed typographic metadata) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <GitBranch className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">Rule Dependency Graph</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{graph.nodes.length} nodes</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{graph.edges.length} edges</span>
          <span aria-hidden="true">·</span>
          {graph.errorCount === 0 && !graph.hasCycles ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Acyclic DAG · 0 errors
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {graph.errorCount} error{graph.errorCount === 1 ? '' : 's'}, {graph.warningCount} warning
              {graph.warningCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canUndo && onUndo && (
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </button>
          )}
          {graph.missingRules.length > 0 && onAutoStubMissingRules && (
            <button
              type="button"
              onClick={() => onAutoStubMissingRules(graph.missingRules)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Auto-Stub {graph.missingRules.length} Missing Rule{graph.missingRules.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>

      {/* Drag-and-Drop Reorder / Merge Strategy Controls */}
      {canDragNodes && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <GitMerge className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>
              Drag a rule node onto another node&apos;s <strong className="font-medium text-slate-800 dark:text-slate-200">center to merge</strong> or{' '}
              <strong className="font-medium text-slate-800 dark:text-slate-200">top/bottom edge to reorder</strong>.
            </span>
          </div>
          {onMergeStrategyChange && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Merge:</span>
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                {MERGE_STRATEGIES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onMergeStrategyChange(s.id)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      mergeStrategy === s.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Graph + Node Inspector Grid */}
      <div className={`grid grid-cols-1 gap-4 ${compact ? '' : 'lg:grid-cols-12'}`}>
        {/* Interactive SVG Directed Graph Canvas */}
        <div
          className={`${compact ? '' : 'lg:col-span-8'} overflow-auto rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-950`}
        >
          <svg
            ref={svgRef}
            width={layout.svgWidth}
            height={layout.svgHeight}
            viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerCancel={() => setDragState(null)}
            className="mx-auto block touch-none select-none"
            role="img"
            aria-label="Directed grammar rule dependency graph with drag-and-drop reorder and merge"
          >
            <defs>
              <marker id="arrow-normal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
              </marker>
              <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#2563eb" />
              </marker>
              <marker id="arrow-cycle" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706" />
              </marker>
              <marker id="arrow-missing" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#dc2626" />
              </marker>
            </defs>

            {/* Edges */}
            {graph.edges.map((edge) => {
              const fromPos = layout.positions.get(edge.from);
              const toPos = layout.positions.get(edge.to);
              if (!fromPos || !toPos) return null;

              const isHighlighted =
                activeNode && (edge.from === activeNode.id || edge.to === activeNode.id);

              let d: string;
              if (edge.from === edge.to) {
                const cx = fromPos.x + NODE_W / 2;
                const ty = fromPos.y;
                d = `M ${cx - 18} ${ty} C ${cx - 34} ${ty - 36}, ${cx + 34} ${ty - 36}, ${cx + 18} ${ty - 2}`;
              } else if (edge.isCycleEdge || toPos.x <= fromPos.x) {
                const x1 = fromPos.x + NODE_W / 2;
                const y1 = fromPos.y;
                const x2 = toPos.x + NODE_W / 2;
                const y2 = toPos.y;
                const arcY = Math.min(y1, y2) - 34;
                d = `M ${x1} ${y1} C ${x1} ${arcY}, ${x2} ${arcY}, ${x2} ${y2 - 2}`;
              } else {
                const x1 = fromPos.x + NODE_W;
                const y1 = fromPos.y + NODE_H / 2;
                const x2 = toPos.x - 2;
                const y2 = toPos.y + NODE_H / 2;
                const dx = Math.max(28, (x2 - x1) * 0.45);
                d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
              }

              const stroke = edge.isMissingTarget
                ? '#dc2626'
                : edge.isCycleEdge
                  ? '#d97706'
                  : isHighlighted
                    ? '#2563eb'
                    : '#94a3b8';

              const marker = edge.isMissingTarget
                ? 'url(#arrow-missing)'
                : edge.isCycleEdge
                  ? 'url(#arrow-cycle)'
                  : isHighlighted
                    ? 'url(#arrow-active)'
                    : 'url(#arrow-normal)';

              return (
                <path
                  key={edge.id}
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isHighlighted ? 2.2 : 1.5}
                  strokeDasharray={edge.isMissingTarget ? '5 4' : edge.isCycleEdge ? '4 3' : undefined}
                  markerEnd={marker}
                  opacity={activeNode && !isHighlighted && !edge.isCycleEdge && !edge.isMissingTarget ? 0.45 : 1}
                />
              );
            })}

            {/* Nodes */}
            {graph.nodes.map((node) => {
              const pos = layout.positions.get(node.id);
              if (!pos) return null;
              const isSelected = activeNode?.id === node.id;
              const isDragSource = dragState?.isDragging && dragState.sourceId === node.id;
              const isMergeTarget = dropIntent?.targetId === node.id && dropIntent.kind === 'merge';
              const isReorderBefore = dropIntent?.targetId === node.id && dropIntent.kind === 'before';
              const isReorderAfter = dropIntent?.targetId === node.id && dropIntent.kind === 'after';

              const strokeColor = isMergeTarget
                ? '#059669'
                : node.isMissing
                  ? '#dc2626'
                  : node.inCycle
                    ? '#d97706'
                    : isSelected
                      ? '#2563eb'
                      : node.isRoot
                        ? '#0f172a'
                        : '#cbd5e1';

              const fillClass = isMergeTarget
                ? 'fill-emerald-50 dark:fill-emerald-950/70'
                : node.isMissing
                  ? 'fill-red-50 dark:fill-red-950/60'
                  : node.inCycle
                    ? 'fill-amber-50 dark:fill-amber-950/50'
                    : isSelected
                      ? 'fill-blue-50 dark:fill-blue-950/60'
                      : 'fill-white dark:fill-slate-900';

              const roleLabel = node.isMissing
                ? 'missing'
                : node.inCycle
                  ? 'cycle'
                  : node.isUnreachable
                    ? 'unreachable'
                    : node.isRoot
                      ? 'entry'
                      : node.isLeaf
                        ? 'terminal'
                        : 'rule';

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onPointerDown={(e) => handleNodePointerDown(e, node)}
                  className={canDragNodes && !node.isMissing ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                  opacity={isDragSource ? 0.4 : 1}
                >
                  {/* Reorder top / bottom insertion indicator */}
                  {isReorderBefore && (
                    <g>
                      <line x1={-4} y1={-6} x2={NODE_W + 4} y2={-6} stroke="#2563eb" strokeWidth={3} strokeLinecap="round" />
                      <circle cx={-4} cy={-6} r={3.5} fill="#2563eb" />
                      <text x={NODE_W / 2} y={-11} textAnchor="middle" className="fill-blue-600 font-sans text-[10px] font-semibold">
                        Reorder before {node.name}
                      </text>
                    </g>
                  )}
                  {isReorderAfter && (
                    <g>
                      <line x1={-4} y1={NODE_H + 6} x2={NODE_W + 4} y2={NODE_H + 6} stroke="#2563eb" strokeWidth={3} strokeLinecap="round" />
                      <circle cx={-4} cy={NODE_H + 6} r={3.5} fill="#2563eb" />
                      <text x={NODE_W / 2} y={NODE_H + 19} textAnchor="middle" className="fill-blue-600 font-sans text-[10px] font-semibold">
                        Reorder after {node.name}
                      </text>
                    </g>
                  )}

                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    className={fillClass}
                    stroke={strokeColor}
                    strokeWidth={isMergeTarget ? 2.5 : isSelected ? 2 : 1.25}
                    strokeDasharray={isMergeTarget ? '5 3' : node.isMissing ? '4 3' : undefined}
                  />
                  <text
                    x={12}
                    y={24}
                    className="fill-slate-900 font-mono text-[12px] font-semibold dark:fill-slate-100"
                  >
                    {node.name.length > 18 ? `${node.name.slice(0, 17)}…` : node.name}
                  </text>
                  <text
                    x={12}
                    y={44}
                    className={
                      isMergeTarget
                        ? 'fill-emerald-700 font-sans text-[10px] font-semibold dark:fill-emerald-300'
                        : 'fill-slate-500 font-mono text-[10px] dark:fill-slate-400'
                    }
                  >
                    {isMergeTarget
                      ? `Drop to merge (${mergeStrategy})`
                      : `${roleLabel} · ${node.branchesCount} alt · in:${node.inDegree} out:${node.outDegree}`}
                  </text>
                </g>
              );
            })}

            {/* Live Drag Connector & Ghost Preview */}
            {dragState?.isDragging && (
              <g pointerEvents="none">
                {(() => {
                  const srcPos = layout.positions.get(dragState.sourceId);
                  if (!srcPos) return null;
                  return (
                    <line
                      x1={srcPos.x + NODE_W / 2}
                      y1={srcPos.y + NODE_H / 2}
                      x2={dragState.currentX}
                      y2={dragState.currentY}
                      stroke={dropIntent?.kind === 'merge' ? '#059669' : '#2563eb'}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                    />
                  );
                })()}
                <g transform={`translate(${dragState.currentX - NODE_W / 2}, ${dragState.currentY - NODE_H / 2})`}>
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={dropIntent?.kind === 'merge' ? '#ecfdf5' : '#eff6ff'}
                    stroke={dropIntent?.kind === 'merge' ? '#059669' : '#2563eb'}
                    strokeWidth={2}
                    opacity={0.92}
                  />
                  <text x={12} y={25} className="fill-slate-900 font-mono text-[12px] font-semibold">
                    {dragState.sourceId}
                  </text>
                  <text x={12} y={44} className="fill-slate-600 font-sans text-[10px] font-medium">
                    {dropIntent?.kind === 'merge'
                      ? `Merge → ${dropIntent.targetId} (${mergeStrategy})`
                      : dropIntent
                        ? `Move ${dropIntent.kind} ${dropIntent.targetId}`
                        : 'Drag onto a rule node'}
                  </text>
                </g>
              </g>
            )}
          </svg>
        </div>

        {/* Selected Node Inspector & Topological Order */}
        {!compact && activeNode && (
          <div className="flex flex-col gap-4 lg:col-span-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {activeNode.name}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {activeNode.isMissing
                      ? 'Undefined symbol reference'
                      : `Line ${activeNode.lineNumber} · Layer ${activeNode.level} · ${activeNode.branchesCount} branch${activeNode.branchesCount === 1 ? '' : 'es'}`}
                  </div>
                </div>
                {!activeNode.isMissing && onToggleRuleLock && (
                  <button
                    type="button"
                    onClick={() => onToggleRuleLock(activeNode.name)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {activeNode.isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    {activeNode.isLocked ? 'Locked' : 'Lock'}
                  </button>
                )}
              </div>

              <pre className="mt-3 overflow-auto rounded-lg bg-slate-950 p-2.5 font-mono text-[11px] text-slate-200">
                {activeNode.expression}
              </pre>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                <div>
                  <div className="font-medium text-slate-500 dark:text-slate-400">Called By ({upstreamCallers.length})</div>
                  <div className="mt-1 flex flex-wrap gap-1 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    {upstreamCallers.length === 0 ? (
                      <span className="text-slate-400">Entry / None</span>
                    ) : (
                      upstreamCallers.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setSelectedNodeId(c)}
                          className="underline decoration-slate-300 underline-offset-2 hover:text-blue-600"
                        >
                          {c}
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-slate-500 dark:text-slate-400">Depends On ({downstreamDeps.length})</div>
                  <div className="mt-1 flex flex-wrap gap-1 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    {downstreamDeps.length === 0 ? (
                      <span className="text-slate-400">Terminals only</span>
                    ) : (
                      downstreamDeps.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSelectedNodeId(d)}
                          className="underline decoration-slate-300 underline-offset-2 hover:text-blue-600"
                        >
                          {d}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {!activeNode.isMissing && onSelectRuleForEval && (
                <button
                  type="button"
                  onClick={() => onSelectRuleForEval(activeNode.name)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <Play className="h-3.5 w-3.5" />
                  Evaluate from &lt;{activeNode.name}&gt;
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                Topological Resolution Order
              </div>
              <div className="font-mono text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {graph.topologicalOrder.join(' → ')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grammar Diagnostics List */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2.5 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Grammar Diagnostics</span>
          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {graph.diagnostics.length} item{graph.diagnostics.length === 1 ? '' : 's'}
          </span>
        </div>

        {graph.diagnostics.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>All rules are well-formed, acyclic, and fully resolved with zero dangling references.</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {graph.diagnostics.map((diag) => (
              <div key={diag.id} className="flex items-start gap-2.5 py-2 text-xs">
                {diag.severity === 'error' ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    [{diag.code}]
                  </span>{' '}
                  <span className="text-slate-800 dark:text-slate-200">{diag.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
