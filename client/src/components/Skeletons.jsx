export function ListSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-1 px-2 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-2 py-3">
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 rounded bg-slate-200" />
            <div className="h-3 w-3/4 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div className="space-y-4 px-4 py-4">
      {[false, true, false, true, false].map((mine, i) => (
        <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <div className={`h-10 animate-pulse rounded-2xl ${mine ? "w-1/3 bg-indigo-100" : "w-1/2 bg-slate-200"}`} />
        </div>
      ))}
    </div>
  );
}
