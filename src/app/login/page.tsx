import { LoginForm } from './LoginForm';

/** Only same-origin paths are honoured as a post-login destination. */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const dest = safeNext(Array.isArray(next) ? next[0] : next);

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center p-4">
      <div className="panel w-full max-w-[360px] p-6">
        <div className="mb-5">
          <div className="font-mono text-[15px] font-semibold tracking-[0.2em]">FUSION CELL</div>
          <div className="text-[11px] text-muted">Meridian Reach · All-Source Workspace</div>
        </div>
        <LoginForm next={dest} />
      </div>
    </div>
  );
}
