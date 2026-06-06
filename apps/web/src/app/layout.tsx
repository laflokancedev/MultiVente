import './globals.css';
import type { Metadata } from 'next';
import { NavBar } from '@/components/nav-bar';

export const metadata: Metadata = {
  title: 'MultiMarket',
  manifest: '/manifest.webmanifest',
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
