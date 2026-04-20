import type { Pipeline } from '../../../domain/pipeline.js';
import { PipelineGlobalVariables } from './PipelineGlobalVariables';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { ModalCloseButton } from '../ui/ModalCloseButton';

export function PipelineSettingsPanel({ pipeline, onClose }: { pipeline: Pipeline; onClose: () => void }) {
  useEscapeToClose(onClose);

  return (
    <div className="w-[480px] flex flex-col animate-slide-in theme-bg-1" style={{ borderLeft: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h3 className="text-base font-semibold theme-text text-balance">Pipeline Settings</h3>
        <ModalCloseButton onClick={onClose} label="Close pipeline settings" />
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <PipelineGlobalVariables pipeline={pipeline} />
      </div>
    </div>
  );
}
