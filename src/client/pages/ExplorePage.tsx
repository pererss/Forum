// Обзор: сетка публикаций, типы, категории, теги, сортировка.

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
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

const SORTS = [
  { value: 'new', label: 'Сначала новые' },
  { value: 'top', label: 'Популярные' },
  { value: 'comments', label: 'Обсуждаемые' },
];

export function ExplorePage() {
  const routeParams = useParams<{ type?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: session } = useSession();
  const categories = useCategories();
  const tags = useTagSuggestions('');
  const reduce = useReducedMotion();

  const type = routeParams.type && isPostType(routeParams.type) ? routeParams.type : '';
  const category = searchParams.get('category') ?? '';
  const tag = searchParams.get('tag') ?? '';
  const sort = searchParams.get('sort') ?? 'new';
  const q = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const [searchValue, setSearchValue] = useState(q);
  const debounced = useDebounced(searchValue, 350);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    setFiltersOpen(false);
  };

  const activeFilters = [
    category
      ? {
          key: 'category',
          label: categories.data?.items.find((item) => item.slug === category)?.name ?? category,
        }
      : null,
    tag ? { key: 'tag', label: `#${tag}` } : null,
    q ? { key: 'q', label: `«${q}»` } : null,
    sort !== 'new' ? { key: 'sort', label: SORTS.find((s) => s.value === sort)?.label ?? sort } : null,
  ].filter(Boolean) as { key: string; label: string }[];

  const closeFilter = (key: string) => {
    if (key === 'q') setSearchValue('');
    setParam(key, null);
  };

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-[1180px] space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3 pt-1">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent">
              Обзор
            </p>
            <h1 className="mt-1 font-display text-[26px] font-semibold leading-none tracking-[-0.03em]">
              {type ? POST_TYPE_META[type as PostType].short : 'Всё интересное'}
            </h1>
          </div>
          {feed.data ? (
            <p className="text-[11.5px] text-muted-foreground">
              {pluralPosts(feed.data.total)}
              {feed.isFetching ? (
                <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin align-[-1px]" />
              ) : null}
            </p>
          ) : null}
        </header>

        <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            to="/explore"
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-200',
              !type
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
            )}
          >
            Все
          </Link>
          {POST_TYPES.map((item) => (
            <Link
              key={item}
              to={`/explore/${item}`}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-200',
                type === item
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
              )}
            >
              {POST_TYPE_META[item].short}
            </Link>
          ))}
        </div>

        {/* Компактная панель: поиск + раскрывающиеся фильтры */}
        <div className="rounded-xl border border-border bg-card/60 p-2">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Найти в обзоре…"
                className="h-9 border-transparent bg-transparent pl-8 shadow-none focus-visible:border-input focus-visible:bg-card"
                aria-label="Поиск в обзоре"
              />
              {searchValue ? (
                <button
                  type="button"
                  onClick={() => setSearchValue('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Очистить"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-label={filtersOpen ? 'Скрыть фильтры' : 'Показать фильтры'}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors',
                filtersOpen || activeFilters.length > 0
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Фильтры</span>
              {activeFilters.length > 0 ? (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                  {activeFilters.length}
                </span>
              ) : null}
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-300',
                  filtersOpen && 'rotate-180',
                )}
              />
            </button>
          </div>

          <AnimatePresence initial={false}>
            {filtersOpen ? (
              <motion.div
                key="filters"
                initial={reduce ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduce ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="grid gap-2 px-1 pb-1 pt-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="px-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                      Категория
                    </span>
                    <Select
                      value={category}
                      onChange={(event) => setParam('category', event.target.value || null)}
                      aria-label="Категория"
                    >
                      <option value="">Все категории</option>
                      {(categories.data?.items ?? []).map((item) => (
                        <option key={item.id} value={item.slug}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="space-y-1">
                    <span className="px-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                      Сортировка
                    </span>
                    <Select
                      value={sort}
                      onChange={(event) => setParam('sort', event.target.value === 'new' ? null : event.target.value)}
                      aria-label="Сортировка"
                    >
                      {SORTS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>

                {(tags.data?.items.length ?? 0) > 0 ? (
                  <div className="px-1 pb-1 pt-2">
                    <p className="mb-1.5 px-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                      Теги
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(tags.data?.items ?? []).slice(0, 18).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setParam('tag', tag === item.slug ? null : item.slug)}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                            tag === item.slug
                              ? 'border-accent/50 bg-accent/10 text-accent'
                              : 'border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                          )}
                        >
                          #{item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeFilters.length > 0 ? (
                  <div className="px-1 pb-1 pt-2">
                    <button
                      type="button"
                      onClick={reset}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <RotateCcw className="h-3 w-3" /> Сбросить всё
                    </button>
                  </div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {!filtersOpen && activeFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1 pt-2">
              {activeFilters.map((filter) => (
                <span
                  key={filter.key}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px]"
                >
                  {filter.label}
                  <button
                    type="button"
                    onClick={() => closeFilter(filter.key)}
                    aria-label={`Убрать фильтр ${filter.label}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {feed.isLoading ? (
          <FeedSkeleton count={6} layout="grid" />
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
              activeFilters.length > 0 ? (
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {feed.data?.items.map((post, index) => (
                <Reveal key={post.id} delay={Math.min(index, 10) * 0.025} y={10}>
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
      </div>
    </PageTransition>
  );
}
