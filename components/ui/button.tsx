import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-brand-500 to-terracotta text-white shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30 hover:-translate-y-px disabled:from-brand-300 disabled:to-brand-400 disabled:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed",
  secondary:
    "bg-warm-100 text-brown-700 border border-warm-200 hover:bg-warm-200 disabled:opacity-50",
  ghost: "bg-transparent text-brown-600 hover:bg-warm-100",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150",
          variants[variant],
          sizes[size],
          className,
        )}
        {...rest}
      />
    );
  },
);
Button.displayName = "Button";
