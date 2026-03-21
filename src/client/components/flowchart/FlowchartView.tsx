import { useMemo } from 'react';
import type { Pipeline, PipelineStage, PipelineStep, StepStatus } from '@shared/types';
import { safeToolMeta } from '@shared/types';
import { useAppStore } from '../../store/app-store';

const STEP_W = 180, STEP_H = 52;
const STEP_GAP_X = 24, STEP_GAP_Y = 16;
const STAGE_PAD = 16, STAGE_HEADER = 32;
const STAGE_GAP = 48;
const CHART_PAD = 32;

interface StageLayout {
  stage: PipelineStage;
  x: number;
  y: number;
  w: number;
  h: number;
  stepPositions: { step: PipelineStep; x: number; y: number }[];
}

function layoutStages(pipeline: Pipeline): { stages: StageLayout[]; totalW: number; totalH: number } {
  const layouts: StageLayout[] = [];
  let curX = CHART_PAD;
  let maxH = 0;

  for (const stage of pipeline.stages) {
    const isParallel = stage.executionMode === 'parallel';
    const stepCount = stage.steps.length;

    let stageContentW: number;
    let stageContentH: number;
    const stepPositions: { step: PipelineStep; x: number; y: number }[] = [];

    if (isParallel) {
      stageContentW = stepCount > 0 ? stepCount * STEP_W + (stepCount - 1) * STEP_GAP_X : STEP_W;
      stageContentH = STEP_H;
      stage.steps.forEach((step, i) => {
        stepPositions.push({
          step,
          x: STAGE_PAD + i * (STEP_W + STEP_GAP_X),
          y: STAGE_HEADER + STAGE_PAD,
        });
      });
    } else {
      stageContentW = STEP_W;
      stageContentH = stepCount > 0 ? stepCount * STEP_H + (stepCount - 1) * STEP_GAP_Y : STEP_H;
      stage.steps.forEach((step, i) => {
        stepPositions.push({
          step,
          x: STAGE_PAD,
          y: STAGE_HEADER + STAGE_PAD + i * (STEP_H + STEP_GAP_Y),
        });
      });
    }

    const stageW = stageContentW + STAGE_PAD * 2;
    const stageH = STAGE_HEADER + STAGE_PAD * 2 + stageContentH;

    layouts.push({
      stage,
      x: curX,
      y: CHART_PAD,
      w: stageW,
      h: stageH,
      stepPositions,
    });

    maxH = Math.max(maxH, stageH);
    curX += stageW + STAGE_GAP;
  }

  // vertically center stages
  for (const layout of layouts) {
    layout.y = CHART_PAD + (maxH - layout.h) / 2;
  }

  return {
    stages: layouts,
    totalW: curX - STAGE_GAP + CHART_PAD,
    totalH: maxH + CHART_PAD * 2,
  };
}

export function FlowchartView({ pipeline }: { pipeline: Pipeline }) {
  const { stepStatuses, selectStep, selectedStepID, theme, t } = useAppStore();
  const isLight = theme === 'light';

  const { stages, totalW, totalH } = useMemo(() => layoutStages(pipeline), [pipeline]);

  const stageBorderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
  const stageBg = isLight ? 'rgba(241,245,249,0.6)' : 'rgba(26,26,38,0.4)';
  const stageHeaderColor = isLight ? '#475569' : '#94a3b8';
  const arrowStroke = isLight ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.3)';
  const arrowFill = isLight ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.5)';
  const internalArrowStroke = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)';

  return (
    <div className="h-full overflow-auto p-6">
      <svg width={Math.max(totalW, 400)} height={Math.max(totalH, 300)} className="animate-fade-in">
        <defs>
          <marker id="arrow-stage" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={arrowFill} /></marker>
          <marker id="arrow-step" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0, 6 2.5, 0 5" fill={internalArrowStroke} /></marker>
        </defs>

        {/* Stage boxes */}
        {stages.map((layout) => (
          <g key={layout.stage.id} transform={`translate(${layout.x}, ${layout.y})`}>
            <rect width={layout.w} height={layout.h} rx={12} fill={stageBg} stroke={stageBorderColor} strokeWidth={1.5} />
            <text x={layout.w / 2} y={22} textAnchor="middle" fill={stageHeaderColor} fontSize={11} fontWeight={600}>
              {layout.stage.name}
              <tspan fontSize={9} fontWeight={400} fill={stageHeaderColor} opacity={0.6}>
                {' '}({layout.stage.executionMode === 'parallel' ? t.editor.parallel : t.editor.sequential})
              </tspan>
            </text>

            {/* Internal sequential arrows */}
            {layout.stage.executionMode === 'sequential' && layout.stepPositions.map((sp, i) => {
              if (i === 0) return null;
              const prev = layout.stepPositions[i - 1];
              const x = prev.x + STEP_W / 2;
              const y1 = prev.y + STEP_H;
              const y2 = sp.y;
              return <line key={`arr-${i}`} x1={x} y1={y1 + 2} x2={x} y2={y2 - 2} stroke={internalArrowStroke} strokeWidth={1.5} markerEnd="url(#arrow-step)" />;
            })}

            {/* Step nodes */}
            {layout.stepPositions.map((sp) => {
              const status = stepStatuses[sp.step.id] || sp.step.status;
              const meta = safeToolMeta(sp.step.tool);
              const selected = selectedStepID === sp.step.id;
              return (
                <g key={sp.step.id} transform={`translate(${sp.x}, ${sp.y})`} className="cursor-pointer" onClick={() => selectStep(sp.step.id)}>
                  <rect width={STEP_W} height={STEP_H} rx={8}
                    fill={isLight ? (selected ? 'rgba(99,102,241,0.08)' : '#ffffff') : (selected ? 'rgba(99,102,241,0.15)' : 'rgba(18,18,26,0.9)')}
                    stroke={selected ? 'rgba(99,102,241,0.5)' : statusBorderColor(status, isLight)}
                    strokeWidth={selected ? 2 : 1}
                    className={status === 'running' ? 'running-glow' : ''} />
                  <circle cx={12} cy={STEP_H / 2} r={4} fill={statusFill(status)} />
                  <rect x={STEP_W - 3} y={6} width={3} height={STEP_H - 12} rx={1.5} fill={meta.tintColor} opacity={0.6} />
                  <text x={24} y={20} fill={isLight ? '#1e293b' : '#e2e8f0'} fontSize={11} fontWeight={500}>
                    {sp.step.name.length > 18 ? sp.step.name.slice(0, 18) + '…' : sp.step.name}
                  </text>
                  <text x={24} y={38} fill={isLight ? '#64748b' : '#64748b'} fontSize={9}>
                    {meta.displayName}{sp.step.failureMode === 'skip' ? ' · skip' : sp.step.failureMode === 'retry' && sp.step.retryCount > 1 ? ` · ×${sp.step.retryCount}` : ''}
                  </text>
                </g>
              );
            })}
          </g>
        ))}

        {/* Stage-to-stage arrows */}
        {stages.map((layout, i) => {
          if (i === 0) return null;
          const prev = stages[i - 1];
          const x1 = prev.x + prev.w;
          const x2 = layout.x;
          const y = prev.y + prev.h / 2;
          const cy = layout.y + layout.h / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path key={`stage-arr-${i}`}
              d={`M ${x1 + 2} ${y} C ${midX} ${y}, ${midX} ${cy}, ${x2 - 2} ${cy}`}
              fill="none" stroke={arrowStroke} strokeWidth={2} markerEnd="url(#arrow-stage)" />
          );
        })}
      </svg>
    </div>
  );
}

function statusFill(s: StepStatus | string) {
  return ({ running: '#f59e0b', completed: '#10b981', failed: '#ef4444', skipped: '#6b7280' } as Record<string, string>)[s] || '#64748b';
}
function statusBorderColor(s: StepStatus | string, light: boolean) {
  const d: Record<string, string> = { running: 'rgba(245,158,11,0.4)', completed: 'rgba(16,185,129,0.3)', failed: 'rgba(239,68,68,0.4)' };
  return d[s] || (light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)');
}
