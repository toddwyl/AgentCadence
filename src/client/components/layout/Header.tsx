import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { api } from '../../lib/api';
import { pickWorkingDirectory } from '../../lib/pick-folder';

export function Header() {
  const {
    selectedPipeline, isExecuting, executingPipelineID,
    showFlowchart, toggleFlowchart,
    runPipeline, stopPipeline, updatePipeline, t,
  } = useAppStore();

  const pipeline = selectedPipeline();
  const [wd, setWd] = useState('');

  useEffect(() => {
    if (pipeline) setWd(pipeline.workingDirectory ?? '');
  }, [pipeline?.id, pipeline?.workingDirectory]);

  if (!pipeline) return <div className="h-14 theme-header" />;

  const isRunning = isExecuting && executingPipelineID === pipeline.id;

  const handleExportMd = async () => {
    try {
      const { markdown } = await api.exportPipelineMd(pipeline.id);
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pipeline.name}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const persistWd = async () => {
    if (wd.trim() && wd !== pipeline.workingDirectory) {
      await updatePipeline(pipeline.id, { workingDirectory: wd.trim() });
    }
  };

  const handleBrowseWd = async () => {
    const p = await pickWorkingDirectory();
    if (p) {
      setWd(p);
      await updatePipeline(pipeline.id, { workingDirectory: p });
    }
  };

  return (
    <header className="h-14 px-6 flex items-center justify-between theme-header backdrop-blur-sm">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold theme-text">{pipeline.name}</h2>
          <div className="flex items-center gap-2 mt-1 max-w-[min(100%,480px)]">
            <span className="text-[10px] theme-text-muted shrink-0">{t.header.workingDirLabel}</span>
            <input
              className="input-field text-[10px] font-mono py-1 px-2 flex-1 min-w-0"
              value={wd}
              onChange={(e) => setWd(e.target.value)}
              onBlur={persistWd}
              disabled={isRunning}
            />
            <button
              type="button"
              onClick={handleBrowseWd}
              disabled={isRunning}
              className="btn-ghost text-[10px] py-1 px-2 shrink-0"
            >
              {t.header.browseFolder}
            </button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button onClick={toggleFlowchart}
          className={`btn-ghost text-xs flex items-center gap-1.5 ${showFlowchart ? 'text-accent-glow theme-active-bg' : ''}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
          {t.header.flowchart}
        </button>
        <button onClick={handleExportMd} className="btn-ghost text-xs flex items-center gap-1.5" title={t.header.saveMd}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          {t.header.saveMd}
        </button>
        {isRunning ? (
          <button onClick={() => stopPipeline(pipeline.id)} className="btn-danger text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
            {t.header.stop}
          </button>
        ) : (
          <button onClick={() => runPipeline(pipeline.id)} disabled={pipeline.stages.length === 0}
            className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>
            {t.header.run}
          </button>
        )}
      </div>
    </header>
  );
}
