import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border-[1.5px] border-cream-200 bg-cream-50 px-3.5 text-sm text-brown-900 placeholder:text-brown-400 transition-all focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-400/10",
      className,
    )}
    {...rest}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-xl border-[1.5px] border-cream-200 bg-cream-50 px-3.5 py-2.5 text-sm text-brown-900 placeholder:text-brown-400 transition-all focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-400/10",
      className,
    )}
    {...rest}
  />
));
Textarea.displayName = "Textarea";
