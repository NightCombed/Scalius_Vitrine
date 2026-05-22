import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * OAuth callback page for Mercado Pago.
 * URL: /admin/oauth/mercadopago/callback?code=...&state=...
 *
 * Flow:
 * 1. Validate CSRF state from sessionStorage
 * 2. Send code + store_id to Edge Function (server-side token exchange)
 * 3. Edge Function stores tokens in Supabase Vault
 * 4. Redirect back to /admin/configuracoes
 */
export default function MercadoPagoCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const ran = useRef(false); // prevent double-execution in React StrictMode

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCallback() {
    const code = params.get("code");
    const state = params.get("state");
    const mpError = params.get("error");

    // User cancelled authorization
    if (mpError) {
      setStatus("error");
      setErrorMsg("Autorização cancelada pelo usuário.");
      return;
    }

    // Missing params
    if (!code || !state) {
      setStatus("error");
      setErrorMsg("Parâmetros inválidos no retorno do Mercado Pago.");
      return;
    }

    // CSRF check
    const savedState = sessionStorage.getItem("mp_oauth_state");
    const storeId = sessionStorage.getItem("mp_oauth_store_id");

    if (!savedState || state !== savedState) {
      setStatus("error");
      setErrorMsg("Falha na verificação de segurança (state inválido). Tente novamente.");
      return;
    }
    if (!storeId) {
      setStatus("error");
      setErrorMsg("ID da loja não encontrado. Volte e tente novamente.");
      return;
    }

    // Clean up sessionStorage
    sessionStorage.removeItem("mp_oauth_state");
    sessionStorage.removeItem("mp_oauth_store_id");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setStatus("error");
        setErrorMsg("Sessão expirada. Faça login novamente.");
        return;
      }

      const { data: result, error: funcError } = await supabase.functions.invoke(
        "mercadopago-oauth",
        {
          body: {
            action: "exchange",
            code,
            store_id: storeId,
            state,
            redirect_uri: window.location.origin + window.location.pathname,
          },
        }
      );

      if (funcError) {
        throw new Error(funcError.message || "Erro na função do servidor");
      }

      setStatus("success");
      toast.success("Mercado Pago conectado!", {
        description: "Pix automático com QR Code já está ativo na sua loja.",
        duration: 6000,
      });

      // Força um recarregamento completo da página para limpar o cache do React Query
      setTimeout(() => {
        window.location.href = "/admin/configuracoes";
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      setStatus("error");
      setErrorMsg(message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card shadow-lg p-8 space-y-6 text-center">
        {status === "loading" && (
          <>
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="font-serif text-2xl">Conectando ao Mercado Pago</h1>
              <p className="text-muted-foreground text-sm">
                Trocando o código de autorização pelos tokens de acesso…
              </p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-emerald-100 dark:bg-emerald-950">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="font-serif text-2xl">Conexão bem-sucedida!</h1>
              <p className="text-muted-foreground text-sm">
                Sua conta Mercado Pago foi vinculada com segurança. Redirecionando…
              </p>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-destructive/10">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="font-serif text-2xl">Falha na conexão</h1>
              <p className="text-muted-foreground text-sm">{errorMsg}</p>
            </div>
            <Button
              onClick={() => navigate("/admin/configuracoes")}
              variant="outline"
              className="w-full"
            >
              Voltar às configurações
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
