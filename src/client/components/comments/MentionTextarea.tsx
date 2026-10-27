// Поле комментария с подсказками @упоминаний.

import { AtSign, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Avatar } from '@/client/components/ui/primitives';
import { Button } from '@/client/components/ui/button';
import { useDebounced } from '@/client/lib/hooks';
import { useUserSearch } from '@/client/lib/queries';
import { cn } from '@/client/lib/utils';

export function MentionTextarea({
  value,
  onChange,
  placeholder = 'Напишите комментарий…',
  autoFocus = false,
  rows = 3,
  onSubmit,
  submitLabel = 'Отправить',
  disabled = false,
  busy = false,
  extra,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
  onSubmit?: () => void;
  submitLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  extra?: React.ReactNode;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounced = useDebounced(mentionQuery ?? '', 180);
  const search = useUserSearch(debounced, mentionQuery !== null);
  const suggestions = mentionQuery !== null ? (search.data?.items ?? []) : [];

  const detectMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const match = /(?:^|\s)@([a-zA-Z0-9_.-]{0,24})$/.exec(before);
    if (!match) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(match[1] ?? '');
    setActiveIndex(0);
  };

  const insertMention = (username: string) => {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at < 0) return;
    const next = `${value.slice(0, at)}@${username} ${value.slice(caret)}`;
    onChange(next);
    setMentionQuery(null);
    window.setTimeout(() => {
      textarea?.focus();
      const position = at + username.length + 2;
      textarea?.setSelectionRange(position, position);
    }, 0);
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        disabled={disabled || busy}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          detectMention(event.target.value, event.target.selectionStart ?? 0);
        }}
        onKeyDown={(event) => {
          if (mentionQuery !== null && suggestions.length > 0) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % suggestions.length);
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              const chosen = suggestions[activeIndex];
              if (chosen) insertMention(chosen.username);
              return;
            }
            if (event.key === 'Escape') {
              setMentionQuery(null);
              return;
            }
          }
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && onSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className={cn(
          'flex min-h-[84px] w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed shadow-sm transition-colors placeholder:text-muted-foreground/70',
          'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40 disabled:opacity-60',
        )}
        aria-label={placeholder}
      />

      {mentionQuery !== null && mentionQuery.length >= 1 ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-pop">
          <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <AtSign className="h-3 w-3" /> упоминание
            {search.isFetching ? <Loader2 className="ml-auto h-3 w-3 animate-spin" /> : null}
          </div>
          {suggestions.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              {mentionQuery.length < 2 ? 'Введите минимум 2 символа' : 'Никого не нашли'}
            </p>
          ) : (
            <ul className="max-h-52 overflow-y-auto p-1">
              {suggestions.map((user, index) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertMention(user.username)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                      index === activeIndex ? 'bg-surface-hover' : 'hover:bg-surface-hover',
                    )}
                  >
                    <Avatar name={user.displayName} username={user.username} size={24} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{user.displayName}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        @{user.username}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          @ — упоминание · Ctrl+Enter — отправить
        </p>
        <div className="flex items-center gap-2">
          {extra}
          {onSubmit ? (
            <Button type="button" size="sm" onClick={onSubmit} loading={busy} disabled={disabled || !value.trim()}>
              {submitLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
