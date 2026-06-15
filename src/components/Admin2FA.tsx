import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { generateRandomSecret, verifyTOTP } from "../utils/totp";
import { ShieldAlert, KeyRound, QrCode, Clipboard, Check, ArrowRight, Loader2, RefreshCw, Smartphone } from "lucide-react";

interface Admin2FAProps {
  userId: string;
  userEmail: string;
  onVerified: (verified: boolean) => void;
  onLogout: () => void;
}

export default function Admin2FA({ userId, userEmail, onVerified, onLogout }: Admin2FAProps) {
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const [totpSecret, setTotpSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [userCode, setUserCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetEmailInput, setResetEmailInput] = useState("");

  // Load existing configuration from /admins/{userId}
  useEffect(() => {
    async function checkAdminConfig() {
      try {
        const adminDocRef = doc(db, "admins", userId);
        const docSnap = await getDoc(adminDocRef);

        if (docSnap.exists() && docSnap.data().totpEnabled) {
          setIsConfigured(true);
          setTotpSecret(docSnap.data().totpSecret);
        } else {
          // If not configured, generate a secret for pairing
          setIsConfigured(false);
          const newSecret = generateRandomSecret();
          setTotpSecret(newSecret);
        }
      } catch (err) {
        console.error("Error reading admin 2FA config:", err);
        // Fallback to generating secret if not available or failed
        setIsConfigured(false);
        setTotpSecret(generateRandomSecret());
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      checkAdminConfig();
    }
  }, [userId]);

  const copyToClipboard = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(totpSecret)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => fallbackCopy());
    } else {
      fallbackCopy();
    }
  };

  const fallbackCopy = () => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = totpSecret;
      // Prevent scrolling on iOS
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Fallback copy failed", err);
    }
  };

  const regenerateSecret = () => {
    if (!isConfigured) {
      setTotpSecret(generateRandomSecret());
      setErrorMsg("");
      setUserCode("");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setVerifying(true);

    try {
      const isValid = await verifyTOTP(totpSecret, userCode);

      if (isValid) {
        if (!isConfigured) {
          // First setup: Save the setup to Firestore
          const adminDocRef = doc(db, "admins", userId);
          try {
            await setDoc(adminDocRef, {
              uid: userId,
              totpSecret: totpSecret,
              totpEnabled: true,
            });
          } catch (fsErr) {
            handleFirestoreError(fsErr, OperationType.WRITE, `admins/${userId}`);
          }
        }
        onVerified(true);
      } else {
        setErrorMsg("Código inválido ou fora de sincronia. Dica: verifique se a hora do seu celular está configurada no modo 'Automático' nas configurações do sistema do aparelho.");
      }
    } catch (err) {
      console.error("Error verifying 2FA OTP:", err);
      setErrorMsg("Erro ao processar validação. Tente novamente.");
    } finally {
      setVerifying(false);
    }
  };

  const handleReset2FA = async () => {
    setVerifying(true);
    setErrorMsg("");
    try {
      const adminDocRef = doc(db, "admins", userId);
      const newSecret = generateRandomSecret();
      await setDoc(adminDocRef, {
        uid: userId,
        totpSecret: newSecret,
        totpEnabled: false,
      });
      setIsConfigured(false);
      setTotpSecret(newSecret);
      setUserCode("");
      setShowResetConfirm(false);
      setResetEmailInput("");
    } catch (fsErr) {
      console.error("Error resetting 2FA config:", fsErr);
      setErrorMsg("Erro ao reconfigurar. Tente novamente.");
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-slate-700">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
        <p className="font-medium">Carregando segurança em duas etapas...</p>
      </div>
    );
  }

  // OTPAuth URI to formulate QR Code
  const qrData = `otpauth://totp/RifasFormatura:Admin?secret=${totpSecret}&issuer=RifasFormatura`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

  return (
    <div className="w-full max-w-lg mx-auto bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
      {/* Header section portraying elevated security mood */}
      <div className="bg-slate-900 px-6 py-8 text-white flex flex-col items-center text-center">
        <div className="p-3 bg-indigo-500/15 text-indigo-400 rounded-full mb-3 border border-indigo-500/30">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Painel de Segurança do Administrador</h2>
        <p className="text-slate-400 text-xs mt-1">
          Acesso restrito à equipe de administração
        </p>
      </div>

      <div className="p-6 md:p-8">
        {!isConfigured ? (
          /* Pairing view */
          <div className="space-y-6">
            <div className="p-4 bg-indigo-50 text-indigo-900 rounded-xl border border-indigo-100 text-sm">
              <span className="font-bold">Primeiro Acesso Detectado:</span> Para garantir a segurança dos fundos arrecadados para a sua formatura, a conta do administrador exige autenticação de dois fatores (2FA).
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                <QrCode className="w-4 h-4 text-indigo-600" />
                Passo 1: Escanear o código QR
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Abra seu aplicativo de autenticação (como Google Authenticator, Microsoft Authenticator ou Authy) em seu celular e escaneie o código abaixo:
              </p>

              <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-100 gap-3.5">
                <img
                  src={qrData && qrCodeUrl}
                  alt="QR Code da Segurança 2FA"
                  className="w-48 h-48 border border-white shadow-sm rounded-lg"
                  referrerPolicy="no-referrer"
                />
                
                {/* Mobile setup quick link */}
                <div className="w-full pt-3.5 border-t border-slate-200/60 flex flex-col items-center gap-2">
                  <p className="text-[10px] text-slate-500 font-semibold text-center leading-normal">
                    Está acessando pelo próprio celular? Toque abaixo para abrir e configurar de forma automática no seu app autenticador sem precisar escanear:
                  </p>
                  <a
                    href={qrData}
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-indigo-650 hover:bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all hover:shadow cursor-pointer select-none text-center"
                  >
                    <Smartphone className="w-4 h-4 shrink-0 animate-bounce" />
                    <span>Conectar no App deste Celular</span>
                  </a>
                </div>
              </div>

              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2 mt-6">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                Ou insira a chave manualmente
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Caso prefira digitar, use esta chave secreta no seu aplicativo autenticador:
              </p>

              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-sm justify-between pl-3 overflow-hidden">
                <span className="font-semibold text-slate-700 tracking-widest break-all select-all">
                  {totpSecret}
                </span>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition"
                    title="Copiar para o clipboard"
                  >
                    {copied ? <Check className="w-4 h-4 text-indigo-600" /> : <Clipboard className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={regenerateSecret}
                    className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition"
                    title="Gerar nova chave"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Login code prompt check */
          <div className="space-y-4">
            <p className="text-slate-600 text-sm text-center leading-relaxed">
              Abra o aplicativo autenticador do seu celular e digite o código temporário de 6 dígitos para entrar no painel de administração da formatura.
            </p>
          </div>
        )}

        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <div>
            <label htmlFor="totpCode" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Código Autenticador (6 dígitos)
            </label>
            <input
              id="totpCode"
              type="tel"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              required
              value={userCode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setUserCode(val);
                setErrorMsg("");
              }}
              className="w-full text-center text-2xl font-bold tracking-[0.4em] py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono"
              autoFocus
            />
          </div>

          {errorMsg && (
            <p className="text-red-600 text-xs text-center border border-red-100 bg-red-50 p-2.5 rounded-lg leading-relaxed">
              {errorMsg}
            </p>
          )}

          {isConfigured && (
            <div className="text-center pt-2">
              {!showResetConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="text-xs text-slate-500 hover:text-indigo-600 font-medium underline transition cursor-pointer"
                >
                  Perdeu acesso ao celular? Redefinir autenticador 2FA
                </button>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-left">
                  <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                    🔁 Redefinir configuração do Autenticador 2FA?
                  </p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Esta ação irá invalidar o código atual do celular e abrirá a tela inicial de pareamento com um novo código QR.
                  </p>
                  <p className="text-[10px] text-slate-400 italic leading-relaxed">
                    Nota: O seu e-mail de administrador deve ser digitado abaixo para autorizar esta alteração crítica de segurança.
                  </p>
                  
                  <div className="space-y-1.5 pt-1.5 border-t border-slate-200/60">
                    <label htmlFor="resetEmailInput" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Digite o seu e-mail de administrador para confirmar:
                    </label>
                    <input
                      id="resetEmailInput"
                      type="text"
                      className="w-full bg-white px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs placeholder-slate-400 font-mono focus:ring-1 focus:ring-red-500 focus:outline-none"
                      placeholder="e-mail cadastrado"
                      value={resetEmailInput}
                      onChange={(e) => setResetEmailInput(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={() => {
                        setShowResetConfirm(false);
                        setResetEmailInput("");
                      }}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={verifying || resetEmailInput.trim().toLowerCase() !== userEmail.trim().toLowerCase()}
                      onClick={handleReset2FA}
                      className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Confirmar e Redefinir
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onLogout}
              className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 rounded-xl hover:shadow transition-all text-sm text-center cursor-pointer"
            >
              Sair
            </button>
            <button
              type="submit"
              disabled={verifying || userCode.length !== 6}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl hover:shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  {isConfigured ? "Entrar no Painel" : "Validar e Ativar 2FA"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
