// Виджеты структурированных типов публикаций.

import { useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  ListChecks,
  Loader2,
  MapPin,
  Plus,
  Target,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/client/components/ui/button';
import { Input } from '@/client/components/ui/form';
import { Avatar, Badge } from '@/client/components/ui/primitives';
import { apiDelete, apiPatch, apiPost, ApiError } from '@/client/lib/api';
import { useSession } from '@/client/lib/queries';
import { cn, formatDateTime, formatNumber, timeAgo } from '@/client/lib/utils';
import type {
  ChecklistDto,
  EventDto,
  GoalDto,
  PollDto,
  PostDetail,
  ProjectDto,
  TeamDto,
  VacancyDto,
} from '@/shared/types';

function usePostRefresh(postId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['post', postId] });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  };
}

function WidgetShell({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ————— Опрос —————

function PollWidget({ poll, postId, canVote }: { poll: PollDto; postId: string; canVote: boolean }) {
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const refresh = usePostRefresh(postId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closed = poll.status === 'closed' || (poll.closesAt ? new Date(poll.closesAt) < new Date() : false);
  const showResults = poll.resultsVisible || closed;

  const vote = async (optionId: string) => {
    if (!user) return;
    setBusy(optionId);
    setError(null);
    try {
      await apiPost(`/posts/${postId}/poll/vote`, { optionId });
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось проголосовать');
    } finally {
      setBusy(null);
    }
  };

  return (
    <WidgetShell
      title="Опрос"
      icon={<CheckCircle2 className="h-4 w-4" />}
      action={
        <span className="text-[11px] text-muted-foreground">
          {poll.totalVotes} {poll.totalVotes === 1 ? 'голос' : 'голосов'}
        </span>
      }
    >
      <div className="space-y-1.5">
        {poll.options.map((option) => {
          const mine = poll.myVote === option.id;
          const interactive = Boolean(user) && !poll.myVote && !closed && canVote;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!interactive || busy !== null}
              onClick={() => void vote(option.id)}
              className={cn(
                'relative w-full overflow-hidden rounded-md border px-3 py-2.5 text-left text-sm transition-colors',
                mine ? 'border-accent/50' : 'border-border',
                interactive ? 'hover:border-foreground/25 hover:bg-surface-hover' : 'cursor-default',
              )}
            >
              {showResults ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-0 left-0 transition-[width] duration-500',
                    mine ? 'bg-accent/15' : 'bg-secondary',
                  )}
                  style={{ width: `${option.percent}%` }}
                />
              ) : null}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {mine ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
                  <span className="truncate">{option.text}</span>
                </span>
                {showResults ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {option.percent}% · {option.votesCount}
                  </span>
                ) : busy === option.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {!showResults ? <span>Результаты скрыты до голосования</span> : null}
        {poll.myVote ? <span>Ваш голос учтён — изменить нельзя</span> : null}
        {poll.closesAt ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {closed ? 'закрыт' : 'до'} {formatDateTime(poll.closesAt)}
          </span>
        ) : null}
        {!user ? (
          <Link to="/auth" className="text-accent hover:underline">
            войдите, чтобы голосовать
          </Link>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </WidgetShell>
  );
}

// ————— Команда —————

function TeamWidget({
  team,
  postId,
  isOwner,
  canApply,
}: {
  team: TeamDto;
  postId: string;
  isOwner: boolean;
  canApply: boolean;
}) {
  const refresh = usePostRefresh(postId);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const { data: session } = useSession();
  const user = session?.user ?? null;

  const apply = async () => {
    if (!roleId || message.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/posts/${postId}/apply`, { roleId, message: message.trim() });
      setRoleId(null);
      setMessage('');
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, decision: 'accept' | 'reject') => {
    setDecisionBusy(id);
    setError(null);
    try {
      await apiPost(`/applications/${id}/decision`, { decision });
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось обработать заявку');
    } finally {
      setDecisionBusy(null);
    }
  };

  const withdraw = async () => {
    if (!team.viewerApplication) return;
    setBusy(true);
    try {
      await apiPost(`/applications/${team.viewerApplication.id}/withdraw`);
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отозвать заявку');
    } finally {
      setBusy(false);
    }
  };

  const pending = team.applications.filter((item) => item.status === 'pending');

  return (
    <WidgetShell
      title="Команда"
      icon={<Users className="h-4 w-4" />}
      action={
        team.expiresAt ? (
          <span className="text-[11px] text-muted-foreground">до {formatDateTime(team.expiresAt)}</span>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {team.roles.map((role) => (
          <div
            key={role.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{role.name}</p>
              {role.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  role.openSeats > 0
                    ? 'bg-success/10 text-success'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                {role.openSeats > 0 ? `${role.openSeats} из ${role.capacity} свободно` : 'мест нет'}
              </span>
              {canApply && role.openSeats > 0 && !team.viewerApplication && !isOwner ? (
                <Button
                  size="sm"
                  variant={roleId === role.id ? 'primary' : 'secondary'}
                  onClick={() => setRoleId(roleId === role.id ? null : role.id)}
                >
                  Откликнуться
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {roleId && !isOwner ? (
        <div className="mt-3 rounded-md border border-accent/30 bg-accent/[0.04] p-3">
          <p className="text-xs font-medium">
            Заявка на роль «{team.roles.find((role) => role.id === roleId)?.name}»
          </p>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Расскажите, почему вы подходите: опыт, ссылки, ожидания."
            className="mt-2 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Минимум 3 символа</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRoleId(null)}>
                Отмена
              </Button>
              <Button
                size="sm"
                onClick={() => void apply()}
                loading={busy}
                disabled={message.trim().length < 3}
              >
                Отправить заявку
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {team.viewerApplication ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-xs">
          <span>
            Ваша заявка:{" "}
            <strong
              className={cn(
                team.viewerApplication.status === 'accepted'
                  ? 'text-success'
                  : team.viewerApplication.status === 'rejected'
                    ? 'text-destructive'
                    : 'text-foreground',
              )}
            >
              {team.viewerApplication.status === 'pending'
                ? 'на рассмотрении'
                : team.viewerApplication.status === 'accepted'
                  ? 'принята'
                  : team.viewerApplication.status === 'rejected'
                    ? 'отклонена'
                    : 'отозвана'}
            </strong>
          </span>
          {team.viewerApplication.status === 'pending' ? (
            <Button size="sm" variant="ghost" onClick={() => void withdraw()} loading={busy}>
              Отозвать
            </Button>
          ) : null}
        </div>
      ) : null}

      {isOwner ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold">
            Заявки <span className="font-normal text-muted-foreground">({pending.length} новых)</span>
          </p>
          {team.applications.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Пока никто не откликнулся.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {team.applications.map((application) => (
                <div
                  key={application.id}
                  className="rounded-md border border-border bg-surface p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Link to={`/u/${application.user.username}`}>
                      <Avatar
                        name={application.user.displayName}
                        username={application.user.username}
                        size={24}
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {application.user.displayName}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {application.roleName ?? 'роль'}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {timeAgo(application.createdAt)}
                      </p>
                    </div>
                    {application.status === 'pending' ? (
                      <div className="flex gap-1">
                        <Button
                          size="icon-sm"
                          variant="success"
                          onClick={() => void decide(application.id, 'accept')}
                          loading={decisionBusy === application.id}
                          aria-label="Принять заявку"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() => void decide(application.id, 'reject')}
                          disabled={decisionBusy === application.id}
                          aria-label="Отклонить заявку"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Badge tone={application.status === 'accepted' ? 'teal' : 'neutral'}>
                        {application.status}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {application.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      {!user && canApply ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <Link to="/auth" className="text-accent hover:underline">
            Войдите
          </Link>
          , чтобы откликнуться.
        </p>
      ) : null}
    </WidgetShell>
  );
}

// ————— Событие —————

function EventWidget({
  event,
  postId,
  canAttend,
}: {
  event: EventDto;
  postId: string;
  canAttend: boolean;
}) {
  const refresh = usePostRefresh(postId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attend = async (status: 'going' | 'maybe') => {
    setBusy(status);
    setError(null);
    try {
      await apiPost(`/posts/${postId}/attend`, { status });
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отметиться');
    } finally {
      setBusy(null);
    }
  };

  const full = event.capacity !== null && event.goingCount >= event.capacity;

  return (
    <WidgetShell title="Событие" icon={<CalendarDays className="h-4 w-4" />}>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Начало</p>
          <p className="mt-0.5 text-[13px] font-medium">{formatDateTime(event.startsAt)}</p>
        </div>
        {event.endsAt ? (
          <div className="rounded-md border border-border bg-surface px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Окончание</p>
            <p className="mt-0.5 text-[13px] font-medium">{formatDateTime(event.endsAt)}</p>
          </div>
        ) : null}
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Формат</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-medium">
            {event.format === 'online' ? (
              <>
                <Video className="h-3.5 w-3.5" /> онлайн
              </>
            ) : (
              <>
                <MapPin className="h-3.5 w-3.5" /> {event.location || 'офлайн'}
              </>
            )}
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Участники</p>
          <p className="mt-0.5 text-[13px] font-medium">
            {event.goingCount}
            {event.capacity !== null ? ` / ${event.capacity}` : ''}
            {full ? <span className="ml-1 text-[11px] text-warning">мест нет</span> : null}
          </p>
        </div>
      </div>

      {event.onlineUrl && event.status === 'scheduled' ? (
        <a
          href={event.onlineUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Ссылка на трансляцию
        </a>
      ) : null}

      {canAttend && event.status === 'scheduled' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={event.viewerStatus === 'going' ? 'primary' : 'secondary'}
            onClick={() => void attend('going')}
            loading={busy === 'going'}
            disabled={full && event.viewerStatus !== 'going'}
          >
            {event.viewerStatus === 'going' ? 'Вы идёте' : full ? 'Мест нет' : 'Пойду'}
          </Button>
          <Button
            size="sm"
            variant={event.viewerStatus === 'maybe' ? 'primary' : 'outline'}
            onClick={() => void attend('maybe')}
            loading={busy === 'maybe'}
          >
            {event.viewerStatus === 'maybe' ? 'Возможно, придёте' : 'Возможно'}
          </Button>
        </div>
      ) : null}
      {event.status !== 'scheduled' ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Событие {event.status === 'completed' ? 'завершено' : 'отменено'}.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </WidgetShell>
  );
}

// ————— Вакансия / проект —————

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-[13px] font-medium">{value}</span>
    </div>
  );
}

function VacancyWidget({ vacancy }: { vacancy: VacancyDto }) {
  return (
    <WidgetShell title="Условия" icon={<Briefcase className="h-4 w-4" />}>
      <div>
        {vacancy.company ? <InfoRow label="Компания" value={vacancy.company} /> : null}
        {vacancy.employment ? <InfoRow label="Занятость" value={vacancy.employment} /> : null}
        {vacancy.compensation ? <InfoRow label="Оплата" value={vacancy.compensation} /> : null}
        <InfoRow
          label="Связь"
          value={
            vacancy.contactMethod === 'comments'
              ? 'в комментариях'
              : vacancy.contactMethod === 'profile'
                ? 'через профиль'
                : vacancy.externalUrl ? (
                    <a
                      href={vacancy.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      внешняя ссылка
                    </a>
                  ) : (
                    'не указана'
                  )
          }
        />
        {vacancy.expiresAt ? (
          <InfoRow label="Актуально до" value={formatDateTime(vacancy.expiresAt)} />
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Публикация информационная: оплата и отклики — вне платформы.
      </p>
    </WidgetShell>
  );
}

function ProjectWidget({ project }: { project: ProjectDto }) {
  const labels: Record<ProjectDto['projectStatus'], string> = {
    idea: 'Идея',
    development: 'В разработке',
    testing: 'Тестирование',
    launched: 'Запущен',
    paused: 'Пауза',
    archived: 'Архив',
  };
  return (
    <WidgetShell title="О проекте" icon={<Target className="h-4 w-4" />}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="indigo">{labels[project.projectStatus]}</Badge>
        {project.externalUrl ? (
          <a
            href={project.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Открыть
          </a>
        ) : null}
      </div>
      {project.tech.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {project.tech.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium"
            >
              {tech}
            </span>
          ))}
        </div>
      ) : null}
    </WidgetShell>
  );
}

// ————— Цель —————

function GoalWidget({ goal, postId, isOwner }: { goal: GoalDto; postId: string; isOwner: boolean }) {
  const refresh = usePostRefresh(postId);
  const [value, setValue] = useState(String(goal.currentValue));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveProgress = async () => {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed < 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/posts/${postId}/goal`, { currentValue: parsed });
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось обновить прогресс');
    } finally {
      setBusy(false);
    }
  };

  const toggleMilestone = async (milestoneId: string, isDone: boolean) => {
    try {
      await apiPost(`/posts/${postId}/milestones/${milestoneId}`, { isDone });
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить этап');
    }
  };

  return (
    <WidgetShell title="Цель" icon={<Target className="h-4 w-4" />}>
      <div className="flex items-end justify-between gap-2">
        <p className="font-display text-2xl font-semibold tabular-nums">
          {formatNumber(goal.currentValue)}
          <span className="text-sm font-normal text-muted-foreground">
            {' '}
            / {formatNumber(goal.targetValue)} {goal.unit}
          </span>
        </p>
        <span className="text-sm font-semibold text-accent">{goal.percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700"
          style={{ width: `${goal.percent}%` }}
        />
      </div>
      {goal.deadline ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Дедлайн: {formatDateTime(goal.deadline)}
        </p>
      ) : null}

      {goal.milestones.length > 0 ? (
        <div className="mt-3 space-y-1">
          {goal.milestones.map((milestone) => (
            <label
              key={milestone.id}
              className={cn(
                'flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm',
                isOwner ? 'cursor-pointer hover:bg-surface-hover' : '',
              )}
            >
              <input
                type="checkbox"
                checked={milestone.isDone}
                disabled={!isOwner}
                onChange={(event) => void toggleMilestone(milestone.id, event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              <span className={cn(milestone.isDone && 'text-muted-foreground line-through')}>
                {milestone.title}
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {isOwner ? (
        <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
          <label className="flex-1 text-xs text-muted-foreground">
            Текущее значение
            <Input
              type="number"
              min={0}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-1"
            />
          </label>
          <Button size="md" onClick={() => void saveProgress()} loading={busy}>
            Обновить
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </WidgetShell>
  );
}

// ————— Чек-лист —————

function ChecklistWidget({
  checklist,
  postId,
  canEdit,
  isOwner,
}: {
  checklist: ChecklistDto;
  postId: string;
  canEdit: boolean;
  isOwner: boolean;
}) {
  const refresh = usePostRefresh(postId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collaborator, setCollaborator] = useState('');

  const toggle = async (itemId: string, isDone: boolean) => {
    try {
      await apiPatch(`/posts/${postId}/items/${itemId}`, { isDone });
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить задачу');
    }
  };

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/posts/${postId}/items`, { text: text.trim() });
      setText('');
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось добавить задачу');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (itemId: string) => {
    try {
      await apiDelete(`/posts/${postId}/items/${itemId}`);
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось удалить задачу');
    }
  };

  const addCollaborator = async () => {
    if (!collaborator.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/posts/${postId}/collaborators`, {
        username: collaborator.trim().replace(/^@/, ''),
        permission: 'edit',
      });
      setCollaborator('');
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось добавить участника');
    } finally {
      setBusy(false);
    }
  };

  const percent = checklist.total > 0 ? Math.round((checklist.done / checklist.total) * 100) : 0;

  return (
    <WidgetShell
      title="Чек-лист"
      icon={<ListChecks className="h-4 w-4" />}
      action={
        <span className="text-[11px] text-muted-foreground">
          {checklist.done} / {checklist.total} · {percent}%
        </span>
      }
    >
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-success transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-2.5 space-y-0.5">
        {checklist.items.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">Задач пока нет.</p>
        ) : (
          checklist.items.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={item.isDone}
                disabled={!checklist.canEditItems}
                onChange={(event) => void toggle(item.id, event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--success)]"
                aria-label={item.text}
              />
              <span
                className={cn(
                  'flex-1 text-sm',
                  item.isDone && 'text-muted-foreground line-through',
                )}
              >
                {item.text}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void remove(item.id)}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Удалить задачу ${item.text}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {checklist.canEditItems ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Новая задача…"
            maxLength={200}
            className="h-8"
          />
          <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={!text.trim()}>
            <Plus className="h-3.5 w-3.5" /> Добавить
          </Button>
        </form>
      ) : null}

      {checklist.collaborators.length > 0 ? (
        <div className="mt-3 border-t border-border pt-2.5">
          <p className="text-[11px] font-medium text-muted-foreground">Совместный доступ</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {checklist.collaborators.map((person) => (
              <Link
                key={person.id}
                to={`/u/${person.username}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] hover:text-accent"
              >
                <Avatar name={person.displayName} username={person.username} size={16} />
                {person.displayName}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {isOwner ? (
        <div className="mt-2 flex gap-2">
          <Input
            value={collaborator}
            onChange={(event) => setCollaborator(event.target.value)}
            placeholder="@username для совместной работы"
            className="h-8"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void addCollaborator()}
            loading={busy}
            disabled={!collaborator.trim()}
          >
            Добавить
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </WidgetShell>
  );
}

// ————— Сборка —————

export function PostTypeWidgets({ post, isOwner }: { post: PostDetail; isOwner: boolean }) {
  const data = post.typeData;
  const canAttend = Boolean(post.viewer?.canComment);

  return (
    <div className="space-y-3">
      {data.poll ? <PollWidget poll={data.poll} postId={post.id} canVote={canAttend} /> : null}
      {data.team ? (
        <TeamWidget
          team={data.team}
          postId={post.id}
          isOwner={isOwner}
          canApply={canAttend}
        />
      ) : null}
      {data.event ? <EventWidget event={data.event} postId={post.id} canAttend={canAttend} /> : null}
      {data.vacancy ? <VacancyWidget vacancy={data.vacancy} /> : null}
      {data.project ? <ProjectWidget project={data.project} /> : null}
      {data.goal ? <GoalWidget goal={data.goal} postId={post.id} isOwner={isOwner} /> : null}
      {data.checklist ? (
        <ChecklistWidget
          checklist={data.checklist}
          postId={post.id}
          canEdit={Boolean(post.viewer?.canEdit)}
          isOwner={isOwner}
        />
      ) : null}
    </div>
  );
}

export { usePostRefresh };
