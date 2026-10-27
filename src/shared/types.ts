// Общие DTO: единый контракт между сервером и клиентом.

import type { PostType } from './post-types';

export type Role = 'user' | 'moderator' | 'admin';
export type UserStatus = 'active' | 'limited' | 'banned';
export type PostStatus = 'draft' | 'published' | 'hidden' | 'removed';

export type NotificationType =
  | 'comment'
  | 'reply'
  | 'mention'
  | 'answer_accepted'
  | 'application'
  | 'application_result'
  | 'follow'
  | 'achievement'
  | 'system'
  | 'watch_activity';

export type NotifyPrefs = Record<NotificationType, boolean>;

export type UserSettings = {
  notify: NotifyPrefs;
  privacy: {
    showActivity: boolean;
    showFollowing: boolean;
  };
};

export type SessionUser = {
  id: string;
  username: string | null;
  displayName: string;
  email: string | null;
  role: Role;
  status: UserStatus;
  level: number;
  xp: number;
  reputation: number;
  onboarded: boolean;
  settings: UserSettings;
  createdAt: string;
};

export type TagDto = {
  id: string;
  slug: string;
  name: string;
  usageCount?: number;
};

export type CategoryDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  isActive?: boolean;
};

export type AuthorDto = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  level: number;
  reputation: number;
};

export type LevelProgress = {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  percent: number;
};

export type AchievementDto = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  awardedAt?: string;
};

export type ProfileCounts = {
  posts: number | null;
  comments: number | null;
  followers: number | null;
  following: number | null;
};

export type ProfileDto = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  role: Role;
  level: number;
  xp: number;
  reputation: number;
  createdAt: string;
  settings?: UserSettings;
  interests: TagDto[];
  achievements: AchievementDto[];
  /** null означает «скрыто настройками приватности», а не отсутствие данных. */
  counts: ProfileCounts;
  progress: LevelProgress;
  viewer?: {
    isSelf: boolean;
    isFollowing: boolean;
    isFollowedBy: boolean;
    status?: UserStatus;
  };
};

export type PostCounts = {
  comments: number;
  reactions: number;
  favorites: number;
};

export type PostCard = {
  id: string;
  type: PostType;
  title: string;
  excerpt: string;
  status: PostStatus;
  author: AuthorDto;
  category: CategoryDto | null;
  tags: TagDto[];
  counts: PostCounts;
  isPinned: boolean;
  isLocked: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  lastActivityAt: string;
  acceptedAnswerId: string | null;
  viewer?: {
    myReaction: 1 | -1 | null;
    favorited: boolean;
    watching: boolean;
    canEdit: boolean;
    canComment: boolean;
    canModerate: boolean;
    hasDraft? : boolean;
  };
};

export type CommentDto = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  author: AuthorDto;
  status: 'visible' | 'hidden' | 'removed';
  isAccepted: boolean;
  reactionScore: number;
  createdAt: string;
  editedAt: string | null;
  viewer?: {
    myReaction: 1 | -1 | null;
    canEdit: boolean;
    canDelete: boolean;
    canAccept: boolean;
  };
};

export type PollOptionDto = {
  id: string;
  text: string;
  votesCount: number;
  percent: number;
};

export type PollDto = {
  closesAt: string | null;
  status: 'open' | 'closed';
  showResultsAfterVote: boolean;
  totalVotes: number;
  options: PollOptionDto[];
  resultsVisible: boolean;
  myVote: string | null;
};

export type ProjectRoleDto = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  filled: number;
  openSeats: number;
};

export type ApplicationDto = {
  id: string;
  postId: string;
  roleId: string;
  roleName?: string;
  user: AuthorDto;
  message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
  decidedAt: string | null;
};

export type TeamDto = {
  roles: ProjectRoleDto[];
  expiresAt: string | null;
  applications: ApplicationDto[];
  pendingCount: number;
  viewerApplication: ApplicationDto | null;
};

export type EventDto = {
  startsAt: string;
  endsAt: string | null;
  format: 'offline' | 'online';
  location: string | null;
  onlineUrl: string | null;
  capacity: number | null;
  goingCount: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  viewerStatus: 'going' | 'maybe' | null;
};

export type VacancyDto = {
  company: string | null;
  employment: string | null;
  compensation: string | null;
  contactMethod: 'comments' | 'profile' | 'external';
  externalUrl: string | null;
  expiresAt: string | null;
};

export type ProjectDto = {
  projectStatus: 'idea' | 'development' | 'testing' | 'launched' | 'paused' | 'archived';
  externalUrl: string | null;
  tech: string[];
};

export type GoalMilestoneDto = {
  id: string;
  title: string;
  isDone: boolean;
  position: number;
};

export type GoalDto = {
  targetValue: number;
  currentValue: number;
  unit: string;
  deadline: string | null;
  percent: number;
  milestones: GoalMilestoneDto[];
};

export type ChecklistItemDto = {
  id: string;
  text: string;
  isDone: boolean;
  position: number;
  updatedBy: string | null;
  updatedAt: string;
};

export type ChecklistDto = {
  items: ChecklistItemDto[];
  done: number;
  total: number;
  collaborators: AuthorDto[];
  canEditItems: boolean;
};

export type PostTypeData = {
  poll?: PollDto;
  team?: TeamDto;
  event?: EventDto;
  vacancy?: VacancyDto;
  project?: ProjectDto;
  goal?: GoalDto;
  checklist?: ChecklistDto;
};

export type PostDetail = PostCard & {
  body: string;
  typeData: PostTypeData;
  collaborators: AuthorDto[];
  commentCountTotal: number;
};

export type NotificationDto = {
  id: string;
  type: NotificationType;
  actor: AuthorDto | null;
  entityType: string;
  entityId: string;
  post: { id: string; title: string } | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type FeedMode = 'for-you' | 'new' | 'popular' | 'following';

export type FeedQuery = {
  mode: FeedMode;
  type?: string;
  category?: string;
  tag?: string;
  author?: string;
  q?: string;
  sort?: 'new' | 'top' | 'comments';
  status?: PostStatus;
  /** Показывать мои публикации (включая черновики). */
  mine?: boolean;
  /** Только избранное текущего пользователя. */
  favorite?: boolean;
  page: number;
  pageSize: number;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
};
