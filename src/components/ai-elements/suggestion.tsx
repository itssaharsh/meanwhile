"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { useCallback } from "react";

// Meanwhile retoken (UI-SPEC C-05): a fixed row above the composer, 44px tall, chips 28px
// visual with a 44px target, transparent on a line border, body 500 12px in --ink-muted;
// hover strengthens the border and lifts the text to --ink. No pills, no fill, no motion
// beyond the colour change. The row scrolls horizontally and never wraps.

export type SuggestionsProps = ComponentProps<"div">;

export const Suggestions = ({ className, children, ...props }: SuggestionsProps) => (
  <div
    className={cn(
      "flex h-11 w-full shrink-0 items-center gap-1.5 overflow-x-auto px-4 py-2 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type SuggestionProps = Omit<ComponentProps<"button">, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({ suggestion, onClick, className, children, ...props }: SuggestionProps) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <button
      className={cn(
        "hit-44 inline-flex h-7 shrink-0 items-center rounded-sm border border-line bg-transparent px-2.5 font-sans text-[12px] font-medium text-ink-muted",
        "[transition:border-color_150ms_var(--ease-out-quint),color_150ms_var(--ease-out-quint)] hover:border-line-strong hover:text-ink",
        className
      )}
      onClick={handleClick}
      type="button"
      {...props}
    >
      {children || suggestion}
    </button>
  );
};
