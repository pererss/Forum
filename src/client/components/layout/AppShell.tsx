// Каркас приложения: верхняя панель, боковая навигация, мобильное меню,
// глобальный поиск, переключатель темы и меню профиля.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Bell,
  Bookmark,
  CalendarDays,
  Compass,
  FileText,
  HelpCircle,
  Home,
  LogOut,
  Moon,
  Plus,
  Rocket,
  Search,
  Settings,
  Shield,
  Sun,
  Users,
  X,
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
  { to: '/explore', label: 'Обзор', icon: Compass, end: true },
  { to: '/explore/question', label: 'Вопросы', icon: HelpCircle },
  { to: '/explore/team', label: 'Команды', icon: Users },
  { to: '/explore/event', label: 'События', icon: CalendarDays },
  { to: '/explore/project', label: 'Проекты', icon: Rocket },
];

export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className="relative grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-primary font-display text-[15px] font-bold text-primary-foreground shadow-sm"
      >
        N
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-background bg-accent" />
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
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground/80')}
            strokeWidth={1.8}
          />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useSession();
  const user = data?.user ?? null;
  const drafts = data?.drafts ?? 0;

  return (
    <nav className="flex h-full flex-col gap-6" aria-label="Основная навигация">
      <div className="space-y-0.5">
        {mainNav.map((item) => (
          <NavItem key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </div>

      {user ? (
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
            Моё
          </p>
          <NavItem to="/favorites" label="Избранное" icon={Bookmark} onNavigate={onNavigate} />
          <NavItem to="/drafts" label={`Черновики${drafts > 0 ? ` · ${drafts}` : ''}`} icon={FileText} onNavigate={onNavigate} />
          <NavItem to="/notifications" label="Уведомления" icon={Bell} onNavigate={onNavigate} />
          <NavItem to="/settings" label="Настройки" icon={Settings} onNavigate={onNavigate} />
          {user.role === 'admin' ? (
            <NavItem to="/admin" label="Админ-панель" icon={Shield} onNavigate={onNavigate} />
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface p-3.5">
          <p className="text-sm font-semibold">Присоединяйтесь</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Публикации, команды, события и ответы — всё в одном месте.
          </p>
          <Link
            to="/auth"
            className="mt-3 flex h-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Войти в Nuffy
          </Link>
        </div>
      )}

      <div className="mt-auto space-y-2 border-t border-border pt-4">
        <p className="px-2.5 text-[11px] leading-relaxed text-muted-foreground/60">
          Nuffy · сообщество без лишнего шума
        </p>
      </div>
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
        'grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground',
        className,
      )}
      aria-label={resolved === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={resolved === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
    >
      {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
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
          sideOffset={8}
          className="z-50 min-w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-pop"
        >
          <div className="px-2 py-2">
            <p className="truncate text-sm font-semibold">{user.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              @{user.username ?? 'без-ника'} · {user.level} уровень
            </p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {user.username ? (
            <DropdownMenu.Item asChild>
              <Link
                to={`/u/${user.username}`}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-surface-hover focus:bg-surface-hover"
              >
                <Users className="h-4 w-4 text-muted-foreground" /> Мой профиль
              </Link>
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item asChild>
            <Link
              to="/drafts"
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-surface-hover focus:bg-surface-hover"
            >
              <FileText className="h-4 w-4 text-muted-foreground" /> Черновики
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              to="/settings"
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-surface-hover focus:bg-surface-hover"
            >
              <Settings className="h-4 w-4 text-muted-foreground" /> Настройки
            </Link>
          </DropdownMenu.Item>
          {user.role === 'admin' ? (
            <DropdownMenu.Item asChild>
              <Link
                to="/admin"
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-surface-hover focus:bg-surface-hover"
              >
                <Shield className="h-4 w-4 text-muted-foreground" /> Админ-панель
              </Link>
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => void logout()}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
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
          className="fixed inset-0 z-[60] flex items-start justify-center bg-background/70 p-4 pt-[8vh] backdrop-blur-sm"
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
            initial={reduce ? false : { opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-pop"
          >
            <div className="flex items-center gap-2 border-b border-border px-3.5">
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
                placeholder="Найти публикацию или человека…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                aria-label="Поисковый запрос"
              />
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                aria-label="Закрыть поиск"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!enabled ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Введите минимум 2 символа. Поиск идёт по заголовкам, тексту и людям.
                </div>
              ) : feed.isLoading || people.isLoading ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">Ищем…</div>
              ) : posts.length === 0 && users.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Ничего не найдено. Попробуйте другой запрос.
                </div>
              ) : (
                <>
                  {users.length > 0 ? (
                    <div className="mb-2">
                      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        Люди
                      </p>
                      {users.slice(0, 4).map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => go(`/u/${user.username}`)}
                          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-surface-hover"
                        >
                          <Avatar name={user.displayName} username={user.username} size={28} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{user.displayName}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              @{user.username} · {user.reputation} репутации
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {posts.length > 0 ? (
                    <div>
                      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        Публикации
                      </p>
                      {posts.map((post) => (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => go(`/post/${post.id}`)}
                          className="w-full rounded-md px-2 py-2 text-left hover:bg-surface-hover"
                        >
                          <span className="line-clamp-1 text-sm font-medium">{post.title}</span>
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {post.author.displayName} · {post.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              <span>Enter — все результаты</span>
              <span>Esc — закрыть</span>
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
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-3.5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">Популярные теги</h2>
          <Link to="/explore" className="text-[11px] text-muted-foreground hover:text-foreground">
            Все
          </Link>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(tags.data?.items ?? []).slice(0, 12).map((tag) => (
            <Link
              key={tag.id}
              to={`/explore?tag=${encodeURIComponent(tag.slug)}`}
              className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground transition-colors hover:border-foreground/20 hover:bg-surface-hover"
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
        <div className="rounded-lg border border-border bg-card p-3.5 shadow-card">
          <h2 className="font-display text-sm font-semibold">Быстрый старт</h2>
          <div className="mt-2.5 flex flex-col gap-1">
            {[
              { type: 'discussion', label: 'Начать обсуждение' },
              { type: 'question', label: 'Задать вопрос' },
              { type: 'team', label: 'Собрать команду' },
              { type: 'project', label: 'Показать проект' },
            ].map((item) => (
              <Link
                key={item.type}
                to={`/new?type=${item.type}`}
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground/60">
        Nuffy — независимое сообщество. Данные хранятся в TiDB Cloud, приватность управляется в
        настройках профиля.
      </p>
    </div>
  );
}

export function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { data } = useSession();
  const user = data?.user ?? null;
  const unread = useUnreadCount(Boolean(user));
  const location = useLocation();
  const { resolved } = useTheme();

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
    <div className="min-h-dvh bg-background">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        К основному содержимому
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-2 px-3 md:px-5">
          <Link to="/" className="mr-1 shrink-0 rounded-md focus-visible:outline-2" aria-label="Nuffy — на главную">
            <Wordmark />
          </Link>

          <nav className="ml-2 hidden items-center gap-1 lg:flex" aria-label="Верхняя навигация">
            <NavLink
              to="/feed"
              className={({ isActive }) =>
                cn(
                  'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              Лента
            </NavLink>
            <NavLink
              to="/explore"
              className={({ isActive }) =>
                cn(
                  'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              Обзор
            </NavLink>
          </nav>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="ml-auto hidden h-9 w-full max-w-[340px] items-center gap-2 rounded-md border border-border bg-surface px-3 text-left text-sm text-muted-foreground/80 transition-colors hover:border-foreground/20 hover:bg-surface-hover sm:flex"
            aria-label="Открыть поиск"
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Поиск по сообществу…</span>
            <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:block">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-0.5 sm:ml-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground sm:hidden"
              aria-label="Поиск"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <ThemeButton />

            {user ? (
              <>
                <Link
                  to="/notifications"
                  className="relative grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                  aria-label="Уведомления"
                >
                  <Bell className="h-[18px] w-[18px]" />
                  <CountBadge value={unread.data?.unread ?? 0} />
                </Link>
                <Link
                  to="/new"
                  className="ml-1 hidden h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98] sm:flex"
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
                    <Avatar
                      name={user.displayName}
                      username={user.username ?? user.id}
                      size={30}
                    />
                  </button>
                </UserMenu>
              </>
            ) : (
              <Link
                to="/auth"
                className="ml-1 flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                Войти
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px]">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[220px] shrink-0 overflow-y-auto border-r border-border px-3 py-4 lg:block">
          <SideNav />
        </aside>

        <main id="content" className="min-w-0 flex-1 px-3 pb-24 pt-5 sm:px-5 md:px-6 lg:pb-12">
          <Outlet />
        </main>

        {showRail ? (
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[300px] shrink-0 overflow-y-auto border-l border-border px-4 py-4 xl:block">
            <RightRail />
          </aside>
        ) : null}
      </div>

      {/* Мобильная нижняя навигация */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        aria-label="Мобильная навигация"
      >
        <div className="mx-auto flex h-14 max-w-md items-center justify-around px-2">
          <NavLink
            to="/feed"
            className={({ isActive }) =>
              cn(
                'flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium',
                isActive ? 'text-foreground' : 'text-muted-foreground',
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
                'flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium',
                isActive ? 'text-foreground' : 'text-muted-foreground',
              )
            }
          >
            <Compass className="h-[19px] w-[19px]" />
            Обзор
          </NavLink>
          <Link
            to={user ? '/new' : '/auth'}
            className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-pop ring-4 ring-background"
            aria-label="Создать публикацию"
          >
            <Plus className="h-5 w-5" />
          </Link>
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              cn(
                'relative flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium',
                isActive ? 'text-foreground' : 'text-muted-foreground',
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
                  'flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
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
                  'flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
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
      <span className="hidden">{resolved}</span>
    </div>
  );
}
