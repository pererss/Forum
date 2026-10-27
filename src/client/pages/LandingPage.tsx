// Первый экран: крупная типографика, курсор-реактивная подпись и живые данные.

import {
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Compass,
  FileText,
  HelpCircle,
  ListChecks,
  MessagesSquare,
  Rocket,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { SignatureField } from '@/client/components/SignatureField';
import { PostCardItem } from '@/client/components/post/PostCardItem';
import { Button } from '@/client/components/ui/button';
import { AnimatedNumber, Reveal } from '@/client/components/ui/motion';
import { useDocumentTitle } from '@/client/lib/hooks';
import { useCategories, useFeed, useSession, useTagSuggestions } from '@/client/lib/queries';
import { POST_TYPE_META, type PostType } from '@/shared/post-types';

const FORMATS: { type: PostType; icon: typeof MessagesSquare; blurb: string }[] = [
  { type: 'discussion', icon: MessagesSquare, blurb: 'Разговор без шума' },
  { type: 'article', icon: FileText, blurb: 'Тексты с режимом чтения' },
  { type: 'question', icon: HelpCircle, blurb: 'Ответы с решением' },
  { type: 'poll', icon: BarChart3, blurb: 'Честные голосования' },
  { type: 'team', icon: Users, blurb: 'Роли и свободные места' },
  { type: 'event', icon: CalendarDays, blurb: 'Встречи и эфиры' },
  { type: 'vacancy', icon: Briefcase, blurb: 'Условия без воды' },
  { type: 'project', icon: Rocket, blurb: 'Портфолио и ссылки' },
  { type: 'goal', icon: Target, blurb: 'Прогресс и этапы' },
  { type: 'checklist', icon: ListChecks, blurb: 'Совместные задачи' },
];

const PRINCIPLES = [
  {
    title: 'Без алгоритмического шума',
    text: 'Лента не прячет авторов и не накручивает охваты. До трёх публикаций одного автора подряд — и честная пагинация.',
  },
  {
    title: 'Прозрачные правила',
    text: 'Уровни, репутация и достижения считаются только на сервере. Любое изменение настроек пишется в журнал.',
  },
  {
    title: 'Данные под контролем',
    text: 'Приватность, уведомления и интересы — в ваших руках. Публичные счётчики скрываются одной настройкой.',
  },
];

export function LandingPage() {
  useDocumentTitle(null);
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const feed = useFeed({ mode: 'new', pageSize: 4, page: 1 });
  const categories = useCategories();
  const tags = useTagSuggestions('');

  const totalPosts = feed.data?.total;
  const totalTags = tags.data?.items.length;

  return (
    <div className="-mx-3 -mt-5 sm:-mx-5 md:-mx-6">
      {/* ————— Первый экран ————— */}
      <section className="relative isolate overflow-hidden bg-[#0a0a0c] text-white">
        <div aria-hidden className="surface-grid absolute inset-0 opacity-[0.13]" />
        <SignatureField className="opacity-90" />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,transparent_20%,rgba(10,10,12,0.55)_65%,#0a0a0c_100%)]"
        />
        <div className="relative mx-auto flex min-h-[540px] w-full max-w-[1200px] flex-col justify-center px-5 py-16 sm:px-8 lg:min-h-[620px] lg:py-24">
          <Reveal delay={0.05}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-medium tracking-wide text-white/70 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7cc4f0]" />
              сообщество · идеи · команды
            </span>
          </Reveal>

          <Reveal delay={0.12}>
            <h1 className="mt-6 font-display text-[clamp(4rem,13vw,9.5rem)] font-semibold leading-[0.86] tracking-[-0.06em]">
              Nuffy
              <span className="ml-2 inline-block h-3 w-3 rounded-full bg-[#7cc4f0] align-super sm:h-4 sm:w-4" />
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="mt-5 max-w-xl text-balance-tight text-[17px] leading-relaxed text-white/72 sm:text-xl">
              Сообщество, в котором слышно каждого: обсуждения, статьи, вопросы, команды и события —
              без бесконечной ленты и лишнего шума.
            </p>
          </Reveal>

          <Reveal delay={0.28}>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link
                to={user ? '/feed' : '/auth'}
                className="group inline-flex h-11 items-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-[#0a0a0c] transition-transform active:scale-[0.98]"
              >
                {user ? 'Открыть ленту' : 'Присоединиться'}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/explore"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-white/20 bg-white/[0.03] px-5 text-sm font-medium text-white/85 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
              >
                <Compass className="h-4 w-4" />
                Обзор сообщества
              </Link>
              <Link
                to={user ? '/new' : '/auth'}
                className="inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium text-white/60 transition-colors hover:text-white"
              >
                <Sparkles className="h-4 w-4" />
                {user ? 'Создать публикацию' : 'Как это работает'}
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.36}>
            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/10 pt-6 text-white/60">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em]">публикаций</dt>
                <dd className="font-display text-2xl font-semibold text-white">
                  {typeof totalPosts === 'number' ? <AnimatedNumber value={totalPosts} /> : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em]">форматов</dt>
                <dd className="font-display text-2xl font-semibold text-white">10</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em]">категорий</dt>
                <dd className="font-display text-2xl font-semibold text-white">
                  {categories.data ? <AnimatedNumber value={categories.data.items.length} /> : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em]">тегов</dt>
                <dd className="font-display text-2xl font-semibold text-white">
                  {typeof totalTags === 'number' ? <AnimatedNumber value={totalTags} /> : '—'}
                </dd>
              </div>
            </dl>
          </Reveal>
        </div>
        <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 text-white/35 sm:flex">
          <span className="text-[10px] uppercase tracking-[0.18em]">листайте</span>
          <span className="h-8 w-px bg-gradient-to-b from-white/40 to-transparent" />
        </div>
      </section>

      {/* ————— Форматы ————— */}
      <section className="mx-auto w-full max-w-[1200px] px-4 py-14 sm:px-6 lg:py-20">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                один фундамент
              </p>
              <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                Десять форматов — один редактор
              </h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              Каждый формат добавляет свои поля, но сохраняет единые комментарии, реакции и
              прозрачные счётчики.
            </p>
          </div>
        </Reveal>

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {FORMATS.map((format, index) => {
            const Icon = format.icon;
            const meta = POST_TYPE_META[format.type];
            return (
              <Reveal key={format.type} delay={Math.min(index, 9) * 0.03}>
                <Link
                  to={`/explore/${format.type}`}
                  className="group flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-pop"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-secondary text-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <span>
                    <span className="block font-display text-[13px] font-semibold">{meta.name}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {format.blurb}
                    </span>
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ————— Принципы ————— */}
      <section className="border-y border-border bg-surface/60">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-14 sm:px-6 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr] lg:gap-14">
            <Reveal>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                  принципы
                </p>
                <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                  Тише, но глубже
                </h2>
                <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                  Nuffy не соревнуется за внимание. Он помогает находить людей и доводить идеи до
                  результата.
                </p>
              </div>
            </Reveal>
            <div className="grid gap-5 sm:grid-cols-3">
              {PRINCIPLES.map((principle, index) => (
                <Reveal key={principle.title} delay={index * 0.06}>
                  <div>
                    <CheckCircle2 className="h-5 w-5 text-accent" strokeWidth={1.7} />
                    <h3 className="mt-2.5 font-display text-sm font-semibold">{principle.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {principle.text}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ————— Свежее ————— */}
      <section className="mx-auto w-full max-w-[1200px] px-4 py-14 sm:px-6 lg:py-18">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                прямо сейчас
              </p>
              <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                Свежее в сообществе
              </h2>
            </div>
            <Link
              to="/feed"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Вся лента
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>

        <div className="mt-5">
          {feed.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-40 animate-pulse-soft rounded-lg border border-border bg-card" />
              ))}
            </div>
          ) : (feed.data?.items.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card/50 px-5 py-10 text-center">
              <p className="font-display text-base font-semibold">Пока пусто — но это ненадолго</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Опубликуйте первую идею: обсуждение, вопрос или проект. Всё остальное появится само.
              </p>
              <Button asChild className="mt-4">
                <Link to={user ? '/new' : '/auth'}>
                  {user ? 'Создать публикацию' : 'Войти и начать'}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {feed.data?.items.map((post, index) => (
                <Reveal key={post.id} delay={index * 0.04}>
                  <PostCardItem post={post} variant="grid" />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ————— Финальный призыв ————— */}
      <section className="mx-auto w-full max-w-[1200px] px-4 pb-16 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-border bg-[#0b0b0e] px-6 py-10 text-white sm:px-10 sm:py-12">
            <div aria-hidden className="surface-grid absolute inset-0 opacity-[0.12]" />
            <div aria-hidden className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#7cc4f0]/15 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div>
                <h2 className="max-w-lg font-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                  Найдите своих людей. Без лишнего шума.
                </h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-white/60">
                  Регистрация через Google готовится. Пока доступен тестовый вход в режиме разработки —
                  без фиктивных аккаунтов.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to={user ? '/feed' : '/auth'}
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-[#0a0a0c] transition-transform active:scale-[0.98]"
                >
                  {user ? 'Перейти в ленту' : 'Войти в Nuffy'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/explore"
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-white/20 px-5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Сначала посмотреть
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-border bg-surface/50">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-[11px] text-muted-foreground sm:px-6">
          <span className="font-display text-sm font-semibold text-foreground">Nuffy</span>
          <span>Обсуждения · Статьи · Вопросы · Команды · События</span>
          <span>TiDB Cloud · PostgreSQL Compatible</span>
        </div>
      </footer>
    </div>
  );
}
