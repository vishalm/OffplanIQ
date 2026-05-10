'use client'

// apps/web/components/ai/Markdown.tsx
//
// Unified markdown renderer for every chat / assistant surface. Centralises
// the styling so /ask, /admin Copilot, and /insights summaries all look
// identical and pick up tweaks once.
//
// Why react-markdown + remark-gfm:
//   - The LLM frequently emits **bold**, lists, fenced code, and pipe tables;
//     rendering those as raw text was making replies hard to read.
//   - GFM brings tables, task lists, autolinks, strikethrough.
//   - We disable raw HTML by default — never trust the model's HTML.

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  /** Markdown source. Empty string is fine; renders nothing. */
  children: string
  /** Optional override class on the wrapper. */
  className?: string
}

export function Markdown({ children, className = '' }: Props) {
  if (!children) return null
  return (
    <div className={`markdown-body text-[14px] leading-relaxed text-gray-800 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings: keep them subtle — chat shouldn't ship h1-sized text.
          h1: ({ children }) => <p className="text-[15px] font-semibold text-gray-900 mt-3 first:mt-0 mb-1.5">{children}</p>,
          h2: ({ children }) => <p className="text-[14.5px] font-semibold text-gray-900 mt-3 first:mt-0 mb-1.5">{children}</p>,
          h3: ({ children }) => <p className="text-[14px] font-semibold text-gray-900 mt-2.5 first:mt-0 mb-1">{children}</p>,
          h4: ({ children }) => <p className="text-[13.5px] font-semibold text-gray-900 mt-2 first:mt-0 mb-1">{children}</p>,
          h5: ({ children }) => <p className="text-[13.5px] font-semibold text-gray-700 mt-2 first:mt-0 mb-1">{children}</p>,
          h6: ({ children }) => <p className="text-[13px] font-semibold text-gray-700 mt-2 first:mt-0 mb-1">{children}</p>,

          // Paragraph spacing — tight inside chat bubbles.
          p:  ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{children}</p>,

          // Lists.
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,

          // Inline emphasis.
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em:     ({ children }) => <em className="italic">{children}</em>,
          del:    ({ children }) => <del className="text-gray-400">{children}</del>,

          // Links — open externally, never trust model-generated targets to
          // navigate inside the app.
          a: ({ href, children }) => (
            <a href={href ?? '#'}
               target="_blank"
               rel="noreferrer noopener"
               className="text-blue-600 hover:underline">
              {children}
            </a>
          ),

          // Code.
          code: ({ inline, className, children, ...rest }: any) => {
            if (inline) {
              return <code className="bg-gray-100 text-[13px] text-gray-800 px-1 py-0.5 rounded font-mono break-words">{children}</code>
            }
            return (
              <code className={`block bg-gray-900 text-gray-100 text-[12px] leading-relaxed font-mono p-3 rounded-lg overflow-x-auto whitespace-pre ${className ?? ''}`} {...rest}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => <pre className="my-2 not-prose">{children}</pre>,

          // Quote.
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-gray-200 pl-3 my-2 text-gray-600">{children}</blockquote>
          ),

          // GFM tables. Wrap so they scroll horizontally on narrow chat bubbles.
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-[12.5px] border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
          tr:    ({ children }) => <tr className="border-t border-gray-100 first:border-t-0">{children}</tr>,
          th:    ({ children }) => <th className="text-left text-[11px] uppercase tracking-wider text-gray-500 font-medium px-3 py-1.5 whitespace-nowrap">{children}</th>,
          td:    ({ children }) => <td className="px-3 py-1.5 text-gray-700 align-top">{children}</td>,

          hr: () => <hr className="my-3 border-gray-100" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
