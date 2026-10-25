import { useState } from "react";
import { BookOpen, ClipboardList, Menu, Sun, type LucideIcon } from "lucide-react";
import { ToastProvider, useStoredState } from "./lib/ui";
import { OpenJobCtx } from "./components/JobRow";
import { JobDetail } from "./components/JobDetail";
import { TodayPage } from "./pages/TodayPage";
import { SiteDiaryPage } from "./pages/SiteDiaryPage";
import { DiaryPage } from "./pages/DiaryPage";
import { MorePage } from "./pages/MorePage";

type Tab = "today" | "site" | "diary" | "more";

const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "today", label: "Today", Icon: Sun },
  { id: "site", label: "Site Diary", Icon: ClipboardList },
  { id: "diary", label: "Journal", Icon: BookOpen },
  { id: "more", label: "More", Icon: Menu },
];

const PAGES: Record<Tab, () => React.JSX.Element> = {
  today: TodayPage,
  site: SiteDiaryPage,
  diary: DiaryPage,
  more: MorePage,
};

export default function App() {
  const [stored, setTab] = useStoredState<Tab | "jobs">("tab", "site");
  const tab: Tab = stored === "jobs" ? "site" : stored;
  const [jobId, setJobId] = useState<string | null>(null);

  return (
    <ToastProvider>
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
    </ToastProvider>
  );
}
