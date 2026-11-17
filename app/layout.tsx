import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Run 258 — Cada km conta', description: 'Um grupo para todos. Vamos correr, acelerar e conquistar Maputo juntos.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="pt"><body>{children}</body></html> }
