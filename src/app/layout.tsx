import type { Metadata, Viewport } from 'next';
import { Provedor } from '@/lib/contexto';
import './globals.css';

export const metadata: Metadata = {
  title: 'Condomínio ROMA — Leitura de Água',
  description: 'Lançamento mensal dos hidrômetros e rateio da conta de água',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ROMA Água' },
  icons: {
    icon: [
      { url: '/icone-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icone-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // o iOS não lê o manifest: precisa da tag apple-touch-icon
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
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
