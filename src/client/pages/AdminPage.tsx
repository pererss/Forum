// Админ-панель: 12 разделов, все операции на сервере под requireAdmin.
// Интерфейс только отправляет запросы и показывает реальные данные из базы.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Ban,
  BarChart3,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  EyeOff,
  FileText,
  Flag,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Lock,
  MessageSquare,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  Sparkles,
  Tag,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/client/components/ui/button';
import { Input, Select, Textarea } from '@/client/components/ui/form';
import { Avatar, Badge, EmptyState, Skeleton } from '@/client/components/ui/primitives';
import { PageTransition } from '@/client/components/ui/motion';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, ApiError } from '@/client/lib/api';
import { useDebounced, useDocumentTitle } from '@/client/lib/hooks';
import { keys, useSession } from '@/client/lib/queries';
import { cn, formatDateTime, formatNumber, timeAgo } from '@/client/lib/utils';
import type { AchievementDto } from '@/shared/types';

// ————— Общие типы —————

type Paged<T> = { items: T[]; page: number; pageSize: number; total: number; hasMore: boolean };

type AdminStats = {
  users: number;
  posts: number;
  comments: number;
  activeProjects: number;
  openReports: number;
  banned: number;
  drafts: number;
  xpEvents: number;
  recent: { day: string; posts: number; comments: number }[];
};

type AdminUserRow = {
  id: string;
  username: string | null;
  displayName: string;
  email: string | null;
  role: 'user' | 'moderator' | 'admin';
  status: 'active' | 'limited' | 'banned';
  xp: number;
  reputation: number;
  level: number;
  postCount: number;
  createdAt: string;
};

type AdminPostRow = {
  id: string;
  type: string;
  title: string;
  status: string;
  author: { username: string | null; displayName: string };
  commentCount: number;
  reactionScore: number;
  createdAt: string;
  publishedAt: string | null;
};

type AdminCommentRow = {
  id: string;
  body: string;
  status: string;
  reactionScore: number;
  createdAt: string;
  author: { username: string | null; displayName: string };
  post: { id: string; title: string };
};

type AdminCategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  post_count: string;
};

type AdminTagRow = {
  id: string;
  slug: string;
  name: string;
  usage_count: number;
  is_active: boolean;
};

type AdminPostTypeRow = {
  type: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  is_enabled: boolean;
  sort_order: number;
};

type AdminReportRow = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: 'open' | 'resolved' | 'rejected';
  createdAt: string;
  reporter: { username: string | null; displayName: string };
  targetPreview: string | null;
};

type AdminLogRow = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: unknown;
  createdAt: string;
  admin: { username: string | null; displayName: string };
};

type AdminSettingRow = {
  key: string;
  value: unknown;
  description: string;
  updatedAt: string;
};

type DiagnosticsData = {
  node: { version: string; env: string; uptimeSec: number };
  database: {
    target: string;
    ready: boolean;
    latencyMs: number | null;
    error: string | null;
    schema: string;
    tables: number;
    migrations: { id: string; appliedAt: string }[];
    bootState: { ready: boolean; code: string | null };
  };
  auth: { googleConfigured: boolean; devLoginEnabled: boolean; adminEmailsCount: number };
  rateLimit: { scale: number };
};

type BackupData = {
  available: boolean;
  method: string;
  instructions: string;
  tables: { name: string; rows: number }[];
  note: string;
};

// ————— Разделы —————

const SECTIONS = [
  { key: 'overview', label: 'Обзор', icon: LayoutDashboard },
  { key: 'users', label: 'Пользователи', icon: Users },
  { key: 'posts', label: 'Публикации', icon: FileText },
  { key: 'comments', label: 'Комментарии', icon: MessageSquare },
  { key: 'categories', label: 'Категории', icon: ListChecks },
  { key: 'tags', label: 'Теги', icon: Tag },
  { key: 'post-types', label: 'Типы публикаций', icon: Sparkles },
  { key: 'progress', label: 'XP и достижения', icon: Gauge },
  { key: 'reports', label: 'Жалобы', icon: Flag },
  { key: 'settings', label: 'Настройки', icon: Settings },
  { key: 'logs', label: 'Журнал', icon: Activity },
  { key: 'diagnostics', label: 'Диагностика', icon: Database },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

// ————— Общие элементы —————

function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 shadow-card sm:p-5', className)}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Flash({ message, error }: { message: string | null; error: string | null }) {
  if (!message && !error) return null;
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={cn(
        'mb-3 flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium',
        error ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
      )}
    >
      {error ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      {error ?? message}
    </p>
  );
}

function Pager({
  page,
  total,
  pageSize,
  hasMore,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  hasMore: boolean;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  return (
    <nav className="mt-3 flex items-center justify-between gap-2" aria-label="Страницы">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="h-3.5 w-3.5" /> Назад
      </Button>
      <span className="text-[11px] text-muted-foreground">
        Страница {page} из {pages} · всего {formatNumber(total)}
      </span>
      <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => onChange(page + 1)}>
        Вперёд <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </nav>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-[180px] flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 text-xs"
        aria-label={placeholder}
      />
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

function useAdminAction() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<unknown>, success = 'Готово') => {
    setBusy(key);
    setMessage(null);
    setError(null);
    try {
      await action();
      setMessage(success);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      await queryClient.invalidateQueries({ queryKey: ['feed'] });
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось выполнить действие');
      return false;
    } finally {
      setBusy(null);
    }
  };

  return { busy, message, error, run, setError, setMessage };
}

function usePagedQuery<T>(
  key: readonly unknown[],
  path: string,
  page: number,
  q: string,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (q.trim()) params.set('q', q.trim());
  for (const [name, value] of Object.entries(extra)) {
    if (value) params.set(name, value);
  }
  return useQuery({
    queryKey: [...key, { page, q: q.trim(), ...extra }],
    queryFn: () => apiGet<Paged<T>>(`${path}?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

// ————— 1. Обзор —————

function OverviewSection() {
  const stats = useQuery({
    queryKey: keys.adminStats,
    queryFn: () => apiGet<AdminStats>('/admin/stats'),
  });

  if (stats.isLoading) return <TableSkeleton rows={4} />;
  if (stats.isError) {
    return (
      <Panel>
        <p className="text-sm text-destructive">
          {stats.error instanceof ApiError ? stats.error.message : 'Не удалось загрузить статистику.'}
        </p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => void stats.refetch()}>
          <RefreshCw className="h-3.5 w-3.5" /> Повторить
        </Button>
      </Panel>
    );
  }
  const data = stats.data;
  if (!data) return null;

  const cards = [
    { label: 'пользователей', value: data.users, icon: Users },
    { label: 'публикаций', value: data.posts, icon: FileText },
    { label: 'комментариев', value: data.comments, icon: MessageSquare },
    { label: 'активных команд', value: data.activeProjects, icon: Shield },
    { label: 'открытых жалоб', value: data.openReports, icon: Flag },
    { label: 'заблокированных', value: data.banned, icon: Ban },
    { label: 'черновиков', value: data.drafts, icon: FileText },
    { label: 'событий опыта', value: data.xpEvents, icon: Gauge },
  ];

  const max = Math.max(1, ...data.recent.flatMap((day) => [day.posts, day.comments]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-border bg-card p-3.5 shadow-card">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
                {formatNumber(card.value)}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
            </div>
          );
        })}
      </div>

      <Panel title="Последние 7 дней" description="Только реальные данные: публикации и видимые комментарии.">
        {data.recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет данных за период.</p>
        ) : (
          <div className="flex items-end gap-2">
            {data.recent.map((day) => (
              <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-28 w-full items-end justify-center gap-0.5">
                  <div
                    className="w-2.5 rounded-t bg-accent/80"
                    style={{ height: `${Math.max(2, (day.posts / max) * 100)}%` }}
                    title={`${day.posts} публикаций`}
                  />
                  <div
                    className="w-2.5 rounded-t bg-muted-foreground/40"
                    style={{ height: `${Math.max(2, (day.comments / max) * 100)}%` }}
                    title={`${day.comments} комментариев`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{day.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-accent/80" /> публикации
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> комментарии
          </span>
        </div>
      </Panel>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <BarChart3 className="h-3 w-3" /> Метрики считаются запросами к базе при каждом открытии раздела —
        без кэша и «примерных» чисел.
      </p>
    </div>
  );
}

// ————— 2. Пользователи —————

function UserRow({ user }: { user: AdminUserRow }) {
  const { busy, run } = useAdminAction();
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [xpOpen, setXpOpen] = useState(false);
  const [xp, setXp] = useState('10');
  const [reason, setReason] = useState('');

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start gap-2.5">
        <Avatar name={user.displayName} username={user.username ?? user.id} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {user.displayName}
            {user.username ? <span className="text-muted-foreground"> @{user.username}</span> : null}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {user.email ?? 'без email'} · {user.level} ур. · {formatNumber(user.xp)} XP ·{' '}
            {user.postCount} публ. · с {formatDateTime(user.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as AdminUserRow['role'])}
            className="h-7 w-auto text-[11px]"
            aria-label="Роль"
          >
            <option value="user">участник</option>
            <option value="moderator">модератор</option>
            <option value="admin">админ</option>
          </Select>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as AdminUserRow['status'])}
            className="h-7 w-auto text-[11px]"
            aria-label="Статус"
          >
            <option value="active">активен</option>
            <option value="limited">ограничен</option>
            <option value="banned">заблокирован</option>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'save'}
            disabled={role === user.role && status === user.status}
            onClick={() =>
              void run(
                'save',
                () => apiPatch(`/admin/users/${user.id}`, { role, status }),
                'Пользователь обновлён',
              )
            }
          >
            Сохранить
          </Button>
          <Button size="sm" variant="outline" onClick={() => setXpOpen((open) => !open)}>
            <Gauge className="h-3.5 w-3.5" /> XP
          </Button>
        </div>
      </div>
      {xpOpen ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2">
          <label className="text-[11px] text-muted-foreground">
            Опыт (+/−)
            <Input
              type="number"
              value={xp}
              onChange={(event) => setXp(event.target.value)}
              className="mt-1 h-8 w-24"
            />
          </label>
          <label className="min-w-[160px] flex-1 text-[11px] text-muted-foreground">
            Причина
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Например, помощь новичкам"
              maxLength={200}
              className="mt-1 h-8"
            />
          </label>
          <Button
            size="sm"
            loading={busy === 'xp'}
            disabled={!reason.trim() || reason.trim().length < 3 || !Number(xp)}
            onClick={() =>
              void run(
                'xp',
                () => apiPost(`/admin/users/${user.id}/xp`, { xp: Number(xp), reason: reason.trim() }),
                'Опыт начислен',
              ).then((ok) => {
                if (ok) {
                  setXpOpen(false);
                  setReason('');
                }
              })
            }
          >
            Применить
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function UsersSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const list = usePagedQuery<AdminUserRow>(keys.adminUsers({}), '/admin/users', page, q);

  return (
    <Panel
      title="Пользователи"
      description="Роли и блокировки меняются на сервере и пишутся в журнал. Себя понизить или заблокировать нельзя."
    >
      <div className="mb-3 flex items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Ник, имя или email" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSearch('');
            setPage(1);
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      {list.isLoading ? (
        <TableSkeleton />
      ) : list.isError ? (
        <p className="text-sm text-destructive">Не удалось загрузить пользователей.</p>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="Никого не нашли" description="Измените запрос." />
      ) : (
        <>
          <div className="space-y-1.5">
            {list.data?.items.map((row) => (
              <UserRow key={row.id} user={row} />
            ))}
          </div>
          <Pager
            page={list.data?.page ?? 1}
            total={list.data?.total ?? 0}
            pageSize={list.data?.pageSize ?? 20}
            hasMore={list.data?.hasMore ?? false}
            onChange={setPage}
          />
        </>
      )}
    </Panel>
  );
}

// ————— 3. Публикации —————

function PostsSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search, 300);
  const list = usePagedQuery<AdminPostRow>(keys.adminPosts({}), '/admin/posts', page, q, { status });
  const { busy, message, error, run } = useAdminAction();

  const moderate = (id: string, action: string, label: string) =>
    void run(`${id}:${action}`, () => apiPost(`/admin/posts/${id}/moderate`, { action }), label);

  return (
    <Panel title="Публикации" description="Скрытие, восстановление, закрепление и блокировка обсуждения.">
      <Flash message={message} error={error} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Заголовок или текст" />
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="h-8 w-auto text-xs"
          aria-label="Статус"
        >
          <option value="">Все статусы</option>
          <option value="published">Опубликовано</option>
          <option value="draft">Черновик</option>
          <option value="hidden">Скрыто</option>
          <option value="removed">Удалено</option>
        </Select>
      </div>
      {list.isLoading ? (
        <TableSkeleton />
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={<FileText className="h-8 w-8" />} title="Публикаций нет" description="Попробуйте другой фильтр." />
      ) : (
        <>
          <div className="space-y-1.5">
            {list.data?.items.map((row) => (
              <div key={row.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/post/${row.id}`}
                      className="line-clamp-1 text-sm font-medium hover:text-accent"
                    >
                      {row.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {row.type} · {row.author.displayName} · {formatDateTime(row.createdAt)} ·{' '}
                      {row.commentCount} комм. · {row.reactionScore} реакций
                    </p>
                  </div>
                  <Badge
                    tone={
                      row.status === 'published'
                        ? 'teal'
                        : row.status === 'draft'
                          ? 'amber'
                          : row.status === 'hidden'
                            ? 'orange'
                            : 'rose'
                    }
                  >
                    {row.status}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" loading={busy === `${row.id}:hide`} onClick={() => moderate(row.id, 'hide', 'Скрыто')}>
                    <EyeOff className="h-3 w-3" /> Скрыть
                  </Button>
                  <Button size="sm" variant="outline" loading={busy === `${row.id}:restore`} onClick={() => moderate(row.id, 'restore', 'Восстановлено')}>
                    <RotateCcw className="h-3 w-3" /> Вернуть
                  </Button>
                  <Button size="sm" variant="outline" loading={busy === `${row.id}:pin`} onClick={() => moderate(row.id, 'pin', 'Закреплено')}>
                    <Pin className="h-3 w-3" /> Закрепить
                  </Button>
                  <Button size="sm" variant="outline" loading={busy === `${row.id}:unpin`} onClick={() => moderate(row.id, 'unpin', 'Откреплено')}>
                    Открепить
                  </Button>
                  <Button size="sm" variant="outline" loading={busy === `${row.id}:lock`} onClick={() => moderate(row.id, 'lock', 'Обсуждение закрыто')}>
                    <Lock className="h-3 w-3" /> Закрыть
                  </Button>
                  <Button size="sm" variant="outline" loading={busy === `${row.id}:unlock`} onClick={() => moderate(row.id, 'unlock', 'Обсуждение открыто')}>
                    Открыть
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={busy === `${row.id}:remove`}
                    onClick={() => {
                      if (window.confirm('Пометить публикацию как удалённую?')) moderate(row.id, 'remove', 'Удалено');
                    }}
                  >
                    <Trash2 className="h-3 w-3" /> Удалить
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Pager
            page={list.data?.page ?? 1}
            total={list.data?.total ?? 0}
            pageSize={list.data?.pageSize ?? 20}
            hasMore={list.data?.hasMore ?? false}
            onChange={setPage}
          />
        </>
      )}
    </Panel>
  );
}

// ————— 4. Комментарии —————

function CommentsSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const list = usePagedQuery<AdminCommentRow>(keys.adminComments({}), '/admin/comments', page, q);
  const { busy, message, error, run } = useAdminAction();

  const moderate = (id: string, action: 'hide' | 'restore' | 'remove', label: string) =>
    void run(`${id}:${action}`, () => apiPost(`/admin/comments/${id}/moderate`, { action }), label);

  return (
    <Panel title="Комментарии" description="Скрытые комментарии не видны в публикации, но остаются в базе.">
      <Flash message={message} error={error} />
      <div className="mb-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Текст комментария" />
      </div>
      {list.isLoading ? (
        <TableSkeleton />
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={<MessageSquare className="h-8 w-8" />} title="Комментариев нет" description="Измените запрос." />
      ) : (
        <>
          <div className="space-y-1.5">
            {list.data?.items.map((row) => (
              <div key={row.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{row.author.displayName}</span>
                  <span>· {row.post.title}</span>
                  <span>· {formatDateTime(row.createdAt)}</span>
                  <Badge
                    tone={row.status === 'visible' ? 'teal' : row.status === 'hidden' ? 'amber' : 'rose'}
                    className="ml-auto"
                  >
                    {row.status}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed">{row.body}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" loading={busy === `${row.id}:hide`} onClick={() => moderate(row.id, 'hide', 'Скрыто')}>
                    <EyeOff className="h-3 w-3" /> Скрыть
                  </Button>
                  <Button size="sm" variant="outline" loading={busy === `${row.id}:restore`} onClick={() => moderate(row.id, 'restore', 'Восстановлено')}>
                    <RotateCcw className="h-3 w-3" /> Вернуть
                  </Button>
                  <Button size="sm" variant="destructive" loading={busy === `${row.id}:remove`} onClick={() => moderate(row.id, 'remove', 'Удалено')}>
                    <Trash2 className="h-3 w-3" /> Удалить
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Pager
            page={list.data?.page ?? 1}
            total={list.data?.total ?? 0}
            pageSize={list.data?.pageSize ?? 20}
            hasMore={list.data?.hasMore ?? false}
            onChange={setPage}
          />
        </>
      )}
    </Panel>
  );
}

// ————— 5. Категории —————

function CategoriesSection() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: keys.adminCategories,
    queryFn: () => apiGet<{ items: AdminCategoryRow[] }>('/admin/categories'),
  });
  const { busy, message, error, run } = useAdminAction();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');

  const create = () =>
    void run(
      'create',
      async () => {
        await apiPost('/admin/categories', {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
        });
        setName('');
        setSlug('');
        setDescription('');
        await queryClient.invalidateQueries({ queryKey: keys.adminCategories });
      },
      'Категория создана',
    );

  return (
    <div className="space-y-4">
      <Panel title="Новая категория" description="Slug — латиница, цифры и дефис; используется в ссылках.">
        <Flash message={message} error={error} />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Название" maxLength={60} />
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            placeholder="slug"
            maxLength={60}
          />
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Описание (необязательно)"
            maxLength={300}
          />
        </div>
        <Button
          size="sm"
          className="mt-2"
          loading={busy === 'create'}
          disabled={name.trim().length < 2 || slug.trim().length < 2}
          onClick={create}
        >
          <Plus className="h-3.5 w-3.5" /> Создать
        </Button>
      </Panel>

      <Panel title="Все категории">
        {list.isLoading ? (
          <TableSkeleton />
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">Категорий пока нет.</p>
        ) : (
          <div className="space-y-1.5">
            {list.data?.items.map((row) => (
              <CategoryRow key={row.id} row={row} busy={busy} run={run} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function CategoryRow({
  row,
  busy,
  run,
}: {
  row: AdminCategoryRow;
  busy: string | null;
  run: (key: string, action: () => Promise<unknown>, success?: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description ?? '');

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          {row.slug}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {row.post_count} публ. · порядок {row.sort_order}
        </span>
        <Badge tone={row.is_active ? 'teal' : 'neutral'} className="ml-auto">
          {row.is_active ? 'активна' : 'скрыта'}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} className="h-8 max-w-[200px] text-xs" aria-label="Название категории" />
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="h-8 min-w-[160px] flex-1 text-xs"
          placeholder="Описание"
          aria-label="Описание категории"
        />
        <Button
          size="sm"
          variant="secondary"
          loading={busy === `${row.id}:save`}
          onClick={() =>
            void run(
              `${row.id}:save`,
              () =>
                apiPatch(`/admin/categories/${row.id}`, {
                  name: name.trim(),
                  description: description.trim() || null,
                }),
              'Категория обновлена',
            )
          }
        >
          <Save className="h-3 w-3" /> Сохранить
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={busy === `${row.id}:toggle`}
          onClick={() =>
            void run(
              `${row.id}:toggle`,
              () => apiPatch(`/admin/categories/${row.id}`, { isActive: !row.is_active }),
              row.is_active ? 'Категория скрыта' : 'Категория активирована',
            )
          }
        >
          {row.is_active ? 'Скрыть' : 'Активировать'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={busy === `${row.id}:delete`}
          onClick={() => {
            if (!window.confirm(`Удалить категорию «${row.name}»? Если к ней привязаны публикации, она будет деактивирована.`)) return;
            void run(`${row.id}:delete`, () => apiDelete(`/admin/categories/${row.id}`), 'Категория удалена');
          }}
          aria-label="Удалить категорию"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ————— 6. Теги —————

function TagsSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const list = usePagedQuery<AdminTagRow>(keys.adminTags({}), '/admin/tags', page, q);
  const { busy, message, error, run } = useAdminAction();

  return (
    <Panel title="Теги" description="Деактивированный тег нельзя выбрать в редакторе, он не исчезает из старых публикаций.">
      <Flash message={message} error={error} />
      <div className="mb-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Название или slug" />
      </div>
      {list.isLoading ? (
        <TableSkeleton />
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={<Tag className="h-8 w-8" />} title="Тегов нет" description="Теги появляются вместе с публикациями." />
      ) : (
        <>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {list.data?.items.map((row) => (
              <div key={row.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5">
                <span className={cn('text-sm', !row.is_active && 'text-muted-foreground line-through')}>
                  #{row.name}
                </span>
                <span className="text-[11px] text-muted-foreground">{row.usage_count}</span>
                <Button
                  size="sm"
                  variant={row.is_active ? 'ghost' : 'secondary'}
                  className="ml-auto"
                  loading={busy === `${row.id}:toggle`}
                  onClick={() =>
                    void run(
                      `${row.id}:toggle`,
                      () => apiPatch(`/admin/tags/${row.id}`, { isActive: !row.is_active }),
                      row.is_active ? 'Тег скрыт' : 'Тег активирован',
                    )
                  }
                >
                  {row.is_active ? 'Скрыть' : 'Вернуть'}
                </Button>
              </div>
            ))}
          </div>
          <Pager
            page={list.data?.page ?? 1}
            total={list.data?.total ?? 0}
            pageSize={list.data?.pageSize ?? 20}
            hasMore={list.data?.hasMore ?? false}
            onChange={setPage}
          />
        </>
      )}
    </Panel>
  );
}

// ————— 7. Типы публикаций —————

function PostTypesSection() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: keys.adminPostTypes,
    queryFn: () => apiGet<{ items: AdminPostTypeRow[] }>('/admin/post-types'),
  });
  const { busy, message, error, run } = useAdminAction();

  return (
    <Panel
      title="Типы публикаций"
      description="Отключённый формат остаётся в базе, но не предлагается при создании."
    >
      <Flash message={message} error={error} />
      {list.isLoading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="space-y-1.5">
          {list.data?.items.map((row) => (
            <div key={row.type} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {row.name} <span className="font-mono text-[10px] text-muted-foreground">{row.type}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{row.description}</p>
                </div>
                <Badge tone={row.is_enabled ? 'teal' : 'neutral'}>
                  {row.is_enabled ? 'включён' : 'выключен'}
                </Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === `${row.type}:toggle`}
                  onClick={() =>
                    void run(
                      `${row.type}:toggle`,
                      async () => {
                        await apiPatch(`/admin/post-types/${row.type}`, { isEnabled: !row.is_enabled });
                        await queryClient.invalidateQueries({ queryKey: keys.adminPostTypes });
                      },
                      row.is_enabled ? 'Формат отключён' : 'Формат включён',
                    )
                  }
                >
                  {row.is_enabled ? 'Отключить' : 'Включить'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ————— 8. XP, уровни, достижения —————

function ProgressSection() {
  const queryClient = useQueryClient();
  const progress = useQuery({
    queryKey: keys.adminProgress,
    queryFn: () =>
      apiGet<{ rules: Record<string, number>; thresholds: { level: number; xp: number }[]; achievements: AchievementDto[] }>(
        '/admin/progress',
      ),
  });
  const { busy, message, error, run } = useAdminAction();
  const [rules, setRules] = useState<Record<string, number> | null>(null);
  const [thresholds, setThresholds] = useState<{ level: number; xp: number }[] | null>(null);
  const [slug, setSlug] = useState('');
  const [achName, setAchName] = useState('');
  const [achDescription, setAchDescription] = useState('');

  const effectiveRules = rules ?? progress.data?.rules ?? {};
  const effectiveThresholds = thresholds ?? progress.data?.thresholds ?? [];

  return (
    <div className="space-y-4">
      <Flash message={message} error={error} />
      <Panel title="Правила опыта" description="Сколько XP начисляется за действие. Значения применяются сервером, клиент их не меняет.">
        {progress.isLoading ? (
          <TableSkeleton rows={4} />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(effectiveRules).map(([key, value]) => (
                <label key={key} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs">
                  <span className="font-mono text-[11px] text-muted-foreground">{key}</span>
                  <Input
                    type="number"
                    min={0}
                    value={value}
                    onChange={(event) =>
                      setRules({ ...effectiveRules, [key]: Math.max(0, Number(event.target.value) || 0) })
                    }
                    className="h-7 w-20 text-right text-xs"
                    aria-label={key}
                  />
                </label>
              ))}
            </div>
            <Button
              size="sm"
              className="mt-3"
              loading={busy === 'rules'}
              onClick={() =>
                void run(
                  'rules',
                  async () => {
                    await apiPut('/admin/progress/rules', effectiveRules);
                    await queryClient.invalidateQueries({ queryKey: keys.adminProgress });
                    setRules(null);
                  },
                  'Правила сохранены',
                )
              }
            >
              <Save className="h-3.5 w-3.5" /> Сохранить правила
            </Button>
          </>
        )}
      </Panel>

      <Panel title="Пороги уровней" description="Опыт должен строго возрастать. Изменения видны в профилях после пересчёта.">
        {progress.isLoading ? (
          <TableSkeleton rows={3} />
        ) : (
          <>
            <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
              {effectiveThresholds.map((threshold, index) => (
                <label
                  key={threshold.level}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-xs"
                >
                  <span className="w-10 shrink-0 text-muted-foreground">ур. {threshold.level}</span>
                  <Input
                    type="number"
                    min={0}
                    value={threshold.xp}
                    onChange={(event) => {
                      const next = [...effectiveThresholds];
                      next[index] = { ...threshold, xp: Math.max(0, Number(event.target.value) || 0) };
                      setThresholds(next);
                    }}
                    className="h-7 text-right text-xs"
                    aria-label={`Опыт для уровня ${threshold.level}`}
                  />
                </label>
              ))}
            </div>
            <Button
              size="sm"
              className="mt-2"
              loading={busy === 'thresholds'}
              onClick={() =>
                void run(
                  'thresholds',
                  async () => {
                    await apiPut('/admin/progress/thresholds', effectiveThresholds);
                    await queryClient.invalidateQueries({ queryKey: keys.adminProgress });
                    setThresholds(null);
                  },
                  'Пороги сохранены',
                )
              }
            >
              <Save className="h-3.5 w-3.5" /> Сохранить пороги
            </Button>
          </>
        )}
      </Panel>

      <Panel title="Достижения" description="Награды выдаются сервером по событиям; здесь можно создать новую или снять с выдачи.">
        {progress.isLoading ? (
          <TableSkeleton rows={2} />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} placeholder="slug" maxLength={40} />
              <Input value={achName} onChange={(event) => setAchName(event.target.value)} placeholder="Название" maxLength={60} />
              <Input
                value={achDescription}
                onChange={(event) => setAchDescription(event.target.value)}
                placeholder="Описание"
                maxLength={300}
              />
            </div>
            <Button
              size="sm"
              className="mt-2"
              loading={busy === 'achievement'}
              disabled={slug.trim().length < 2 || achName.trim().length < 2}
              onClick={() =>
                void run(
                  'achievement',
                  async () => {
                    await apiPost('/admin/progress/achievements', {
                      slug: slug.trim(),
                      name: achName.trim(),
                      description: achDescription.trim(),
                    });
                    await queryClient.invalidateQueries({ queryKey: keys.adminProgress });
                    setSlug('');
                    setAchName('');
                    setAchDescription('');
                  },
                  'Достижение сохранено',
                )
              }
            >
              <Plus className="h-3.5 w-3.5" /> Добавить
            </Button>

            <div className="mt-3 space-y-1.5">
              {(progress.data?.achievements ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Достижений пока нет.</p>
              ) : (
                progress.data?.achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-warning" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{achievement.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{achievement.description}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === `${achievement.id}:off`}
                      onClick={() =>
                        void run(
                          `${achievement.id}:off`,
                          () => apiDelete(`/admin/achievements/${achievement.id}`),
                          'Достижение снято с выдачи',
                        )
                      }
                      aria-label="Деактивировать достижение"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

// ————— 9. Жалобы —————

function ReportsSection() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('open');
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const list = usePagedQuery<AdminReportRow>(keys.adminReports({}), '/admin/reports', page, q, { status });
  const { busy, message, error, run } = useAdminAction();

  const resolve = (id: string, next: 'resolved' | 'rejected') =>
    void run(
      `${id}:${next}`,
      () => apiPost(`/admin/reports/${id}/resolve`, { status: next }),
      next === 'resolved' ? 'Жалоба закрыта' : 'Жалоба отклонена',
    );

  return (
    <Panel title="Жалобы" description="Видна только модерации. Обработанные жалобы нельзя изменить повторно.">
      <Flash message={message} error={error} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Причина" />
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="h-8 w-auto text-xs"
          aria-label="Статус жалобы"
        >
          <option value="">Все</option>
          <option value="open">Открытые</option>
          <option value="resolved">Решённые</option>
          <option value="rejected">Отклонённые</option>
        </Select>
      </div>
      {list.isLoading ? (
        <TableSkeleton />
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={<Flag className="h-8 w-8" />} title="Жалоб нет" description="Это хороший знак." />
      ) : (
        <>
          <div className="space-y-1.5">
            {list.data?.items.map((row) => (
              <div key={row.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge tone={row.status === 'open' ? 'amber' : row.status === 'resolved' ? 'teal' : 'neutral'}>
                    {row.status}
                  </Badge>
                  <span className="font-medium text-foreground">{row.reason}</span>
                  <span>· {row.targetType}</span>
                  <span>· {row.reporter.displayName}</span>
                  <span>· {timeAgo(row.createdAt)}</span>
                </div>
                {row.targetPreview ? (
                  <p className="mt-1 line-clamp-2 text-xs">{row.targetPreview}</p>
                ) : null}
                {row.details ? (
                  <p className="mt-1 line-clamp-2 text-[11px] italic text-muted-foreground">{row.details}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.targetType === 'post' ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/post/${row.targetId}`}>Открыть публикацию</Link>
                    </Button>
                  ) : null}
                  {row.status === 'open' ? (
                    <>
                      <Button size="sm" variant="success" loading={busy === `${row.id}:resolved`} onClick={() => resolve(row.id, 'resolved')}>
                        <Check className="h-3 w-3" /> Решено
                      </Button>
                      <Button size="sm" variant="outline" loading={busy === `${row.id}:rejected`} onClick={() => resolve(row.id, 'rejected')}>
                        Отклонить
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <Pager
            page={list.data?.page ?? 1}
            total={list.data?.total ?? 0}
            pageSize={list.data?.pageSize ?? 20}
            hasMore={list.data?.hasMore ?? false}
            onChange={setPage}
          />
        </>
      )}
    </Panel>
  );
}

// ————— 10. Настройки платформы —————

function SettingsSection() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: keys.adminSettings,
    queryFn: () => apiGet<{ items: AdminSettingRow[] }>('/admin/settings'),
  });
  const { busy, message, error, run } = useAdminAction();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  return (
    <Panel
      title="Настройки платформы"
      description="JSON-значения. Изменения пишутся в журнал; значения используются сервером при следующем запросе."
    >
      <Flash message={message} error={error} />
      {list.isLoading ? (
        <TableSkeleton />
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <p className="text-xs text-muted-foreground">
          Настроек нет — они появятся после первого изменения через панель.
        </p>
      ) : (
        <div className="space-y-2">
          {list.data?.items.map((row) => {
            const text = drafts[row.key] ?? JSON.stringify(row.value, null, 2);
            return (
              <div key={row.key} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-medium">{row.key}</span>
                  <span className="text-[11px] text-muted-foreground">
                    обновлено {formatDateTime(row.updatedAt)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-auto"
                    loading={busy === `${row.key}:save`}
                    onClick={() =>
                      void run(
                        `${row.key}:save`,
                        async () => {
                          let parsed: unknown;
                          try {
                            parsed = JSON.parse(text);
                          } catch {
                            throw new ApiError(400, 'invalid_json', 'Некорректный JSON.');
                          }
                          await apiPut(`/admin/settings/${row.key}`, {
                            value: parsed,
                            description: row.description,
                          });
                          await queryClient.invalidateQueries({ queryKey: keys.adminSettings });
                          setDrafts((current) => {
                            const next = { ...current };
                            delete next[row.key];
                            return next;
                          });
                        },
                        'Настройка сохранена',
                      )
                    }
                  >
                    <Save className="h-3 w-3" /> Сохранить
                  </Button>
                </div>
                {row.description ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{row.description}</p>
                ) : null}
                <Textarea
                  value={text}
                  onChange={(event) => setDrafts({ ...drafts, [row.key]: event.target.value })}
                  rows={4}
                  spellCheck={false}
                  className="mt-1.5 font-mono text-[11px]"
                  aria-label={`Значение ${row.key}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ————— 11. Журнал —————

function LogsSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const list = usePagedQuery<AdminLogRow>(keys.adminLogs({}), '/admin/logs', page, q);

  return (
    <Panel title="Журнал действий" description="Каждое административное изменение фиксируется с автором и временем.">
      <div className="mb-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Действие, например user_update" />
      </div>
      {list.isLoading ? (
        <TableSkeleton />
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={<Activity className="h-8 w-8" />} title="Записей нет" description="Здесь появятся действия администраторов." />
      ) : (
        <>
          <div className="space-y-1">
            {list.data?.items.map((row) => (
              <div key={row.id} className="rounded-md border border-border bg-surface px-2.5 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-medium">{row.action}</span>
                  {row.targetType ? (
                    <span className="text-[11px] text-muted-foreground">
                      {row.targetType}:{row.targetId?.slice(0, 8)}
                    </span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {row.admin.displayName} · {formatDateTime(row.createdAt)}
                  </span>
                </div>
                {row.details ? (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
                    {JSON.stringify(row.details)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
          <Pager
            page={list.data?.page ?? 1}
            total={list.data?.total ?? 0}
            pageSize={list.data?.pageSize ?? 20}
            hasMore={list.data?.hasMore ?? false}
            onChange={setPage}
          />
        </>
      )}
    </Panel>
  );
}

// ————— 12. Диагностика и обслуживание —————

function DiagnosticsSection() {
  const diagnostics = useQuery({
    queryKey: keys.adminDiagnostics,
    queryFn: () => apiGet<DiagnosticsData>('/admin/diagnostics'),
  });
  const backup = useQuery({
    queryKey: keys.adminBackup,
    queryFn: () => apiGet<BackupData>('/admin/backup'),
  });
  const { busy, message, error, run } = useAdminAction();

  return (
    <div className="space-y-4">
      <Panel title="Состояние сервера" description="Без строк подключения, логинов и паролей — только безопасные параметры.">
        <Flash message={message} error={error} />
        {diagnostics.isLoading ? (
          <TableSkeleton rows={3} />
        ) : diagnostics.isError ? (
          <p className="text-sm text-destructive">
            {diagnostics.error instanceof ApiError ? diagnostics.error.message : 'Диагностика недоступна.'}
          </p>
        ) : diagnostics.data ? (
          <div className="space-y-3">
            <dl className="grid gap-2 sm:grid-cols-2">
              {[
                ['Node', `${diagnostics.data.node.version} · ${diagnostics.data.node.env}`],
                ['Uptime', `${Math.floor(diagnostics.data.node.uptimeSec / 60)} мин`],
                ['База', diagnostics.data.database.ready ? 'доступна' : 'недоступна'],
                ['Задержка', diagnostics.data.database.latencyMs !== null ? `${diagnostics.data.database.latencyMs} мс` : '—'],
                ['Схема', diagnostics.data.database.schema],
                ['Таблиц', String(diagnostics.data.database.tables)],
                ['Google OAuth', diagnostics.data.auth.googleConfigured ? 'настроен' : 'не настроен'],
                ['Тестовый вход', diagnostics.data.auth.devLoginEnabled ? 'включён' : 'выключен'],
                ['ADMIN_EMAILS', String(diagnostics.data.auth.adminEmailsCount)],
                ['Rate limit scale', String(diagnostics.data.rateLimit.scale)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {diagnostics.data.database.error ? (
              <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
                {diagnostics.data.database.error}
              </p>
            ) : null}
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Миграции
              </p>
              <div className="flex flex-wrap gap-1.5">
                {diagnostics.data.database.migrations.map((migration) => (
                  <span
                    key={migration.id}
                    title={formatDateTime(migration.appliedAt)}
                    className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium"
                  >
                    {migration.id}
                  </span>
                ))}
                {diagnostics.data.database.migrations.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">Нет записей о миграциях.</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Обслуживание"
        description="ANALYZE обновляет статистику планировщика. Операция безопасна и не меняет данные."
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'analyze'}
            onClick={() =>
              void run('analyze', () => apiPost('/admin/maintenance/reindex'), 'Статистика обновлена (ANALYZE)')
            }
          >
            <Wrench className="h-3.5 w-3.5" /> Обновить статистику
          </Button>
        }
      >
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Индексы и структура таблиц управляются миграциями в репозитории. Удаление и пересоздание базы
          из панели недоступно намеренно.
        </p>
      </Panel>

      <Panel title="Резервные копии" description="Полный бэкап выполняется в консоли TiDB Cloud; сервер показывает инвентарь таблиц.">
        {backup.isLoading ? (
          <TableSkeleton rows={3} />
        ) : backup.data ? (
          <>
            <p className="rounded-md border border-border bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {backup.data.instructions}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {backup.data.tables.map((table) => (
                <span
                  key={table.name}
                  className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-mono"
                  title={`${table.rows} строк (оценка)`}
                >
                  {table.name}
                </span>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Bell className="h-3 w-3" /> {backup.data.note}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Данные о резервном копировании недоступны.</p>
        )}
      </Panel>
    </div>
  );
}

// ————— Страница —————

function SectionView({ section }: { section: SectionKey }) {
  switch (section) {
    case 'users':
      return <UsersSection />;
    case 'posts':
      return <PostsSection />;
    case 'comments':
      return <CommentsSection />;
    case 'categories':
      return <CategoriesSection />;
    case 'tags':
      return <TagsSection />;
    case 'post-types':
      return <PostTypesSection />;
    case 'progress':
      return <ProgressSection />;
    case 'reports':
      return <ReportsSection />;
    case 'settings':
      return <SettingsSection />;
    case 'logs':
      return <LogsSection />;
    case 'diagnostics':
      return <DiagnosticsSection />;
    default:
      return <OverviewSection />;
  }
}

export function AdminPage() {
  useDocumentTitle('Админ-панель');
  const { data: session, isLoading } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = session?.user ?? null;

  const raw = searchParams.get('section') ?? 'overview';
  const section = useMemo<SectionKey>(
    () => (SECTIONS.some((item) => item.key === raw) ? (raw as SectionKey) : 'overview'),
    [raw],
  );

  if (isLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="font-display text-xl font-semibold">Требуется вход</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Админ-панель доступна только администраторам.</p>
        <Button asChild className="mt-4">
          <Link to="/auth">Войти</Link>
        </Button>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-8 text-center">
        <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-2 font-display text-xl font-semibold">Недостаточно прав</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Раздел защищён на сервере. Если вам нужен доступ, попросите администратора добавить ваш email в
          ADMIN_EMAILS и выполнить синхронизацию ролей.
        </p>
        <Button asChild className="mt-4" variant="secondary">
          <Link to="/feed">Вернуться в ленту</Link>
        </Button>
      </div>
    );
  }

  const active = SECTIONS.find((item) => item.key === section) ?? SECTIONS[0];

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-[1200px]">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
              <Shield className="h-3.5 w-3.5" /> администрирование
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em]">Админ-панель</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {active.label} · действия пишутся в журнал, статистика — только из базы.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/feed">В ленту</Link>
          </Button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
          <nav
            aria-label="Разделы админ-панели"
            className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 lg:flex-col lg:overflow-visible"
          >
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === section;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSearchParams({ section: item.key })}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors lg:w-full',
                    isActive
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-w-0">
            <SectionView section={section} />
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
