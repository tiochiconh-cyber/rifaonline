import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { UserProfile } from "./types";
import LoginForm from "./components/LoginForm";
import ClientDashboard from "./components/ClientDashboard";
import Admin2FA from "./components/Admin2FA";
import AdminPanel from "./components/AdminPanel";
import AppLogo from "./components/AppLogo";
import { Loader2, GraduationCap, Sparkles, LogIn, LogOut, Lock, BookOpen, Clock, ShieldCheck, Trophy, AlertCircle, DollarSign, Calendar } from "lucide-react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [admin2FAVerified, setAdmin2FAVerified] = useState(false);

  // LGPD Banner, Modals and Rules states
  const [showLgpdBanner, setShowLgpdBanner] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

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
    pixKey: "contato@rifadochiquinho.com.br",
    bankName: "Banco Central",
    receiverName: "Apoio Rifa do Chiquinho",
    expirationHours: 24,
    supportContact: "51999999999",
    supportEmail: "contato@rifadochiquinho.com.br",
    rulesText: "Os bilhetes reservados têm prazo de validade. Caso a transferência via PIX não seja comprovada, a cota retornará à disponibilidade geral automaticamente.",
    salesSuspensionBlocked: false,
  });

  // Load dynamically controlled settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (d) => {
      if (d.exists()) {
        const data = d.data();
        setSettings(prev => ({
          ...prev,
          ...data,
          vipWhatsAppUrl: data.vipWhatsAppUrl || "https://chat.whatsapp.com/Fc7S4ayw2KrAGru9t76eH8"
        }));
      }
    });
    return () => unsub();
  }, []);

  // Authenticated state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        setUser(null);
        setProfile(null);
        setAdmin2FAVerified(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time user profile listener (to detect blocks/suspensions instantly)
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    // Static Admin Profile Definition
    if (user.email === "tio.chico.nh@gmail.com") {
      setProfile({
        uid: user.uid,
        name: "Administrador",
        email: user.email,
        cpf: "000.000.000-00",
        phone: "(00) 00000-0000",
        city: "Administração",
        role: "admin",
        isBlocked: false,
      });
      return;
    }

    // Sync other clients in real-time
    const userDocRef = doc(db, "users", user.uid);
    const unsubscribeProfile = onSnapshot(userDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const profileData = docSnap.data() as UserProfile;
        if (profileData.isBlocked) {
          alert("Sua conta está suspensa ou bloqueada pelo administrador do sistema. Entre em contato para mais detalhes.");
          await signOut(auth);
          setProfile(null);
          setUser(null);
          return;
        }

        // Auto-activates VIP for Adriana Cerveira (Adriana Cerveira, CPF 624.499.400-06, Tel: 51 98436-0158)
        const rawCpf = profileData.cpf ? profileData.cpf.replace(/\D/g, "") : "";
        const rawPhone = profileData.phone ? profileData.phone.replace(/\D/g, "") : "";
        const nameLower = profileData.name ? profileData.name.toLowerCase() : "";

        const isAdriana = 
          rawCpf === "62449940006" || 
          rawPhone === "51984360158" || 
          (nameLower.includes("adriana") && nameLower.includes("cerveira"));

        if (isAdriana && !profileData.isVip) {
          console.log(`Auto-activating VIP for Adriana Cerveira (${user.uid})...`);
          try {
            await updateDoc(userDocRef, { isVip: true });
            profileData.isVip = true;
          } catch (err) {
            console.error("Error auto-activating VIP for Adriana:", err);
          }
        }

        setProfile(profileData);
      } else {
        setProfile(null); // Triggers "Completar Cadastro" screen
      }
    }, (err) => {
      console.error("Error listening to user profile:", err);
    });

    return () => unsubscribeProfile();
  }, [user]);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
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

      {/* Modern, elegant main branding and regulations navbar header */}
      <header className="max-w-7xl mx-auto px-4 md:px-8 pt-4 md:pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200/60 pb-4">
        <div className="flex items-center gap-3">
          <AppLogo settings={settings} size="lg" className="ring-1 ring-indigo-500/20 shadow-md" />
          <div>
            <h1 className="font-black text-lg text-slate-800 tracking-tight">
              Rifas de Formatura
            </h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Apoie meu sonho de colar grau! 🎓
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5" id="header-support-contact-email-container">
              <span>Contato: </span>
              <a 
                href={`mailto:${settings.supportEmail || "contato@rifadochiquinho.com.br"}`} 
                className="text-indigo-600 hover:underline font-semibold transition-colors"
                id="header-support-contact-email"
              >
                {settings.supportEmail || "contato@rifadochiquinho.com.br"}
              </a>
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-2">
          {profile && (
            <div className="flex flex-col text-right mr-1.5 bg-indigo-50/50 px-3 py-1.5 rounded-xl border border-indigo-100/40">
              <span className="text-xs font-black text-indigo-900 leading-none">{profile.name}</span>
              <span className="text-[9px] text-slate-500 font-bold mt-0.5 font-mono">CPF: {profile.cpf}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="flex items-center gap-1.5 px-3.5 md:px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-700 font-extrabold text-xs rounded-xl shadow-xs border border-indigo-150 transition cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>Regulamento</span>
          </button>
          
          {user && (
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-750 font-extrabold text-xs rounded-xl shadow-xs border border-slate-200 transition cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-650 animate-pulse" />
              <span className="hidden sm:inline">Meus Dados</span>
            </button>
          )}

          {!user ? (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 px-4 md:px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-650 hover:from-indigo-600 hover:to-indigo-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md border border-indigo-500/10 transition cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Entrar / Cadastrar ✅</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 font-extrabold text-xs rounded-xl shadow-xs border border-rose-150 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto shrink-0 p-2 md:p-4 lg:p-6">
        {!user ? (
          /* GUEST VISITOR FLOW: Render main client dashboard with null user profile support */
          <ClientDashboard 
            userProfile={null} 
            onLogout={handleLogout} 
            onPromptLogin={() => setShowAuthModal(true)} 
          />
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
                <ClientDashboard 
                  userProfile={profile} 
                  onLogout={handleLogout} 
                  onPromptLogin={() => setShowAuthModal(true)} 
                />
              ) : (
                /* Signed-in but needs to complete missing fields */
                <div className="py-8 col-span-12 max-w-4xl lg:max-w-5xl mx-auto w-full">
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
              <p>Seus dados pessoais coletados são armazenados em nuvem sob o serviço de alto desempenho <strong>Google Firebase (Firestore e Authentication)</strong>, contando com camadas rigorosas de segurança, controle de acessos (Security Rules) e criptografia de ponta.</p>

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

      {/* Global Rules / Regulation Modal - Formatação Avançada e Prêmio */}
      {showRules && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md select-none animate-fadeIn">
          <div className="bg-slate-50 rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200/50 flex flex-col max-h-[85vh]">
            
            {/* Modal Header Premium */}
            <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-indigo-800 px-6 md:px-8 py-6 text-white flex items-center justify-between relative overflow-hidden">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 w-44 h-44 bg-indigo-500/10 rounded-full blur-2xl" />
              <div className="absolute left-1/3 bottom-0 w-32 h-32 bg-indigo-600/10 rounded-full blur-xl" />
              
              <div className="flex items-center gap-4 relative z-10">
                <div className="p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-inner text-indigo-300">
                  <BookOpen className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <h3 className="font-black text-lg md:text-xl tracking-tight text-white flex items-center gap-2">
                    Regulamento Oficial
                    <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                  </h3>
                  <span className="text-[10px] text-indigo-200 block mt-0.5 font-extrabold uppercase tracking-widest">
                    Diretrizes de transparência e apoio beneficente
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 active:scale-90 transition flex items-center justify-center text-white text-base font-extrabold cursor-pointer border border-white/10 relative z-10"
              >
                ✕
              </button>
            </div>

            {/* Modal Content Elegant */}
            <div className="p-6 md:p-8 overflow-y-auto flex-1 select-text space-y-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              
              {/* Propósito Solidário Card */}
              <div className="p-5 bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-150/70 rounded-2xl relative overflow-hidden shadow-xs">
                <div className="absolute top-0 right-0 p-3 text-indigo-300 opacity-20 pointer-events-none">
                  <GraduationCap className="w-16 h-16" />
                </div>
                <div className="flex items-start gap-3.5 relative z-10">
                  <span className="text-2xl mt-0.5 select-none font-sans">🎓</span>
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-indigo-950 text-xs uppercase tracking-widest">Propósito Social Beneficente</h4>
                    <p className="text-xs text-indigo-900 leading-relaxed font-medium">
                      Esta é uma iniciativa inteiramente beneficente e de cunho privado. Toda a arrecadação obtida através da aquisição dos bilhetes será 100% destinada ao custeio de taxas administrativas, materiais didáticos e solenidades da minha <strong>formatura de graduação</strong>. Ao adquirir um bilhete, você torna-se um apoiador desse sonho acadêmico!
                    </p>
                  </div>
                </div>
              </div>

              {/* Steps/Rules Grid & Cards */}
              <div className="space-y-4">
                <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3 block">Regras de participação passo a passo:</h5>
                
                <div className="grid grid-cols-1 gap-4">
                  
                  {/* Step 1 */}
                  <div className="flex gap-4 p-4.5 bg-white border border-slate-150 hover:border-slate-250 transition-all duration-200 rounded-2xl shadow-xs group">
                    <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-1.5xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                      <DollarSign className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PASSO 1</span>
                        <h4 className="font-extrabold text-slate-800 text-sm">Reserva de Cotas Simples</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        Navegue pela grade de bilhetes ativos na página inicial, selecione seus números desejados e prossiga para a reserva confirmando seus dados cadastrais (nome, CPF e contato ativo).
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-4 p-4.5 bg-white border border-slate-150 hover:border-slate-250 transition-all duration-200 rounded-2xl shadow-xs group">
                    <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-1.5xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center font-bold text-sm shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                      <Clock className="w-5 h-5 text-rose-600" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PASSO 2</span>
                        <h4 className="font-extrabold text-slate-800 text-sm">Prazo de Pagamento via PIX</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        As cotas reservadas deverão ser pagas em até <strong className="text-slate-800 font-extrabold">{settings.expirationHours} horas</strong>. Caso o comprovante ou transferência via PIX não seja registrado ou confirmado dentro deste prazo, o sistema realizará a <strong className="text-rose-600">liberação automática</strong> dos números para a lista de números livres.
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-4 p-4.5 bg-white border border-slate-150 hover:border-slate-250 transition-all duration-200 rounded-2xl shadow-xs group">
                    <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-1.5xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                      <Trophy className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PASSO 3</span>
                        <h4 className="font-extrabold text-slate-800 text-sm">Sorteio Baseado na Loteria Federal</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        A extração e identificação dos bilhetes contemplados são lastreadas de forma auditável e transparente com base nos resultados da <strong className="text-slate-800 font-extrabold">Loteria Federal da Caixa Econômica Federal</strong> na data estipulada em cada campanha.
                      </p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="flex gap-4 p-4.5 bg-white border border-slate-150 hover:border-slate-250 transition-all duration-200 rounded-2xl shadow-xs group">
                    <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-1.5xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                      <ShieldCheck className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PASSO 4</span>
                        <h4 className="font-extrabold text-slate-800 text-sm">Garantias & Identificação Confiável</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        Para o recebimento da premiação, é imprescindível que os dados informados sejam rigorosamente reais e verificáveis. Cadastros intencionalmente falsificados ou com dados incorretos anularão o respectivo herdeiro da cota sorteada.
                      </p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Informative Additional Alert Box */}
              {settings.rulesText && (
                <div className="p-5 bg-amber-50/60 border border-amber-250/60 rounded-2.5xl space-y-2.5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200/5 rounded-full" />
                  <h5 className="font-extrabold text-[10px] text-amber-800 uppercase tracking-widest flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    ⚠️ Notas Importantes & Comunicado:
                  </h5>
                  <div 
                    className="text-xs text-amber-950 leading-relaxed font-semibold font-sans pl-6 border-l-2 border-amber-400 rich-text-content"
                    dangerouslySetInnerHTML={{ __html: settings.rulesText }}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer Elegant */}
            <div className="bg-slate-100 border-t border-slate-200/80 p-4 shrink-0 flex items-center justify-between px-6 md:px-8">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider hidden sm:block">Plataforma Auditada e Confiável</span>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-black text-xs px-8 py-3.5 rounded-2xl transition shadow-md shadow-indigo-600/10 cursor-pointer text-center font-sans uppercase tracking-widest"
              >
                Entendi as Regras
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Floating Auth Modal Popup */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn select-none">
          <div className="relative w-full max-w-4xl lg:max-w-5xl max-h-[92vh] flex flex-col">
            <button 
              type="button"
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 z-[130] w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-850 font-extrabold text-xs flex items-center justify-center cursor-pointer transition-all active:scale-90 shadow-md border border-slate-250/70"
              title="Fechar"
            >
              ✕
            </button>
            <div className="overflow-y-auto rounded-3xl shadow-2xl">
              <LoginForm onLoginSuccess={(loggedInUser) => {
                handleLoginSuccess(loggedInUser);
                setShowAuthModal(false);
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
