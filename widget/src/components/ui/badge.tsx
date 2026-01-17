import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 relative overflow-hidden backdrop-blur-sm",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-slate-900 text-white shadow-lg shadow-slate-900/20",
        secondary:
          "border-slate-200 bg-slate-100 text-slate-800",
        outline:
          "border-slate-300 bg-white text-slate-700",
        destructive:
          "border-transparent bg-red-500 text-white shadow-lg shadow-red-500/30",
        // PREMIUM GLOSSY BADGES WITH GLOW
        remote:
          "border-transparent bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 text-white shadow-xl shadow-blue-500/40 hover:shadow-2xl hover:shadow-blue-500/50 hover:scale-105 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:via-transparent before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity",
        noExperience:
          "border-transparent bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600 text-white shadow-xl shadow-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-500/50 hover:scale-105 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:via-transparent before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity",
        experience:
          "border-slate-300 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 shadow-md hover:shadow-lg hover:from-slate-200 hover:to-slate-300",
        vacancies:
          "border-transparent bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-700 text-white shadow-xl shadow-purple-500/40 hover:shadow-2xl hover:shadow-purple-500/50 hover:scale-105 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:via-transparent before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity",
        verifying:
          "border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-700 shadow-md animate-pulse",
        workType:
          "border-sky-300 bg-gradient-to-br from-sky-50 to-cyan-100 text-sky-800 shadow-md",
        deadline:
          "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-100 text-amber-800 shadow-md",
        success:
          "border-transparent bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-xl shadow-emerald-500/30",
        warning:
          "border-amber-300 bg-amber-100 text-amber-900",
        info:
          "border-blue-300 bg-blue-100 text-blue-900",
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
