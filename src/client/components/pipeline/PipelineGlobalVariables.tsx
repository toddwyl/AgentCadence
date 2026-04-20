import { useState, useEffect } from 'react';
import type { Pipeline } from '../../../domain/pipeline.js';
import { useAppStore } from '../../store/app-store';

const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function PipelineGlobalVariables({ pipeline }: { pipeline: Pipeline }) {
  const { updatePipeline, t } = useAppStore();
  const [rows, setRows] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }]);

  useEffect(() => {
    const gv = pipeline.globalVariables ?? {};
    const entries = Object.entries(gv);
    setRows(entries.length > 0 ? entries.map(([k, v]) => ({ key: k, value: v })) : [{ key: '', value: '' }]);
  }, [pipeline.id, pipeline.globalVariables]);

  const buildRecord = (list: { key: string; value: string }[]) => {
    const o: Record<string, string> = {};
    for (const r of list) {
      const k = r.key.trim();
      if (k && KEY_RE.test(k)) o[k] = r.value;
    }
    return o;
  };

  const save = (list: { key: string; value: string }[]) => {
    updatePipeline(pipeline.id, { globalVariables: buildRecord(list) });
  };

  return (
    <div className="glass-panel p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold theme-text-secondary text-balance">{t.editor.globalVariables}</h3>
        <p className="text-xs theme-text-muted mt-1 text-pretty">{t.editor.globalVariablesHint}</p>
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-start">
            <input
              className="input-field text-sm font-mono flex-1 min-w-0"
              placeholder={t.editor.variableKey}
              value={row.key}
              onChange={(e) => {
                const next = rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r));
                setRows(next);
              }}
            />
            <input
              className="input-field text-sm flex-[2] min-w-0"
              placeholder={t.editor.variableValue}
              value={row.value}
              onChange={(e) => {
                const next = rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r));
                setRows(next);
              }}
            />
            <button
              type="button"
              onClick={() => {
                const next = rows.filter((_, j) => j !== i);
                const list = next.length ? next : [{ key: '', value: '' }];
                setRows(list);
                save(list);
              }}
              className="btn-ghost text-xs px-2 py-1.5 shrink-0 text-red-400/70 hover:text-red-400"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => setRows([...rows, { key: '', value: '' }])} className="btn-ghost text-sm">
          {t.editor.addVariable}
        </button>
        <button
          type="button"
          onClick={() => {
            save(rows);
          }}
          className="btn-primary text-sm"
        >
          {t.editor.saveVariables}
        </button>
      </div>
    </div>
  );
}
