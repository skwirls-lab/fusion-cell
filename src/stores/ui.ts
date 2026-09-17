/**
 * Shell-only UI state: which right tab is showing, which center pane is
 * maximized, whether the bottom drawer is open. Selection and filter state
 * live in a separate store (later phase) because they are URL-synced.
 */
import { create } from 'zustand';

export type RightTab = 'entity' | 'analyst';
export type Maximized = null | 'map' | 'graph';

export interface UiState {
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;
  maximized: Maximized;
  setMaximized: (pane: Maximized) => void;
  drawerOpen: boolean;
  toggleDrawer: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  rightTab: 'entity',
  setRightTab: (rightTab) => set({ rightTab }),
  maximized: null,
  setMaximized: (maximized) => set({ maximized }),
  drawerOpen: true,
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
}));
