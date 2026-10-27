// Безопасный рендер разметки: только поддерживаемое подмножество markdown,
// без dangerouslySetInnerHTML. Упоминания @username превращаются в ссылки.

import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { cn } from '@/client/lib/utils';

const INLINE_RE =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|@[a-zA-Z0-9][a-zA-Z0-9_.-]{1,22}[a-zA-Z0-9])/g;

function renderInline(text: string, prefix: string): ReactNode[] {
  const tokens = text.split(INLINE_RE);
  return tokens.map((token, index) => {
    const key = `${prefix}-${index}`;
    if (!token) return null;

    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return <code key={key}>{token.slice(1, -1)}</code>;
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer nofollow">
          {link[1]}
        </a>
      );
    }
    if (/^@[a-zA-Z0-9]/.test(token)) {
      const username = token.slice(1);
      return (
        <Link key={key} to={`/u/${username}`} className="mention">
          {token}
        </Link>
      );
    }
    return <span key={key}>{token}</span>;
  });
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; code: string }
  | { kind: 'hr' };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (/^```/.test(line.trim())) {
      flush();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test((lines[index] ?? '').trim())) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'code', code: code.join('\n') });
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'h', level: heading[1]!.length, text: heading[2]! });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flush();
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? '')) {
        quoteLines.push((lines[index] ?? '').replace(/^\s*>\s?/, ''));
        index += 1;
      }
      index -= 1;
      blocks.push({ kind: 'quote', lines: quoteLines });
      continue;
    }

    const listItem = /^\s*([-*+]|\d+\.)\s+(.+)$/.exec(line);
    if (listItem) {
      flush();
      const ordered = /\d+\./.test(listItem[1]!);
      const items: string[] = [];
      while (index < lines.length) {
        const match = /^\s*([-*+]|\d+\.)\s+(.+)$/.exec(lines[index] ?? '');
        if (!match) break;
        if (/\d+\./.test(match[1]!) !== ordered) break;
        items.push(match[2]!);
        index += 1;
      }
      index -= 1;
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flush();
      blocks.push({ kind: 'hr' });
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    paragraph.push(line.trim());
  }

  flush();
  return blocks;
}

export function Markdown({
  text,
  className,
  compact = false,
}: {
  text: string;
  className?: string;
  compact?: boolean;
}) {
  const blocks = parseBlocks(text ?? '');

  return (
    <div className={cn('prose-nuffy', compact && 'prose-compact', className)}>
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        switch (block.kind) {
          case 'p':
            return <p key={key}>{renderInline(block.text, key)}</p>;
          case 'h': {
            const Tag = (`h${Math.min(4, block.level + 1)}` as 'h2' | 'h3' | 'h4');
            return <Tag key={key}>{renderInline(block.text, key)}</Tag>;
          }
          case 'quote':
            return (
              <blockquote key={key}>
                {renderInline(block.lines.join(' '), key)}
              </blockquote>
            );
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </Tag>
            );
          }
          case 'code':
            return (
              <pre key={key}>
                <code>{block.code}</code>
              </pre>
            );
          case 'hr':
            return <hr key={key} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
