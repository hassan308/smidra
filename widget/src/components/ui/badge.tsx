import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-gray-100 text-gray-700 border border-gray-200",
        primary:
          "bg-blue-100 text-blue-700 border border-blue-200",
        success:
          "bg-green-100 text-green-700 border border-green-200",
        warning:
          "bg-amber-100 text-amber-700 border border-amber-200",
        danger:
          "bg-red-100 text-red-700 border border-red-200",
        info:
          "bg-cyan-100 text-cyan-700 border border-cyan-200",
        purple:
          "bg-purple-100 text-purple-700 border border-purple-200",
        // Job-specific variants
        remote:
          "bg-blue-50 text-blue-700 border border-blue-200",
        experience:
          "bg-gray-50 text-gray-600 border border-gray-200",
        noExperience:
          "bg-emerald-50 text-emerald-700 border border-emerald-200",
        vacancies:
          "bg-purple-50 text-purple-700 border border-purple-200",
        deadline:
          "bg-orange-50 text-orange-700 border border-orange-200",
        workType:
          "bg-slate-50 text-slate-600 border border-slate-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
