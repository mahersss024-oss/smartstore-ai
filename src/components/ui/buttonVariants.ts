import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  `
    inline-flex shrink-0 cursor-pointer items-center justify-center gap-2
    rounded-lg text-sm font-semibold whitespace-nowrap transition-all
    duration-200 ease-out outline-none
    focus-visible:border-ring focus-visible:ring-[3px]
    focus-visible:ring-ring/50
    active:scale-[0.98]
    disabled:pointer-events-none disabled:opacity-50
    aria-invalid:border-destructive aria-invalid:ring-destructive/20
    dark:aria-invalid:ring-destructive/40
    [&_svg]:shrink-0
    [&_svg:not([class*="size-"])]:size-4
  `,
  {
    variants: {
      variant: {
        default:
          `
            bg-linear-to-r from-primary to-cyan-600 text-primary-foreground
            shadow-sm shadow-primary/25
            hover:-translate-y-px hover:from-primary/95 hover:to-emerald-600
            hover:shadow-md hover:shadow-primary/25
          `,
        destructive:
          `
            bg-destructive text-white
            hover:bg-destructive/90
            focus-visible:ring-destructive/20
            dark:bg-destructive/60
            dark:focus-visible:ring-destructive/40
          `,
        outline:
          `
            border border-border/70 bg-background/78 shadow-xs backdrop-blur-sm
            hover:-translate-y-px hover:border-primary/35 hover:bg-accent/80
            hover:text-accent-foreground
            dark:border-input dark:bg-input/30
            dark:hover:bg-input/50
          `,
        secondary:
          `
            bg-secondary text-secondary-foreground shadow-xs shadow-cyan-950/5
            hover:-translate-y-px hover:bg-secondary/82
          `,
        ghost:
          `
            hover:-translate-y-px hover:bg-accent/85
            hover:text-accent-foreground
            data-[state=open]:bg-accent/85
          `,
        link: `
          text-primary underline-offset-4
          hover:underline
        `,
      },
      size: {
        'default': `
          h-9 px-4 py-2
          has-[>svg]:px-3
        `,
        'sm': `
          h-8 gap-1.5 rounded-md px-3
          has-[>svg]:px-2.5
        `,
        'lg': `
          h-10 rounded-md px-6
          has-[>svg]:px-4
        `,
        'icon': 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
