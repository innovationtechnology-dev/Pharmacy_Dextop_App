import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import './globals.css';

export const metadata = {
  title: 'Pharmacy Cloud License Admin',
  description: 'Super admin dashboard for managing pharmacy licenses'
};

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/requests', label: 'Requests' },
  { href: '/licenses', label: 'Licenses' },
  { href: '/pharmacies', label: 'Pharmacies' }
];

function TopNav() {
  const headersList = headers();
  const currentPath = headersList.get('x-invoke-path') || headersList.get('referer') || '';

  return (
    <header className="border-b border-slate-800 bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-bold">
            CL
          </span>
          <span>Cloud License Admin</span>
        </div>
        <nav className="flex items-center gap-2 text-xs">
          {navItems.map((item) => {
            const isActive = currentPath.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'px-3 py-1.5 rounded-full border transition-colors ' +
                  (isActive
                    ? 'bg-emerald-500/10 border-emerald-400 text-emerald-200'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-emerald-500 hover:text-emerald-200')
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-50">
        <TopNav />
        <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}

