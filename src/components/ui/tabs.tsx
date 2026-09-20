import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "cn"

// Retokened to UI-SPEC C-03's tab bar: 40px bar, 32px tabs with a 44px target, idle
// --ink-muted, selected --ink with a 2px --ink underline inset to the label (T-19: the
// underline moves to the new label over 200ms E). Never amber: a selected tab is not on air.

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex min-h-0 flex-col", className)}
      {...props}
    />
  )
}

function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative flex h-10 shrink-0 items-center gap-1 border-b border-line bg-surface-1 px-2",
        className
      )}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        className={
          "pointer-events-none absolute bottom-[-1px] left-0 h-0.5 bg-ink " +
          "w-[calc(var(--active-tab-width)-20px)] translate-x-[calc(var(--active-tab-left)+10px)] " +
          "[transition:translate_200ms_var(--ease-out-quint),width_200ms_var(--ease-out-quint)] motion-reduce:transition-none"
        }
      />
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "hit-44 inline-flex h-8 items-center rounded-md px-2.5 font-sans text-[13px] font-medium whitespace-nowrap text-ink-muted outline-none select-none",
        "[transition:background-color_150ms_var(--ease-out-quint),color_150ms_var(--ease-out-quint),transform_120ms_var(--ease-out-quint)]",
        "hover:bg-surface-2 active:scale-[.985] motion-reduce:active:scale-100 data-active:text-ink",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      keepMounted
      className={cn("min-h-0 flex-1 outline-none data-hidden:hidden", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
