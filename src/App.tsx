import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { UserProfile } from "./types";
import LoginForm from "./components/LoginForm";
import ClientDashboard from "./components/ClientDashboard";
import Admin2FA from "./components/Admin2FA";
import AdminPanel from "./components/AdminPanel";
import { Loader2, GraduationCap, Sparkles, LogIn, Lock } from "lucide-react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [admin2FAVerified, setAdmin2FAVerified] = useState(false);

  // LGPD Banner and Modals states
  const [showLgpdBanner, setShowLgpdBanner] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("lgpd_consent_accepted");
    if (!consent) {
      // Show LGPD consent banner if not dismissed yet
      const timer = setTimeout(() => {
        setShowLgpdBanner(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptLgpd = () => {
    localStorage.setItem("lgpd_consent_accepted", "true");
    setShowLgpdBanner(false);
  };

  // App Settings State
  const [settings, setSettings] = useState({
    pixKey: "formaturapix@suaformatura.com",
    bankName: "Banco Central",
    receiverName: "Comissão de Formatura Integrada",
    expirationHours: 24,
    supportContact: "51999999999",
    rulesText: "Os bilhetes reservados têm prazo de validade. Caso a transferência via PIX não seja comprovada, a cota retornará à disponibilidade geral automaticamente.",
  });

  // Load dynamically controlled settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (d) => {
      if (d.exists()) {
        setSettings(d.data() as any);
      }
    });
    return () => unsub();
  }, []);

  // Authenticated state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);

        // Check if admin email matches exactly
        if (firebaseUser.email === "tio.chico.nh@gmail.com") {
          // Admin triggers 2FA check
          setLoading(false);
          return;
        }

        // Regular clients look up profile shape
        try {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const docSnap = await getDoc(userDocRef);

          if (docSnap.exists()) {
            const profileData = docSnap.data() as UserProfile;
            if (profileData.isBlocked) {
              alert("Sua conta está suspensa ou bloqueada pelo administrador do sistema. Entre em contato para mais detalhes.");
              await signOut(auth);
              setProfile(null);
              setUser(null);
              setLoading(false);
              return;
            }
            setProfile(profileData);
          } else {
            setProfile(null); // Triggers "Completar Cadastro" screen
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
        setAdmin2FAVerified(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = async (loggedInUser: User) => {
    setUser(loggedInUser);
    setLoading(true);

    if (loggedInUser.email === "tio.chico.nh@gmail.com") {
      setLoading(false);
      return;
    }

    try {
      const userDocRef = doc(db, "users", loggedInUser.uid);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        const profileData = docSnap.data() as UserProfile;
        if (profileData.isBlocked) {
          alert("Sua conta está suspensa ou bloqueada pelo administrador do sistema. Entre em contato para mais detalhes.");
          await signOut(auth);
          setProfile(null);
          setUser(null);
          setLoading(false);
          return;
        }
        setProfile(profileData);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error("Error reading profile following authentication:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setAdmin2FAVerified(false);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-700 font-sans">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
        <p className="font-semibold text-sm">Carregando sistema de rifas...</p>
        <p className="text-xs text-slate-400 mt-1">Conectando ao banco de dados Firebase</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      
      {/* Dynamic top bar highlighting purpose of app */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white py-2 px-4 text-center text-xs font-semibold tracking-wider flex items-center justify-center gap-2 shadow-sm">
        <Sparkles className="w-4 h-4 text-indigo-300 animate-pulse shrink-0" />
        <span>Toda a arrecadação das rifas será destinada ao financiamento da minha <strong>formatura de graduação!</strong></span>
      </div>

      <main className="max-w-7xl mx-auto p-4 md:p-8 shrink-0">
        {!user ? (
          /* Initial Screen: Auth or Register option */
          <div className="py-8">
            <LoginForm onLoginSuccess={handleLoginSuccess} />
          </div>
        ) : (
          /* User is logged in: Check for admin or normal client flow */
          <div className="space-y-6">
            {user.email === "tio.chico.nh@gmail.com" ? (
              /* ADMIN USER FLOW */
              !admin2FAVerified ? (
                /* Admin 2FA challenge */
                <div className="py-12">
                  <Admin2FA
                    userId={user.uid}
                    userEmail={user.email}
                    onVerified={(verified) => setAdmin2FAVerified(verified)}
                    onLogout={handleLogout}
                  />
                </div>
              ) : (
                /* Admin fully verified */
                <AdminPanel onLogout={handleLogout} />
              )
            ) : (
              /* REGULAR CLIENT FLOW */
              profile ? (
                /* Active complete profile - enter raffle cockpit */
                <ClientDashboard userProfile={profile} onLogout={handleLogout} />
              ) : (
                /* Signed-in but needs to complete missing fields */
                <div className="py-8 col-span-12">
                  <LoginForm onLoginSuccess={handleLoginSuccess} initialUser={user} />
                </div>
              )
            )}
          </div>
        )}
      </main>
      


      {/* LGPD Consent Cookie Banner */}
      {showLgpdBanner && (
        <div className="fixed bottom-4 left-4 right-4 md:right-auto md:max-w-md z-50 bg-slate-900 text-white rounded-3xl p-5 md:p-6 shadow-2xl border border-slate-800 flex flex-col gap-4 animate-slideUp select-none">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl shrink-0 border border-indigo-500/10">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-400">Privacidade & LGPD 🇧🇷</h4>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Nós respeitamos a sua privacidade! Coletamos dados básicos (como CPF e WhatsApp) estritamente para segurança, validação de transações e controle das rifas de formatura. Para saber mais, veja nossos{" "}
                <button type="button" onClick={() => setShowTerms(true)} className="text-indigo-400 font-bold hover:underline cursor-pointer">
                  Termos
                </button>{" "}
                e{" "}
                <button type="button" onClick={() => setShowPrivacy(true)} className="text-indigo-400 font-bold hover:underline cursor-pointer">
                  Privacidade
                </button>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end text-[10.5px]">
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="px-3.5 py-2 hover:bg-white/10 rounded-xl font-semibold text-slate-300 transition cursor-pointer"
            >
              Ver Detalhes
            </button>
            <button
              type="button"
              onClick={handleAcceptLgpd}
              className="px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold rounded-xl shadow-md shadow-indigo-600/30 transition cursor-pointer"
            >
              Aceitar Termos
            </button>
          </div>
        </div>
      )}

      {/* Global Terms Modal */}
      {showTerms && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs select-none animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">Termos de Uso</h3>
                  <span className="text-[10px] text-indigo-300 block -mt-0.5 font-bold uppercase tracking-wide">Minha Formatura & Rifa Solidária</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-white text-sm font-extrabold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto flex-1 select-text space-y-4 text-xs md:text-sm text-slate-600 leading-relaxed">
              <h4 className="font-bold text-slate-800 text-sm">1. Introdução e Objetivo do Serviço</h4>
              <p>O presente sistema regulamenta a pré-reserva, controle e verificação beneficente de cotas para a campanha estudantil <strong>Rifa Solidária de Formatura</strong>. Todo o saldo arrecadado reverte estritamente ao financiamento das festividades, diplomas e celebrações formais de formatura do aluno organizador.</p>
              
              <h4 className="font-bold text-slate-800 text-sm">2. Pré-Reserva e Regras de Cancelamento</h4>
              <p>Ao realizar a escolha dos bilhetes, o sistema efetua uma pré-reserva em nome do participante. O participante tem o período estabelecido de tempo (ex: 24h) para efetuar o pagamento correspondente via transferência PIX e enviar a comprovação se necessário. Cotas não validadas ou confirmadas dentro desse prazo serão devolvidas ao estoque livre automaticamente, sem aviso prévio.</p>
              
              <h4 className="font-bold text-slate-800 text-sm">3. Regulação e Identificação dos Participantes</h4>
              <p>Para garantir a isonomia, transparência e cumprimento legal, os participantes devem fornecer dados válidos de identificação pessoal (Nome completo, CPF autêntico, Cidade e WhatsApp). Dados incorretos, incompletos ou fraudulentos acarretarão a nulidade imediata das cotas selecionadas e o impedimento de retirada de qualquer item ofertado.</p>

              <h4 className="font-bold text-slate-800 text-sm">4. Da Extração e Entrega do Prêmio</h4>
              <p>A extração do número vencedor baseia-se nos prêmios oficiais da Loteria Federal (Caixa Econômica Federal), conforme instruções específicas detalhadas no Regulamento de cada prêmio individualizado.</p>
            </div>
            <div className="bg-slate-50 border-t border-slate-150 p-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                className="bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
              >
                Fechar Termos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Privacy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs select-none animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">Política de Privacidade (LGPD)</h3>
                  <span className="text-[10px] text-emerald-300 block -mt-0.5 font-bold uppercase tracking-wide">Tratamento de Dados Pessoais</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacy(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-white text-sm font-extrabold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto flex-1 select-text space-y-4 text-xs md:text-sm text-slate-605 leading-relaxed">
              <p className="font-semibold text-slate-800">Esta política explica, nos termos da Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/18), como coletamos, armazenamos e protegemos seus dados pessoais de forma transparente.</p>

              <h4 className="font-bold text-slate-800 text-sm">1. Quais dados pessoais são coletados?</h4>
              <p>Tratamos apenas os dados essenciais fornecidos voluntariamente por você ao criar sua conta:</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li><strong>Nome Completo:</strong> Para individualizar o participante das cotas.</li>
                <li><strong>E-mail:</strong> Para autenticação do seu painel e comunicação de avisos.</li>
                <li><strong>CPF (Cadastro de Pessoas Físicas):</strong> Utilizado estritamente para a finalidade de validação unívoca do ganhador de sorteio beneficente, mitigação de fraudes de reservas falsas e prevenção a prejuízos operacionais.</li>
                <li><strong>Telefone (WhatsApp):</strong> Para contato urgente em caso de expiração iminente da cota reservada ou confirmação do envio do PIX.</li>
                <li><strong>Cidade e Estado:</strong> Dados geográficos genéricos para relatórios operacionais do sorteio.</li>
              </ul>

              <h4 className="font-bold text-slate-800 text-sm">2. Segurança e Tecnologia de Armazenamento</h4>
              <p>Seus dados pessoais coletados são armazenados em nuvem sob o serviço de alto desempenho **Google Firebase (Firestore e Authentication)**, contando com camadas rigorosas de segurança, controle de acessos (Security Rules) e autenticação emcriptada.</p>

              <h4 className="font-bold text-slate-800 text-sm">3. Prazo de Retenção</h4>
              <p>Os seus dados permanecem armazenados pelo tempo de existência da campanha e auditoria das extrações correspondentes, ou até que você solicite formalmente a exclusão da sua conta, exercendo seu Direito ao Esquecimento físico.</p>

              <h4 className="font-bold text-slate-800 text-sm">4. Direitos do Titular (Art. 18 LGPD)</h4>
              <p>Como titular dos dados, você pode acessar e auditar seus dados ou solicitar a exclusão total de sua conta a qualquer momento direto pelo painel de controle do usuário.</p>
            </div>
            <div className="bg-slate-50 border-t border-slate-150 p-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPrivacy(false)}
                className="bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
              >
                Entendi, Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
