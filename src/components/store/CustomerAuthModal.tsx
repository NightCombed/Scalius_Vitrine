import { useState } from "react";
import { Eye, EyeOff, Loader2, User, LogIn } from "lucide-react";
import { toast } from "sonner";

import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CustomerAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  /** Pre-fill email (e.g. from checkout) */
  defaultEmail?: string;
  /** Pre-fill name (e.g. from checkout) */
  defaultName?: string;
  /** Called after successful auth */
  onSuccess?: () => void;
  /** Start on "register" or "login" tab */
  defaultTab?: "register" | "login";
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ caracteres", ok: password.length >= 8 },
    { label: "Maiúscula", ok: /[A-Z]/.test(password) },
    { label: "Número", ok: /\d/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const colors = ["bg-destructive", "bg-amber-400", "bg-emerald-400", "bg-emerald-500"];
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score] : "bg-muted"}`}
          />
        ))}
      </div>
      <div className="flex gap-3">
        {checks.map((c) => (
          <span key={c.label} className={`text-xs ${c.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
            {c.ok ? "✓" : "○"} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CustomerAuthModal({
  open,
  onOpenChange,
  storeId,
  defaultEmail = "",
  defaultName = "",
  onSuccess,
  defaultTab = "register",
}: CustomerAuthModalProps) {
  const { register, login } = useCustomerAuth();
  const [tab, setTab] = useState<"register" | "login">(defaultTab);
  const [isLoading, setIsLoading] = useState(false);

  // Register form
  const [regName, setRegName] = useState(defaultName);
  const [regEmail, setRegEmail] = useState(defaultEmail);
  const [regPass, setRegPass] = useState("");
  const [regPassConfirm, setRegPassConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState(defaultEmail);
  const [loginPass, setLoginPass] = useState("");
  const [showLoginPass, setShowLoginPass] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPass !== regPassConfirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setIsLoading(true);
    try {
      await register({ store_id: storeId, email: regEmail, password: regPass, full_name: regName });
      toast.success(`Bem-vindo${regName ? `, ${regName.split(" ")[0]}` : ""}! 🎉`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar conta.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await login({ store_id: storeId, email: loginEmail, password: loginPass });
      const name = result.customer.full_name?.split(" ")[0] || "";
      toast.success(`Bem-vindo de volta${name ? `, ${name}` : ""}! 👋`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message ?? "Email ou senha incorretos.");
    } finally {
      setIsLoading(false);
    }
  };

  const passOk = regPass.length >= 8;
  const confirmOk = regPass === regPassConfirm && regPassConfirm.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {tab === "register" ? "Criar conta" : "Entrar na conta"}
          </DialogTitle>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium mb-1">
          <button
            type="button"
            onClick={() => setTab("register")}
            className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors ${
              tab === "register"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <User className="h-3.5 w-3.5" /> Criar conta
          </button>
          <button
            type="button"
            onClick={() => setTab("login")}
            className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors ${
              tab === "login"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <LogIn className="h-3.5 w-3.5" /> Entrar
          </button>
        </div>

        {/* ── REGISTER ─────────────────────────────────────────── */}
        {tab === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-name">Nome completo</Label>
              <Input
                id="reg-name"
                placeholder="Seu nome"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                autoComplete="name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email *</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="seu@email.com"
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-pass">Senha *</Label>
              <div className="relative">
                <Input
                  id="reg-pass"
                  type={showPass ? "text" : "password"}
                  placeholder="Mínimo 8 caracteres"
                  required
                  value={regPass}
                  onChange={(e) => setRegPass(e.target.value)}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {regPass && <PasswordStrength password={regPass} />}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-pass-confirm">Confirmar senha *</Label>
              <Input
                id="reg-pass-confirm"
                type={showPass ? "text" : "password"}
                placeholder="Repita a senha"
                required
                value={regPassConfirm}
                onChange={(e) => setRegPassConfirm(e.target.value)}
                autoComplete="new-password"
                className={regPassConfirm && !confirmOk ? "border-destructive" : ""}
              />
              {regPassConfirm && !confirmOk && (
                <p className="text-xs text-destructive">As senhas não coincidem.</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !passOk || (regPassConfirm.length > 0 && !confirmOk)}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar conta
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Já tem conta?{" "}
              <button type="button" onClick={() => setTab("login")} className="underline text-foreground">
                Entrar
              </button>
            </p>
          </form>
        )}

        {/* ── LOGIN ────────────────────────────────────────────── */}
        {tab === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="seu@email.com"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-pass">Senha</Label>
              <div className="relative">
                <Input
                  id="login-pass"
                  type={showLoginPass ? "text" : "password"}
                  placeholder="Sua senha"
                  required
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showLoginPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Entrar
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Não tem conta?{" "}
              <button type="button" onClick={() => setTab("register")} className="underline text-foreground">
                Criar conta
              </button>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
