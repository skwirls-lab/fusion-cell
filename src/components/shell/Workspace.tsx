'use client';

import { TopBar } from './TopBar';
import { LeftRail } from './LeftRail';
import { CenterSplit } from './CenterSplit';
import { RightPanel } from './RightPanel';
import { BottomDrawer } from './BottomDrawer';

/**
 * PRD §5.1 layout. Fills the viewport between the two 28px exercise banners.
 *   [ top bar                                    ]
 *   [ rail | map | graph                | right  ]
 *   [ rail | live feed drawer           | right  ]
 */
export function Workspace() {
  return (
    <div id="workspace" className="grid h-[calc(100vh-56px)] grid-rows-[auto_1fr] overflow-hidden">
      <TopBar />
      <div className="grid min-h-0 grid-cols-[240px_1fr_360px]">
        <LeftRail />
        <main className="grid min-h-0 min-w-0 grid-rows-[1fr_auto]">
          <CenterSplit />
          <BottomDrawer />
        </main>
        <RightPanel />
      </div>
    </div>
  );
}
