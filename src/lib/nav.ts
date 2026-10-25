import { createContext, useContext } from "react";

export type Tab = "tasks" | "site" | "materials" | "more";

export const GoTabCtx = createContext<(tab: Tab) => void>(() => {});
export const useGoTab = () => useContext(GoTabCtx);
