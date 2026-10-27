// Уведомления: список, непрочитанные, отметка прочтения, пагинация.

import { useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
  Bell,
  BellOff,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Settings,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/client/components/ui/button';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/client/components/ui/primitives';
import { PageTransition } from '@/client/components/ui/motion';
import { apiPost, ApiError } from '@/client/lib/api';
import { useDocumentTitle } from '@/client/lib/hooks';
import { useNotifications, useSession } from '@/client/lib/queries';
import { cn, timeAgo } from '@/client/lib/utils';
import type { NotificationDto, NotificationType } from '@/shared/types';

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  comment: MessageSquare,
  reply: MessageSquare,
  mention: AtSign,
  answer_accepted: CheckCheck,
  application: Users,
  application_result: Users,
  follow: UserPlus,
  achievement: Sparkles,
  system: Bell,
  watch_activity: Bell,
};

function describe(notification: NotificationDto): { text: string; link: string | null } {
  const actor = notification.actor?.displayName ?? 'Кто-то';
  const postLink = notification.post ? `/post/${notification.post.id}` : null;
  switch (notification.type) {
    case 'comment':
      return { text: `${actor} прокомментировал(а) «${notification.post?.title ?? 'публикацию'}»`, link: postLink };
    case 'reply':
      return { text: `${actor} ответил(а) на ваш комментарий`, link: postLink };
    case 'mention':
      return { text: `${actor} упомянул(а) вас в публикации`, link: postLink };
    case 'answer_accepted':
      return { text: `Ваш ответ принят в «${notification.post?.title ?? 'вопросе'}»`, link: postLink };
    case 'application':
      return { text: `${actor} откликнулся(ась) на вашу команду`, link: postLink };
    case 'application_result':
      return {
        text:
          String(notification.payload.status) === 'accepted'
            ? 'Ваша заявка в команду принята'
            : 'По вашей заявке в команду принято решение',
        link: postLink,
      };
    case 'follow':
      return { text: `${actor} подписался(ась) на вас`, link: notification.actor ? `/u/${notification.actor.username}` : null };
    case 'achievement':
      return { text: 'Новое достижение открыто', link: `/u/${notification.actor?.username ?? ''}` };
    case 'watch_activity':
      return { text: `Новая активность в «${notification.post?.title ?? 'публикации'}»`, link: postLink };
    default:
      return { text: 'Системное уведомление', link: postLink };
  }
}

export function NotificationsPage() {
  useDocumentTitle('Уведомления');
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useNotifications(page, unreadOnly, Boolean(user));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markAll = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPost('/notifications/read', { all: true });
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отметить прочитанным');
    } finally {
      setBusy(false);
    }
  };

  const open = async (notification: NotificationDto) => {
    const target = describe(notification).link;
    if (!notification.readAt) {
      try {
        await apiPost('/notifications/read', { ids: [notification.id] });
        refresh();
      } catch {
        // переход важнее отметки — не блокируем
      }
    }
    if (target) navigate(target);
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="font-display text-xl font-semibold">Нужен аккаунт</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Уведомления доступны после входа.
        </p>
        <Button asChild className="mt-4">
          <Link to="/auth">Войти</Link>
        </Button>
      </div>
    );
  }

  const unread = list.data?.unread ?? 0;

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Уведомления</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {unread > 0 ? `${unread} непрочитанных` : 'Всё прочитано'} · обновление раз в минуту
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/settings">
                <Settings className="h-3.5 w-3.5" /> Настройки
              </Link>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void markAll()} loading={busy} disabled={unread === 0}>
              <CheckCheck className="h-3.5 w-3.5" /> Прочитать всё
            </Button>
          </div>
        </header>

        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5 text-xs">
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(false);
              setPage(1);
            }}
            aria-pressed={!unreadOnly}
            className={cn(
              'flex-1 rounded px-2 py-1.5 font-medium transition-colors',
              !unreadOnly ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            Все
          </button>
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(true);
              setPage(1);
            }}
            aria-pressed={unreadOnly}
            className={cn(
              'flex-1 rounded px-2 py-1.5 font-medium transition-colors',
              unreadOnly ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            Непрочитанные
          </button>
        </div>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}

        {list.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState
            message={list.error instanceof ApiError ? list.error.message : 'Не удалось загрузить уведомления'}
            onRetry={() => void list.refetch()}
          />
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={<BellOff className="h-10 w-10" />}
            title={unreadOnly ? 'Непрочитанных нет' : 'Пока тихо'}
            description={
              unreadOnly
                ? 'Всё прочитано — можно переключиться на вкладку «Все».'
                : 'Здесь появятся комментарии, ответы, упоминания и заявки в команды.'
            }
            action={
              <Button asChild variant="secondary">
                <Link to="/feed">Вернуться в ленту</Link>
              </Button>
            }
          />
        ) : (
          <>
            <ul className="space-y-1.5">
              {list.data?.items.map((notification) => {
                const Icon = TYPE_ICON[notification.type];
                const description = describe(notification);
                const isUnread = !notification.readAt;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => void open(notification)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                        isUnread
                          ? 'border-accent/25 bg-accent/[0.04] hover:bg-accent/[0.07]'
                          : 'border-border bg-card hover:bg-surface-hover',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full',
                          isUnread ? 'bg-accent/15 text-accent' : 'bg-secondary text-muted-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {notification.actor ? (
                        <Avatar
                          name={notification.actor.displayName}
                          username={notification.actor.username}
                          size={30}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] leading-snug text-foreground">
                          {description.text}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {timeAgo(notification.createdAt)}
                          {notification.type === 'application_result'
                            ? ' · решение по заявке'
                            : ''}
                        </span>
                      </span>
                      {isUnread ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="непрочитано" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            <nav className="flex items-center justify-between gap-2 pt-1" aria-label="Страницы уведомлений">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                <ChevronLeft className="h-4 w-4" /> Назад
              </Button>
              <span className="text-xs text-muted-foreground">
                Страница {page}
                {list.data && list.data.total > list.data.pageSize
                  ? ` из ${Math.max(1, Math.ceil(list.data.total / list.data.pageSize))}`
                  : ''}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!list.data?.hasMore}
                onClick={() => setPage((value) => value + 1)}
              >
                Вперёд <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          </>
        )}

        <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-muted-foreground/70">
          {list.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
          Уведомления обновляются опросом раз в 60 секунд — мгновенная доставка требует WebSocket и
          серверной инфраструктуры, которой пока нет.
        </p>
      </div>
    </PageTransition>
  );
}
