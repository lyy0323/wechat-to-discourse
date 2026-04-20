import type { Metadata } from 'next';
import { validateEnv } from '@/lib/env';
import './globals.css';

validateEnv();

export const metadata: Metadata = {
  title: '内容搬运 → 论坛',
  description: '一键将公众号、小红书等平台的内容搬运到论坛',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
