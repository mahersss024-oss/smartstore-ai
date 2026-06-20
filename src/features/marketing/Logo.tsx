import { AppConfig } from '@/utils/AppConfig';

export const Logo = (props: {
  isTextHidden?: boolean;
}) => (
  <div className="inline-flex items-center gap-2.5">
    <svg
      className="size-9 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" fill="url(#smartstore-logo-bg)" />
      <path
        d="M11.5 17.5 20 10l8.5 7.5"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 17v10.5h12V17"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 22.5h6"
        stroke="#9FFFD2"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="29.5" cy="10.5" r="2.7" fill="#9FFFD2" />
      <path
        d="M26.9 10.5h-3.4M29.5 13.2v3.3"
        stroke="#9FFFD2"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient
          id="smartstore-logo-bg"
          x1="6"
          y1="4"
          x2="34"
          y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0F172A" />
          <stop offset="0.52" stopColor="#14532D" />
          <stop offset="1" stopColor="#0E7490" />
        </linearGradient>
      </defs>
    </svg>
    {!props.isTextHidden && (
      <span className="leading-none">
        <span className="
          block text-lg font-bold tracking-normal text-foreground
        "
        >
          {AppConfig.name}
        </span>
        <span className="
          mt-0.5 block text-[10px] font-medium tracking-[0.18em]
          text-muted-foreground uppercase
        "
        >
          Commerce OS
        </span>
      </span>
    )}
  </div>
);
