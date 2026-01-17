import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-slate-700 text-white hover:bg-slate-800 shadow-sm",
        primary:
          "bg-slate-700 text-white hover:bg-slate-800 shadow-[0_4px_12px_rgba(100,116,139,0.2)] hover:opacity-90 hover:-translate-y-0.5",
        secondary:
          "bg-white border border-black/10 text-slate-900 hover:bg-slate-50",
        outline:
          "border border-black/10 bg-white text-slate-700 hover:bg-slate-50",
        ghost:
          "text-slate-600 hover:bg-slate-100",
        success:
          "bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_4px_12px_rgba(5,150,105,0.2)]",
      },
      size: {
        default: "h-11 px-5 py-3",
        sm: "h-9 px-3 text-xs rounded-lg",
        lg: "h-12 px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
