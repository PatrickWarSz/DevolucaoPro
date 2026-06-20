import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, EyeOff, Users, UserPlus, Trash2, LogOut, Copy, Share2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  useCurrentUser,
  listFuncionarios,
  createFuncionario,
  deleteFuncionario,
  revokeFuncionarioSession,
  type Funcionario,
} from "@/lib/account";

export default function FuncionariosPage() {
  const { user, loading } = useCurrentUser();
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [openNew, setOpenNew] = useState(false);
  const [nome, setNome] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<{ name: string; login: string; password: string } | null>(null);

  const reload = async () => {
    if (!user?.workspaceId) return;
    try {
      const list = await listFuncionarios(user.workspaceId);
      // exclui o próprio admin atual da listagem de "funcionários"
      setFuncionarios(list.filter((f) => f.id !== user.userId));
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar funcionários");
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.workspaceId]);

  const inviteText = useMemo(() => {
    if (!credentials) return "";
    return `Olá ${credentials.name}! 👋\n\nSeu acesso ao DevoluçõesPro foi liberado:\n\nLink: https://devolucao.vexodev.com.br\nUsuário: ${credentials.login}\nSenha: ${credentials.password}\n\nGuarde com segurança.`;
  }, [credentials]);

  const resetForm = () => {
    setNome("");
    setUsername("");
    setPassword("");
    setShowPass(false);
  };

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let p = "";
    for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setPassword(p);
    setShowPass(true);
  };

  const handleCreate = async () => {
    if (!user?.workspaceId) return;
    if (!nome.trim() || !username.trim() || !password.trim()) {
      toast.error("Preencha nome, usuário e senha.");
      return;
    }
    setCreating(true);
    const res = await createFuncionario({
      workspaceId: user.workspaceId,
      nome: nome.trim(),
      username: username.trim().toLowerCase(),
      password,
    });
    setCreating(false);
    if (!res.ok) {
      toast.error(res.error || "Falha ao criar funcionário.");
      return;
    }
    setCredentials({
      name: nome.trim(),
      login: res.login || username.trim().toLowerCase(),
      password,
    });
    setOpenNew(false);
    resetForm();
    toast.success("Funcionário criado.");
    await reload();
  };

  const handleRevoke = async (f: Funcionario) => {
    if (!confirm(`Revogar sessão ativa de ${f.nome}? Ele será deslogado.`)) return;
    const res = await revokeFuncionarioSession(f.id);
    if (!res.ok) {
      toast.error(res.error || "Falha ao revogar sessão.");
      return;
    }
    toast.success("Sessão revogada.");
  };

  const handleDelete = async (f: Funcionario) => {
    if (!confirm(`Remover ${f.nome}? Essa ação não pode ser desfeita.`)) return;
    const res = await deleteFuncionario(f.id);
    if (!res.ok) {
      toast.error(res.error || "Falha ao remover.");
      return;
    }
    toast.success("Funcionário removido.");
    await reload();
  };

  if (loading) {
    return <div className="px-4 py-6 text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!user) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        Faça login para acessar funcionários.
      </div>
    );
  }

  if (!user.isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title="Funcionários" />
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <ShieldAlert className="mb-3 h-10 w-10 text-warning" />
          <p className="text-base font-semibold">Acesso restrito ao administrador</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Apenas o titular da conta pode cadastrar ou remover funcionários.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funcionários"
        description="Cadastre acessos para sua equipe. Todo funcionário criado aqui também consegue usar o EstoquePro com o mesmo login."
        right={
          <Button onClick={() => setOpenNew(true)} className="gap-2">
            <UserPlus className="h-4 w-4" /> Novo funcionário
          </Button>
        }
      />

      {funcionarios.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold">Nenhum funcionário cadastrado</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Crie um login para cada operador. Eles entram com acesso total ao app.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {funcionarios.map((f) => (
            <Card key={f.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{f.nome}</p>
                    {!f.ativo && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        DESATIVADO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">@{f.username}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => handleRevoke(f)} className="gap-1.5">
                  <LogOut className="h-3.5 w-3.5" /> Revogar sessão
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(f)}
                  className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal: novo funcionário */}
      <Dialog open={openNew} onOpenChange={(o) => { setOpenNew(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo funcionário</DialogTitle>
            <DialogDescription>
              Acesso total ao app de devoluções. Você poderá compartilhar as credenciais ao final.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Maria Souza" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Usuário</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                  placeholder="maria"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Senha</Label>
                <div className="flex gap-1">
                  <div className="relative flex-1">
                    <Input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={generatePassword}>
                    Gerar
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Criando..." : "Criar funcionário"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: credenciais */}
      <Dialog open={!!credentials} onOpenChange={(o) => !o && setCredentials(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Credenciais criadas</DialogTitle>
            <DialogDescription>
              Compartilhe estas informações. Esta é a única vez que a senha será exibida em texto.
            </DialogDescription>
          </DialogHeader>
          {credentials && (
            <div className="space-y-3">
              <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><span className="text-muted-foreground">Nome:</span> <strong>{credentials.name}</strong></div>
                <div><span className="text-muted-foreground">Link:</span> <code className="text-xs">https://devolucao.vexodev.com.br</code></div>
                <div><span className="text-muted-foreground">Usuário:</span> <code className="font-mono">{credentials.login}</code></div>
                <div><span className="text-muted-foreground">Senha:</span> <code className="font-mono">{credentials.password}</code></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteText);
                    toast.success("Mensagem copiada");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar mensagem
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const url = `https://wa.me/?text=${encodeURIComponent(inviteText)}`;
                    window.open(url, "_blank");
                  }}
                >
                  <Share2 className="h-3.5 w-3.5" /> WhatsApp
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
