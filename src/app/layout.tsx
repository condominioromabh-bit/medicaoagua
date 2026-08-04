import type { Metadata, Viewport } from 'next';
import { Provedor } from '@/lib/contexto';
import './globals.css';

export const metadata: Metadata = {
  title: 'Condomínio ROMA — Leitura de Água',
  description: 'Lançamento mensal dos hidrômetros e rateio da conta de água',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ROMA Água' },
};

export const viewport: Viewport = {
  themeColor: '#0E2129',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Provedor>{children}</Provedor>
      </body>
    </html>
  );
}
