'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiRequestError, registerQueryClient } from '@/lib/client/api';

export function Providers({ children }: { children: React.ReactNode }) {
  // Created in state so each browser session gets exactly one client.
  const [client] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 10_000,
          refetchOnWindowFocus: false,
          // A 4xx is the answer, not a hiccup: never retry it. Anything else gets two more tries.
          retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
        },
      },
    }),
  );
  // Registered from an effect, not the initializer: StrictMode runs the initializer twice and discards one client.
  useEffect(() => { registerQueryClient(client); return () => registerQueryClient(null); }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
