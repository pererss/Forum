// Страница 404: спокойное состояние без тупика.

import { ArrowLeft, Compass, Home } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/client/components/ui/button';
import { PageTransition } from '@/client/components/ui/motion';
import { useDocumentTitle } from '@/client/lib/hooks';

export function NotFoundPage() {
  useDocumentTitle('Страница не найдена');

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center text-center">
        <p className="font-display text-[clamp(4rem,14vw,7rem)] font-semibold leading-none tracking-[-0.06em] text-muted-foreground/25">
          404
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-[-0.02em]">
          Здесь ничего нет
        </h1>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Страница могла быть удалена, переименована или никогда не существовала. Публикации и
          профили остаются доступны из ленты и обзора.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link to="/feed">
              <Home className="h-4 w-4" /> В ленту
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/explore">
              <Compass className="h-4 w-4" /> Обзор
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> На главную
            </Link>
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
