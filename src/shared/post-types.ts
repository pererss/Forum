// Единый реестр форматов публикаций: общий фундамент + данные типа.

export const POST_TYPES = [
  'discussion',
  'article',
  'question',
  'poll',
  'team',
  'event',
  'vacancy',
  'project',
  'goal',
  'checklist',
] as const;

export type PostType = (typeof POST_TYPES)[number];

export const POST_TYPE_META: Record<
  PostType,
  {
    name: string;
    short: string;
    icon: string;
    color: string;
    description: string;
  }
> = {
  discussion: {
    name: 'Обсуждение',
    short: 'Обсуждения',
    icon: 'messages-square',
    color: 'blue',
    description: 'Открытый разговор на интересную тему с реакциями и ответами.',
  },
  article: {
    name: 'Статья',
    short: 'Статьи',
    icon: 'file-text',
    color: 'violet',
    description: 'Длинный материал с форматированием и удобным режимом чтения.',
  },
  question: {
    name: 'Вопрос',
    short: 'Вопросы',
    icon: 'help-circle',
    color: 'amber',
    description: 'Вопрос сообществу с сортировкой ответов и принятым решением.',
  },
  poll: {
    name: 'Опрос',
    short: 'Опросы',
    icon: 'bar-chart-3',
    color: 'teal',
    description: 'Голосование с вариантами, сроками и правилами показа результатов.',
  },
  team: {
    name: 'Поиск команды',
    short: 'Команды',
    icon: 'users',
    color: 'emerald',
    description: 'Проект с ролями, свободными местами и заявками на участие.',
  },
  event: {
    name: 'Событие',
    short: 'События',
    icon: 'calendar-days',
    color: 'rose',
    description: 'Встреча или эфир: дата, место или онлайн, список участников.',
  },
  vacancy: {
    name: 'Вакансия',
    short: 'Вакансии',
    icon: 'briefcase',
    color: 'orange',
    description: 'Предложение о работе или услуге: условия, контакт, срок действия.',
  },
  project: {
    name: 'Проект',
    short: 'Проекты',
    icon: 'rocket',
    color: 'indigo',
    description: 'Проект или портфолио: цели, технологии, статус и ссылка.',
  },
  goal: {
    name: 'Цель',
    short: 'Цели',
    icon: 'target',
    color: 'cyan',
    description: 'Цель с этапами и видимым прогрессом для всего сообщества.',
  },
  checklist: {
    name: 'Чек-лист',
    short: 'Чек-листы',
    icon: 'list-checks',
    color: 'slate',
    description: 'Совместимый список задач с сохранением отметок в базе.',
  },
};

export const DEFAULT_TYPE_DATA: Partial<Record<PostType, unknown>> = {};

export function isPostType(value: string): value is PostType {
  return (POST_TYPES as readonly string[]).includes(value);
}
