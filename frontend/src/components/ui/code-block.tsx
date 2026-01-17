'use client';

/**
 * Code Block Component - PERF-007
 *
 * Lightweight syntax highlighter using prism-react-renderer.
 * Replaces react-syntax-highlighter for better performance and smaller bundle size.
 */

import { Highlight, themes } from 'prism-react-renderer';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  language: string;
  className?: string;
}

/**
 * PERF-007: Lightweight code block with syntax highlighting
 *
 * Uses prism-react-renderer instead of react-syntax-highlighter
 * for smaller bundle size and better performance.
 */
export function CodeBlock({ code, language, className }: CodeBlockProps) {
  return (
    <Highlight theme={themes.oneDark} code={code} language={language}>
      {({ className: preClassName, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={cn(
            preClassName,
            'overflow-x-auto rounded-md p-4 text-sm',
            className
          )}
          style={style}
        >
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

/**
 * Inline code component for non-block code
 */
export function InlineCode({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        'rounded bg-muted px-1.5 py-0.5 font-mono text-sm',
        className
      )}
    >
      {children}
    </code>
  );
}
