import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row sm:gap-4",
        month: "space-y-4",
        caption: "relative flex items-center justify-center px-10 pb-2 pt-1",
        caption_label: "text-base font-semibold tracking-tight text-foreground",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between px-1",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-10 w-10 rounded-xl border border-border/70 bg-background p-0 text-foreground shadow-sm transition-colors hover:border-primary/25 hover:bg-primary/5 hover:text-primary focus-visible:ring-1 focus-visible:ring-primary/30",
        ),
        nav_button_previous: "static",
        nav_button_next: "static",
        table: "w-full border-collapse space-y-1",
        head_row: "flex justify-between",
        head_cell: "w-10 rounded-md text-sm font-semibold lowercase text-muted-foreground",
        row: "mt-2 flex w-full justify-between",
        cell: "relative h-10 w-10 p-0 text-center text-sm [&:has([aria-selected].day-range-end)]:rounded-r-xl [&:has([aria-selected].day-outside)]:bg-accent/40 [&:has([aria-selected])]:bg-accent/70 first:[&:has([aria-selected])]:rounded-l-xl last:[&:has([aria-selected])]:rounded-r-xl focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-10 w-10 rounded-xl p-0 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-primary/10 font-semibold text-primary",
        day_outside:
          "day-outside text-muted-foreground/45 opacity-100 aria-selected:bg-accent/40 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground/35 opacity-60",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
