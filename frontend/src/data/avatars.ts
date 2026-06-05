// 10 built-in avatar options — SVG data URIs with distinct color schemes and face styles

export type AvatarOption = {
  id: string;
  label: string;
  svg?: string; // inline SVG string
  imagePath?: string; // static image path
};

// Helper to build a simple illustrated face SVG
function face(bg: string, skin: string, hair: string, hairStyle: "short" | "long" | "curly" | "bun" | "none", glasses: boolean, id: string): string {
  const hairShapes: Record<string, string> = {
    short: `<rect x="18" y="14" width="44" height="22" rx="12" fill="${hair}"/>`,
    long: `<rect x="18" y="14" width="44" height="22" rx="12" fill="${hair}"/><rect x="18" y="30" width="10" height="28" rx="5" fill="${hair}"/><rect x="52" y="30" width="10" height="28" rx="5" fill="${hair}"/>`,
    curly: `<ellipse cx="40" cy="20" rx="22" ry="12" fill="${hair}"/><ellipse cx="22" cy="28" rx="8" ry="10" fill="${hair}"/><ellipse cx="58" cy="28" rx="8" ry="10" fill="${hair}"/>`,
    bun: `<rect x="20" y="16" width="40" height="18" rx="10" fill="${hair}"/><ellipse cx="40" cy="14" rx="10" ry="8" fill="${hair}"/>`,
    none: ``,
  };

  const glassesEl = glasses
    ? `<rect x="24" y="36" width="14" height="10" rx="4" fill="none" stroke="#334155" stroke-width="2"/>
       <rect x="42" y="36" width="14" height="10" rx="4" fill="none" stroke="#334155" stroke-width="2"/>
       <line x1="38" y1="41" x2="42" y2="41" stroke="#334155" stroke-width="2"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
  <circle cx="40" cy="40" r="40" fill="${bg}"/>
  ${hairShapes[hairStyle]}
  <ellipse cx="40" cy="46" rx="18" ry="20" fill="${skin}"/>
  <circle cx="33" cy="44" r="2.5" fill="#1e293b"/>
  <circle cx="47" cy="44" r="2.5" fill="#1e293b"/>
  <circle cx="34" cy="43" r="1" fill="white"/>
  <circle cx="48" cy="43" r="1" fill="white"/>
  ${glassesEl}
  <path d="M34 52 Q40 57 46 52" stroke="#c2856a" stroke-width="2" fill="none" stroke-linecap="round"/>
  <ellipse cx="33" cy="50" rx="3" ry="2" fill="${skin}" opacity="0.6"/>
  <ellipse cx="47" cy="50" rx="3" ry="2" fill="${skin}" opacity="0.6"/>
</svg>`;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: "scholar",
    label: "Scholar",
    imagePath: "/media/avatars/scholar.png",
  },
  {
    id: "explorer",
    label: "Explorer",
    imagePath: "/media/avatars/explorer.png",
  },
  {
    id: "dreamer",
    label: "Dreamer",
    imagePath: "/media/avatars/dreamer.png",
  },
  {
    id: "pioneer",
    label: "Pioneer",
    imagePath: "/media/avatars/pioneer.png",
  },
  {
    id: "thinker",
    label: "Thinker",
    imagePath: "/media/avatars/thinker.png",
  },
  {
    id: "creator",
    label: "Creator",
    imagePath: "/media/avatars/creator.png",
  },
  {
    id: "visionary",
    label: "Visionary",
    imagePath: "/media/avatars/visionary.png",
  },
  {
    id: "achiever",
    label: "Achiever",
    imagePath: "/media/avatars/achiever.png",
  },
  {
    id: "innovator",
    label: "Innovator",
    imagePath: "/media/avatars/innovator.png",
  },
  {
    id: "trailblazer",
    label: "Trailblazer",
    imagePath: "/media/avatars/trailblazer.png",
  },
  {
    id: "mentor",
    label: "Mentor",
    imagePath: "/media/avatars/mentor.png",
  },
  {
    id: "navigator",
    label: "Navigator",
    imagePath: "/media/avatars/navigator.png",
  },
  {
    id: "catalyst",
    label: "Catalyst",
    imagePath: "/media/avatars/catalyst.png",
  },
  {
    id: "strategist",
    label: "Strategist",
    imagePath: "/media/avatars/strategist.png",
  },
  {
    id: "builder",
    label: "Builder",
    imagePath: "/media/avatars/builder.png",
  },
];

export function getAvatarById(id: string | null | undefined): AvatarOption | undefined {
  return AVATAR_OPTIONS.find((a) => a.id === id);
}

/** Render avatar as a small img-like element — returns a data URI */
export function avatarDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function avatarImageSrc(avatar: AvatarOption): string {
  if (avatar.imagePath) return avatar.imagePath;
  if (avatar.svg) return avatarDataUri(avatar.svg);
  return "";
}
