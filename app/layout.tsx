import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import './globals.css';
import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: 'Fine Print — Watch the words that matter',
  description: 'Bounties for catching what changed in the fine print. GenLayer validators decide if it matters.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}
