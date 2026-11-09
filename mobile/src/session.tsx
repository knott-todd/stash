// The signed-in state every screen reads: the config (token, key, settings, setup
// progress) and a way to change it. Loaded once at start from the secure store.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { loadConfig, saveConfig, type Config } from "./api";

type Session = { cfg: Config | null; update: (patch: Partial<Config> | ((c: Config) => Config)) => Promise<Config>; existing: boolean; setExisting: (v: boolean) => void };
const Ctx = createContext<Session>({ cfg: null, update: async () => ({ server: "" }), existing: false, setExisting: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [existing, setExisting] = useState(false);
  useEffect(() => {
    loadConfig().then(setCfg);
  }, []);
  const update = useCallback(async (patch: Partial<Config> | ((c: Config) => Config)) => {
    const base = await loadConfig();
    const next = typeof patch === "function" ? patch(base) : { ...base, ...patch };
    await saveConfig(next);
    setCfg(next);
    return next;
  }, []);
  return <Ctx.Provider value={{ cfg, update, existing, setExisting }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
