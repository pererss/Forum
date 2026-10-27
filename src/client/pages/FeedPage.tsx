// Лента: режимы, фильтры, сохранённые фильтры, скелетоны, пагинация.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PostCardItem } from '@/client/components/post/PostCardItem';
import { Button } from '@/client/components/ui/button';
import { EmptyState, ErrorState, FeedSkeleton } from '@/client/components/ui/primitives';
import { Input, Select } from '@/client/components/ui/form';
import { PageTransition } from '@/client/components/ui/motion';
import { apiDelete, apiPost, ApiError } from '@/client/lib/api';
import { useDebounced, useDocumentTitle } from '@/client/lib/hooks';
import {
  keys,
  useCategories,
  useFeed,
  useSavedFilters,
  useSession,
} from '@/client/lib/queries';
import { cn, pluralPosts } from '@/client/lib/utils';
import { POST_TYPES, POST_TYPE_META, type PostType } from '@/shared/post-types';

export type FeedView = 'feed' | 'drafts' | 'favorites';

const MODES = [
  { value: 'for-you', label: 'Для меня' },
  { value: 'new', label: 'Новое' },
  { value: 'popular', label: 'Популярное' },
  { value: 'following', label: 'Подписки' },
] as const;

export function FeedPage({ view = 'feed' }: { view?: FeedView }) {
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const mode = (searchParams.get('mode') ?? 'new') as (typeof MODES)[number]['value'];
  const type = searchParams.get('type') ?? '';
  const tag = searchParams.get('tag') ?? '';
  const category = searchParams.get('category') ?? '';
  const author = searchParams.get('author') ?? '';
  const sort = searchParams.get('sort') ?? 'new';
  const q = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const [searchValue, setSearchValue] = useState(q);
  const debouncedSearch = useDebounced(searchValue, 350);
  const [filtersOpen, setFiltersOpen] = useState(() => Boolean(type || tag || category || author || q));
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const isDrafts = view === 'drafts';
  const isFavorites = view === 'favorites';

  useDocumentTitle(
    isDrafts ? 'Черновики' : isFavorites ? 'Избранное' : mode === 'following' ? 'Подписки' : 'Лента',
  );

  useEffect(() => {
    setSearchValue(q);
  }, [q]);

  // Поиск с задержкой: обновляем URL, не дёргая API на каждый символ.
  useEffect(() => {
    if (debouncedSearch === q) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('q', debouncedSearch);
    else next.delete('q');
    next.delete('page');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const params = useMemo(() => {
    const base: Record<string, unknown> = {
      mode,
      sort,
      page,
      pageSize: 20,
    };
    if (type) base.type = type;
    if (tag) base.tag = tag;
    if (category) base.category = category;
    if (author) base.author = author;
    if (q) base.q = q;
    if (isDrafts) {
      base.mine = true;
      base.status = 'draft';
      base.mode = 'new';
      base.sort = 'new';
    }
    if (isFavorites) {
      base.favorite = true;
      base.mode = 'new';
      base.sort = 'new';
    }
    return base;
  }, [mode, sort, page, type, tag, category, author, q, isDrafts, isFavorites]);

  const feed = useFeed(params);
  const categories = useCategories();

  const setParam = (key: string, value: string | null, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (resetPage) next.delete('page');
    setSearchParams(next);
  };

  const resetFilters = () => {
    const next = new URLSearchParams();
    if (isDrafts) next.set('mode', 'new');
    setSearchParams(next);
    setFiltersOpen(false);
  };

  const activeFilters = [
    type ? { key: 'type', label: POST_TYPE_META[type as PostType]?.name ?? type } : null,
    category
      ? {
          key: 'category',
          label:
            categories.data?.items.find((item) => item.slug === category)?.name ?? category,
        }
      : null,
    tag ? { key: 'tag', label: `#${tag}` } : null,
    author ? { key: 'author', label: `@${author}` } : null,
    q ? { key: 'q', label: `«${q}»` } : null,
    sort !== 'new' ? { key: 'sort', label: sort === 'top' ? 'По реакциям' : 'По комментариям' } : null,
  ].filter(Boolean) as { key: string; label: string }[];

  const saved = useSavedFilters(Boolean(user));
  const saveMutation = useMutation({
    mutationFn: (input: { name: string; query: Record<string, unknown> }) =>
      apiPost('/posts/saved-filters', input),
    onSuccess: () => {
      setSaveOpen(false);
      setSaveName('');
      void queryClient.invalidateQueries({ queryKey: keys.savedFilters });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/posts/saved-filters/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.savedFilters }),
  });

  const applySaved = (query: Record<string, unknown>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '' && value !== false) {
        next.set(key, String(value));
      }
    }
    setSearchParams(next);
  };

  const headerTitle = isDrafts ? 'Черновики' : isFavorites ? 'Избранное' : 'Лента';
  const headerSubtitle = isDrafts
    ? 'Незаконченные материалы сохраняются автоматически и доступны только вам.'
    : isFavorites
      ? 'Публикации, которые вы сохранили. Доступно только вам.'
      : 'Спокойный поток идей, вопросов и проектов сообщества.';

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">{headerTitle}</h1>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              {headerSubtitle}
            </p>
          </div>
          {user ? (
            <Button asChild size="sm" variant="secondary" className="hidden sm:inline-flex">
              <Link to="/new">
                <Sparkles className="h-3.5 w-3.5" /> Создать
              </Link>
            </Button>
          ) : null}
        </header>

        {!user && view === 'feed' ? (
          <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-secondary/60 p-5">
            <div aria-hidden className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent/10 blur-2xl" />
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                Добро пожаловать
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold">
                Nuffy — место для идей и людей
              </h2>
              <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
                Войдите, чтобы собирать избранное, подписываться на темы и находить команду.
                Читать можно и без аккаунта.
              </p>
              <div className="mt-3 flex gap-2">
                <Button asChild size="sm">
                  <Link to="/auth">Войти</Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/explore">Смотреть обзор</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {view === 'feed' ? (
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
            {MODES.map((item) => {
              const active = mode === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setParam('mode', item.value)}
                  aria-pressed={active}
                  className={cn(
                    'relative flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                    active
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {mode === 'following' && view === 'feed' ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            В этой ленте — только авторы и теги, на которые вы подписаны.
            {!user ? ' Войдите, чтобы она наполнилась.' : ''}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={isDrafts ? 'Найти среди черновиков…' : 'Поиск по публикациям…'}
              className="pl-8"
              aria-label="Поиск по публикациям"
            />
            {searchValue ? (
              <button
                type="button"
                onClick={() => setSearchValue('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Очистить поиск"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Button
            type="button"
            variant={filtersOpen || activeFilters.length > 0 ? 'secondary' : 'outline'}
            size="md"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Фильтры
            {activeFilters.length > 0 ? (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                {activeFilters.length}
              </span>
            ) : null}
          </Button>
          {user && view === 'feed' ? (
            <Button type="button" variant="outline" size="md" onClick={() => setSaveOpen((open) => !open)}>
              <Bookmark className="h-4 w-4" />
              <span className="hidden sm:inline">Сохранить</span>
            </Button>
          ) : null}
        </div>

        {saveOpen ? (
          <form
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (saveName.trim().length < 2) return;
              saveMutation.mutate({ name: saveName.trim(), query: params });
            }}
          >
            <Input
              autoFocus
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder="Название фильтра"
              maxLength={60}
              className="min-w-[160px] flex-1"
            />
            <Button type="submit" size="md" loading={saveMutation.isPending} disabled={saveName.trim().length < 2}>
              Сохранить фильтр
            </Button>
            <Button type="button" size="md" variant="ghost" onClick={() => setSaveOpen(false)}>
              Отмена
            </Button>
            {saveMutation.isError ? (
              <span className="text-xs text-destructive">
                {saveMutation.error instanceof ApiError ? saveMutation.error.message : 'Ошибка'}
              </span>
            ) : null}
          </form>
        ) : null}

        {filtersOpen ? (
          <div className="space-y-3 rounded-lg border border-border bg-card p-3.5">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>Тип</span>
                <Select value={type} onChange={(event) => setParam('type', event.target.value || null)}>
                  <option value="">Все типы</option>
                  {POST_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {POST_TYPE_META[item].name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>Категория</span>
                <Select
                  value={category}
                  onChange={(event) => setParam('category', event.target.value || null)}
                >
                  <option value="">Все категории</option>
                  {(categories.data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.slug}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>Сортировка</span>
                <Select value={sort} onChange={(event) => setParam('sort', event.target.value || null)}>
                  <option value="new">Сначала новые</option>
                  <option value="top">По реакциям</option>
                  <option value="comments">По комментариям</option>
                </Select>
              </label>
            </div>
            {author ? (
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs">
                  Автор: <strong>@{author}</strong>
                  <button type="button" onClick={() => setParam('author', null)} aria-label="Убрать фильтр по автору">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            ) : null}
            {saved.data?.items && saved.data.items.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Сохранённые фильтры
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {saved.data.items.map((item) => (
                    <span
                      key={item.id}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs"
                    >
                      <button type="button" className="hover:text-accent" onClick={() => applySaved(item.query)}>
                        {item.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(item.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Удалить фильтр ${item.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFilters.map((filter) => (
              <span
                key={filter.key}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs"
              >
                {filter.label}
                <button
                  type="button"
                  onClick={() => {
                    if (filter.key === 'q') setSearchValue('');
                    setParam(filter.key, null);
                  }}
                  aria-label={`Убрать фильтр ${filter.label}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Сбросить всё
            </button>
          </div>
        ) : null}

        {feed.isLoading ? (
          <FeedSkeleton count={4} />
        ) : feed.isError ? (
          <ErrorState
            message={
              feed.error instanceof ApiError ? feed.error.message : 'Не удалось загрузить ленту.'
            }
            onRetry={() => void feed.refetch()}
          />
        ) : (feed.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Filter className="h-10 w-10" />}
            title={
              isDrafts
                ? 'Черновиков пока нет'
                : isFavorites
                  ? 'В избранном пусто'
                  : activeFilters.length > 0
                    ? 'Ничего не нашлось'
                    : 'Здесь пока тихо'
            }
            description={
              isDrafts
                ? 'Начните публикацию — черновик сохранится автоматически.'
                : isFavorites
                  ? 'Сохраняйте интересные публикации кнопкой с закладкой.'
                  : activeFilters.length > 0
                    ? 'Попробуйте изменить запрос или сбросить фильтры.'
                    : 'Станьте первым: опубликуйте идею, вопрос или проект.'
            }
            action={
              activeFilters.length > 0 ? (
                <Button variant="secondary" onClick={resetFilters}>
                  <RotateCcw className="h-4 w-4" /> Сбросить фильтры
                </Button>
              ) : user ? (
                <Button asChild>
                  <Link to="/new">Создать публикацию</Link>
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
              <span>
                {feed.data ? pluralPosts(feed.data.total) : ''}
              </span>
              {feed.isFetching ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> обновляем
                </span>
              ) : null}
            </div>
            <div className="space-y-3">
              {feed.data?.items.map((post) => (
                <PostCardItem key={post.id} post={post} />
              ))}
            </div>

            <nav className="flex items-center justify-between gap-2 pt-2" aria-label="Страницы ленты">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setParam('page', String(page - 1), false)}
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
                onClick={() => setParam('page', String(page + 1), false)}
              >
                Вперёд <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          </>
        )}

        {view === 'feed' && user && (feed.data?.items.length ?? 0) > 0 ? (
          <div className="flex items-center justify-center gap-1.5 pb-2 pt-1 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3" /> Показано до 3 публикаций одного автора подряд — против
            засорения ленты
          </div>
        ) : null}
      </div>
    </PageTransition>
  );
}
