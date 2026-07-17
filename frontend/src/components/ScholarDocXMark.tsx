export function ScholarDocXMark({ size = 52, className = "scholarMark" }: { size?: number | string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M11 50L18 31L45 7L55 17L30 43L11 50Z"
        fill="#F59E0B"
        stroke="#F4FAF8"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M11 50L18 31L30 43L11 50Z"
        fill="#FF5FA2"
        stroke="#F4FAF8"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M45 7L55 17L59 5L45 7Z"
        fill="#F59E0B"
        stroke="#F4FAF8"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M24 29L36 17"
        stroke="#0B2A27"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M17 52C27 46 41 43 55 44"
        stroke="#6BC7BD"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
