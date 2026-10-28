'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';

interface ChatMarkdownProps {
  content: string;
}

export const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  return (
    <div className="chat-markdown-content leading-relaxed break-words text-sm text-slate-800">
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 leading-relaxed text-slate-800">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-950">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-900">
              {children}
            </em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-4 mb-2.5 space-y-1 text-slate-800 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-4 mb-2.5 space-y-1 text-slate-800 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5">
              {children}
            </li>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className && typeof children === 'string' && !children.includes('\n');
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[12px] font-medium text-blue-700 border border-slate-200/80"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="block p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto my-2 border border-slate-800 leading-relaxed"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 rounded-xl overflow-hidden">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-blue-500 pl-3 italic text-slate-600 my-2.5 bg-blue-50/30 py-1 rounded-r-lg">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-50 text-slate-700 font-semibold text-left">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-100 bg-white">
              {children}
            </tbody>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-xs font-semibold text-slate-800">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-xs text-slate-700">
              {children}
            </td>
          ),
          a: ({ href, children }) => {
            // Seguridad: Solo permitir enlaces http/https seguros y abrir en nueva pestaña con noopener
            const isSafe = href?.startsWith('https://') || href?.startsWith('http://');
            if (!isSafe) {
              return <span>{children}</span>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline font-medium hover:text-blue-800 transition"
              >
                {children}
              </a>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
