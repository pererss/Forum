// Карточка публикации для лент и сеток.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import {
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

  return (
    <article
      className={cn(
        'group relative rounded-lg border border-border bg-card shadow-card transition-all duration-200',
        'hover:border-foreground/15 hover:shadow-pop',
        variant === 'grid' && 'flex h-full flex-col p-4',
        variant === 'list' && 'p-4 sm:p-5',
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <Link
          to={`/u/${post.author.username}`}
          className="shrink-0 rounded-full transition-opacity hover:opacity-85"
          aria-label={`Профиль ${post.author.displayName}`}
        >
          <Avatar name={post.author.displayName} username={post.author.username} size={28} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs">
            <Link
              to={`/u/${post.author.username}`}
              className="truncate font-semibold text-foreground hover:underline"
            >
              {post.author.displayName}
            </Link>
            <span className="truncate text-muted-foreground">@{post.author.username}</span>
            <span className="text-muted-foreground/50">·</span>
            <time
              dateTime={post.publishedAt ?? post.createdAt}
              className="shrink-0 text-muted-foreground"
            >
              {timeAgo(post.publishedAt ?? post.createdAt)}
            </time>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <TypeBadge type={post.type} />
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
          {viewer ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                  aria-label="Действия с публикацией"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-52 rounded-lg border border-border bg-popover p-1 shadow-pop"
                >
                  <DropdownMenu.Item
                    onSelect={() => void hide('post')}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none hover:bg-surface-hover focus:bg-surface-hover"
                  >
                    <EyeOff className="h-4 w-4 text-muted-foreground" /> Скрыть публикацию
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => void hide('author')}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none hover:bg-surface-hover focus:bg-surface-hover"
                  >
                    <UserX className="h-4 w-4 text-muted-foreground" /> Скрыть автора
                  </DropdownMenu.Item>
                  {post.category ? (
                    <DropdownMenu.Item
                      onSelect={() => void hide('category')}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none hover:bg-surface-hover focus:bg-surface-hover"
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

      <h3 className="font-display text-[17px] font-semibold leading-snug tracking-[-0.01em] sm:text-lg">
        <Link
          to={`/post/${post.id}`}
          className="line-clamp-2 transition-colors hover:text-accent"
        >
          {post.title}
        </Link>
      </h3>

      {post.status !== 'published' ? (
        <div className="mt-1.5">
          <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
            {post.status === 'draft' ? 'Черновик' : post.status === 'hidden' ? 'Скрыто' : 'Удалено'}
          </span>
        </div>
      ) : null}

      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
        {post.excerpt}
      </p>

      {post.type === 'question' && post.acceptedAnswerId ? (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> Есть принятый ответ
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {post.category ? (
          <Link
            to={`/explore?category=${post.category.slug}`}
            className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground transition-colors hover:bg-surface-hover"
          >
            {post.category.name}
          </Link>
        ) : null}
        {post.tags.slice(0, 4).map((tag) => (
          <Link
            key={tag.id}
            to={`/explore?tag=${encodeURIComponent(tag.slug)}`}
            className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-accent"
          >
            #{tag.name}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1 border-t border-border/60 pt-2.5 text-muted-foreground">
        <Link
          to={`/post/${post.id}`}
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label={`Комментарии: ${post.counts.comments}`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="tabular-nums">{formatNumber(post.counts.comments)}</span>
        </Link>
        <span className="flex items-center gap-1.5 px-1.5 py-1 text-xs" title="Реакции">
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
              'flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-all',
              favorited
                ? 'text-accent'
                : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
            )}
          >
            <Bookmark className={cn('h-3.5 w-3.5', favorited && 'fill-current')} />
            <span className="tabular-nums">{formatNumber(favoriteCount)}</span>
          </button>
        </span>
      </div>
    </article>
  );
}

export function postTypeLabel(type: PostCard['type']): string {
  return POST_TYPE_META[type].short;
}
