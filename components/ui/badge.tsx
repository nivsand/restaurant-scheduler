import * as React from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "neutral"
  | "kitchen"
  | "floor"
  | "warning"
  | "danger"
  | "success"
  | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  kitchen: "bg-kitchen-100 text-kitchen-500",
  floor: "bg-floor-100 text-floor-500",
  warning: "bg-amber-50 text-amber-700 border border-amber-200/60",
  danger: "bg-rose-50 text-rose-700 border border-rose-200/60",
  success: "bg-brand-50 text-brand-700 border border-brand-200/60",
  brand: "bg-brand-100 text-brand-700",
};

export function Badge({
  tone = "neutral",
  className,
  ...rest
}: { tone?: Tone } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
