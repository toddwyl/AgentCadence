import { useRef, useLayoutEffect, useState, useEffect } from 'react';
import type { IDisposable } from 'ghostty-web';
import { Ghostty, Terminal as GhosttyWebTerminal, FitAddon } from 'ghostty-web';
import ghosttyWasmUrl from 'ghostty-web/ghostty-vt.wasm?url';
import { getExecutionGhosttyOptions } from '../../lib/ghosttyTerminalOptions';
import { useAppStore } from '../../store/app-store';

interface TerminalPaneProps {
  /** Raw terminal data (may include ANSI escape codes) */
  output: string | null;
  noOutputText: string;
  isLive?: boolean;
  /** When false, parent renders the review banner (e.g. above activity + raw tabs). */
  suppressReviewBanner?: boolean;
  pendingReview: {
    pipelineId: string;
    stepId: string;
    workingDirectory: string;
    changedFiles: string[];
  } | null;
  respondToReview: (action: 'accept' | 'reject') => void;
}

export function TerminalPane({
  output,
  noOutputText,
  isLive,
  suppressReviewBanner,
  pendingReview,
  respondToReview,
}: TerminalPaneProps) {
  const setTerminalPtySize = useAppStore((s) => s.setTerminalPtySize);
  const t = useAppStore((s) => s.t);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<GhosttyWebTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const writtenLenRef = useRef(0);
  const outputRef = useRef(output);
  outputRef.current = output;
  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;

  /** OpenChamber-style: only auto-scroll when user is at bottom and not selecting text */
  const followOutputRef = useRef(true);
  const restoreScrollPatchRef = useRef<(() => void) | null>(null);
  const terminalEventDisposablesRef = useRef<IDisposable[]>([]);
  const stickUiRafRef = useRef<number | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  /** Batched writes: timeout(0) yields sooner than rAF so live PTY chunks paint without waiting a frame. */
  const pendingWriteRef = useRef('');
  const writeScheduledRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWritingRef = useRef(false);
  const enqueueWriteRef = useRef<(data: string) => void>(() => {});
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    const scheduleStickUiSync = () => {
      if (typeof window === 'undefined') return;
      if (stickUiRafRef.current !== null) return;
      stickUiRafRef.current = window.requestAnimationFrame(() => {
        stickUiRafRef.current = null;
        setStickToBottom(followOutputRef.current);
      });
    };

    const resetWriteState = () => {
      pendingWriteRef.current = '';
      if (writeScheduledRef.current !== null) {
        clearTimeout(writeScheduledRef.current);
      }
      writeScheduledRef.current = null;
      isWritingRef.current = false;
    };

    const flushWrites = () => {
      if (disposed) return;
      if (isWritingRef.current) return;
      const term = termRef.current;
      if (!term) {
        resetWriteState();
        return;
      }
      const chunk = pendingWriteRef.current;
      if (!chunk) return;
      pendingWriteRef.current = '';
      isWritingRef.current = true;
      term.write(chunk, () => {
        isWritingRef.current = false;
        if (isLiveRef.current) {
          term.scrollToBottom();
        }
        if (pendingWriteRef.current && !disposed && typeof window !== 'undefined') {
          writeScheduledRef.current = window.setTimeout(() => {
            writeScheduledRef.current = null;
            flushWrites();
          }, 0);
        }
      });
    };

    const scheduleFlushWrites = () => {
      if (writeScheduledRef.current !== null) return;
      if (typeof window === 'undefined') {
        flushWrites();
        return;
      }
      writeScheduledRef.current = window.setTimeout(() => {
        writeScheduledRef.current = null;
        flushWrites();
      }, 0);
    };

    const enqueueWrite = (data: string) => {
      if (!data) return;
      pendingWriteRef.current += data;
      scheduleFlushWrites();
    };

    void (async () => {
      let ghostty: Ghostty;
      try {
        ghostty = await Ghostty.load(ghosttyWasmUrl);
      } catch {
        return;
      }
      if (disposed || !containerRef.current) return;

      const term = new GhosttyWebTerminal(getExecutionGhosttyOptions(ghostty));
      if (disposed) {
        term.dispose();
        return;
      }
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);
      if (disposed) {
        term.dispose();
        return;
      }

      followOutputRef.current = true;
      setStickToBottom(true);

      const termWithScroll = term as GhosttyWebTerminal & { scrollToBottom?: () => void };
      if (typeof termWithScroll.scrollToBottom === 'function') {
        const originalScrollToBottom = termWithScroll.scrollToBottom.bind(term);
        termWithScroll.scrollToBottom = () => {
          if (followOutputRef.current) {
            originalScrollToBottom();
          }
        };
        restoreScrollPatchRef.current = () => {
          termWithScroll.scrollToBottom = originalScrollToBottom;
        };
      }

      terminalEventDisposablesRef.current = [
        term.onScroll((viewportY: number) => {
          if (typeof viewportY === 'number' && Number.isFinite(viewportY)) {
            const hasSelection = typeof term.hasSelection === 'function' && term.hasSelection();
            followOutputRef.current = !hasSelection && viewportY <= 0.5;
            scheduleStickUiSync();
          }
        }),
        term.onSelectionChange(() => {
          const hasSelection = typeof term.hasSelection === 'function' && term.hasSelection();
          if (hasSelection) {
            followOutputRef.current = false;
            scheduleStickUiSync();
            return;
          }
          const viewportY = typeof term.getViewportY === 'function' ? term.getViewportY() : 0;
          followOutputRef.current = viewportY <= 0.5;
          scheduleStickUiSync();
        }),
      ];

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      enqueueWriteRef.current = enqueueWrite;
      writtenLenRef.current = 0;

      const reportSize = () => {
        try {
          fitAddon.fit();
          setTerminalPtySize({ cols: term.cols, rows: term.rows });
        } catch {
          /* ignore */
        }
      };

      const o = outputRef.current;
      if (o != null && o.length > 0) {
        writtenLenRef.current = o.length;
        enqueueWrite(o);
      }

      reportSize();

      const fitWithObserve = fitAddon as FitAddon & { observeResize?: () => void };
      if (typeof fitWithObserve.observeResize === 'function') {
        fitWithObserve.observeResize();
      }

      const ro = new ResizeObserver(() => {
        reportSize();
      });
      if (disposed) {
        ro.disconnect();
        term.dispose();
        termRef.current = null;
        fitAddonRef.current = null;
        enqueueWriteRef.current = () => {};
        return;
      }
      ro.observe(container);
      resizeObserverRef.current = ro;

      if (typeof window !== 'undefined') {
        window.setTimeout(reportSize, 0);
      }
    })();

    return () => {
      disposed = true;
      enqueueWriteRef.current = () => {};
      resetWriteState();
      terminalEventDisposablesRef.current.forEach((d) => d.dispose());
      terminalEventDisposablesRef.current = [];
      restoreScrollPatchRef.current?.();
      restoreScrollPatchRef.current = null;
      if (stickUiRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(stickUiRafRef.current);
        stickUiRafRef.current = null;
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      writtenLenRef.current = 0;
    };
  }, [setTerminalPtySize]);

  /** When a run starts (live), snap back to following output like OpenChamber’s new session */
  const prevLiveRef = useRef(isLive);
  useEffect(() => {
    const wasLive = prevLiveRef.current;
    prevLiveRef.current = isLive;
    if (!isLive || wasLive) return;
    followOutputRef.current = true;
    setStickToBottom(true);
    termRef.current?.scrollToBottom();
  }, [isLive]);

  useLayoutEffect(() => {
    const term = termRef.current;
    if (!term || output === null || output === undefined) return;

    const newData = output.slice(writtenLenRef.current);
    if (!newData) return;
    writtenLenRef.current = output.length;
    enqueueWriteRef.current(newData);
  }, [output, isLive]);

  useLayoutEffect(() => {
    if (output === null && termRef.current) {
      termRef.current.clear();
      writtenLenRef.current = 0;
      pendingWriteRef.current = '';
      if (writeScheduledRef.current !== null) {
        clearTimeout(writeScheduledRef.current);
      }
      writeScheduledRef.current = null;
      isWritingRef.current = false;
      followOutputRef.current = true;
      setStickToBottom(true);
    }
  }, [output]);

  const handleJumpToBottom = () => {
    followOutputRef.current = true;
    setStickToBottom(true);
    termRef.current?.scrollToBottom();
  };

  const showJumpToBottom = Boolean(isLive && !stickToBottom);

  if (!output && !pendingReview && !isLive) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-sm"
        style={{ backgroundColor: '#0d1117', color: '#8b949e' }}
      >
        {noOutputText}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: '#0d1117' }}>
      {pendingReview && !suppressReviewBanner && (
        <div
          className="flex items-center gap-3 px-4 py-3 text-xs shrink-0"
          style={{
            backgroundColor: 'rgba(56, 139, 253, 0.1)',
            borderBottom: '1px solid rgba(56, 139, 253, 0.3)',
            color: '#58a6ff',
          }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="flex-1">
            Review required — {pendingReview.changedFiles.length} file
            {pendingReview.changedFiles.length !== 1 ? 's' : ''} changed
          </span>
          <button
            type="button"
            onClick={() => respondToReview('accept')}
            className="px-3 py-1 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(63, 185, 80, 0.2)',
              color: '#3fb950',
              border: '1px solid rgba(63, 185, 80, 0.4)',
            }}
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => respondToReview('reject')}
            className="px-3 py-1 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(248, 81, 73, 0.2)',
              color: '#f85149',
              border: '1px solid rgba(248, 81, 73, 0.4)',
            }}
          >
            Reject
          </button>
        </div>
      )}
      <div className="relative flex-1 min-h-0 p-1">
        <div ref={containerRef} className="absolute inset-0 p-0" />
        {showJumpToBottom && (
          <button
            type="button"
            onClick={handleJumpToBottom}
            className="absolute bottom-3 right-3 z-10 px-2.5 py-1 rounded-md text-xs font-medium shadow-md transition-colors theme-hover"
            style={{
              backgroundColor: 'rgba(56, 139, 253, 0.2)',
              color: '#58a6ff',
              border: '1px solid rgba(56, 139, 253, 0.45)',
            }}
          >
            {t.execution.jumpToBottom}
          </button>
        )}
      </div>
    </div>
  );
}
