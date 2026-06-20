const PlatformAdminLoading = () => (
  <div className="grid gap-6">
    <div className="dashboard-panel rounded-xl border p-6">
      <div className="h-7 w-52 animate-pulse rounded-sm bg-primary/10" />
      <div className="
        mt-3 h-4 w-96 max-w-full animate-pulse rounded-sm bg-primary/10
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
          <div className="h-4 w-28 animate-pulse rounded-sm bg-primary/10" />
          <div className="mt-4 h-8 w-20 animate-pulse rounded-sm bg-primary/10" />
        </div>
      ))}
    </div>

    <div className="dashboard-panel rounded-xl border p-6">
      <div className="grid gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl bg-primary/8"
          />
        ))}
      </div>
    </div>
  </div>
);

export default PlatformAdminLoading;
