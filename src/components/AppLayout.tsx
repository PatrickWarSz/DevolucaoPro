import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { MobileNav } from "./MobileNav";
import { useTheme } from "@/hooks/use-theme";

export function AppLayout() {
  // mounts the theme effect
  useTheme();
  return (
    <div
      className="flex min-h-screen w-full bg-background"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <main className="flex-1 px-4 py-5 md:px-8 md:py-7 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-7">
          <div className="mx-auto w-full max-w-[1400px] animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
