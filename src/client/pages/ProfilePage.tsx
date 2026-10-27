// Публичный профиль: достижения, уровень, статистика, публикации, подписка.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  Settings,
  Shield,
  Sparkles,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { PostCardItem } from '@/client/components/post/PostCardItem';
import { Button } from '@/client/components/ui/button';
import { Avatar, Badge, EmptyState, FeedSkeleton, ErrorState } from '@/client/components/ui/primitives';
import { AnimatedNumber, PageTransition, Reveal } from '@/client/components/ui/motion';
import { apiPost, ApiError } from '@/client/lib/api';
import { useDocumentTitle } from '@/client/lib/hooks';
import { useFeed, useProfile, useSession } from '@/client/lib/queries';
import { cn, formatDate, formatNumber, pluralPosts } from '@/client/lib/utils';
import type { PostType } from '@/shared/post-types';

const ROLE_LABEL = { user: 'участник', moderator: 'модератор', admin: 'администратор' } as const;

const CONTENT_TABS: { key: string; label: string; type?: PostType }[] = [
  { key: 'all', label: 'Публикации' },
  { key: 'project', label: 'Проекты', type: 'project' },
  { key: 'question', label: 'Вопросы', type: 'question' },
  { key: 'article', label: 'Статьи', type: 'article' },
];

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { data: session } = useSession();
  const profileQuery = useProfile(username);
  const profile = profileQuery.data?.profile;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('all');

  useDocumentTitle(profile?.displayName ?? username ?? 'Профиль');

  const activeTab = CONTENT_TABS.find((item) => item.key === tab) ?? CONTENT_TABS[0]!;
  const feedParams = useMemo(
    () => ({
      mode: 'new',
      author: username,
      pageSize: 12,
      ...(activeTab.type ? { type: activeTab.type } : {}),
    }),
    [username, activeTab.type],
  );
  const feed = useFeed(feedParams, Boolean(username));

  const follow = useMutation({
    mutationFn: (next: boolean) =>
      apiPost<{ following: boolean }>(`/users/${username}/follow`, { follow: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', username] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  if (profileQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-36 animate-pulse-soft rounded-lg bg-muted" />
        <FeedSkeleton count={3} />
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          message={
            profileQuery.error instanceof ApiError && profileQuery.error.status === 404
              ? 'Пользователь не найден.'
              : 'Не удалось загрузить профиль.'
          }
          onRetry={() => void profileQuery.refetch()}
        />
      </div>
    );
  }

  const isSelf = Boolean(profile.viewer?.isSelf);
  const following = Boolean(profile.viewer?.isFollowing);
  const counts = profile.counts;

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <section className="nuffy-card relative isolate overflow-hidden rounded-2xl p-5 sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent/12 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-accent/15 blur-3xl"
          />
          <div aria-hidden className="surface-grid pointer-events-none absolute inset-0 opacity-[0.05]" />
          <div className="relative flex flex-wrap items-start gap-4">
            <span className="rounded-full bg-gradient-to-br from-accent/60 via-border to-transparent p-[2px]">
              <Avatar
                name={profile.displayName}
                username={profile.username}
                size={76}
                className="ring-4 ring-card"
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-[26px] font-semibold leading-none tracking-[-0.03em]">
                  {profile.displayName}
                </h1>
                {profile.role !== 'user' ? (
                  <Badge tone="indigo">
                    <Shield className="h-3 w-3" /> {ROLE_LABEL[profile.role]}
                  </Badge>
                ) : null}
                {isSelf ? <Badge tone="neutral">это вы</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">@{profile.username}</p>
              {profile.bio ? (
                <p className="mt-2 max-w-xl whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                  {profile.bio}
                </p>
              ) : isSelf ? (
                <Link
                  to="/settings"
                  className="mt-2 inline-block text-[13px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                >
                  Добавить описание профиля
                </Link>
              ) : (
                <p className="mt-2 text-sm italic text-muted-foreground">Без описания.</p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> с {formatDate(profile.createdAt)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Trophy className="h-3.5 w-3.5" /> {formatNumber(profile.reputation)} репутации
                </span>
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" /> {formatNumber(profile.xp)} XP
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {isSelf ? (
                <Button asChild size="sm" variant="secondary">
                  <Link to="/settings">
                    <Settings className="h-3.5 w-3.5" /> Редактировать
                  </Link>
                </Button>
              ) : session?.user ? (
                <Button
                  size="sm"
                  variant={following ? 'secondary' : 'primary'}
                  onClick={() => follow.mutate(!following)}
                  loading={follow.isPending}
                >
                  {following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                  {following ? 'Вы подписаны' : 'Подписаться'}
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link to="/auth">Войти</Link>
                </Button>
              )}
            </div>
          </div>

          <div className="relative mt-5 flex flex-wrap items-stretch divide-x divide-border/70 rounded-xl border border-border/70 bg-surface/50">
            {[
              { label: 'публикаций', value: counts.posts },
              { label: 'комментариев', value: counts.comments },
              { label: 'подписчиков', value: counts.followers },
              { label: 'подписок', value: counts.following },
            ].map((stat) => (
              <div
                key={stat.label}
                className="min-w-[25%] flex-1 px-3 py-2.5 text-center"
                title={stat.value === null ? 'Скрыто настройками приватности' : undefined}
              >
                <p className="font-display text-lg font-semibold tabular-nums">
                  {stat.value === null ? '—' : <AnimatedNumber value={stat.value} />}
                </p>
                <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {stat.value === null ? 'скрыто' : stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold">Уровень {profile.level}</h2>
            <span className="text-[11px] text-muted-foreground">
              {profile.progress.xpIntoLevel} / {profile.progress.xpForNext} XP до следующего
            </span>
          </div>
          <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent/70 via-accent to-accent shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_50%,transparent)] transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: `${Math.min(100, profile.progress.percent)}%` }}
            />
          </div>
          {profile.achievements.length > 0 ? (
            <div className="mt-3.5">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Достижения
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.achievements.map((achievement) => (
                  <span
                    key={achievement.id}
                    title={achievement.description}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium"
                  >
                    <Trophy className="h-3 w-3 text-warning" />
                    {achievement.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {profile.interests.length > 0 ? (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Интересы
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.interests.map((interest) => (
                  <Link
                    key={interest.id}
                    to={`/explore?tag=${encodeURIComponent(interest.slug)}`}
                    className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] transition-colors hover:border-foreground/20"
                  >
                    #{interest.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {CONTENT_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
                tab === item.key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {feed.isLoading ? (
          <FeedSkeleton count={3} />
        ) : (feed.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title={isSelf ? 'Здесь пока пусто' : 'Публикаций пока нет'}
            description={
              isSelf
                ? 'Опубликуйте первую идею — она появится в вашем профиле.'
                : 'Возможно, автор ещё готовит материал.'
            }
            action={
              isSelf ? (
                <Button asChild>
                  <Link to="/new">Создать публикацию</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {pluralPosts(feed.data?.total ?? 0)}
              {activeTab.type ? ` · ${activeTab.label.toLowerCase()}` : ''}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {feed.data?.items.map((post, index) => (
                <Reveal key={post.id} delay={Math.min(index, 6) * 0.03}>
                  <PostCardItem post={post} variant="grid" />
                </Reveal>
              ))}
            </div>
          </>
        )}

        {profile.viewer?.isSelf ? (
          <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3" /> Приватность и уведомления настраиваются в разделе «Настройки»
          </p>
        ) : null}
      </div>
    </PageTransition>
  );
}
