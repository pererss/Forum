// Ключи и хуки React Query для работы с API.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from './api';
import type {
  AuthorDto,
  CategoryDto,
  CommentDto,
  NotificationDto,
  Paginated,
  PostCard,
  PostDetail,
  ProfileDto,
  SessionUser,
  TagDto,
} from '@/shared/types';

export const keys = {
  session: ['session'] as const,
  meta: ['meta'] as const,
  feed: (params: Record<string, unknown>) => ['feed', params] as const,
  post: (id: string) => ['post', id] as const,
  comments: (id: string, sort: string) => ['comments', id, sort] as const,
  profile: (username: string) => ['profile', username] as const,
  following: (username: string, page: number) => ['following', username, page] as const,
  notifications: (page: number, unreadOnly: boolean) => ['notifications', page, unreadOnly] as const,
  unread: ['notifications', 'unread'] as const,
  savedFilters: ['saved-filters'] as const,
  tags: (q: string) => ['tags', q] as const,
  userSearch: (q: string) => ['user-search', q] as const,
  adminStats: ['admin', 'stats'] as const,
  adminUsers: (params: Record<string, unknown>) => ['admin', 'users', params] as const,
  adminPosts: (params: Record<string, unknown>) => ['admin', 'posts', params] as const,
  adminComments: (params: Record<string, unknown>) => ['admin', 'comments', params] as const,
  adminReports: (params: Record<string, unknown>) => ['admin', 'reports', params] as const,
  adminLogs: (params: Record<string, unknown>) => ['admin', 'logs', params] as const,
  adminCategories: ['admin', 'categories'] as const,
  adminTags: (params: Record<string, unknown>) => ['admin', 'tags', params] as const,
  adminPostTypes: ['admin', 'post-types'] as const,
  adminProgress: ['admin', 'progress'] as const,
  adminSettings: ['admin', 'settings'] as const,
  adminDiagnostics: ['admin', 'diagnostics'] as const,
  adminBackup: ['admin', 'backup'] as const,
};

export type SessionData = { user: SessionUser | null; drafts: number };
export type MetaData = {
  service: string;
  oauth: { configured: boolean };
  devLogin: { enabled: boolean };
  db: { configured: boolean; ready: boolean };
};

export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: () => apiGet<SessionData>('/auth/session'),
    staleTime: 30_000,
    retry: false,
  });
}

export function useMeta() {
  return useQuery({
    queryKey: keys.meta,
    queryFn: () => apiGet<MetaData>('/meta'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useFeed(params: Record<string, unknown>, enabled = true) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) {
      search.set(key, String(value));
    }
  }
  return useQuery({
    queryKey: keys.feed(params),
    queryFn: () => apiGet<Paginated<PostCard>>(`/posts?${search.toString()}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function usePost(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.post(id ?? ''),
    queryFn: () => apiGet<{ post: PostDetail }>(`/posts/${id}`),
    enabled: Boolean(id) && enabled,
  });
}

export function useComments(postId: string | undefined, sort: string) {
  return useQuery({
    queryKey: keys.comments(postId ?? '', sort),
    queryFn: () => apiGet<{ items: CommentDto[] }>(`/posts/${postId}/comments?sort=${sort}`),
    enabled: Boolean(postId),
  });
}

export function useProfile(username: string | undefined) {
  return useQuery({
    queryKey: keys.profile(username ?? ''),
    queryFn: () => apiGet<{ profile: ProfileDto }>(`/users/${username}`),
    enabled: Boolean(username),
    retry: false,
  });
}

export function useNotifications(page: number, unreadOnly: boolean, enabled = true) {
  return useQuery({
    queryKey: keys.notifications(page, unreadOnly),
    queryFn: () =>
      apiGet<Paginated<NotificationDto> & { unread: number }>(
        `/notifications?page=${page}&unreadOnly=${unreadOnly}`,
      ),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: keys.unread,
    queryFn: () => apiGet<{ unread: number }>('/notifications/unread-count'),
    enabled,
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useSavedFilters(enabled = true) {
  return useQuery({
    queryKey: keys.savedFilters,
    queryFn: () =>
      apiGet<{ items: { id: string; name: string; query: Record<string, unknown> }[] }>(
        '/posts/saved-filters',
      ),
    enabled,
    retry: false,
  });
}

export function useTagSuggestions(query: string) {
  return useQuery({
    queryKey: keys.tags(query),
    queryFn: () => apiGet<{ items: TagDto[] }>(`/users/tags/list?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 0,
    staleTime: 60_000,
  });
}

export function useUserSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: keys.userSearch(query),
    queryFn: () => apiGet<{ items: AuthorDto[] }>(`/users/search/query?q=${encodeURIComponent(query)}`),
    enabled: enabled && query.length >= 2,
    staleTime: 30_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => apiGet<{ items: CategoryDto[] }>('/categories'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ————— Мутации —————

export function useInvalidate(...keyGroups: (readonly unknown[])[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keyGroups) void queryClient.invalidateQueries({ queryKey: key as unknown[] });
  };
}

export function useToggleFavorite() {
  const invalidate = useInvalidate(['feed'], ['post'], keys.savedFilters);
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      apiPost<{ favorited: boolean; count: number }>(`/posts/${id}/favorite`, { on }),
    onSuccess: invalidate,
  });
}

export function useReaction() {
  const invalidate = useInvalidate(['feed'], ['post'], ['comments']);
  return useMutation({
    mutationFn: (input: { targetType: 'post' | 'comment'; targetId: string; value: 1 | -1 }) =>
      apiPost<{ myReaction: 1 | -1 | null; score: number }>('/reactions', input),
    onSuccess: invalidate,
  });
}

export function useCreateComment(postId: string) {
  const invalidate = useInvalidate(keys.comments(postId, 'old'), keys.comments(postId, 'new'), keys.comments(postId, 'top'), ['feed'], ['post']);
  return useMutation({
    mutationFn: (input: { body: string; parentId?: string | null }) =>
      apiPost<{ comment: unknown }>(`/posts/${postId}/comments`, input),
    onSuccess: invalidate,
  });
}

export function useMarkNotificationsRead() {
  const invalidate = useInvalidate(keys.unread, ['notifications']);
  return useMutation({
    mutationFn: (input: { ids?: string[]; all?: boolean }) =>
      apiPost<{ unread: number }>('/notifications/read', input),
    onSuccess: invalidate,
  });
}

export function useDeletePost() {
  const invalidate = useInvalidate(['feed'], ['post']);
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/posts/${id}`),
    onSuccess: invalidate,
  });
}

export { ApiError, apiGet, apiPost, apiPatch, apiDelete };
