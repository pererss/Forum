// Иконки форматов: единая точка для карточек, фильтров и пустых состояний.

import {
  BarChart3,
  Briefcase,
  CalendarDays,
  FileText,
  HelpCircle,
  ListChecks,
  MessagesSquare,
  Rocket,
  Target,
  Users,
} from 'lucide-react';
import type { PostType } from '@/shared/post-types';

export const POST_TYPE_ICON: Record<PostType, typeof MessagesSquare> = {
  discussion: MessagesSquare,
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
