export function ListSkeleton({ rows = 5 }) {
  return (
    <div role="status" aria-label="Loading people and conversations" className="space-y-1 px-2 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-3">
          <div className="h-10 w-10 rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 rounded bg-surface-2" />
            <div className="h-3 w-3/4 rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div role="status" aria-label="Loading messages" className="space-y-4 px-4 py-4">
      {[false, true, false, true, false].map((mine, i) => (
        <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <div className={`h-10 rounded-2xl bg-surface-2 ${mine ? "w-1/3" : "w-1/2"}`} />
        </div>
      ))}
    </div>
  );
}
