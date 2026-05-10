// apps/web/components/project/SectionHeader.tsx
//
// Consistent section header used throughout /projects/[id]. Three slots:
//   - eyebrow:  small, uppercase, tracked. Tells the eye what kind of thing this is.
//   - title:    the section name as a real heading.
//   - kicker:   optional one-line narrative or stat that "answers" the section.
//
// Renders nothing fancy — the whole point is rhythm. Every section on the
// page uses this so the user can scan with predictable structure.

interface Props {
  eyebrow: string
  title:   string
  kicker?: string | React.ReactNode
}

export function SectionHeader({ eyebrow, title, kicker }: Readonly<Props>) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-3">
      <div className="min-w-0">
        <p className="text-[10.5px] uppercase tracking-[0.14em] text-gray-400 font-medium">{eyebrow}</p>
        <h2 className="text-[18px] font-semibold tracking-tight text-gray-900 mt-0.5">{title}</h2>
      </div>
      {kicker && (
        <p className="text-[12.5px] text-gray-500 truncate hidden sm:block max-w-[55%]">{kicker}</p>
      )}
    </div>
  )
}
