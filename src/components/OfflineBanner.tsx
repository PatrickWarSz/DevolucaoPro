/**
 * OfflineBanner — slim top banner shown when the browser reports offline.
 */
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warning/90 px-3 py-1.5 text-xs font-medium text-warning-foreground"
      role="status"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>Você está offline — alterações serão sincronizadas ao reconectar.</span>
    </div>
  );
}
