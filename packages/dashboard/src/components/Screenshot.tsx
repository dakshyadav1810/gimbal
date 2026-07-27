export function Screenshot({
  path,
  alt,
}: {
  path?: string;
  alt: string;
}) {
  if (!path) {
    return (
      <div className="flex h-40 w-full items-center justify-center rounded border border-dashed border-neutral-300 text-xs text-neutral-400 dark:border-neutral-700 dark:text-neutral-600">
        no screenshot
      </div>
    );
  }
  return (
    <img
      src={`/screenshots/${path}`}
      alt={alt}
      className="w-full rounded border border-neutral-200 dark:border-neutral-800"
    />
  );
}
