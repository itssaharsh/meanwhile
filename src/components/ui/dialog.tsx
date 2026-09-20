"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

// Retokened to UI-SPEC C-09, the one modal in the product. The scrim is --canvas at 72% with
// no blur, and starts below the TopBar so a cut stays visible while the dialog is open. The
// popup is surface-1 on a line border, 420px, centred; below 640 it becomes a bottom sheet.
// No close-X by default: every string needs to be in COPY.md, and Escape + the dialog's own
// actions already close it.

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-x-0 top-[var(--topbar-h)] bottom-0 z-50 bg-[color-mix(in_oklab,var(--canvas)_72%,transparent)]",
        "[transition:opacity_200ms_var(--ease-out-quint)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed inset-x-4 inset-y-0 z-50 mx-auto my-auto flex h-fit max-h-[calc(100dvh-var(--topbar-h)-32px)] w-auto max-w-[420px] flex-col gap-3.5 overflow-y-auto rounded-lg border border-line bg-surface-1 p-5 text-ink outline-none",
          "[transition:opacity_200ms_var(--ease-out-quint),translate_200ms_var(--ease-out-quint)] data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
          "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:mb-0 max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:p-4 max-sm:pb-[calc(16px+env(safe-area-inset-bottom))] max-sm:shadow-sheet max-sm:data-[starting-style]:translate-y-full",
          "motion-reduce:[transition:opacity_120ms_linear] motion-reduce:data-[starting-style]:translate-y-0",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex flex-col gap-2", className)} {...props} />
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("m-0 font-display text-[17px] leading-[1.3] font-semibold text-ink", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("m-0 font-sans text-[13px] leading-[1.5] text-ink-muted", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
