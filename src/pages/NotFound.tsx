import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 — rota inexistente:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary-soft text-primary">
          <PackageX className="h-8 w-8" />
        </div>
        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Erro 404 · DevoluçõesPro
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Página não encontrada
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A rota <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{location.pathname}</code> não existe.
          Verifique o link ou volte para a fila de devoluções.
        </p>
        <Button asChild className="mt-6">
          <Link to="/registrar">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao início
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
