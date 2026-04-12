export function MapSkeleton() {
  return (
    <div className="space-y-4">
      <div className="aspect-[975/610] w-full rounded-lg shadow-flat skeleton" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[60px] rounded-md skeleton" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      <div className="h-9 w-full rounded-md skeleton" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 rounded skeleton" />
      ))}
    </div>
  );
}

export function BubbleSkeleton() {
  return (
    <div className="mt-6 space-y-1">
      <div className="h-5 w-40 rounded skeleton mb-2" />
      <div className="rounded-lg overflow-hidden border border-border/40">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 skeleton" />
        ))}
      </div>
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="h-8 w-48 rounded-md skeleton" />
      <div className="h-8 w-72 rounded-md skeleton" />
      <div className="h-8 w-44 rounded-md skeleton" />
      <div className="h-8 w-32 rounded-md skeleton" />
    </div>
  );
}
