// Единые схемы валидации (zod): используются сервером для проверки входных данных,
// клиентом — для подсветки ошибок. Сервер всегда валидирует заново.

import { z } from 'zod';
import { POST_TYPES } from './post-types';

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_.-]{1,22}[a-z0-9]$/i, '3–24 символа: буквы, цифры, точка, дефис, подчёркивание.');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Минимум 2 символа.')
  .max(60, 'Максимум 60 символов.');

export const tagSlugSchema = z
  .string()
  .trim()
  .min(2, 'Минимум 2 символа.')
  .max(40, 'Максимум 40 символов.');

export const tagListSchema = z.array(tagSlugSchema).max(8, 'Не больше 8 тегов.');

export const bioSchema = z.string().trim().max(500, 'Максимум 500 символов.');

export const titleSchema = z
  .string()
  .trim()
  .min(3, 'Заголовок слишком короткий.')
  .max(300, 'Заголовок слишком длинный.');

export const bodySchema = z.string().max(150_000, 'Текст слишком длинный.');

export const isoDateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Некорректная дата.');

// ————— Данные конкретных типов публикаций —————

export const pollDataSchema = z.object({
  options: z
    .array(z.string().trim().min(1, 'Пустой вариант.').max(160, 'Слишком длинный вариант.'))
    .min(2, 'Минимум 2 варианта.')
    .max(10, 'Максимум 10 вариантов.'),
  closesAt: isoDateSchema.optional(),
  showResultsAfterVote: z.boolean().default(false),
});

export const teamDataSchema = z.object({
  roles: z
    .array(
      z.object({
        name: z.string().trim().min(2, 'Название роли слишком короткое.').max(60),
        description: z.string().trim().max(400).optional(),
        capacity: z.coerce.number().int().min(1, 'Минимум 1 место.').max(50, 'Слишком много мест.'),
      }),
    )
    .min(1, 'Добавьте хотя бы одну роль.')
    .max(12, 'Максимум 12 ролей.'),
  expiresAt: isoDateSchema.optional(),
});

export const eventDataSchema = z.object({
  startsAt: isoDateSchema,
  endsAt: isoDateSchema.optional(),
  format: z.enum(['offline', 'online']).default('offline'),
  location: z.string().trim().max(200).optional(),
  onlineUrl: z.string().trim().max(500).optional(),
  capacity: z.coerce.number().int().min(1).max(100_000).optional(),
});

export const vacancyDataSchema = z.object({
  company: z.string().trim().max(120).optional(),
  employment: z.string().trim().max(80).optional(),
  compensation: z.string().trim().max(120).optional(),
  contactMethod: z.enum(['comments', 'profile', 'external']).default('comments'),
  externalUrl: z.string().trim().max(500).optional(),
  expiresAt: isoDateSchema.optional(),
});

export const projectDataSchema = z.object({
  projectStatus: z
    .enum(['idea', 'development', 'testing', 'launched', 'paused', 'archived'])
    .default('idea'),
  externalUrl: z.string().trim().max(500).optional(),
  tech: z.array(z.string().trim().min(1).max(40)).max(14, 'Максимум 14 технологий.').default([]),
});

export const goalDataSchema = z.object({
  targetValue: z.coerce.number().positive('Значение должно быть больше нуля.'),
  unit: z.string().trim().max(20).default(''),
  deadline: isoDateSchema.optional(),
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Пустой этап.').max(120),
        isDone: z.boolean().default(false),
      }),
    )
    .max(30, 'Максимум 30 этапов.')
    .default([]),
});

export const checklistDataSchema = z.object({
  items: z
    .array(
      z.object({
        text: z.string().trim().min(1, 'Пустая задача.').max(200),
        isDone: z.boolean().default(false),
      }),
    )
    .max(100, 'Максимум 100 задач.')
    .default([]),
});

export type PollData = z.infer<typeof pollDataSchema>;
export type TeamData = z.infer<typeof teamDataSchema>;
export type EventData = z.infer<typeof eventDataSchema>;
export type VacancyData = z.infer<typeof vacancyDataSchema>;
export type ProjectData = z.infer<typeof projectDataSchema>;
export type GoalData = z.infer<typeof goalDataSchema>;
export type ChecklistData = z.infer<typeof checklistDataSchema>;

/** Схема typeData по типу публикации — undefined означает «для типа нет полей». */
export function typeDataSchemaFor(type: (typeof POST_TYPES)[number]) {
  switch (type) {
    case 'poll':
      return pollDataSchema;
    case 'team':
      return teamDataSchema;
    case 'event':
      return eventDataSchema;
    case 'vacancy':
      return vacancyDataSchema;
    case 'project':
      return projectDataSchema;
    case 'goal':
      return goalDataSchema;
    case 'checklist':
      return checklistDataSchema;
    default:
      return undefined;
  }
}

// ————— Публикации —————

export const createPostSchema = z.object({
  type: z.enum(POST_TYPES),
  title: titleSchema,
  body: bodySchema,
  categoryId: z.string().trim().max(64).nullish(),
  tags: tagListSchema.default([]),
  status: z.enum(['draft', 'published']).default('published'),
  typeData: z.unknown().optional(),
});

export const updatePostSchema = z.object({
  title: titleSchema.optional(),
  body: bodySchema.optional(),
  categoryId: z.string().trim().max(64).nullish(),
  tags: tagListSchema.optional(),
  typeData: z.unknown().optional(),
  // Публикация черновика отдельным действием — здесь только редактирование содержимого.
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Комментарий не может быть пустым.').max(10_000, 'Слишком длинный комментарий.'),
  parentId: z.string().trim().max(64).nullish(),
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1, 'Комментарий не может быть пустым.').max(10_000),
});

export const reactionSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: z.string().trim().min(1).max(64),
  value: z.union([z.literal(1), z.literal(-1)]),
});

// ————— Аккаунт —————

export const devLoginSchema = z.object({
  username: usernameSchema,
});

export const setupSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema.optional(),
  interests: z.array(tagSlugSchema).max(30, 'Слишком много интересов.').default([]),
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  bio: bioSchema.nullish(),
  interests: z.array(tagSlugSchema).max(30).optional(),
  settings: z
    .object({
      notify: z.record(z.string(), z.boolean()).optional(),
      privacy: z
        .object({
          showActivity: z.boolean().optional(),
          showFollowing: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

// ————— Участие, события, голосование —————

export const applicationSchema = z.object({
  roleId: z.string().trim().min(1).max(64),
  message: z.string().trim().min(3, 'Напишите пару слов о себе.').max(4000),
});

export const applicationDecisionSchema = z.object({
  decision: z.enum(['accept', 'reject']),
});

export const pollVoteSchema = z.object({
  optionId: z.string().trim().min(1).max(64),
});

export const attendEventSchema = z.object({
  status: z.enum(['going', 'maybe']),
});

export const goalProgressSchema = z.object({
  currentValue: z.coerce.number().min(0).max(1_000_000_000),
});

export const milestoneSchema = z.object({
  title: z.string().trim().min(1).max(120),
  isDone: z.boolean().default(false),
});

export const checklistItemSchema = z.object({
  text: z.string().trim().min(1, 'Пустая задача.').max(200),
});

export const checklistItemUpdateSchema = z.object({
  text: z.string().trim().min(1).max(200).optional(),
  isDone: z.boolean().optional(),
  position: z.coerce.number().int().min(0).max(1000).optional(),
});

export const collaboratorSchema = z.object({
  username: usernameSchema,
  permission: z.enum(['edit', 'view']).default('edit'),
});

// ————— Модерация и жалобы —————

export const reportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'user']),
  targetId: z.string().trim().min(1).max(64),
  reason: z.enum(['spam', 'abuse', 'offtopic', 'misinfo', 'other']),
  details: z.string().trim().max(1000).optional(),
});

// ————— Лента и фильтры —————

export const feedQuerySchema = z.object({
  mode: z.enum(['for-you', 'new', 'popular', 'following']).default('new'),
  type: z.enum(POST_TYPES).optional(),
  category: z.string().trim().max(60).optional(),
  tag: z.string().trim().max(60).optional(),
  author: z.string().trim().max(30).optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['new', 'top', 'comments']).default('new'),
  status: z.enum(['draft', 'published', 'hidden', 'removed']).default('published'),
  mine: z.coerce.boolean().optional(),
  favorite: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const savedFilterSchema = z.object({
  name: z.string().trim().min(2).max(60),
  query: z.record(z.string(), z.unknown()),
});
