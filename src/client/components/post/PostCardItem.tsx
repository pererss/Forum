// Карточка публикации для лент и сеток.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bookmark,
  CheckCircle2,
  EyeOff,
  Heart,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Pin,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { POST_TYPE_META } from '@/shared/post-types';
import { apiPost } from '@/client/lib/api';
import { useSession } from '@/client/lib/queries';
import { cn, formatNumber, timeAgo } from '@/client/lib/utils';
import type { PostCard } from '@/shared/types';
import { Avatar, Badge } from '@/client/components/ui/primitives';
import { POST_TYPE_ICON } from '@/client/components/post/type-icons';

export function TypeBadge({ type }: { type: PostCard['type'] }) {
  const meta = POST_TYPE_META[type];
  return <Badge tone={meta.color as never}>{meta.name}</Badge>;
}

export function PostCardItem({
  post,
  variant = 'list',
  onHidden,
}: {
  post: PostCard;
  variant?: 'list' | 'grid';
  onHidden?: (id: string) => void;
}) {
  const { data: session } = useSession();
  const viewer = session?.user ?? null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [favorited, setFavorited] = useState(post.viewer?.favorited ?? false);
  const [favoriteCount, setFavoriteCount] = useState(post.counts.favorites);
  const [pending, setPending] = useState(false);

  const toggleFavorite = async () => {
    if (!viewer) {
      navigate('/auth');
      return;
    }
    if (pending) return;
    setPending(true);
    const next = !favorited;
    setFavorited(next);
    setFavoriteCount((count) => Math.max(0, count + (next ? 1 : -1)));
    try {
      const result = await apiPost<{ favorited: boolean; count: number }>(
        `/posts/${post.id}/favorite`,
        { on: next },
      );
      setFavorited(result.favorited);
      setFavoriteCount(result.count);
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch {
      setFavorited(!next);
      setFavoriteCount(post.counts.favorites);
    } finally {
      setPending(false);
    }
  };

  const hide = async (targetType: 'post' | 'author' | 'category') => {
    if (!viewer) return;
    const targetId =
      targetType === 'author'
        ? post.author.id
        : targetType === 'category'
          ? (post.category?.id ?? '')
          : post.id;
    if (!targetId) return;
    await apiPost(`/posts/${post.id}/hide`, { targetType, targetId });
    onHidden?.(post.id);
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  const meta = POST_TYPE_META[post.type];
  const TypeIcon = POST_TYPE_ICON[post.type];

  return (
    <article
      className={cn(
        'nuffy-card group relative isolate overflow-hidden rounded-xl',
        variant === 'grid' && 'flex h-full min-h-[292px] flex-col p-4',
        variant === 'list' && 'flex flex-col p-4 sm:p-5',
      )}
    >
      {/* Декоративный знак формата: заполняет воздух в высоких карточках,
          не изображая данных, которых нет в превью. */}
      {variant === 'grid' ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <span className="absolute -right-12 -top-14 h-32 w-32 rounded-full bg-accent/12 blur-2xl" />
          <TypeIcon
            className="absolute -bottom-5 -right-4 h-28 w-28 text-foreground/[0.045] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1 group-hover:scale-[1.04]"
            strokeWidth={1.2}
          />
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Link
          to={`/u/${post.author.username}`}
          className="shrink-0 rounded-full ring-offset-2 ring-offset-card transition-all hover:ring-2 hover:ring-border"
          aria-label={`Профиль ${post.author.displayName}`}
        >
          <Avatar name={post.author.displayName} username={post.author.username} size={variant === 'grid' ? 24 : 28} />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px]">
          <Link
            to={`/u/${post.author.username}`}
            className="truncate font-semibold text-foreground hover:text-accent"
          >
            {post.author.displayName}
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <time
            dateTime={post.publishedAt ?? post.createdAt}
            className="shrink-0 text-muted-foreground"
          >
            {timeAgo(post.publishedAt ?? post.createdAt)}
          </time>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {post.isPinned ? (
            <span title="Закреплено" className="text-muted-foreground">
              <Pin className="h-3.5 w-3.5" />
            </span>
          ) : null}
          {post.isLocked ? (
            <span title="Обсуждение закрыто" className="text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
            </span>
          ) : null}
          {viewer && viewer.id !== post.author.id ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/60 opacity-0 transition-all hover:bg-surface-hover hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                  aria-label="Действия с публикацией"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="nuffy-select-content z-50 min-w-52 rounded-xl border border-border bg-popover/95 p-1 shadow-pop backdrop-blur-xl"
                >
                  <DropdownMenu.Item
                    onSelect={() => void hide('post')}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none hover:bg-surface-hover focus:bg-surface-hover"
                  >
                    <EyeOff className="h-4 w-4 text-muted-foreground" /> Скрыть публикацию
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => void hide('author')}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none hover:bg-surface-hover focus:bg-surface-hover"
                  >
                    <UserX className="h-4 w-4 text-muted-foreground" /> Скрыть автора
                  </DropdownMenu.Item>
                  {post.category ? (
                    <DropdownMenu.Item
                      onSelect={() => void hide('category')}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none hover:bg-surface-hover focus:bg-surface-hover"
                    >
                      <EyeOff className="h-4 w-4 text-muted-foreground" /> Скрыть «{post.category.name}»
                    </DropdownMenu.Item>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">
          {meta.name}
        </span>
        {post.status !== 'published' ? (
          <span className="ml-auto rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
            {post.status === 'draft' ? 'Черновик' : post.status === 'hidden' ? 'Скрыто' : 'Удалено'}
          </span>
        ) : null}
      </div>

      <h3
        className={cn(
          'mt-1.5 font-display font-semibold leading-snug tracking-[-0.015em]',
          variant === 'grid' ? 'line-clamp-3 text-[15.5px]' : 'text-[17px] sm:text-lg',
        )}
      >
        <Link to={`/post/${post.id}`} className="transition-colors hover:text-accent">
          {post.title}
        </Link>
      </h3>

      <p
        className={cn(
          'mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground',
          variant === 'grid' ? 'line-clamp-3' : 'line-clamp-2',
        )}
      >
        {post.excerpt}
      </p>

      {post.type === 'question' && post.acceptedAnswerId ? (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> Есть принятый ответ
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {post.category ? (
          <Link
            to={`/explore?category=${post.category.slug}`}
            className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-secondary-foreground transition-colors hover:bg-surface-hover"
          >
            {post.category.name}
          </Link>
        ) : null}
        {post.tags.slice(0, 3).map((tag) => (
          <Link
            key={tag.id}
            to={`/explore?tag=${encodeURIComponent(tag.slug)}`}
            className="text-[10.5px] font-medium text-muted-foreground/80 transition-colors hover:text-accent"
          >
            #{tag.name}
          </Link>
        ))}
      </div>

      <div className="mt-auto" />

      <div className="flex items-center gap-0.5 border-t border-border/60 pt-2 text-muted-foreground">
        <Link
          to={`/post/${post.id}`}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label={`Комментарии: ${post.counts.comments}`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="tabular-nums">{formatNumber(post.counts.comments)}</span>
        </Link>
        <span className="flex items-center gap-1.5 px-1.5 py-1 text-[11.5px]" title="Реакции">
          <Heart className="h-3.5 w-3.5" />
          <span className="tabular-nums">{formatNumber(post.counts.reactions)}</span>
        </span>

        <span className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void toggleFavorite()}
            aria-pressed={favorited}
            aria-label={favorited ? 'Убрать из избранного' : 'В избранное'}
            className={cn(
              'flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] transition-all active:scale-90',
              favorited
                ? 'text-accent'
                : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
            )}
          >
            <Bookmark className={cn('h-3.5 w-3.5 transition-transform', favorited && 'scale-110 fill-current')} />
            <span className="tabular-nums">{formatNumber(favoriteCount)}</span>
          </button>
          <Link
            to={`/post/${post.id}`}
            aria-label="Открыть публикацию"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/50 transition-all hover:bg-surface-hover hover:text-foreground"
          >
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </span>
      </div>
    </article>
  );
}

export function postTypeLabel(type: PostCard['type']): string {
  return POST_TYPE_META[type].short;
}
