const DashboardLoading = () => (
  <div className="grid gap-6">
    <div className="dashboard-panel rounded-xl border p-6">
      <div className="h-7 w-48 animate-pulse rounded-sm bg-primary/10" />
      <div className="
        mt-3 h-4 w-80 max-w-full animate-pulse rounded-sm bg-primary/10
      "
      />
    </div>

    <div className="
      grid gap-4
      md:grid-cols-2
      xl:grid-cols-4
    "
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="dashboard-surface rounded-xl border p-5">
          <div className="h-4 w-24 animate-pulse rounded-sm bg-primary/10" />
          <div className="mt-4 h-8 w-16 animate-pulse rounded-sm bg-primary/10" />
        </div>
      ))}
    </div>

    <div className="dashboard-panel rounded-xl border p-6">
      <div className="grid gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="h-12 animate-pulse rounded-lg bg-primary/8"
          />
        ))}
      </div>
    </div>
  </div>
);

export default DashboardLoading;
