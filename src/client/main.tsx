import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import './styles/index.css';
import { App } from './App';
import { ApiError } from './lib/api';
import { ThemeProvider } from './lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (attempt, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 404)) return false;
        return attempt < 1;
      },
    },
    mutations: { retry: false },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Не найден корневой элемент #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
