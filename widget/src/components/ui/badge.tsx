import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-white/60 border-black/[0.06] text-slate-600",
        primary:
          "bg-blue-50 border-blue-100 text-blue-700",
        success:
          "bg-emerald-50 border-emerald-100 text-emerald-700",
        warning:
          "bg-amber-50 border-amber-100 text-amber-700",
        // Job-specific variants (matching new design)
        remote:
          "bg-emerald-50 border-emerald-100 text-emerald-700",
        experience:
          "bg-white/60 border-black/[0.06] text-slate-600",
        noExperience:
          "bg-emerald-50 border-emerald-100 text-emerald-700",
        vacancies:
          "bg-purple-50 border-purple-100 text-purple-700",
        deadline:
          "bg-orange-50 border-orange-100 text-orange-700",
        workType:
          "bg-white/60 border-black/[0.06] text-slate-600",
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
