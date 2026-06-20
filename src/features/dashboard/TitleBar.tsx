export const TitleBar = (props: {
  title: React.ReactNode;
  description?: React.ReactNode;
}) => (
  <div className="
    mb-8 flex flex-col gap-2 border-b border-border/60 pb-5
    sm:flex-row sm:items-end sm:justify-between
  "
  >
    <div>
      <div className="
        text-2xl font-bold tracking-normal
        sm:text-3xl
      "
      >
        {props.title}
      </div>

      {props.description && (
        <div className="
          mt-1 max-w-3xl text-sm/6 font-medium text-muted-foreground
        "
        >
          {props.description}
        </div>
      )}
    </div>
  </div>
);
