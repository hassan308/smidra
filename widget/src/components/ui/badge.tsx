import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-slate-900 text-white shadow",
        secondary:
          "border-slate-200 bg-slate-100 text-slate-800",
        outline:
          "border-slate-300 bg-white text-slate-700",
        destructive:
          "border-transparent bg-red-500 text-white shadow",
        // Premium gradient badges
        remote:
          "border-transparent bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30",
        noExperience:
          "border-transparent bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 text-white shadow-md shadow-emerald-500/30",
        experience:
          "border-slate-200 bg-slate-50 text-slate-600",
        vacancies:
          "border-transparent bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 text-white shadow-md shadow-purple-500/30",
        verifying:
          "border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700",
        workType:
          "border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 text-sky-800",
        deadline:
          "border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800",
        success:
          "border-transparent bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-md shadow-emerald-500/25",
        warning:
          "border-amber-200 bg-amber-50 text-amber-800",
        info:
          "border-blue-200 bg-blue-50 text-blue-800",
      },
      size: {
        default: "text-xs px-2.5 py-1",
        sm: "text-[10px] px-2 py-0.5",
        lg: "text-sm px-3 py-1.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
