import { useRef, useEffect, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import AnsiToHtml from 'ansi-to-html';
import 'highlight.js/styles/github-dark.css';

const ansiConverter = new AnsiToHtml({ fg: '#c9d1d9', bg: 'transparent', newline: true });

// Detect whether text contains markdown syntax worth rendering
const MD_SYNTAX_RE = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /;
function hasMarkdownSyntax(s: string): boolean {
  return MD_SYNTAX_RE.test(s.length > 500 ? s.slice(0, 500) : s);
}

// Detect ANSI escape codes
const ANSI_RE = /\x1b\[[0-9;]*m/;
function hasAnsiCodes(s: string): boolean {
  return ANSI_RE.test(s);
}

interface OutputRendererProps {
  output: string | null;
  noOutputText: string;
}

export function OutputRenderer({ output, noOutputText }: OutputRendererProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolled, setIsUserScrolled] = useState(false);
  const [viewMode, setViewMode] = useState<'auto' | 'raw' | 'markdown'>('auto');

  // Auto-scroll to bottom unless user has scrolled up
  useEffect(() => {
    if (!isUserScrolled) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [output, isUserScrolled]);

  // Detect user scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollHeight - scrollTop - clientHeight < 40;
      setIsUserScrolled(!atBottom);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const capped = useMemo(() => {
    if (!output) return '';
    return output.length > 80000 ? output.slice(0, 80000) + '\n\n…' : output;
  }, [output]);

  const renderMode = useMemo(() => {
    if (viewMode !== 'auto') return viewMode;
    if (!capped) return 'raw';
    if (hasAnsiCodes(capped)) return 'raw';
    if (hasMarkdownSyntax(capped)) return 'markdown';
    return 'raw';
  }, [viewMode, capped]);

  if (!output) {
    return (
      <div className="flex-1 flex items-center justify-center theme-text-muted text-sm">
        {noOutputText}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-5 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-xs theme-text-tertiary mr-1.5">View:</span>
        {(['auto', 'raw', 'markdown'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              viewMode === mode
                ? 'theme-active-bg theme-text'
                : 'theme-text-muted theme-hover'
            }`}
            style={viewMode === mode ? { boxShadow: 'inset 0 0 0 1px var(--color-accent-border)' } : undefined}
          >
            {mode === 'auto' ? 'Auto' : mode === 'raw' ? 'Raw' : 'Markdown'}
          </button>
        ))}
        {isUserScrolled && (
          <button
            type="button"
            onClick={() => {
              setIsUserScrolled(false);
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="ml-auto px-2 py-0.5 rounded text-xs theme-text-tertiary theme-hover flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            Scroll to bottom
          </button>
        )}
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-auto p-5">
        {renderMode === 'markdown' ? (
          <div className="output-markdown prose prose-invert prose-sm max-w-none text-sm leading-relaxed text-pretty">
            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
              {capped}
            </ReactMarkdown>
          </div>
        ) : hasAnsiCodes(capped) ? (
          <pre
            className="text-sm font-mono theme-text-secondary leading-relaxed whitespace-pre-wrap break-all"
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(capped) }}
          />
        ) : (
          <pre className="text-sm font-mono theme-text-secondary leading-relaxed whitespace-pre-wrap break-all">
            {capped}
          </pre>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
