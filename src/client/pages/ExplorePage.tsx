// Обзор: сетка публикаций, типы, категории, теги, сортировка.

import { ChevronLeft, ChevronRight, Compass, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PostCardItem } from '@/client/components/post/PostCardItem';
import { Button } from '@/client/components/ui/button';
import { Input, Select } from '@/client/components/ui/form';
import { EmptyState, ErrorState, FeedSkeleton } from '@/client/components/ui/primitives';
import { PageTransition, Reveal } from '@/client/components/ui/motion';
import { ApiError } from '@/client/lib/api';
import { useDebounced, useDocumentTitle } from '@/client/lib/hooks';
import { useCategories, useFeed, useSession, useTagSuggestions } from '@/client/lib/queries';
import { cn, pluralPosts } from '@/client/lib/utils';
import { isPostType, POST_TYPE_META, POST_TYPES, type PostType } from '@/shared/post-types';

export function ExplorePage() {
  const routeParams = useParams<{ type?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: session } = useSession();
  const categories = useCategories();
  const tags = useTagSuggestions('');

  const type = routeParams.type && isPostType(routeParams.type) ? routeParams.type : '';
  const category = searchParams.get('category') ?? '';
  const tag = searchParams.get('tag') ?? '';
  const sort = searchParams.get('sort') ?? 'new';
  const q = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const [searchValue, setSearchValue] = useState(q);
  const debounced = useDebounced(searchValue, 350);

  useDocumentTitle(type ? POST_TYPE_META[type as PostType].short : 'Обзор');

  useEffect(() => {
    setSearchValue(q);
  }, [q]);

  useEffect(() => {
    if (debounced === q) return;
    const next = new URLSearchParams(searchParams);
    if (debounced) next.set('q', debounced);
    else next.delete('q');
    next.delete('page');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const params = useMemo(() => {
    const base: Record<string, unknown> = { mode: 'new', sort, page, pageSize: 24 };
    if (type) base.type = type;
    if (category) base.category = category;
    if (tag) base.tag = tag;
    if (q) base.q = q;
    return base;
  }, [type, category, tag, sort, page, q]);

  const feed = useFeed(params);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  };

  const reset = () => {
    setSearchParams({});
    setSearchValue('');
  };

  const hasFilters = Boolean(category || tag || q || sort !== 'new');

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-[1200px] space-y-5">
        <header className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-secondary/50 px-5 py-5 sm:px-6">
          <div aria-hidden className="surface-grid pointer-events-none absolute inset-0 opacity-[0.18]" />
          <div className="relative flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                <Compass className="h-3.5 w-3.5" /> Обзор сообщества
              </p>
              <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em]">
                {type ? POST_TYPE_META[type as PostType].short : 'Всё интересное в одном месте'}
              </h1>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                {type
                  ? POST_TYPE_META[type as PostType].description
                  : 'Фильтруйте по формату, категории и тегам. Сетка адаптируется от телефона до широкого экрана.'}
              </p>
            </div>
            {feed.data ? (
              <div className="text-right">
                <p className="font-display text-2xl font-semibold tabular-nums">{feed.data.total}</p>
                <p className="text-[11px] text-muted-foreground">
                  {pluralPosts(feed.data.total)}
                </p>
              </div>
            ) : null}
          </div>
        </header>

        <div className="flex gap-1 overflow-x-auto pb-0.5">
          <Link
            to="/explore"
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              !type
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            Все форматы
          </Link>
          {POST_TYPES.map((item) => (
            <Link
              key={item}
              to={`/explore/${item}`}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                type === item
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground',
              )}
            >
              {POST_TYPE_META[item].short}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Что ищем?"
              className="pl-8"
              aria-label="Поиск в обзоре"
            />
            {searchValue ? (
              <button
                type="button"
                onClick={() => setSearchValue('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Очистить"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Select
            value={category}
            onChange={(event) => setParam('category', event.target.value || null)}
            className="w-auto min-w-[150px]"
            aria-label="Категория"
          >
            <option value="">Все категории</option>
            {(categories.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(event) => setParam('sort', event.target.value === 'new' ? null : event.target.value)}
            className="w-auto min-w-[140px]"
            aria-label="Сортировка"
          >
            <option value="new">Новые</option>
            <option value="top">Популярные</option>
            <option value="comments">Обсуждаемые</option>
          </Select>
          {hasFilters ? (
            <Button variant="ghost" size="md" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Сбросить
            </Button>
          ) : null}
        </div>

        {(tags.data?.items.length ?? 0) > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Теги:</span>
            {(tags.data?.items ?? []).slice(0, 14).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setParam('tag', tag === item.slug ? null : item.slug)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  tag === item.slug
                    ? 'border-accent/50 bg-accent/10 text-accent'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                #{item.name}
              </button>
            ))}
          </div>
        ) : null}

        {feed.isLoading ? (
          <FeedSkeleton count={6} />
        ) : feed.isError ? (
          <ErrorState
            message={feed.error instanceof ApiError ? feed.error.message : 'Не удалось загрузить обзор.'}
            onRetry={() => void feed.refetch()}
          />
        ) : (feed.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Публикаций не найдено"
            description="Смените фильтры или станьте первым автором в этом разделе."
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={reset}>
                  <RotateCcw className="h-4 w-4" /> Сбросить фильтры
                </Button>
              ) : session?.user ? (
                <Button asChild>
                  <Link to={`/new${type ? `?type=${type}` : ''}`}>Создать публикацию</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/auth">Войти</Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{pluralPosts(feed.data?.total ?? 0)}</span>
              {feed.isFetching ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> обновляем
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {feed.data?.items.map((post, index) => (
                <Reveal key={post.id} delay={Math.min(index, 8) * 0.03}>
                  <PostCardItem post={post} variant="grid" />
                </Reveal>
              ))}
            </div>
            <nav className="flex items-center justify-between gap-2 pt-2" aria-label="Страницы обзора">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('page', String(page - 1));
                  setSearchParams(next);
                }}
              >
                <ChevronLeft className="h-4 w-4" /> Назад
              </Button>
              <span className="text-xs text-muted-foreground">
                Страница {page}
                {feed.data && feed.data.total > feed.data.pageSize
                  ? ` из ${Math.max(1, Math.ceil(feed.data.total / feed.data.pageSize))}`
                  : ''}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!feed.data?.hasMore}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('page', String(page + 1));
                  setSearchParams(next);
                }}
              >
                Вперёд <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          </>
        )}

        <p className="pt-2 text-center text-[11px] text-muted-foreground/60">
          Пагинация по серверу · без бесконечной подгрузки и скрытых счётчиков
        </p>
      </div>
    </PageTransition>
  );
}
