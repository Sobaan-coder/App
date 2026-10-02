"use client";
import * as React from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "type" | "checked" | "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

/** Native, styled checkbox (keyboard + screen-reader support for free, SSR-safe). */
function Checkbox({ className, checked, onCheckedChange, ...props }: Props) {
  return (
    <span className={cn("relative inline-flex size-5 shrink-0", className)}>
      <input
        type="checkbox"
        data-slot="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className="peer size-5 cursor-pointer appearance-none rounded-md border border-input bg-card shadow-xs transition-colors outline-none checked:border-primary checked:bg-primary focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <CheckIcon aria-hidden="true" strokeWidth={3.5} className="pointer-events-none absolute inset-0 m-auto size-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100" />
    </span>
  );
}

export { Checkbox };
