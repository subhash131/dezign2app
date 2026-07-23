import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-start justify-center gap-4 px-6">
      <p className="text-sm uppercase tracking-[0.2em] text-fd-muted-foreground">
        404
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        This docs page does not exist.
      </h1>
      <Link
        href="/projects"
        className="inline-flex rounded-lg border border-fd-border px-4 py-2 text-sm font-medium transition-colors hover:bg-fd-accent"
      >
        Back to projects
      </Link>
    </main>
  );
}
