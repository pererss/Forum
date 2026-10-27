// Детальная страница публикации: чтение, действия, виджеты типа, комментарии.

import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowBigDown,
  ArrowBigUp,
  ArrowLeft,
  Bookmark,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Flag,
  Link2,
  Loader2,
  Lock,
  Pencil,
  Send,
  Trash2,
  UserPlus,
  UserCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Markdown } from '@/client/components/Markdown';
import { CommentsSection } from '@/client/components/comments/CommentsSection';
import { PostTypeWidgets } from '@/client/components/post/PostTypeWidgets';
import { TypeBadge } from '@/client/components/post/PostCardItem';
import { Button } from '@/client/components/ui/button';
import { Select } from '@/client/components/ui/form';
import {
  Avatar,
  Badge,
  ErrorState,
  Skeleton,
} from '@/client/components/ui/primitives';
import { PageTransition } from '@/client/components/ui/motion';
import { apiDelete, apiPost, ApiError } from '@/client/lib/api';
import { useDocumentTitle } from '@/client/lib/hooks';
import { usePost, useProfile, useSession } from '@/client/lib/queries';
import { cn, formatDate, formatNumber, timeAgo } from '@/client/lib/utils';

const REPORT_REASONS = [
  { value: 'spam', label: 'Спам или реклама' },
  { value: 'abuse', label: 'Оскорбления и травля' },
  { value: 'offtopic', label: 'Не по теме' },
  { value: 'misinfo', label: 'Недостоверная информация' },
  { value: 'other', label: 'Другое' },
];

export function PostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const post = usePost(id);
  const detail = post.data?.post;
  const authorProfile = useProfile(detail?.author.username);

  const [reading, setReading] = useState(false);
  const [score, setScore] = useState(0);
  const [myReaction, setMyReaction] = useState<1 | -1 | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [watching, setWatching] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDetails, setReportDetails] = useState('');

  useDocumentTitle(detail?.title ?? 'Публикация');

  useEffect(() => {
    if (!detail) return;
    setScore(detail.counts.reactions);
    setMyReaction(detail.viewer?.myReaction ?? null);
    setFavorited(detail.viewer?.favorited ?? false);
    setFavoriteCount(detail.counts.favorites);
    setWatching(detail.viewer?.watching ?? false);
    // Автор публикации не может подписаться на себя — кнопка не показывается.
  }, [detail]);

  useEffect(() => {
    setFollowing(Boolean(authorProfile.data?.profile.viewer?.isFollowing));
  }, [authorProfile.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['post', id] });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
    void queryClient.invalidateQueries({ queryKey: ['comments', id] });
  };

  const react = async (value: 1 | -1) => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (!detail || busy) return;
    const previous = { score, myReaction };
    const nextReaction = myReaction === value ? null : value;
    setMyReaction(nextReaction);
    setScore((current) => current + (nextReaction === null ? -value : myReaction === null ? value : 2 * value));
    setBusy('react');
    try {
      const result = await apiPost<{ myReaction: 1 | -1 | null; score: number }>('/reactions', {
        targetType: 'post',
        targetId: detail.id,
        value,
      });
      setMyReaction(result.myReaction);
      setScore(result.score);
    } catch {
      setScore(previous.score);
      setMyReaction(previous.myReaction);
    } finally {
      setBusy(null);
    }
  };

  const toggleFavorite = async () => {
    if (!user) return navigate('/auth');
    if (!detail) return;
    const next = !favorited;
    setFavorited(next);
    setFavoriteCount((count) => Math.max(0, count + (next ? 1 : -1)));
    setBusy('favorite');
    try {
      const result = await apiPost<{ favorited: boolean; count: number }>(
        `/posts/${detail.id}/favorite`,
        { on: next },
      );
      setFavorited(result.favorited);
      setFavoriteCount(result.count);
      refresh();
    } catch {
      setFavorited(!next);
      setFavoriteCount(detail.counts.favorites);
    } finally {
      setBusy(null);
    }
  };

  const toggleWatch = async () => {
    if (!user) return navigate('/auth');
    if (!detail) return;
    setBusy('watch');
    try {
      const result = await apiPost<{ watching: boolean }>(`/posts/${detail.id}/watch`, {
        on: !watching,
      });
      setWatching(result.watching);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить подписку');
    } finally {
      setBusy(null);
    }
  };

  const toggleFollow = async () => {
    if (!user) return navigate('/auth');
    if (!detail) return;
    setBusy('follow');
    try {
      const result = await apiPost<{ following: boolean }>(
        `/users/${detail.author.username}/follow`,
        { follow: !following },
      );
      setFollowing(result.following);
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось подписаться');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice('Ссылка скопирована');
      window.setTimeout(() => setNotice(null), 2000);
    } catch {
      setNotice('Не удалось скопировать');
    }
  };

  const remove = async () => {
    if (!detail) return;
    if (!window.confirm('Удалить публикацию? Она исчезнет из ленты, восстановить нельзя.')) return;
    setBusy('delete');
    try {
      await apiDelete(`/posts/${detail.id}`);
      await queryClient.invalidateQueries({ queryKey: ['feed'] });
      navigate('/feed');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось удалить');
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!detail) return;
    setBusy('publish');
    try {
      await apiPost(`/posts/${detail.id}/publish`);
      refresh();
      setNotice('Опубликовано');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось опубликовать');
    } finally {
      setBusy(null);
    }
  };

  const sendReport = async () => {
    if (!detail) return;
    setBusy('report');
    try {
      await apiPost(`/posts/${detail.id}/report`, {
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setReportOpen(false);
      setReportDetails('');
      setNotice('Жалоба отправлена модерации');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отправить жалобу');
    } finally {
      setBusy(null);
    }
  };

  if (post.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-4/5" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (post.isError || !detail) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState
          message={
            post.error instanceof ApiError
              ? post.error.status === 404
                ? 'Публикация не найдена или удалена.'
                : post.error.message
              : 'Не удалось загрузить публикацию.'
          }
          onRetry={() => void post.refetch()}
        />
        <div className="mt-4 text-center">
          <Button asChild variant="secondary">
            <Link to="/feed">
              <ArrowLeft className="h-4 w-4" /> Вернуться в ленту
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const isOwner = Boolean(user && user.username === detail.author.username);
  const canEdit = Boolean(detail.viewer?.canEdit);
  const isQuestion = detail.type === 'question';

  return (
    <PageTransition>
      <article
        className={cn('mx-auto w-full max-w-3xl', reading && 'reading-mode')}
        aria-labelledby="post-title"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            to="/feed"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Лента
          </Link>
          <div className="flex items-center gap-1">
            {detail.type === 'article' ? (
              <button
                type="button"
                onClick={() => setReading((value) => !value)}
                aria-pressed={reading}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                  reading
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
                )}
              >
                <BookOpen className="h-3.5 w-3.5" />
                {reading ? 'Обычный вид' : 'Режим чтения'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void copyLink()}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              aria-label="Скопировать ссылку"
            >
              <Link2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <header className="relative isolate overflow-hidden rounded-xl border border-border bg-card/70 p-4 sm:p-5">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-accent/10 blur-3xl"
          />
          <div className="relative flex flex-wrap items-center gap-2">
            <TypeBadge type={detail.type} />
            {detail.category ? (
              <Link
                to={`/explore?category=${detail.category.slug}`}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                {detail.category.name}
              </Link>
            ) : null}
            {detail.isPinned ? <Badge tone="amber">закреплено</Badge> : null}
            {detail.isLocked ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" /> обсуждение закрыто
              </span>
            ) : null}
            {detail.status === 'draft' ? <Badge tone="amber">черновик</Badge> : null}
          </div>

          <h1
            id="post-title"
            className="mt-2.5 font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[34px]"
          >
            {detail.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link to={`/u/${detail.author.username}`} className="flex items-center gap-2.5">
              <Avatar
                name={detail.author.displayName}
                username={detail.author.username}
                size={36}
              />
              <span>
                <span className="block text-sm font-semibold leading-tight hover:underline">
                  {detail.author.displayName}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  @{detail.author.username} · {detail.author.level} ур. · {detail.author.reputation}{' '}
                  репутации
                </span>
              </span>
            </Link>

            {user && user.id !== detail.author.id ? (
              <button
                type="button"
                onClick={() => void toggleFollow()}
                disabled={busy === 'follow'}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                  following
                    ? 'border-border bg-secondary text-foreground'
                    : 'border-foreground/20 text-foreground hover:bg-surface-hover',
                )}
              >
                {following ? <UserCheck className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                {following ? 'Вы подписаны' : 'Подписаться'}
              </button>
            ) : null}

            <span className="ml-auto text-[11px] text-muted-foreground">
              {detail.publishedAt ? formatDate(detail.publishedAt) : 'не опубликовано'}
              {detail.editedAt ? ` · изменено ${timeAgo(detail.editedAt)}` : ''}
            </span>
          </div>
        </header>

        <div className="mt-5 space-y-5">
          {detail.body ? <Markdown text={detail.body} /> : null}

          {detail.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {detail.tags.map((tag) => (
                <Link
                  key={tag.id}
                  to={`/explore?tag=${encodeURIComponent(tag.slug)}`}
                  className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground transition-colors hover:border-foreground/20"
                >
                  #{tag.name}
                </Link>
              ))}
            </div>
          ) : null}

          <PostTypeWidgets post={detail} isOwner={isOwner} />

          <div className="flex flex-wrap items-center gap-1.5 border-y border-border py-2.5">
            <div className="flex items-center rounded-md border border-border bg-card">
              <button
                type="button"
                onClick={() => void react(1)}
                aria-pressed={myReaction === 1}
                aria-label="Нравится"
                className={cn(
                  'flex h-8 items-center gap-1 rounded-l-md px-2.5 text-sm transition-colors hover:bg-surface-hover',
                  myReaction === 1 && 'text-accent',
                )}
              >
                <ArrowBigUp className={cn('h-4 w-4', myReaction === 1 && 'fill-current')} />
              </button>
              <span className="min-w-7 px-1 text-center text-xs font-semibold tabular-nums">
                {formatNumber(score)}
              </span>
              <button
                type="button"
                onClick={() => void react(-1)}
                aria-pressed={myReaction === -1}
                aria-label="Не нравится"
                className={cn(
                  'flex h-8 items-center rounded-r-md px-2.5 text-sm transition-colors hover:bg-surface-hover',
                  myReaction === -1 && 'text-destructive',
                )}
              >
                <ArrowBigDown className={cn('h-4 w-4', myReaction === -1 && 'fill-current')} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => void toggleFavorite()}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover',
                favorited && 'border-accent/40 text-accent',
              )}
              aria-pressed={favorited}
            >
              <Bookmark className={cn('h-3.5 w-3.5', favorited && 'fill-current')} />
              {favorited ? 'В избранном' : 'В избранное'}
              <span className="tabular-nums text-muted-foreground">{favoriteCount}</span>
            </button>

            <Link
              to="#comments"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              {detail.counts.comments} комментариев
            </Link>

            <button
              type="button"
              onClick={() => void toggleWatch()}
              disabled={busy === 'watch'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover',
                watching ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {watching ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {watching ? 'Слежу' : 'Следить'}
            </button>

            <div className="ml-auto flex items-center gap-1">
              {detail.status === 'draft' && canEdit ? (
                <Button size="sm" onClick={() => void publish()} loading={busy === 'publish'}>
                  <Send className="h-3.5 w-3.5" /> Опубликовать
                </Button>
              ) : null}
              {canEdit ? (
                <>
                  <Button asChild size="sm" variant="secondary">
                    <Link to={`/new?edit=${detail.id}`}>
                      <Pencil className="h-3.5 w-3.5" /> Изменить
                    </Link>
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => void remove()}
                    loading={busy === 'delete'}
                    aria-label="Удалить публикацию"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : user ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setReportOpen((open) => !open)}
                  aria-label="Пожаловаться"
                >
                  <Flag className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>

          {reportOpen ? (
            <div className="rounded-lg border border-border bg-card p-3.5">
              <p className="text-sm font-semibold">Жалоба на публикацию</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Модерация увидит жалобу и контекст. Повторная отправка обновит её.
              </p>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                <Select
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  aria-label="Причина жалобы"
                >
                  {REPORT_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </Select>
                <input
                  value={reportDetails}
                  onChange={(event) => setReportDetails(event.target.value)}
                  placeholder="Детали (необязательно)"
                  maxLength={1000}
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => void sendReport()} loading={busy === 'report'}>
                  Отправить
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReportOpen(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          ) : null}

          {notice ? (
            <p className="flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-2 text-xs font-medium text-success">
              <Check className="h-3.5 w-3.5" /> {notice}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <CommentsSection
            postId={detail.id}
            canComment={Boolean(detail.viewer?.canComment)}
            isQuestion={isQuestion}
            isLocked={detail.isLocked}
          />

          {busy === 'react' ? (
            <span className="sr-only" role="status">
              <Loader2 className="h-3 w-3 animate-spin" /> Сохраняем реакцию
            </span>
          ) : null}
        </div>
      </article>
    </PageTransition>
  );
}
