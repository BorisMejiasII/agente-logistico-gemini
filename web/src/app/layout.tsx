import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agente Logístico Multi-Proveedor',
  description: 'Asistente Inteligente de Inventario y Abastecimiento con Gemini y OpenAI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
