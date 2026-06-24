import { cn } from "@/lib/utils";
import type { ReturnStatus } from "@/lib/types";
import { CheckCircle2, AlertCircle, XCircle, Clock } from "lucide-react";

const config: Record<
  ReturnStatus,
  { label: string; cls: string; Icon: typeof CheckCircle2 }
> = {
  resolved: {
    label: "Resolvida",
    cls: "bg-success-soft text-success-soft-foreground border-success/20",
    Icon: CheckCircle2,
  },
  dispute: {
    label: "Em disputa",
    cls: "bg-warning-soft text-warning-soft-foreground border-warning/20",
    Icon: AlertCircle,
  },
  loss: {
    label: "Perda",
    cls: "bg-destructive-soft text-destructive-soft-foreground border-destructive/20",
    Icon: XCircle,
  },
  pending: {
    label: "Aguardando valor",
    cls: "bg-muted text-muted-foreground border-border",
    Icon: Clock,
  },
};

interface Props {
  status: ReturnStatus;
  size?: "sm" | "md";
  withIcon?: boolean;
  className?: string;
}

export function StatusBadge({ status, size = "sm", withIcon = true, className }: Props) {
  const { label, cls, Icon } = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        cls,
        className,
      )}
    >
      {withIcon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}
