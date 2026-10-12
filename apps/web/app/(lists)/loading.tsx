// The loading skeleton for the list pages in this route group only. It must not wrap detail pages
// (polls/[id], u/[handle], ...) or pages that redirect: inside a loading boundary the response is
// streamed and its status is sent before notFound() or redirect() runs, so a missing poll would get
// HTTP 200 instead of 404. Pages outside this group render fully first and keep real status codes.

export default function Loading() {
  return (
    <main
      style={{ maxWidth: 1280, margin: '0 auto', padding: 40 }}
      className="animate-pulse"
    >
      {/* Title skeleton */}
      <div
        className="rounded-sm bg-parchment-line-soft mb-2"
        style={{ height: 24, width: 180 }}
      />
      <div
        className="rounded-sm bg-parchment-line-soft mb-8"
        style={{ height: 14, width: 300 }}
      />

      {/* Card skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-sm border border-parchment-line-soft bg-parchment-surface"
            style={{ padding: 24 }}
          >
            <div
              className="rounded-sm bg-parchment-line-soft mb-3"
              style={{ height: 12, width: 80 }}
            />
            <div
              className="rounded-sm bg-parchment-line-soft mb-2"
              style={{ height: 16, width: '90%' }}
            />
            <div
              className="rounded-sm bg-parchment-line-soft mb-4"
              style={{ height: 16, width: '60%' }}
            />
            <div
              className="rounded-sm bg-parchment-line-soft"
              style={{ height: 32, width: '100%' }}
            />
          </div>
        ))}
      </div>
    </main>
  )
}
