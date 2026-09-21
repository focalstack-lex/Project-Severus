import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sondera | Every path tells a story',
  description: 'Universal spatial memory & activity map platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-creamBackground text-charcoalText min-h-screen">
        {children}
      </body>
    </html>
  );
}
