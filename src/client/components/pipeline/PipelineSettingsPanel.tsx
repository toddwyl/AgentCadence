import type { Pipeline } from '@shared/types';
import { PipelineGlobalVariables } from './PipelineGlobalVariables';

export function PipelineSettingsPanel({ pipeline, onClose }: { pipeline: Pipeline; onClose: () => void }) {
  return (
    <div className="w-[480px] flex flex-col animate-slide-in theme-bg-1" style={{ borderLeft: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h3 className="text-sm font-semibold theme-text">Pipeline Settings</h3>
        <button onClick={onClose} className="btn-ghost text-xs">Close</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <PipelineGlobalVariables pipeline={pipeline} />
      </div>
    </div>
  );
}
