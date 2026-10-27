// Комментарии: сортировка, ответы, редактирование, удаление, принятый ответ, реакции.

import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowBigDown,
  ArrowBigUp,
  CheckCircle2,
  CornerDownRight,
  MessageSquare,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Markdown } from '@/client/components/Markdown';
import { MentionTextarea } from '@/client/components/comments/MentionTextarea';
import { Button } from '@/client/components/ui/button';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/client/components/ui/primitives';
import { apiDelete, apiPatch, apiPost, ApiError } from '@/client/lib/api';
import { useComments, useSession } from '@/client/lib/queries';
import { cn, formatNumber, timeAgo } from '@/client/lib/utils';
import type { CommentDto } from '@/shared/types';

const SORTS = [
  { value: 'old', label: 'Сначала старые' },
  { value: 'new', label: 'Сначала новые' },
  { value: 'top', label: 'Популярные' },
] as const;

function CommentItem({
  comment,
  depth,
  canReply,
  onReply,
  onChanged,
}: {
  comment: CommentDto;
  depth: number;
  canReply: boolean;
  onReply: (comment: CommentDto) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(comment.reactionScore);
  const [myReaction, setMyReaction] = useState<1 | -1 | null>(comment.viewer?.myReaction ?? null);

  const isHidden = comment.status === 'hidden';

  const react = async (value: 1 | -1) => {
    if (busy) return;
    const previous = { score, myReaction };
    const nextReaction = myReaction === value ? null : value;
    setBusy(true);
    setMyReaction(nextReaction);
    setScore((current) => current + (nextReaction === null ? -(value) : myReaction === null ? value : 2 * value));
    try {
      const result = await apiPost<{ myReaction: 1 | -1 | null; score: number }>('/reactions', {
        targetType: 'comment',
        targetId: comment.id,
        value,
      });
      setMyReaction(result.myReaction);
      setScore(result.score);
    } catch {
      setScore(previous.score);
      setMyReaction(previous.myReaction);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/comments/${comment.id}`, { body: draft.trim() });
      setEditing(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Удалить комментарий? Действие необратимо.')) return;
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/comments/${comment.id}`);
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось удалить');
      setBusy(false);
    }
  };

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/comments/${comment.id}/accept`, { accept: !comment.isAccepted });
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить решение');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn(depth > 0 && 'ml-5 border-l-2 border-border pl-3 sm:ml-8 sm:pl-4')}>
      <div
        className={cn(
          'rounded-lg border bg-card p-3.5 transition-colors sm:p-4',
          comment.isAccepted ? 'border-success/35 bg-success/[0.03]' : 'border-border',
        )}
      >
        <div className="flex items-start gap-2.5">
          <Link to={`/u/${comment.author.username}`} className="shrink-0">
            <Avatar name={comment.author.displayName} username={comment.author.username} size={28} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <Link
                to={`/u/${comment.author.username}`}
                className="font-semibold text-foreground hover:underline"
              >
                {comment.author.displayName}
              </Link>
              <span className="text-muted-foreground">@{comment.author.username}</span>
              <span className="rounded bg-secondary px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                {comment.author.level} ур.
              </span>
              <time dateTime={comment.createdAt} className="text-muted-foreground">
                {timeAgo(comment.createdAt)}
              </time>
              {comment.editedAt ? <span className="text-muted-foreground/70">изменён</span> : null}
              {comment.isAccepted ? (
                <span className="inline-flex items-center gap-0.5 font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> принятый ответ
                </span>
              ) : null}
            </div>

            {isHidden ? (
              <p className="mt-2 text-sm italic text-muted-foreground">Комментарий скрыт модерацией.</p>
            ) : editing ? (
              <div className="mt-2">
                <MentionTextarea
                  value={draft}
                  onChange={setDraft}
                  rows={3}
                  autoFocus
                  busy={busy}
                  submitLabel="Сохранить"
                  onSubmit={() => void save()}
                  extra={
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      Отмена
                    </Button>
                  }
                />
              </div>
            ) : (
              <Markdown text={comment.body} className="mt-1.5" compact />
            )}

            {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => void react(1)}
                aria-pressed={myReaction === 1}
                aria-label="Нравится"
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-surface-hover',
                  myReaction === 1 && 'text-accent',
                )}
              >
                <ArrowBigUp className={cn('h-4 w-4', myReaction === 1 && 'fill-current')} />
              </button>
              <span className="min-w-4 text-center font-medium tabular-nums">{formatNumber(score)}</span>
              <button
                type="button"
                onClick={() => void react(-1)}
                aria-pressed={myReaction === -1}
                aria-label="Не нравится"
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-surface-hover',
                  myReaction === -1 && 'text-destructive',
                )}
              >
                <ArrowBigDown className={cn('h-4 w-4', myReaction === -1 && 'fill-current')} />
              </button>

              {canReply && !isHidden ? (
                <button
                  type="button"
                  onClick={() => onReply(comment)}
                  className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-surface-hover hover:text-foreground"
                >
                  <CornerDownRight className="h-3.5 w-3.5" /> Ответить
                </button>
              ) : null}
              {comment.viewer?.canAccept ? (
                <button
                  type="button"
                  onClick={() => void accept()}
                  disabled={busy}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-surface-hover',
                    comment.isAccepted ? 'text-success' : 'hover:text-success',
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {comment.isAccepted ? 'Снять решение' : 'Принять ответ'}
                </button>
              ) : null}
              {comment.viewer?.canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(comment.body);
                    setEditing(true);
                  }}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-surface-hover hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" /> Изменить
                </button>
              ) : null}
              {comment.viewer?.canDelete ? (
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-surface-hover hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Удалить
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CommentsSection({
  postId,
  canComment,
  isQuestion,
  isLocked,
}: {
  postId: string;
  canComment: boolean;
  isQuestion: boolean;
  isLocked: boolean;
}) {
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const [sort, setSort] = useState<'old' | 'new' | 'top'>('old');
  const comments = useComments(postId, sort);
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommentDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    void queryClient.invalidateQueries({ queryKey: ['post', postId] });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  const items = useMemo(() => comments.data?.items ?? [], [comments.data]);
  const roots = useMemo(() => items.filter((item) => item.parentId === null), [items]);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, CommentDto[]>();
    for (const item of items) {
      if (!item.parentId) continue;
      const list = map.get(item.parentId) ?? [];
      list.push(item);
      map.set(item.parentId, list);
    }
    return map;
  }, [items]);

  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/posts/${postId}/comments`, {
        body: body.trim(),
        parentId: replyTo?.id ?? null,
      });
      setBody('');
      setReplyTo(null);
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отправить комментарий');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="comments" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <MessageSquare className="h-[18px] w-[18px] text-muted-foreground" />
          Комментарии
          <span className="text-sm font-normal text-muted-foreground">
            {items.length > 0 ? formatNumber(items.length) : ''}
          </span>
        </h2>
        <div className="flex gap-0.5 rounded-md border border-border bg-surface p-0.5">
          {SORTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSort(option.value)}
              aria-pressed={sort === option.value}
              className={cn(
                'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                sort === option.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {canComment ? (
        <div className="mb-4 rounded-lg border border-border bg-card p-3.5">
          {replyTo ? (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-surface px-2.5 py-1.5 text-xs text-muted-foreground">
              <span className="truncate">
                Ответ на комментарий <strong className="text-foreground">@{replyTo.author.username}</strong>
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="shrink-0 rounded p-0.5 hover:bg-surface-hover hover:text-foreground"
                aria-label="Отменить ответ"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <MentionTextarea
            value={body}
            onChange={setBody}
            onSubmit={() => void submit()}
            busy={busy}
            rows={replyTo ? 2 : 3}
            placeholder={
              isQuestion ? 'Предложите ответ или уточните детали…' : 'Поделитесь мыслью…'
            }
            submitLabel={replyTo ? 'Ответить' : 'Отправить'}
          />
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          {isLocked
            ? 'Обсуждение закрыто автором. Читать можно, писать — нет.'
            : user
              ? 'Ваш аккаунт ограничен: новые комментарии недоступны.'
              : (
                  <>
                    <Link to="/auth" className="font-medium text-accent hover:underline">
                      Войдите
                    </Link>
                    , чтобы присоединиться к обсуждению.
                  </>
                )}
        </div>
      )}

      {comments.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : comments.isError ? (
        <ErrorState
          message={
            comments.error instanceof ApiError ? comments.error.message : 'Не удалось загрузить комментарии'
          }
          onRetry={() => void comments.refetch()}
        />
      ) : roots.length === 0 ? (
        <EmptyState
          title={isQuestion ? 'Ответов пока нет' : 'Комментариев пока нет'}
          description={
            isQuestion
              ? 'Будьте первым, кто поможет автору разобраться.'
              : 'Начните разговор — вежливость и конкретика приветствуются.'
          }
        />
      ) : (
        <div className="space-y-3">
          {roots.map((root) => (
            <div key={root.id} className="space-y-2">
              <CommentItem
                comment={root}
                depth={0}
                canReply={canComment}
                onReply={(comment) => {
                  setReplyTo(comment);
                  setBody('');
                  document
                    .querySelector<HTMLTextAreaElement>('#comments textarea')
                    ?.focus({ preventScroll: false });
                }}
                onChanged={refresh}
              />
              {(repliesByParent.get(root.id) ?? []).map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  depth={1}
                  canReply={canComment}
                  onReply={(comment) => setReplyTo(comment)}
                  onChanged={refresh}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
