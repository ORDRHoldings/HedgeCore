"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-bold text-red-600">Something went wrong</h2>
        <p className="mt-2 text-sm text-gray-600">{error.message}</p>
        <button
          onClick={reset}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
