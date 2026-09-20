import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Retokened to UI-SPEC C-01's button conventions, which every other component references.
// No variant is amber. DESIGN.md's button-primary said amber; that contradicted the amber rule
// and was corrected at the author's direction — primary is --ink on --canvas instead.
// Colour changes over 150ms and the press scale over 120ms; nothing else transitions.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border font-sans select-none outline-none " +
    "[transition:background-color_150ms_var(--ease-out-quint),border-color_150ms_var(--ease-out-quint),color_150ms_var(--ease-out-quint),transform_120ms_var(--ease-out-quint)] " +
    "active:not-aria-disabled:scale-[.985] " +
    "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 " +
    "motion-reduce:active:scale-100 " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Secondary, and the default everywhere: surface-1 on a line border.
        default:
          "rounded-md border-line bg-surface-1 text-ink font-medium " +
          "hover:not-aria-disabled:border-line-strong hover:not-aria-disabled:bg-surface-2 " +
          "active:not-aria-disabled:bg-surface-1",
        // Primary ("Send me this", the 404's way back): the page's own ink, inverted. The only
        // high-contrast fill in the product, which is what makes it read as the primary action
        // without borrowing amber — amber is a claim about what is on air, and a button is not
        // on air.
        strong:
          "rounded-md border-transparent bg-ink text-canvas font-semibold " +
          "hover:not-aria-disabled:bg-[color-mix(in_oklab,var(--ink)_88%,var(--canvas))] " +
          "active:not-aria-disabled:bg-[color-mix(in_oklab,var(--ink)_78%,var(--canvas))]",
        // 404 secondary: transparent on a line border.
        quiet:
          "rounded-md border-line bg-transparent text-ink font-medium " +
          "hover:not-aria-disabled:border-line-strong hover:not-aria-disabled:bg-surface-2 active:not-aria-disabled:bg-surface-1",
        // Mono uppercase text actions: Retry, Cancel, Stop.
        text:
          "hit-44 rounded-sm border-transparent bg-transparent px-1 font-mono text-[11px] font-normal uppercase tracking-[0.1em] text-ink " +
          "hover:not-aria-disabled:text-ink-muted",
        // Icon-only (the dock's close). Always carries an aria-label.
        icon:
          "hit-44 rounded-md border-transparent bg-transparent text-ink-muted hover:not-aria-disabled:bg-surface-2 hover:not-aria-disabled:text-ink",
        // shadcn / AI Elements names, retokened onto the two above so the copied components
        // keep compiling without reintroducing their look.
        outline:
          "rounded-md border-line bg-transparent text-ink font-medium hover:not-aria-disabled:border-line-strong hover:not-aria-disabled:bg-surface-2",
        ghost:
          "rounded-md border-transparent bg-transparent text-ink-muted font-medium hover:not-aria-disabled:bg-surface-2 hover:not-aria-disabled:text-ink",
      },
      size: {
        md: "h-10 px-[14px] text-[13px] pointer-coarse:h-11",
        lg: "h-11 px-4 text-[14px]",
        sm: "h-8 px-2.5 text-[13px]",
        inline: "h-auto",
        icon: "size-8",
        xs: "h-6 px-2 text-[12px]",
        "icon-sm": "size-8",
        "icon-xs": "size-6",
      },
    },
    compoundVariants: [
      { variant: "text", size: "md", className: "h-6 px-1 pointer-coarse:h-6" },
    ],
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
