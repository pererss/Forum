// Настройки: профиль, интересы, приватность, уведомления, тема, аккаунт.

import { useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Loader2, LogOut, Moon, Monitor, Palette, Shield, Sun, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/client/components/ui/button';
import { Field, Input, Switch, Textarea } from '@/client/components/ui/form';
import { Avatar } from '@/client/components/ui/primitives';
import { PageTransition } from '@/client/components/ui/motion';
import { apiGet, apiPatch, apiPost, ApiError } from '@/client/lib/api';
import { useDocumentTitle } from '@/client/lib/hooks';
import { keys, useSession, useTagSuggestions } from '@/client/lib/queries';
import { useTheme } from '@/client/lib/theme';
import { cn } from '@/client/lib/utils';
import type { NotificationType } from '@/shared/types';

const NOTIFY_LABELS: Record<NotificationType, string> = {
  comment: 'Комментарии к моим публикациям',
  reply: 'Ответы на мои комментарии',
  mention: 'Упоминания @username',
  answer_accepted: 'Принятый ответ',
  application: 'Новые заявки в мои команды',
  application_result: 'Решения по моим заявкам',
  follow: 'Новые подписчики',
  achievement: 'Достижения',
  system: 'Системные уведомления',
  watch_activity: 'Активность в отслеживаемых публикациях',
};

function Section({
  title,
  description,
  icon,
  children,
  id,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
          {icon}
        </span>
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function SettingsPage() {
  useDocumentTitle('Настройки');
  const { data: session, isLoading } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const tags = useTagSuggestions('');
  const user = session?.user ?? null;

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState({ showActivity: true, showFollowing: true });
  const [notify, setNotify] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setInterests([]);
    setPrivacy({
      showActivity: user.settings?.privacy?.showActivity ?? true,
      showFollowing: user.settings?.privacy?.showFollowing ?? true,
    });
    setNotify(user.settings?.notify ?? {});
  }, [user]);

  useEffect(() => {
    if (!user?.username) return;
    let cancelled = false;
    void apiGet<{ profile: { bio: string | null; interests: { slug: string }[] } }>(
      `/users/${user.username}`,
    )
      .then(({ profile }) => {
        if (cancelled) return;
        setBio(profile.bio ?? '');
        setInterests(profile.interests.map((item) => item.slug));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.username]);

  const refreshSession = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.session });
    if (user?.username) {
      await queryClient.invalidateQueries({ queryKey: ['profile', user.username] });
    }
  };

  const flash = (message: string) => {
    setSaved(message);
    window.setTimeout(() => setSaved(null), 2200);
  };

  const saveProfile = async () => {
    setBusy('profile');
    setError(null);
    try {
      await apiPatch('/users/me', {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        interests,
      });
      await refreshSession();
      flash('Профиль сохранён');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить профиль');
    } finally {
      setBusy(null);
    }
  };

  const savePrivacy = async (next: { showActivity: boolean; showFollowing: boolean }) => {
    setPrivacy(next);
    setBusy('privacy');
    setError(null);
    try {
      await apiPatch('/users/me', { settings: { privacy: next } });
      await refreshSession();
      flash('Приватность обновлена');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить приватность');
    } finally {
      setBusy(null);
    }
  };

  const saveNotify = async (next: Record<string, boolean>) => {
    setNotify(next);
    setBusy('notify');
    setError(null);
    try {
      await apiPatch('/notifications/settings', { notify: next });
      await refreshSession();
      flash('Настройки уведомлений обновлены');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить уведомления');
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      queryClient.setQueryData(keys.session, { user: null, drafts: 0 });
      void queryClient.clear();
      navigate('/');
    }
  };

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
        <h1 className="font-display text-xl font-semibold">Нужен аккаунт</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Настройки доступны после входа.
        </p>
        <Button asChild className="mt-4">
          <Link to="/auth">Войти</Link>
        </Button>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <header>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Настройки</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Профиль, приватность и уведомления. Все изменения сохраняются на сервере.
          </p>
        </header>

        {saved ? (
          <p className="flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-2 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" /> {saved}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Section
          title="Профиль"
          description="Имя и описание видны всем. Ник изменить нельзя."
          icon={<User className="h-4 w-4" />}
        >
          <div className="flex items-center gap-3">
            <Avatar name={displayName || user.displayName} username={user.username ?? user.id} size={52} />
            <div className="text-xs text-muted-foreground">
              <p className="text-sm font-medium text-foreground">@{user.username ?? 'без-ника'}</p>
              <p>
                {user.role === 'admin' ? 'администратор' : user.role === 'moderator' ? 'модератор' : 'участник'}{' '}
                · {user.level} уровень · {user.xp} XP
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Отображаемое имя" htmlFor="settings-name">
              <Input
                id="settings-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={60}
              />
            </Field>
            <div className="text-xs text-muted-foreground">
              <p className="mb-1.5 text-sm font-medium text-foreground">Заинтересованность</p>
              <p className="leading-relaxed">
                Интересы влияют на порядок публикаций в режиме «Для меня». Выбрано {interests.length} из 30.
              </p>
            </div>
          </div>
          <Field label="О себе" htmlFor="settings-bio" hint={`${bio.length}/500`}>
            <Textarea
              id="settings-bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Чем занимаетесь, что ищете, о чём интересно говорить."
            />
          </Field>

          <p className="mb-1.5 text-sm font-medium">Интересы</p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-border bg-surface p-2">
            {(tags.data?.items ?? []).map((tag) => {
              const active = interests.includes(tag.slug);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() =>
                    setInterests((current) =>
                      current.includes(tag.slug)
                        ? current.filter((item) => item !== tag.slug)
                        : current.length >= 30
                          ? current
                          : [...current, tag.slug],
                    )
                  }
                  aria-pressed={active}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                    active
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  #{tag.name}
                </button>
              );
            })}
            {(tags.data?.items.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">Теги появятся после первых публикаций.</p>
            ) : null}
          </div>

          <Button className="mt-4" onClick={() => void saveProfile()} loading={busy === 'profile'}>
            Сохранить профиль
          </Button>
        </Section>

        <Section
          title="Приватность"
          description="Скрытые счётчики не отдаются другим пользователям API — это серверная защита, а не косметика."
          icon={<Shield className="h-4 w-4" />}
        >
          <Switch
            checked={privacy.showActivity}
            onChange={(value) => void savePrivacy({ ...privacy, showActivity: value })}
            label="Показывать количество публикаций и комментариев"
          />
          <Switch
            checked={privacy.showFollowing}
            onChange={(value) => void savePrivacy({ ...privacy, showFollowing: value })}
            label="Показывать подписчиков и подписки"
          />
          {busy === 'privacy' ? (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> сохраняем
            </p>
          ) : null}
        </Section>

        <Section
          title="Уведомления"
          description="Счётчик непрочитанных обновляется опросом раз в минуту — без WebSocket и фоновых пушей."
          icon={<Bell className="h-4 w-4" />}
        >
          <div className="divide-y divide-border">
            {(Object.keys(NOTIFY_LABELS) as NotificationType[]).map((type) => (
              <Switch
                key={type}
                checked={notify[type] !== false}
                onChange={(value) => void saveNotify({ ...notify, [type]: value })}
                label={NOTIFY_LABELS[type]}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Внешний вид"
          description="Тема применяется сразу и запоминается в этом браузере."
          icon={<Palette className="h-4 w-4" />}
        >
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'light', label: 'Светлая', icon: Sun },
              { value: 'dark', label: 'Тёмная', icon: Moon },
              { value: 'system', label: 'Системная', icon: Monitor },
            ].map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value as 'light' | 'dark' | 'system')}
                  aria-pressed={theme === option.value}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors',
                    theme === option.value
                      ? 'border-accent bg-accent/5 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-surface-hover',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Аккаунт" icon={<LogOut className="h-4 w-4" />}>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>
              Email: <span className="text-foreground">{user.email ?? 'не привязан'}</span>
            </p>
            <p>
              Статус: <span className="text-foreground">{user.status === 'active' ? 'активен' : user.status}</span>
            </p>
            <p>
              Зарегистрирован:{' '}
              <span className="text-foreground">
                {new Date(user.createdAt).toLocaleDateString('ru-RU')}
              </span>
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to={user.username ? `/u/${user.username}` : '/feed'}>Открыть профиль</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              <LogOut className="h-3.5 w-3.5" /> Выйти
            </Button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Удаление аккаунта вручную выполняет администратор: автоматическое удаление связано с
            необратимой потерей публикаций и комментариев.
          </p>
        </Section>
      </div>
    </PageTransition>
  );
}
