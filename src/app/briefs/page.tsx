import type { Metadata } from 'next';
import { BriefsView } from '@/components/brief/BriefsView';

export const metadata: Metadata = { title: 'Briefs — Fusion Cell' };

export default function BriefsPage() {
  return <BriefsView />;
}
