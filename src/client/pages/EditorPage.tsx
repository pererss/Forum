// Единый редактор: выбор типа, адаптивные поля, предпросмотр,
// автосохранение черновика, валидация и защита от потери данных.

import {
  BarChart3,
  Briefcase,
  CalendarDays,
  Check,
  FileText,
  HelpCircle,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  Rocket,
  Save,
  Send,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Markdown } from '@/client/components/Markdown';
import { TypeBadge } from '@/client/components/post/PostCardItem';
import { Button } from '@/client/components/ui/button';
import { Field, Input, RadioCard, Select, TagChip, Textarea } from '@/client/components/ui/form';
import { PageTransition } from '@/client/components/ui/motion';
import { apiGet, apiPatch, apiPost, ApiError } from '@/client/lib/api';
import { useDocumentTitle } from '@/client/lib/hooks';
import { useCategories, useSession, useTagSuggestions } from '@/client/lib/queries';
import { cn } from '@/client/lib/utils';
import { POST_TYPES, POST_TYPE_META, type PostType } from '@/shared/post-types';
import type { PollDto, PostDetail } from '@/shared/types';

const TYPE_ICONS: Record<PostType, typeof MessageSquare> = {
  discussion: MessageSquare,
  article: FileText,
  question: HelpCircle,
  poll: BarChart3,
  team: Users,
  event: CalendarDays,
  vacancy: Briefcase,
  project: Rocket,
  goal: Target,
  checklist: ListChecks,
};

type OptionRow = { id: string; text: string };
type RoleRow = { id: string; name: string; description: string; capacity: string };
type MilestoneRow = { id: string; title: string; isDone: boolean };

const uid = () => Math.random().toString(36).slice(2, 10);

function isoToLocal(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function pollToRows(poll: PollDto | undefined): OptionRow[] {
  if (!poll) return [{ id: uid(), text: '' }, { id: uid(), text: '' }];
  return poll.options.map((option) => ({ id: uid(), text: option.text }));
}

export function EditorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const categories = useCategories();

  const editId = searchParams.get('edit') ?? searchParams.get('draft');
  const initialType = (searchParams.get('type') ?? 'discussion') as PostType;
  const [type, setType] = useState<PostType>(POST_TYPES.includes(initialType) ? initialType : 'discussion');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  const [options, setOptions] = useState<OptionRow[]>([
    { id: uid(), text: '' },
    { id: uid(), text: '' },
  ]);
  const [pollClosesAt, setPollClosesAt] = useState('');
  const [showResultsAfterVote, setShowResultsAfterVote] = useState(false);

  const [roles, setRoles] = useState<RoleRow[]>([{ id: uid(), name: '', description: '', capacity: '1' }]);
  const [teamExpiresAt, setTeamExpiresAt] = useState('');

  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [eventFormat, setEventFormat] = useState<'offline' | 'online'>('offline');
  const [location, setLocation] = useState('');
  const [onlineUrl, setOnlineUrl] = useState('');
  const [eventCapacity, setEventCapacity] = useState('');

  const [company, setCompany] = useState('');
  const [employment, setEmployment] = useState('');
  const [compensation, setCompensation] = useState('');
  const [contactMethod, setContactMethod] = useState<'comments' | 'profile' | 'external'>('comments');
  const [vacancyUrl, setVacancyUrl] = useState('');
  const [vacancyExpiresAt, setVacancyExpiresAt] = useState('');

  const [projectStatus, setProjectStatus] = useState<'idea' | 'development' | 'testing' | 'launched' | 'paused' | 'archived'>('idea');
  const [projectUrl, setProjectUrl] = useState('');
  const [tech, setTech] = useState('');

  const [targetValue, setTargetValue] = useState('');
  const [goalUnit, setGoalUnit] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);

  const [checklistItems, setChecklistItems] = useState<OptionRow[]>([{ id: uid(), text: '' }]);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [original, setOriginal] = useState<PostDetail | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tagFocused, setTagFocused] = useState(false);

  const tagSuggestions = useTagSuggestions(tagInput.trim());
  const enabledTypes = useQuery({
    queryKey: ['post-types', 'enabled'],
    queryFn: () => apiGet<{ items: { type: string; is_enabled: boolean }[] }>('/post-types'),
    staleTime: 60_000,
  });
  const availableTypes = useMemo(() => {
    const enabled = enabledTypes.data?.items.filter((item) => item.is_enabled).map((item) => item.type);
    if (!enabled || enabled.length === 0) return [...POST_TYPES];
    // Свой тип при редактировании остаётся доступным, даже если формат отключили.
    const list = POST_TYPES.filter((item) => enabled.includes(item) || (original && item === type));
    return list.length > 0 ? list : [...POST_TYPES];
  }, [enabledTypes.data, original, type]);
  const lastSavedRef = useRef<string>('');
  const saveLock = useRef(false);

  useDocumentTitle(editId ? 'Редактирование' : 'Новая публикация');

  const isPublishedOriginal = original?.status === 'published';
  const autoSaveEnabled = Boolean(user) && !isPublishedOriginal;

  const buildTypeData = useCallback((): Record<string, unknown> | undefined => {
    switch (type) {
      case 'poll':
        return {
          options: options.map((option) => option.text.trim()).filter(Boolean),
          closesAt: localToIso(pollClosesAt),
          showResultsAfterVote,
        };
      case 'team':
        return {
          roles: roles
            .filter((role) => role.name.trim())
            .map((role) => ({
              name: role.name.trim(),
              description: role.description.trim() || undefined,
              capacity: Number(role.capacity) || 1,
            })),
          expiresAt: localToIso(teamExpiresAt),
        };
      case 'event':
        return {
          startsAt: localToIso(startsAt),
          endsAt: localToIso(endsAt),
          format: eventFormat,
          location: location.trim() || undefined,
          onlineUrl: onlineUrl.trim() || undefined,
          capacity: eventCapacity ? Number(eventCapacity) : undefined,
        };
      case 'vacancy':
        return {
          company: company.trim() || undefined,
          employment: employment.trim() || undefined,
          compensation: compensation.trim() || undefined,
          contactMethod,
          externalUrl: vacancyUrl.trim() || undefined,
          expiresAt: localToIso(vacancyExpiresAt),
        };
      case 'project':
        return {
          projectStatus,
          externalUrl: projectUrl.trim() || undefined,
          tech: tech
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 14),
        };
      case 'goal':
        return {
          targetValue: Number(targetValue) || 0,
          unit: goalUnit.trim(),
          deadline: localToIso(goalDeadline),
          milestones: milestones
            .filter((milestone) => milestone.title.trim())
            .map((milestone) => ({ title: milestone.title.trim(), isDone: milestone.isDone })),
        };
      case 'checklist':
        return {
          items: checklistItems
            .filter((item) => item.text.trim())
            .map((item) => ({ text: item.text.trim(), isDone: false })),
        };
      default:
        return undefined;
    }
  }, [
    type,
    options,
    pollClosesAt,
    showResultsAfterVote,
    roles,
    teamExpiresAt,
    startsAt,
    endsAt,
    eventFormat,
    location,
    onlineUrl,
    eventCapacity,
    company,
    employment,
    compensation,
    contactMethod,
    vacancyUrl,
    vacancyExpiresAt,
    projectStatus,
    projectUrl,
    tech,
    targetValue,
    goalUnit,
    goalDeadline,
    milestones,
    checklistItems,
  ]);

  const payload = useMemo(
    () => ({
      type,
      title: title.trim(),
      body,
      categoryId: categoryId || null,
      tags,
      typeData: buildTypeData(),
    }),
    [type, title, body, categoryId, tags, buildTypeData],
  );

  const serialized = JSON.stringify(payload);

  // ————— Загрузка существующей публикации —————
  useEffect(() => {
    if (!editId) {
      setLoadingEdit(false);
      return;
    }
    let cancelled = false;
    setLoadingEdit(true);
    void apiGet<{ post: PostDetail }>(`/posts/${editId}`)
      .then(({ post }) => {
        if (cancelled) return;
        setOriginal(post);
        setDraftId(post.id);
        setType(post.type);
        setTitle(post.title);
        setBody(post.body);
        setCategoryId(post.category?.id ?? '');
        setTags(post.tags.map((tag) => tag.slug));
        const data = post.typeData;
        if (data.poll) {
          setOptions(pollToRows(data.poll));
          setPollClosesAt(isoToLocal(data.poll.closesAt));
          setShowResultsAfterVote(data.poll.showResultsAfterVote);
        }
        if (data.team) {
          setRoles(
            data.team.roles.map((role) => ({
              id: uid(),
              name: role.name,
              description: role.description ?? '',
              capacity: String(role.capacity),
            })),
          );
          setTeamExpiresAt(isoToLocal(data.team.expiresAt));
        }
        if (data.event) {
          setStartsAt(isoToLocal(data.event.startsAt));
          setEndsAt(isoToLocal(data.event.endsAt));
          setEventFormat(data.event.format);
          setLocation(data.event.location ?? '');
          setOnlineUrl(data.event.onlineUrl ?? '');
          setEventCapacity(data.event.capacity ? String(data.event.capacity) : '');
        }
        if (data.vacancy) {
          setCompany(data.vacancy.company ?? '');
          setEmployment(data.vacancy.employment ?? '');
          setCompensation(data.vacancy.compensation ?? '');
          setContactMethod(data.vacancy.contactMethod);
          setVacancyUrl(data.vacancy.externalUrl ?? '');
          setVacancyExpiresAt(isoToLocal(data.vacancy.expiresAt));
        }
        if (data.project) {
          setProjectStatus(data.project.projectStatus);
          setProjectUrl(data.project.externalUrl ?? '');
          setTech(data.project.tech.join(', '));
        }
        if (data.goal) {
          setTargetValue(String(data.goal.targetValue));
          setGoalUnit(data.goal.unit);
          setGoalDeadline(isoToLocal(data.goal.deadline));
          setMilestones(
            data.goal.milestones.map((milestone) => ({
              id: uid(),
              title: milestone.title,
              isDone: milestone.isDone,
            })),
          );
        }
        if (data.checklist) {
          setChecklistItems(
            data.checklist.items.length > 0
              ? data.checklist.items.map((item) => ({ id: uid(), text: item.text }))
              : [{ id: uid(), text: '' }],
          );
        }
        lastSavedRef.current = JSON.stringify({
          type: post.type,
          title: post.title,
          body: post.body,
          categoryId: post.category?.id ?? null,
          tags: post.tags.map((tag) => tag.slug),
          typeData: undefined,
        });
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить публикацию');
      })
      .finally(() => {
        if (!cancelled) setLoadingEdit(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const validate = (forPublish: boolean): string | null => {
    if (title.trim().length < 3) return 'Заголовок — минимум 3 символа.';
    if (title.trim().length > 300) return 'Заголовок — максимум 300 символов.';
    if (tags.length > 8) return 'Не больше 8 тегов.';
    if (!forPublish) return null;

    if (type === 'poll') {
      const filled = options.map((option) => option.text.trim()).filter(Boolean);
      if (filled.length < 2) return 'Добавьте минимум два варианта ответа.';
      if (new Set(filled.map((item) => item.toLowerCase())).size !== filled.length) {
        return 'Варианты опроса не должны повторяться.';
      }
    }
    if (type === 'team') {
      if (!roles.some((role) => role.name.trim())) return 'Добавьте хотя бы одну роль.';
      if (roles.some((role) => role.name.trim() && (!Number(role.capacity) || Number(role.capacity) < 1))) {
        return 'У каждой роли должно быть минимум одно место.';
      }
    }
    if (type === 'event' && !startsAt) return 'Укажите дату начала события.';
    if (type === 'goal' && (!Number(targetValue) || Number(targetValue) <= 0)) {
      return 'Целевое значение должно быть больше нуля.';
    }
    return null;
  };

  const saveDraft = useCallback(
    async (silent = false) => {
      if (!user || saveLock.current) return null;
      if (title.trim().length < 3) {
        if (!silent) setError('Заголовок — минимум 3 символа.');
        return null;
      }
      saveLock.current = true;
      if (!silent) setSaving(true);
      setError(null);
      try {
        if (draftId) {
          await apiPatch(`/posts/${draftId}`, {
            title: payload.title,
            body: payload.body,
            categoryId: payload.categoryId,
            tags: payload.tags,
            typeData: payload.typeData,
          });
        } else {
          const created = await apiPost<{ id: string }>('/posts', { ...payload, status: 'draft' });
          setDraftId(created.id);
        }
        lastSavedRef.current = serialized;
        setSavedAt(new Date());
        setDirty(false);
        return true;
      } catch (caught) {
        if (!silent) {
          setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить черновик');
        }
        return null;
      } finally {
        saveLock.current = false;
        if (!silent) setSaving(false);
      }
    },
    [user, title, draftId, payload, serialized],
  );

  // Автосохранение: не чаще, чем через 1,6 с после последнего изменения.
  useEffect(() => {
    if (!autoSaveEnabled || loadingEdit) return;
    if (title.trim().length < 3) return;
    if (serialized === lastSavedRef.current) return;
    const timer = window.setTimeout(() => {
      void saveDraft(true);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [serialized, autoSaveEnabled, loadingEdit, saveDraft, title]);

  const publish = async () => {
    const message = validate(true);
    if (message) {
      setError(message);
      setTab('write');
      return;
    }
    if (!user) return;
    setPublishing(true);
    setError(null);
    try {
      let id = draftId;
      if (id) {
        await apiPatch(`/posts/${id}`, {
          title: payload.title,
          body: payload.body,
          categoryId: payload.categoryId,
          tags: payload.tags,
          typeData: payload.typeData,
        });
        if (original?.status !== 'published') {
          await apiPost(`/posts/${id}/publish`);
        }
      } else {
        const created = await apiPost<{ id: string }>('/posts', { ...payload, status: 'published' });
        id = created.id;
      }
      setDirty(false);
      navigate(`/post/${id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось опубликовать');
    } finally {
      setPublishing(false);
    }
  };

  const addTag = (raw?: string) => {
    const value = (raw ?? tagInput).trim().replace(/^#/, '');
    if (!value) return;
    if (tags.length >= 8) {
      setError('Не больше 8 тегов.');
      return;
    }
    if (tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
      setTagInput('');
      return;
    }
    setTags((current) => [...current, value]);
    setTagInput('');
    setDirty(true);
  };

  const removeTag = (value: string) => {
    setTags((current) => current.filter((tag) => tag !== value));
    setDirty(true);
  };

  const markDirty = () => setDirty(true);

  if (!user) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="font-display text-xl font-semibold">Нужен аккаунт</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Публикации создаются от имени пользователя. Войдите, чтобы продолжить.
        </p>
        <Button asChild className="mt-4">
          <Link to="/auth">Войти</Link>
        </Button>
      </div>
    );
  }

  if (loadingEdit) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="h-8 w-48 animate-pulse-soft rounded bg-muted" />
        <div className="h-12 w-full animate-pulse-soft rounded bg-muted" />
        <div className="h-64 w-full animate-pulse-soft rounded bg-muted" />
      </div>
    );
  }

  if (original && original.author.username !== user.username && user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="font-display text-xl font-semibold">Нет доступа</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Редактировать может только автор.</p>
        <Button asChild className="mt-4" variant="secondary">
          <Link to={`/post/${original.id}`}>Открыть публикацию</Link>
        </Button>
      </div>
    );
  }

  const saveState = saving
    ? 'Сохраняем…'
    : savedAt
      ? `Черновик сохранён в ${savedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
      : autoSaveEnabled
        ? 'Черновик сохранится автоматически'
        : 'Изменения не сохраняются автоматически';

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-3xl pb-24">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-2 pt-1">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent">
              {original ? 'Редактирование' : 'Создание'}
            </p>
            <h1 className="mt-1 font-display text-[26px] font-semibold leading-none tracking-[-0.03em]">
              {original ? 'Редактирование' : 'Новая публикация'}
            </h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : dirty ? null : <Check className="h-3 w-3 text-success" />}
              {saveState}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface/60 p-1">
            <button
              type="button"
              onClick={() => setTab('write')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                tab === 'write' ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground',
              )}
            >
              Редактор
            </button>
            <button
              type="button"
              onClick={() => setTab('preview')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                tab === 'preview' ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground',
              )}
            >
              Предпросмотр
            </button>
          </div>
        </header>

        {error ? (
          <div className="mb-3 flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Закрыть">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {tab === 'preview' ? (
          <div className="rounded-xl border border-border bg-card/80 p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TypeBadge type={type} />
              <span className="text-[11px] text-muted-foreground">предпросмотр</span>
            </div>
            <h2 className="font-display text-2xl font-semibold leading-tight">
              {title.trim() || 'Без заголовка'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {user.displayName} · только что
            </p>
            <div className="mt-4">
              {body.trim() ? (
                <Markdown text={body} />
              ) : (
                <p className="text-sm italic text-muted-foreground">Текст пока не добавлен.</p>
              )}
            </div>
            {tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="text-[11px] text-muted-foreground">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {!original ? (
              <section>
                <p className="mb-1.5 text-sm font-medium">Формат</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {availableTypes.map((item) => {
                    const Icon = TYPE_ICONS[item];
                    return (
                      <RadioCard
                        key={item}
                        selected={type === item}
                        onSelect={() => {
                          setType(item);
                          markDirty();
                        }}
                        title={POST_TYPE_META[item].name}
                        description={POST_TYPE_META[item].description}
                        icon={<Icon className="h-4 w-4" />}
                      />
                    );
                  })}
                </div>
              </section>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                <TypeBadge type={type} />
                Тип публикации нельзя изменить после создания.
              </div>
            )}

            <Field label="Заголовок" htmlFor="title" hint={`${title.length}/300`}>
              <Input
                id="title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  markDirty();
                }}
                placeholder="Коротко и по делу — о чём публикация?"
                maxLength={300}
                autoFocus={!original}
                className="h-11 text-base"
              />
            </Field>

            <Field
              label={type === 'question' ? 'Вопрос и контекст' : 'Текст'}
              htmlFor="body"
              hint="Markdown: **жирный**, *курсив*, `код`, списки, цитаты"
            >
              <Textarea
                id="body"
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  markDirty();
                }}
                rows={type === 'article' ? 14 : 8}
                placeholder={
                  type === 'question'
                    ? 'Опишите, что уже пробовали и какой результат нужен…'
                    : type === 'article'
                      ? 'Начните с главного. Абзацы, списки и цитаты помогут читателю.'
                      : 'Расскажите подробнее…'
                }
                className="min-h-[180px] font-sans text-sm leading-relaxed"
              />
            </Field>

            {/* ————— Адаптивные поля ————— */}
            {type === 'poll' ? (
              <section className="rounded-xl border border-border bg-card/70 p-3.5">
                <p className="text-sm font-medium">Варианты ответа</p>
                <div className="mt-2 space-y-2">
                  {options.map((option, index) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <span className="w-5 text-right text-xs text-muted-foreground">{index + 1}</span>
                      <Input
                        value={option.text}
                        onChange={(event) => {
                          setOptions((current) =>
                            current.map((item) =>
                              item.id === option.id ? { ...item, text: event.target.value } : item,
                            ),
                          );
                          markDirty();
                        }}
                        placeholder={`Вариант ${index + 1}`}
                        maxLength={160}
                      />
                      {options.length > 2 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOptions((current) => current.filter((item) => item.id !== option.id));
                            markDirty();
                          }}
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                          aria-label="Удалить вариант"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {options.length < 10 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-1.5"
                    onClick={() => setOptions((current) => [...current, { id: uid(), text: '' }])}
                  >
                    <Plus className="h-3.5 w-3.5" /> Добавить вариант
                  </Button>
                ) : null}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground">
                    Закрыть голосование
                    <Input
                      type="datetime-local"
                      value={pollClosesAt}
                      onChange={(event) => setPollClosesAt(event.target.value)}
                      className="mt-1"
                    />
                  </label>
                  <label className="flex items-center gap-2 self-end pb-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showResultsAfterVote}
                      onChange={(event) => setShowResultsAfterVote(event.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    Показывать результаты после голосования
                  </label>
                </div>
              </section>
            ) : null}

            {type === 'team' ? (
              <section className="rounded-xl border border-border bg-card/70 p-3.5">
                <p className="text-sm font-medium">Роли и места</p>
                <div className="mt-2 space-y-2.5">
                  {roles.map((role) => (
                    <div key={role.id} className="rounded-md border border-border bg-surface p-2.5">
                      <div className="flex gap-2">
                        <Input
                          value={role.name}
                          onChange={(event) => {
                            setRoles((current) =>
                              current.map((item) =>
                                item.id === role.id ? { ...item, name: event.target.value } : item,
                              ),
                            );
                            markDirty();
                          }}
                          placeholder="Название роли, например «Фронтенд»"
                          maxLength={60}
                        />
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={role.capacity}
                          onChange={(event) => {
                            setRoles((current) =>
                              current.map((item) =>
                                item.id === role.id ? { ...item, capacity: event.target.value } : item,
                              ),
                            );
                            markDirty();
                          }}
                          className="w-20"
                          aria-label="Мест"
                        />
                        {roles.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setRoles((current) => current.filter((item) => item.id !== role.id))}
                            className="rounded p-1 text-muted-foreground hover:text-destructive"
                            aria-label="Удалить роль"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <Input
                        value={role.description}
                        onChange={(event) => {
                          setRoles((current) =>
                            current.map((item) =>
                              item.id === role.id ? { ...item, description: event.target.value } : item,
                            ),
                          );
                          markDirty();
                        }}
                        placeholder="Задачи и ожидания (необязательно)"
                        maxLength={400}
                        className="mt-1.5"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-1.5"
                  onClick={() => setRoles((current) => [...current, { id: uid(), name: '', description: '', capacity: '1' }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Добавить роль
                </Button>
                <label className="mt-3 block text-xs text-muted-foreground">
                  Заявки принимаются до
                  <Input
                    type="datetime-local"
                    value={teamExpiresAt}
                    onChange={(event) => setTeamExpiresAt(event.target.value)}
                    className="mt-1 max-w-xs"
                  />
                </label>
              </section>
            ) : null}

            {type === 'event' ? (
              <section className="space-y-3 rounded-xl border border-border bg-card/70 p-3.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground">
                    Начало *
                    <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1" />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Окончание
                    <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1" />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Формат
                    <Select value={eventFormat} onChange={(event) => setEventFormat(event.target.value as 'offline' | 'online')} className="mt-1">
                      <option value="offline">Офлайн</option>
                      <option value="online">Онлайн</option>
                    </Select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Лимит участников
                    <Input type="number" min={1} value={eventCapacity} onChange={(event) => setEventCapacity(event.target.value)} className="mt-1" placeholder="Без лимита" />
                  </label>
                </div>
                {eventFormat === 'offline' ? (
                  <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Место: адрес или площадка" maxLength={200} />
                ) : (
                  <Input value={onlineUrl} onChange={(event) => setOnlineUrl(event.target.value)} placeholder="Ссылка на трансляцию" maxLength={500} />
                )}
              </section>
            ) : null}

            {type === 'vacancy' ? (
              <section className="space-y-3 rounded-xl border border-border bg-card/70 p-3.5">
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs text-muted-foreground">
                    Компания
                    <Input value={company} onChange={(event) => setCompany(event.target.value)} maxLength={120} className="mt-1" />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Занятость
                    <Input value={employment} onChange={(event) => setEmployment(event.target.value)} maxLength={80} placeholder="Полная, проектная" className="mt-1" />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Оплата
                    <Input value={compensation} onChange={(event) => setCompensation(event.target.value)} maxLength={120} placeholder="По договорённости" className="mt-1" />
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground">
                    Как связаться
                    <Select value={contactMethod} onChange={(event) => setContactMethod(event.target.value as typeof contactMethod)} className="mt-1">
                      <option value="comments">В комментариях</option>
                      <option value="profile">Через профиль</option>
                      <option value="external">Внешняя ссылка</option>
                    </Select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Актуально до
                    <Input type="datetime-local" value={vacancyExpiresAt} onChange={(event) => setVacancyExpiresAt(event.target.value)} className="mt-1" />
                  </label>
                </div>
                {contactMethod === 'external' ? (
                  <Input value={vacancyUrl} onChange={(event) => setVacancyUrl(event.target.value)} placeholder="https://…" maxLength={500} />
                ) : null}
              </section>
            ) : null}

            {type === 'project' ? (
              <section className="space-y-3 rounded-xl border border-border bg-card/70 p-3.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground">
                    Статус
                    <Select value={projectStatus} onChange={(event) => setProjectStatus(event.target.value as typeof projectStatus)} className="mt-1">
                      <option value="idea">Идея</option>
                      <option value="development">В разработке</option>
                      <option value="testing">Тестирование</option>
                      <option value="launched">Запущен</option>
                      <option value="paused">Пауза</option>
                      <option value="archived">Архив</option>
                    </Select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Ссылка
                    <Input value={projectUrl} onChange={(event) => setProjectUrl(event.target.value)} placeholder="https://…" maxLength={500} className="mt-1" />
                  </label>
                </div>
                <label className="block text-xs text-muted-foreground">
                  Технологии через запятую
                  <Input value={tech} onChange={(event) => setTech(event.target.value)} placeholder="React, Node.js, PostgreSQL" className="mt-1" />
                </label>
              </section>
            ) : null}

            {type === 'goal' ? (
              <section className="space-y-3 rounded-xl border border-border bg-card/70 p-3.5">
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs text-muted-foreground">
                    Цель *
                    <Input type="number" min={1} value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="mt-1" />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Единица
                    <Input value={goalUnit} onChange={(event) => setGoalUnit(event.target.value)} placeholder="статей, км, часов" maxLength={20} className="mt-1" />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Дедлайн
                    <Input type="datetime-local" value={goalDeadline} onChange={(event) => setGoalDeadline(event.target.value)} className="mt-1" />
                  </label>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Этапы</p>
                  <div className="mt-1 space-y-1.5">
                    {milestones.map((milestone) => (
                      <div key={milestone.id} className="flex gap-2">
                        <Input
                          value={milestone.title}
                          onChange={(event) =>
                            setMilestones((current) =>
                              current.map((item) =>
                                item.id === milestone.id ? { ...item, title: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder="Название этапа"
                          maxLength={120}
                        />
                        <button
                          type="button"
                          onClick={() => setMilestones((current) => current.filter((item) => item.id !== milestone.id))}
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                          aria-label="Удалить этап"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="mt-1.5" onClick={() => setMilestones((current) => [...current, { id: uid(), title: '', isDone: false }])}>
                    <Plus className="h-3.5 w-3.5" /> Добавить этап
                  </Button>
                </div>
              </section>
            ) : null}

            {type === 'checklist' ? (
              <section className="rounded-xl border border-border bg-card/70 p-3.5">
                <p className="text-sm font-medium">Начальные задачи</p>
                <div className="mt-2 space-y-1.5">
                  {checklistItems.map((item) => (
                    <div key={item.id} className="flex gap-2">
                      <Input
                        value={item.text}
                        onChange={(event) =>
                          setChecklistItems((current) =>
                            current.map((row) => (row.id === item.id ? { ...row, text: event.target.value } : row)),
                          )
                        }
                        placeholder="Задача"
                        maxLength={200}
                      />
                      <button
                        type="button"
                        onClick={() => setChecklistItems((current) => current.filter((row) => row.id !== item.id))}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        aria-label="Удалить задачу"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button type="button" size="sm" variant="ghost" className="mt-1.5" onClick={() => setChecklistItems((current) => [...current, { id: uid(), text: '' }])}>
                  <Plus className="h-3.5 w-3.5" /> Добавить задачу
                </Button>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  После публикации задачи можно отмечать — изменения сохранятся в базе.
                </p>
              </section>
            ) : null}

            {/* ————— Метаданные ————— */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Категория" htmlFor="category">
                <Select id="category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Без категории</option>
                  {(categories.data?.items ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <p className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
                  Теги <span className="text-xs font-normal text-muted-foreground">{tags.length}/8</span>
                </p>
                <div className="relative">
                  <Input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onFocus={() => setTagFocused(true)}
                    onBlur={() => window.setTimeout(() => setTagFocused(false), 120)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ',') {
                        event.preventDefault();
                        addTag();
                      }
                      if (event.key === 'Backspace' && !tagInput && tags.length > 0) {
                        removeTag(tags[tags.length - 1]!);
                      }
                    }}
                    placeholder="Начните вводить и нажмите Enter"
                    disabled={tags.length >= 8}
                  />
                  {tagFocused && tagSuggestions.data?.items && tagSuggestions.data.items.length > 0 ? (
                    <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-pop">
                      {tagSuggestions.data.items
                        .filter((tag) => !tags.some((item) => item.toLowerCase() === tag.slug.toLowerCase()))
                        .slice(0, 8)
                        .map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => addTag(tag.slug)}
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
                          >
                            <span>#{tag.name}</span>
                            {tag.usageCount ? (
                              <span className="text-[11px] text-muted-foreground">{tag.usageCount}</span>
                            ) : null}
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>
                {tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <TagChip key={tag} name={`#${tag}`} onRemove={() => removeTag(tag)} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* ————— Панель действий ————— */}
        <div className="fixed inset-x-0 bottom-14 z-30 border-t border-border bg-background/95 px-3 py-2.5 backdrop-blur lg:bottom-0">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2">
            <Link
              to={original ? `/post/${original.id}` : '/feed'}
              onClick={(event) => {
                if (dirty && !window.confirm('Изменения не сохранены. Уйти без сохранения?')) {
                  event.preventDefault();
                }
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Отмена
            </Link>
            <div className="flex items-center gap-2">
              {autoSaveEnabled ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void saveDraft(false)}
                  loading={saving}
                >
                  <Save className="h-3.5 w-3.5" /> Сохранить черновик
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={() => void publish()} loading={publishing}>
                <Send className="h-3.5 w-3.5" />
                {isPublishedOriginal ? 'Сохранить изменения' : original ? 'Опубликовать' : 'Опубликовать'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
