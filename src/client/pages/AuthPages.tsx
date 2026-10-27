// Вход и первичная настройка профиля. Google OAuth включается только через env;
// без настроек честно показываем состояние, а не имитацию входа.

import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Info, Loader2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { SignatureField } from '@/client/components/SignatureField';
import { Wordmark } from '@/client/components/layout/AppShell';
import { Button } from '@/client/components/ui/button';
import { Input, Label } from '@/client/components/ui/form';
import { PageTransition } from '@/client/components/ui/motion';
import { apiPost, ApiError } from '@/client/lib/api';
import { useDocumentTitle } from '@/client/lib/hooks';
import { keys, useMeta, useSession, useTagSuggestions } from '@/client/lib/queries';
import { cn } from '@/client/lib/utils';
import { USERNAME_RE } from '@/shared/slug';
import type { SessionUser } from '@/shared/types';

function GoogleButton({ configured }: { configured: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (!configured) {
            setNotice('Авторизация ещё не настроена: администратору нужно добавить GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.');
            return;
          }
          window.location.href = '/api/auth/google';
        }}
        className={cn(
          'flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-border bg-card text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-surface-hover',
          !configured && 'text-muted-foreground',
        )}
        aria-describedby="google-status"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
          />
        </svg>
        Продолжить с Google
      </button>
      <p id="google-status" className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {configured
          ? 'Откроется страница Google. Пароль не передаётся Nuffy.'
          : 'Авторизация ещё не настроена. Google-вход появится после добавления ключей на сервере.'}
      </p>
      {notice ? (
        <p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-[11px] leading-relaxed text-warning">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

export function AuthPage() {
  useDocumentTitle('Вход');
  const { data: session, isLoading: sessionLoading } = useSession();
  const meta = useMeta();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    navigate(session.user.onboarded ? '/feed' : '/onboarding', { replace: true });
  }, [session, navigate]);

  const devLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!USERNAME_RE.test(username.trim())) {
      setFieldError('3–24 символа: латиница, цифры, точка, дефис, подчёркивание.');
      return;
    }
    setFieldError(null);
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ user: SessionUser }>('/auth/dev-login', {
        username: username.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: keys.session });
      navigate(result.user.onboarded ? '/feed' : '/onboarding', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const devEnabled = meta.data?.devLogin.enabled ?? false;
  const googleConfigured = meta.data?.oauth.configured ?? false;
  const dbDown = meta.data ? !meta.data.db.ready : false;

  return (
    <PageTransition>
      <div className="relative mx-auto grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-pop lg:grid-cols-2">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 z-0 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative hidden min-h-[540px] overflow-hidden bg-[#0a0a0c] p-8 text-white lg:block">
          <div aria-hidden className="surface-grid absolute inset-0 opacity-[0.14]" />
          <SignatureField className="opacity-80" />
          <div className="relative flex h-full flex-col">
            <Wordmark />
            <div className="mt-auto">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">
                Nuffy
              </p>
              <h2 className="mt-2 max-w-xs font-display text-3xl font-semibold leading-tight tracking-[-0.03em]">
                Место, где идеи находят людей.
              </h2>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/55">
                Обсуждения, статьи, вопросы, команды и события — без бесконечной ленты и лишнего
                шума.
              </p>
              <ul className="mt-6 space-y-2 text-xs text-white/50">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5" /> Приватность под вашим контролем
                </li>
                <li className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5" /> Серверные сессии, без токенов в браузере
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" /> Уровни и достижения за реальные действия
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <h1 className="mt-6 font-display text-2xl font-semibold tracking-[-0.02em] lg:mt-0">
            Вход в Nuffy
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Один аккаунт — все форматы публикаций и сообщества.
          </p>

          {dbDown ? (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
              База данных временно недоступна. Вход станет доступен после восстановления соединения.
            </p>
          ) : null}

          <div className="mt-5">
            <GoogleButton configured={googleConfigured && !dbDown} />
          </div>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {devEnabled ? 'или тестовый вход' : 'или'}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {devEnabled ? (
            <form onSubmit={(event) => void devLogin(event)} noValidate>
              <Label htmlFor="dev-username" error={fieldError ?? undefined}>
                Имя пользователя
              </Label>
              <Input
                id="dev-username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setFieldError(null);
                }}
                placeholder="например, anna_k"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={24}
                aria-invalid={Boolean(fieldError)}
              />
              <Button type="submit" className="mt-3 w-full" size="lg" loading={busy}>
                Продолжить <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Тестовый вход доступен только в режиме разработки (ENABLE_DEV_LOGIN=true). Новый
                ник создаёт аккаунт, повторный — входит в тот же профиль.
              </p>
              {error ? (
                <p className="mt-2 rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </form>
          ) : (
            <div className="rounded-md border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-muted-foreground">
              Тестовый вход отключён. Публичная авторизация через Google ещё не настроена —
              администратору нужно задать GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в окружении
              сервера. Секреты никогда не попадают в клиентский код.
            </div>
          )}

          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            Продолжая, вы соглашаетесь с правилами сообщества. Публичные счётчики можно скрыть в
            настройках. <Link to="/explore" className="text-accent hover:underline">Сначала посмотреть</Link>
          </p>
        </div>
      </div>
    </PageTransition>
  );
}

export function OnboardingPage() {
  useDocumentTitle('Настройка профиля');
  const { data: session, isLoading } = useSession();
  const meta = useMeta();
  const tags = useTagSuggestions('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = session?.user ?? null;

  useEffect(() => {
    if (isLoading) return;
    if (!user) navigate('/auth', { replace: true });
    else if (user.onboarded) navigate('/feed', { replace: true });
  }, [user, isLoading, navigate]);

  const filteredTags = (tags.data?.items ?? []).filter((tag) =>
    tagQuery.trim() ? tag.name.toLowerCase().includes(tagQuery.trim().toLowerCase()) : true,
  );

  const toggleInterest = (slug: string) => {
    setInterests((current) => {
      if (current.includes(slug)) return current.filter((item) => item !== slug);
      if (current.length >= 30) return current;
      return [...current, slug];
    });
  };

  const submit = async () => {
    if (!USERNAME_RE.test(username.trim())) {
      setError('Ник: 3–24 символа, латиница, цифры, точка, дефис или подчёркивание.');
      setStep(1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost('/auth/setup', {
        username: username.trim(),
        displayName: displayName.trim() || undefined,
        interests,
      });
      await queryClient.invalidateQueries({ queryKey: keys.session });
      navigate('/feed', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.details) {
        const first = Object.values(caught.details)[0]?.[0];
        setError(first ?? caught.message);
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить профиль');
      }
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-4 flex items-center gap-2">
          {[1, 2].map((item) => (
            <span
              key={item}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                step >= item ? 'bg-accent' : 'bg-secondary',
              )}
            />
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-7">
          {step === 1 ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                шаг 1 из 2
              </p>
              <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em]">
                Как вас зовут?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Ник виден всем и используется в упоминаниях. Изменить его позже нельзя.
              </p>
              <div className="mt-5 space-y-3">
                <div>
                  <Label htmlFor="onboarding-username">Ник</Label>
                  <Input
                    id="onboarding-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value.toLowerCase())}
                    placeholder="anna_k"
                    maxLength={24}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Латинские буквы, цифры, точка, дефис, подчёркивание. 3–24 символа.
                  </p>
                </div>
                <div>
                  <Label htmlFor="onboarding-name" hint="необязательно">
                    Отображаемое имя
                  </Label>
                  <Input
                    id="onboarding-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Анна Ковалёва"
                    maxLength={60}
                  />
                </div>
              </div>
              <Button
                className="mt-5 w-full"
                size="lg"
                onClick={() => {
                  if (!USERNAME_RE.test(username.trim())) {
                    setError('Ник: 3–24 символа, латиница, цифры, точка, дефис или подчёркивание.');
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
              >
                Дальше <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                шаг 2 из 2
              </p>
              <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em]">
                Что вам интересно?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Выберите темы — они улучшат ленту «Для меня». Можно пропустить и настроить позже.
              </p>
              <Input
                value={tagQuery}
                onChange={(event) => setTagQuery(event.target.value)}
                placeholder="Найти тему…"
                className="mt-4"
              />
              <div className="mt-3 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
                {filteredTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Пока нет подходящих тегов — они появятся вместе с публикациями.
                  </p>
                ) : (
                  filteredTags.slice(0, 60).map((tag) => {
                    const active = interests.includes(tag.slug);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleInterest(tag.slug)}
                        aria-pressed={active}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border bg-secondary text-secondary-foreground hover:border-foreground/20',
                        )}
                      >
                        {active ? <Check className="h-3 w-3" /> : null}#{tag.name}
                      </button>
                    );
                  })
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Выбрано {interests.length} из 30
              </p>
              {error ? (
                <p className="mt-2 rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              {!meta.data?.db.ready ? (
                <p className="mt-2 text-xs text-destructive">База данных недоступна — повторите позже.</p>
              ) : null}
              <div className="mt-5 flex gap-2">
                <Button variant="secondary" size="lg" onClick={() => setStep(1)}>
                  Назад
                </Button>
                <Button className="flex-1" size="lg" onClick={() => void submit()} loading={busy}>
                  Завершить <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Данные профиля хранятся в базе Nuffy. Приватность меняется в настройках.
        </p>
      </div>
    </PageTransition>
  );
}
