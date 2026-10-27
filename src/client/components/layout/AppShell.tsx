// Каркас приложения: верхняя панель, боковая навигация, мобильное меню,
// глобальный поиск, переключатель темы и меню профиля.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Bell,
  Bookmark,
  Compass,
  FileText,
  Home,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Shield,
  Sun,
  UserRound,
  Users,
  X,
  ArrowRight,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Avatar, CountBadge } from '@/client/components/ui/primitives';
import { apiPost } from '@/client/lib/api';
import { useDebounced, useLockBody } from '@/client/lib/hooks';
import { keys, useFeed, useSession, useTagSuggestions, useUnreadCount, useUserSearch } from '@/client/lib/queries';
import { useTheme } from '@/client/lib/theme';
import { cn } from '@/client/lib/utils';

const mainNav = [
  { to: '/feed', label: 'Лента', icon: Home, end: true },
  { to: '/explore', label: 'Обзор', icon: Compass, end: false },
];

export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('group inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[11px] bg-primary font-display text-[16px] font-bold text-primary-foreground shadow-sm transition-transform duration-300 group-hover:scale-105 group-hover:rotate-[-4deg]"
      >
        N
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-background bg-accent" />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </span>
      {compact ? null : (
        <span className="font-display text-[19px] font-semibold tracking-[-0.045em] text-foreground">
          Nuffy
        </span>
      )}
    </span>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  onNavigate,
  badge,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
  onNavigate?: () => void;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13.5px] font-medium transition-colors duration-200',
          isActive
            ? 'bg-surface-hover text-foreground'
            : 'text-muted-foreground hover:bg-surface-hover/70 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden
            className={cn(
              'absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-accent transition-all duration-300',
              isActive ? 'opacity-100' : 'scale-y-0 opacity-0',
            )}
          />
          <Icon
            className={cn(
              'h-[17px] w-[17px] shrink-0 transition-colors',
              isActive ? 'text-accent' : 'text-muted-foreground/70 group-hover:text-foreground',
            )}
            strokeWidth={1.8}
          />
          <span className="truncate">{label}</span>
          {badge && badge > 0 ? (
            <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-accent/15 px-1 text-[10px] font-semibold tabular-nums text-accent">
              {badge > 99 ? '99+' : badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useSession();
  const user = data?.user ?? null;
  const drafts = data?.drafts ?? 0;
  const unread = useUnreadCount(Boolean(user));

  return (
    <nav className="flex h-full flex-col gap-5" aria-label="Основная навигация">
      <div className="space-y-0.5">
        {mainNav.map((item) => (
          <NavItem key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </div>

      {user ? (
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
            Моё
          </p>
          <NavItem to="/favorites" label="Избранное" icon={Bookmark} onNavigate={onNavigate} />
          <NavItem
            to="/drafts"
            label="Черновики"
            icon={FileText}
            onNavigate={onNavigate}
            badge={drafts}
          />
          <NavItem
            to="/notifications"
            label="Уведомления"
            icon={Bell}
            onNavigate={onNavigate}
            badge={unread.data?.unread ?? 0}
          />
          <NavItem to="/settings" label="Настройки" icon={Settings} onNavigate={onNavigate} />
          {user.role === 'admin' ? (
            <NavItem to="/admin" label="Админ-панель" icon={Shield} onNavigate={onNavigate} />
          ) : null}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3.5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-accent/15 blur-2xl"
          />
          <p className="relative text-[13px] font-semibold">Присоединяйтесь</p>
          <p className="relative mt-1 text-xs leading-relaxed text-muted-foreground">
            Публикации, команды и ответы — в одном месте.
          </p>
          <Link
            to="/auth"
            className="relative mt-3 flex h-8 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Войти в Nuffy
          </Link>
        </div>
      )}

      {user ? (
        <Link
          to="/new"
          onClick={onNavigate}
          className="group relative mt-auto flex items-center gap-2 overflow-hidden rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-surface-hover"
        >
          <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <Plus className="h-3.5 w-3.5" />
          </span>
          Создать публикацию
          <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </nav>
  );
}

function ThemeButton({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground',
        className,
      )}
      aria-label={resolved === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={resolved === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
    >
      <span className="relative grid place-items-center">
        {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </span>
    </button>
  );
}

function UserMenu({ children }: { children: ReactNode }) {
  const { data } = useSession();
  const user = data?.user ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!user) return null;

  const logout = async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      queryClient.setQueryData(keys.session, { user: null, drafts: 0 });
      void queryClient.clear();
      navigate('/');
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="nuffy-select-content z-50 w-64 overflow-hidden rounded-xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-pop backdrop-blur-xl"
        >
          <div className="flex items-center gap-2.5 rounded-lg bg-surface/60 px-2 py-2">
            <Avatar name={user.displayName} username={user.username ?? user.id} size={34} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{user.displayName}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                @{user.username ?? 'без-ника'} · {user.level} уровень
              </p>
            </div>
          </div>
          <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
          {user.username ? (
            <DropdownMenu.Item asChild>
              <Link
                to={`/u/${user.username}`}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] outline-none transition-colors hover:bg-surface-hover focus:bg-surface-hover"
              >
                <UserRound className="h-4 w-4 text-muted-foreground" /> Мой профиль
              </Link>
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item asChild>
            <Link
              to="/settings"
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] outline-none transition-colors hover:bg-surface-hover focus:bg-surface-hover"
            >
              <Settings className="h-4 w-4 text-muted-foreground" /> Настройки
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => void logout()}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Выйти
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [value, setValue] = useState('');
  const debounced = useDebounced(value, 220);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();
  useLockBody(open);

  const enabled = open && debounced.trim().length >= 2;
  const feed = useFeed({ mode: 'new', q: debounced.trim(), pageSize: 6 }, enabled);
  const people = useUserSearch(debounced.trim(), open);
  const posts = feed.data?.items ?? [];
  const users = people.data?.items ?? [];

  useEffect(() => {
    if (open) {
      setValue('');
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-background/60 p-4 pt-[10vh] backdrop-blur-md"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Поиск по сообществу"
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover/95 shadow-pop backdrop-blur-2xl"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
            />
            <div className="flex items-center gap-2 border-b border-border/70 px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') onOpenChange(false);
                  if (event.key === 'Enter' && value.trim().length >= 2) {
                    go(`/explore?q=${encodeURIComponent(value.trim())}`);
                  }
                }}
                placeholder="Публикации, люди, темы…"
                className="h-13 w-full bg-transparent py-3.5 text-[15px] outline-none placeholder:text-muted-foreground/60"
                aria-label="Поисковый запрос"
              />
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="Закрыть поиск"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-2">
              {!enabled ? (
                <div className="flex flex-col items-center gap-1.5 px-3 py-10 text-center">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-muted-foreground">
                    <Search className="h-4 w-4" />
                  </span>
                  <p className="mt-1 text-sm font-medium">Начните вводить запрос</p>
                  <p className="text-xs text-muted-foreground">Заголовки, тексты публикаций и люди</p>
                </div>
              ) : feed.isLoading || people.isLoading ? (
                <div className="space-y-2 p-2" aria-label="Идёт поиск">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg p-2">
                      <div className="h-7 w-7 animate-pulse-soft rounded-full bg-muted" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2.5 w-1/3 animate-pulse-soft rounded bg-muted" />
                        <div className="h-2 w-1/2 animate-pulse-soft rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : posts.length === 0 && users.length === 0 ? (
                <div className="px-3 py-10 text-center">
                  <p className="text-sm font-medium">Ничего не найдено</p>
                  <p className="mt-1 text-xs text-muted-foreground">Попробуйте другой запрос</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {users.length > 0 ? (
                    <div>
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
                        Люди
                      </p>
                      {users.slice(0, 4).map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => go(`/u/${user.username}`)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-hover"
                        >
                          <Avatar name={user.displayName} username={user.username} size={28} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium">{user.displayName}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              @{user.username} · {user.reputation} репутации
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {posts.length > 0 ? (
                    <div>
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
                        Публикации
                      </p>
                      {posts.map((post) => (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => go(`/post/${post.id}`)}
                          className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-hover"
                        >
                          <span className="line-clamp-1 text-[13px] font-medium">{post.title}</span>
                          <span className="line-clamp-1 text-[11px] text-muted-foreground">
                            {post.author.displayName} · {post.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border/70 px-3.5 py-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-surface px-1 py-0.5 text-[10px]">Enter</kbd>
                все результаты
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-surface px-1 py-0.5 text-[10px]">Esc</kbd>
                закрыть
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function RightRail() {
  const { data } = useSession();
  const tags = useTagSuggestions('');
  const user = data?.user ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card/70 p-3.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[13px] font-semibold">Популярные теги</h2>
          <Link to="/explore" className="text-[11px] text-muted-foreground hover:text-foreground">
            Все
          </Link>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(tags.data?.items ?? []).slice(0, 12).map((tag) => (
            <Link
              key={tag.id}
              to={`/explore?tag=${encodeURIComponent(tag.slug)}`}
              className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground transition-colors hover:border-accent/40 hover:text-accent"
            >
              #{tag.name}
              {typeof tag.usageCount === 'number' && tag.usageCount > 0 ? (
                <span className="ml-1 text-muted-foreground/70">{tag.usageCount}</span>
              ) : null}
            </Link>
          ))}
          {(tags.data?.items ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Теги появятся после первых публикаций.</p>
          ) : null}
        </div>
      </div>

      {user ? (
        <div className="rounded-xl border border-border bg-card/70 p-3.5">
          <h2 className="font-display text-[13px] font-semibold">Быстрый старт</h2>
          <div className="mt-2 flex flex-col gap-0.5">
            {[
              { type: 'discussion', label: 'Начать обсуждение' },
              { type: 'question', label: 'Задать вопрос' },
              { type: 'team', label: 'Собрать команду' },
              { type: 'project', label: 'Показать проект' },
            ].map((item) => (
              <Link
                key={item.type}
                to={`/new?type=${item.type}`}
                className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5 transition-transform group-hover:rotate-90" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { data } = useSession();
  const user = data?.user ?? null;
  const unread = useUnreadCount(Boolean(user));
  const location = useLocation();
  const reduce = useReducedMotion();
  const ambientRef = useRef<HTMLDivElement>(null);

  // Лёгкий параллакс фоновых пятен за курсором. Только для точного указателя,
  // с троттлингом и полным отключением при prefers-reduced-motion.
  useEffect(() => {
    if (reduce) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    let frame = 0;
    let last = { x: 0, y: 0 };
    const onMove = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const px = (last.x / window.innerWidth - 0.5) * 28;
        const py = (last.y / window.innerHeight - 0.5) * 22;
        ambientRef.current?.style.setProperty('--px', `${px.toFixed(1)}px`);
        ambientRef.current?.style.setProperty('--py', `${py.toFixed(1)}px`);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduce]);

  const showRail =
    location.pathname !== '/' &&
    !/^\/(feed|post|new|admin|settings|notifications|drafts|auth|u\/)/.test(location.pathname);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === '/' && !searchOpen) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && !target?.isContentEditable) {
          event.preventDefault();
          setSearchOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen]);

  return (
    <div className="relative min-h-dvh bg-background">
      {/* Атмосферный фон: мягкие световые пятна + зерно */}
      <div aria-hidden className="ambient-field" ref={ambientRef}>
        <span
          className="ambient-blob animate-drift"
          style={{
            top: '-18rem',
            left: '8%',
            width: '38rem',
            height: '38rem',
            background: 'var(--ambient-a)',
          }}
        />
        <span
          className="ambient-blob animate-float-slow"
          style={{
            top: '12rem',
            right: '-10rem',
            width: '34rem',
            height: '34rem',
            background: 'var(--ambient-b)',
          }}
        />
        <span
          className="ambient-blob animate-drift"
          style={{
            bottom: '-16rem',
            left: '32%',
            width: '30rem',
            height: '30rem',
            background: 'var(--ambient-c)',
            animationDelay: '-9s',
          }}
        />
      </div>
      <div aria-hidden className="ambient-grain" />

      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        К основному содержимому
      </a>

      <header className="glass-panel sticky top-0 z-40 border-b border-border/70">
        <div className="relative mx-auto flex h-14 w-full max-w-[1400px] items-center px-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="shrink-0 rounded-md focus-visible:outline-2" aria-label="Nuffy — на главную">
              <Wordmark />
            </Link>

            <nav className="ml-1 hidden items-center gap-0.5 md:flex" aria-label="Верхняя навигация">
              {mainNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'relative rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                      isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {item.label}
                      {isActive ? (
                        <motion.span
                          layoutId="top-nav-indicator"
                          className="absolute inset-x-2 -bottom-[7px] h-[2px] rounded-full bg-accent shadow-[0_0_10px_var(--accent)]"
                          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                        />
                      ) : null}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Поиск по центру (с небольшим смещением влево) */}
          <div className="pointer-events-none absolute inset-x-0 hidden justify-center px-4 lg:flex">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="pointer-events-auto group flex h-9 w-full max-w-[430px] items-center gap-2 rounded-full border border-border bg-surface/70 px-3.5 text-left text-[13px] text-muted-foreground/80 shadow-sm transition-all duration-200 hover:border-foreground/20 hover:bg-surface hover:shadow-md"
              aria-label="Открыть поиск"
            >
              <Search className="h-4 w-4 transition-colors group-hover:text-foreground" />
              <span className="truncate">Поиск по сообществу…</span>
              <kbd className="ml-auto hidden shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:block">
                Ctrl K
              </kbd>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground lg:hidden"
              aria-label="Поиск"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <ThemeButton />

            {user ? (
              <>
                <Link
                  to="/notifications"
                  className="relative grid h-9 w-9 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                  aria-label="Уведомления"
                >
                  <Bell className="h-[18px] w-[18px]" />
                  <CountBadge value={unread.data?.unread ?? 0} />
                </Link>
                <Link
                  to="/new"
                  className="ml-1 hidden h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98] sm:flex"
                >
                  <Plus className="h-4 w-4" />
                  Создать
                </Link>
                <UserMenu>
                  <button
                    type="button"
                    className="ml-1 rounded-full ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Меню профиля"
                  >
                    <Avatar name={user.displayName} username={user.username ?? user.id} size={30} />
                  </button>
                </UserMenu>
              </>
            ) : (
              <Link
                to="/auth"
                className="ml-1 flex h-9 items-center rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                Войти
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-[1400px]">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[214px] shrink-0 overflow-y-auto px-3 py-5 lg:block">
          <SideNav />
        </aside>

        <main id="content" className="min-w-0 flex-1 px-3 pb-24 pt-5 sm:px-5 md:px-6 lg:pb-12">
          <Outlet />
        </main>

        {showRail ? (
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[290px] shrink-0 overflow-y-auto px-4 py-5 xl:block">
            <RightRail />
          </aside>
        ) : null}
      </div>

      {/* Мобильная нижняя навигация */}
      <nav
        className="glass-panel fixed inset-x-0 bottom-0 z-40 border-t border-border/70 pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Мобильная навигация"
      >
        <div className="mx-auto flex h-14 max-w-md items-center justify-around px-2">
          <NavLink
            to="/feed"
            className={({ isActive }) =>
              cn(
                'flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                isActive ? 'text-accent' : 'text-muted-foreground',
              )
            }
          >
            <Home className="h-[19px] w-[19px]" />
            Лента
          </NavLink>
          <NavLink
            to="/explore"
            className={({ isActive }) =>
              cn(
                'flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                isActive ? 'text-accent' : 'text-muted-foreground',
              )
            }
          >
            <Compass className="h-[19px] w-[19px]" />
            Обзор
          </NavLink>
          <Link
            to={user ? '/new' : '/auth'}
            className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-pop ring-4 ring-background transition-transform hover:scale-105 active:scale-95"
            aria-label="Создать публикацию"
          >
            <Plus className="h-5 w-5" />
          </Link>
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              cn(
                'relative flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                isActive ? 'text-accent' : 'text-muted-foreground',
              )
            }
          >
            <Bell className="h-[19px] w-[19px]" />
            <CountBadge value={unread.data?.unread ?? 0} />
            События
          </NavLink>
          {user?.username ? (
            <NavLink
              to={`/u/${user.username}`}
              className={({ isActive }) =>
                cn(
                  'flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-muted-foreground',
                )
              }
            >
              <Avatar name={user.displayName} username={user.username} size={20} />
              Профиль
            </NavLink>
          ) : (
            <NavLink
              to="/auth"
              className={({ isActive }) =>
                cn(
                  'flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-muted-foreground',
                )
              }
            >
              <Users className="h-[19px] w-[19px]" />
              Войти
            </NavLink>
          )}
        </div>
      </nav>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
