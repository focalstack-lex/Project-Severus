import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-creamBackground text-charcoalText">
      <h2 className="text-2xl font-bold mb-2">Page Not Found</h2>
      <p className="text-xs text-slate-500 mb-4">The requested spatial page could not be located.</p>
      <Link href="/" className="px-4 py-2 bg-olivePrimary text-white text-xs font-semibold rounded-full">
        Return Home
      </Link>
    </div>
  );
}
