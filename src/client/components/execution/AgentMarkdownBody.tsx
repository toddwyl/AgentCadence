import type { ComponentPropsWithoutRef, ReactElement } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import 'highlight.js/styles/github-dark-dimmed.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('zsh', bash);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('markdown', markdown);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const markdownComponents: Components = {
  p({ children }) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
  },
  strong({ children }) {
    return <strong className="font-semibold theme-text-secondary">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic opacity-95">{children}</em>;
  },
  ul({ className, children }) {
    const cls = typeof className === 'string' ? className : '';
    const isTaskList = cls.includes('contains-task-list');
    return (
      <ul
        className={`mb-2 space-y-0.5 ${isTaskList ? 'list-none pl-0' : 'list-disc pl-4'} ${cls}`}
      >
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>;
  },
  li({ className, children }) {
    const cls = typeof className === 'string' ? className : '';
    const isTask = cls.includes('task-list-item');
    return (
      <li className={`leading-relaxed ${isTask ? 'flex gap-2 items-start' : ''} ${cls}`}>{children}</li>
    );
  },
  input(props) {
    const { type, className, ...rest } = props as ComponentPropsWithoutRef<'input'>;
    if (type === 'checkbox') {
      return (
        <input
          {...rest}
          type="checkbox"
          readOnly
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-[var(--color-border)] accent-[var(--accent-primary)] ${className ?? ''}`}
        />
      );
    }
    return <input type={type} className={className} {...rest} />;
  },
  h1({ children }) {
    return <h1 className="text-base font-semibold mt-2 mb-1 theme-text-secondary">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-[15px] font-semibold mt-2 mb-1 theme-text-secondary">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-sm font-semibold mt-1.5 mb-0.5 theme-text-secondary">{children}</h3>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        className="text-accent-primary underline-offset-2 hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote
        className="border-l-2 pl-2 my-2 opacity-90 italic theme-text-muted"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-3 border-[var(--color-border)]" />;
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2">
        <table
          className="text-[12px] border-collapse min-w-full"
          style={{ border: '1px solid var(--color-border)' }}
        >
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="theme-bg-0">{children}</thead>;
  },
  th({ children }) {
    return (
      <th
        className="px-2 py-1 text-left font-medium theme-text-secondary"
        style={{ border: '1px solid var(--color-border)' }}
      >
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="px-2 py-1 align-top" style={{ border: '1px solid var(--color-border)' }}>
        {children}
      </td>
    );
  },
  pre({ children }) {
    return (
      <pre
        className="overflow-x-auto rounded-lg p-3 my-2 text-[12px] leading-relaxed border theme-bg-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {children}
      </pre>
    );
  },
  code({ className, children }) {
    const text = String(children ?? '').replace(/\n$/, '');
    const match = /language-(\w+)/.exec(className ?? '');
    const isInline = !text.includes('\n') && !match;

    if (isInline) {
      return (
        <code
          className="px-1 py-px rounded text-[12px] font-mono theme-bg-0"
          style={{ border: '1px solid var(--color-border)' }}
        >
          {text}
        </code>
      );
    }

    let html: string;
    try {
      const lang = match?.[1];
      if (lang && hljs.getLanguage(lang)) {
        html = hljs.highlight(text, { language: lang }).value;
      } else {
        html = hljs.highlightAuto(text).value;
      }
    } catch {
      html = escapeHtml(text);
    }

    return (
      <code
        className={`hljs !bg-transparent !p-0 block w-fit min-w-full font-mono ${className ?? ''}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
};

export function AgentMarkdownBody({
  text,
  className,
  variant = 'default',
}: {
  text: string;
  className?: string;
  variant?: 'default' | 'dim';
}): ReactElement {
  const rootTone =
    variant === 'dim' ? 'opacity-90 text-[12px] theme-text-muted' : 'text-[13px] theme-text-secondary';

  return (
    <div className={`agent-md-root ${rootTone} ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
