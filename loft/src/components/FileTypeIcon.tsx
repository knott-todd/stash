// Single-colour file icons in the shapes people already know from Finder,
// Explorer and Drive: a folder, a page with a folded corner, a picture, a
// film strip, a note, a grid for spreadsheets, a box for archives.

export function FileTypeIcon({ kind, className = "" }: { kind: string; className?: string }) {
  const common = { width: 28, height: 28, viewBox: "0 0 28 28", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" as const, "aria-hidden": true, className };
  switch (kind) {
    case "DIR":
      return (
        <svg {...common}>
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H11l2 2.5h10.5A1.5 1.5 0 0 1 25 11v10.5a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 3 21.5v-13Z" fill="currentColor" fillOpacity="0.12" />
        </svg>
      );
    case "IMG":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="20" height="18" rx="2" />
          <circle cx="10" cy="11" r="2" />
          <path d="M4 20l6-6 4 4 3-3 7 7" strokeLinecap="round" />
        </svg>
      );
    case "VID":
      return (
        <svg {...common}>
          <rect x="4" y="6" width="20" height="16" rx="2" />
          <path d="M8 6v16M20 6v16M4 11h4M4 17h4M20 11h4M20 17h4" />
          <path d="M12.5 11.5v5l4-2.5-4-2.5Z" fill="currentColor" />
        </svg>
      );
    case "AUD":
      return (
        <svg {...common}>
          <path d="M11 19V8l10-2v11" strokeLinecap="round" />
          <circle cx="8" cy="19" r="3" />
          <circle cx="18" cy="17" r="3" />
        </svg>
      );
    case "XLS":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="20" height="18" rx="2" />
          <path d="M4 11h20M4 17h20M11 5v18M18 5v18" />
        </svg>
      );
    case "ZIP":
      return (
        <svg {...common}>
          <path d="M4 9h20v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" />
          <path d="M3 5h22v4H3z" />
          <path d="M12 13h4v3h-4z" />
        </svg>
      );
    default:
      // DOC, PDF, PPT, TXT, FILE: a page with a folded corner and text lines
      return (
        <svg {...common}>
          <path d="M7 3h9l6 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M16 3v6h6" />
          <path d="M9 14h10M9 18h10" strokeLinecap="round" />
        </svg>
      );
  }
}
