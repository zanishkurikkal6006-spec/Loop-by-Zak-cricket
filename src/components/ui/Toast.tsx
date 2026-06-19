import { useToast } from '@/lib/toast';

/** Global toast: dark pill, gold check, auto-dismiss. Mounted once in App. */
export function Toast() {
  const message = useToast((s) => s.message);
  if (!message) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8">
      <div className="flex items-center gap-2 rounded-pill bg-ink px-5 py-3 text-[13px] font-medium text-paper shadow-card-lg">
        <span className="text-gold">✓</span>
        {message}
      </div>
    </div>
  );
}
