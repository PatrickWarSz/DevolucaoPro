import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Shield, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, useSubscription, asaasCheckout, asaasCancel } from "@/lib/account";

const MONTHLY_PRICE = 24.9;

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export default function SubscriptionPanel() {
  const { user } = useCurrentUser();
  const workspaceId = user?.workspaceId ?? null;
  const { info, refresh } = useSubscription(workspaceId);
  const [busy, setBusy] = useState<"monthly" | "cancel" | null>(null);

  const status = info.status ?? "trialing";
  const daysRemaining = daysBetween(info.dataVencimento);

  const handleSubscribe = async () => {
    if (!workspaceId) return;
    setBusy("monthly");
    const toastId = toast.loading("Gerando cobrança...");
    const res = await asaasCheckout(workspaceId, "monthly");
    toast.dismiss(toastId);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error || "Não foi possível abrir a cobrança.");
      return;
    }
    if (res.invoiceUrl) window.open(res.invoiceUrl, "_blank");
    await refresh();
  };

  const handleCancel = async () => {
    if (!workspaceId) return;
    if (!confirm("Cancelar a assinatura? O acesso continua até o fim do ciclo.")) return;
    setBusy("cancel");
    const toastId = toast.loading("Cancelando...");
    const res = await asaasCancel(workspaceId);
    toast.dismiss(toastId);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error || "Falha ao cancelar.");
      return;
    }
    toast.success("Assinatura cancelada.");
    await refresh();
  };

  const statusBadge =
    status === "trialing" ? (
      <Badge className="bg-warning text-warning-foreground hover:bg-warning/90 gap-1">
        <Clock className="h-3 w-3" />
        {daysRemaining !== null ? `Trial — ${daysRemaining} ${daysRemaining === 1 ? "dia" : "dias"} restantes` : "Trial"}
      </Badge>
    ) : status === "active" ? (
      <Badge className="bg-success text-success-foreground hover:bg-success/90 gap-1">
        <Check className="h-3 w-3" /> Assinatura ativa
      </Badge>
    ) : status === "canceled" ? (
      <Badge variant="outline" className="text-muted-foreground gap-1 border-muted-foreground/30">
        <AlertCircle className="h-3 w-3" /> Cancelada
      </Badge>
    ) : (
      <Badge variant="destructive">Pagamento pendente</Badge>
    );

  const features = [
    "Registros ilimitados",
    "Disputas e fila do dia",
    "Importação de planilhas com IA",
    "Dashboard com análise de IA",
    "Suporte por e-mail",
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl">Assinatura</CardTitle>
            <CardDescription>Gerencie seu plano do DevoluçõesPro</CardDescription>
          </div>
          {statusBadge}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="max-w-md rounded-lg border-2 border-primary bg-primary/5 p-5 flex flex-col">
          <div className="mb-3">
            <p className="text-sm font-medium text-primary">Plano Mensal</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold">{formatBRL(MONTHLY_PRICE)}</span>
              <span className="text-sm text-muted-foreground">/ mês</span>
            </div>
          </div>
          <ul className="mb-5 space-y-2 text-sm flex-1">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Button onClick={handleSubscribe} disabled={busy !== null || status === "active"}>
            {status === "active" ? "Plano atual" : busy === "monthly" ? "Aguarde..." : "Assinar agora"}
          </Button>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            <span>Pagamento 100% seguro via Asaas (Pix, boleto ou cartão). Cancele quando quiser.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {info.asaasPortalUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={info.asaasPortalUrl} target="_blank" rel="noreferrer" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Gerenciar pagamento
                </a>
              </Button>
            )}
            {status === "active" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleCancel}
                disabled={busy === "cancel"}
              >
                {busy === "cancel" ? "Processando..." : "Cancelar assinatura"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
