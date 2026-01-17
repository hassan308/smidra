import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-gray-900 text-white hover:bg-gray-800 shadow-sm",
        primary:
          "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/30",
        secondary:
          "bg-gray-100 text-gray-900 hover:bg-gray-200 border border-gray-200",
        outline:
          "border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400",
        ghost:
          "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        link:
          "text-blue-600 underline-offset-4 hover:underline",
        success:
          "bg-green-600 text-white hover:bg-green-700 shadow-sm shadow-green-600/20",
        danger:
          "bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-600/20",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs rounded-md",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
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
