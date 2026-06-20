type PlanCheckoutButtonProps = {
  active?: boolean;
  disabled?: boolean;
  label: string;
};

export const PlanCheckoutButton = (props: PlanCheckoutButtonProps) => {
  return (
    <button
      type="button"
      disabled
      className="
        inline-flex w-full items-center justify-center rounded-lg bg-primary
        px-4 py-2 text-sm font-semibold text-primary-foreground
        transition-opacity
        hover:opacity-90
        disabled:cursor-not-allowed disabled:opacity-55
      "
    >
      {props.label}
    </button>
  );
};
