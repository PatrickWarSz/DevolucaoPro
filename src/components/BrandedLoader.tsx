/**
 * BrandedLoader — full-screen DevoluçõesPro loading splash.
 * Uses the app's icon and brand palette.
 */
export function BrandedLoader({ label = "Carregando DevoluçõesPro…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-2xl bg-primary/20" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-card shadow-lg">
            <img src="/pwa-192.png" alt="" className="h-12 w-12 rounded-xl" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="font-display text-sm font-semibold tracking-tight text-foreground">
            DevoluçõesPro
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <div className="h-0.5 w-32 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-[loader_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      </div>
      <style>{`@keyframes loader { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }`}</style>
    </div>
  );
}
