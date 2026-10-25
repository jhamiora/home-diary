import { useState } from "react";
import { ClipboardList, Menu, Package, Sun, type LucideIcon } from "lucide-react";
import { ToastProvider, useStoredState } from "./lib/ui";
import { OpenJobCtx } from "./components/JobRow";
import { JobDetail } from "./components/JobDetail";
import { TodayPage } from "./pages/TodayPage";
import { SiteDiaryPage } from "./pages/SiteDiaryPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { GoTabCtx, type Tab } from "./lib/nav";
import { MorePage } from "./pages/MorePage";


const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "today", label: "Today", Icon: Sun },
  { id: "site", label: "Site Diary", Icon: ClipboardList },
  { id: "materials", label: "Materials", Icon: Package },
  { id: "more", label: "More", Icon: Menu },
];

const PAGES: Record<Tab, () => React.JSX.Element> = {
  today: TodayPage,
  site: SiteDiaryPage,
  materials: MaterialsPage,
  more: MorePage,
};

export default function App() {
  const [stored, setTab] = useStoredState<string>("tab", "site");
  const tab: Tab = (["today", "site", "materials", "more"] as string[]).includes(stored) ? (stored as Tab) : "site";
  const [jobId, setJobId] = useState<string | null>(null);

  return (
    <ToastProvider>
      <GoTabCtx.Provider value={setTab}>
      <OpenJobCtx.Provider value={setJobId}>
        <div className="mx-auto flex h-full max-w-xl flex-col">
          {/* Every tab stays mounted so each keeps its own scroll spot. */}
          {TABS.map(({ id }) => {
            const Page = PAGES[id];
            return (
              <main
                key={id}
                className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pt-[env(safe-area-inset-top)] ${tab === id ? "" : "hidden"}`}
              >
                <Page />
              </main>
            );
          })}
          <nav className="grid shrink-0 grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`flex h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${tab === id ? "text-navy" : "text-[#9aa3aa]"}`}
                onClick={() => setTab(id)}
              >
                <Icon size={22} strokeWidth={tab === id ? 2 : 1.6} />
                {label}
              </button>
            ))}
          </nav>
        </div>
        {jobId && <JobDetail key={jobId} jobId={jobId} onClose={() => setJobId(null)} />}
      </OpenJobCtx.Provider>
      </GoTabCtx.Provider>
    </ToastProvider>
  );
}
