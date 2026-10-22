import { create } from 'zustand';
import type { CoreInfo, EngineState, Settings } from '../../../shared/protocol';
import { api } from '../api/client';

/** Engine-owned configuration: settings, the Xray core and the engine version. */
interface EngineConfigState {
  settings: Settings | null;
  core: CoreInfo;
  version: string;
  load(s: EngineState): void;
  setSettings(s: Settings): void;
  setCore(c: CoreInfo): void;
  updateSettings(patch: Partial<Settings>): Promise<void>;
}

export const useEngine = create<EngineConfigState>((set) => ({
  settings: null,
  core: { path: null, version: null, installing: false },
  version: '',
  load(s) {
    set({ settings: s.settings, core: s.core, version: s.version });
  },
  setSettings(settings) {
    set({ settings });
  },
  setCore(core) {
    set({ core });
  },
  async updateSettings(patch) {
    const settings = await api.updateSettings(patch);
    set({ settings });
  },
}));

export function useSettings<T>(pick: (s: Settings) => T, fallback: T): T {
  return useEngine((s) => (s.settings ? pick(s.settings) : fallback));
}
