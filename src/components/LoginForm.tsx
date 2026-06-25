import React, { useState } from "react";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, query, where, limit, onSnapshot } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";
import { validateCPF, formatCPF, formatPhone, validatePhone, maskWinnerName } from "../utils/validation";
import { 
  GraduationCap, 
  ShieldCheck, 
  Mail, 
  MapPin, 
  Phone, 
  User as UserIcon, 
  ArrowRight, 
  Sparkles, 
  Building2, 
  Ticket, 
  Lock,
  Trophy,
  Gift,
  Coins,
  Heart,
  Clock,
  ChevronLeft,
  ChevronRight,
  LogIn,
  UserPlus,
  HelpCircle,
  AlertCircle,
  XCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AppLogo from "./AppLogo";

interface LoginFormProps {
  onLoginSuccess: (user: User) => void;
  initialUser?: User | null;
}

export default function LoginForm({ onLoginSuccess, initialUser = null }: LoginFormProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser);
  const [showRegisterForm, setShowRegisterForm] = useState(!!initialUser);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Secret Google Login bypass password check states
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [secretPassword, setSecretPassword] = useState("");
  const [secretError, setSecretError] = useState("");

  // Authentication & Profile states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(initialUser?.displayName || "");
  const [cpf, setCpf] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState("");

  // Real-time evaluation of validations
  const cleanCpfDigits = cpf.replace(/\D/g, "");
  const isCpfValid = cleanCpfDigits.length === 0 ? null : validateCPF(cleanCpfDigits);
  const cleanPhoneDigits = phone.replace(/\D/g, "");
  const isPhoneValid = cleanPhoneDigits.length === 0 ? null : validatePhone(phone);

  // Quick Login & Registration states
  const [loginMethod, setLoginMethod] = useState<"quick" | "traditional">("quick");
  const [quickCpf, setQuickCpf] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickRegisterMode, setQuickRegisterMode] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickCity, setQuickCity] = useState("");
  const [quickLgpdAgree, setQuickLgpdAgree] = useState(false);

  const cleanQuickCpfDigits = quickCpf.replace(/\D/g, "");
  const isQuickCpfValid = cleanQuickCpfDigits.length === 0 ? null : validateCPF(cleanQuickCpfDigits);
  const cleanQuickPhoneDigits = quickPhone.replace(/\D/g, "");
  const isQuickPhoneValid = cleanQuickPhoneDigits.length === 0 ? null : validatePhone(quickPhone);

  // LGPD Compliance hooks
  const [lgpdAgree, setLgpdAgree] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Dynamic slideshow states & effects
  const [slides, setSlides] = useState<any[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slidesLoading, setSlidesLoading] = useState(true);

  const [settings, setSettings] = useState<any>({
    logoUrl: "",
    logoBase64: ""
  });

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (d) => {
      if (d.exists()) {
        setSettings(d.data());
      }
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    let active = true;
    const loadSlidesData = async () => {
      try {
        const q = collection(db, "campaigns");
        const querySnapshot = await getDocs(q);
        const campList: any[] = [];
        querySnapshot.forEach((d) => {
          campList.push({ id: d.id, ...d.data() });
        });

        const initialSlides: any[] = [
          {
            type: "story",
            title: "Rifa Solidária de Formatura",
            subtitle: "Financiamento Estudantil",
            description: "Olá, seja muito bem-vindo! Esta plataforma de rifas foi desenvolvida com muito carinho para me ajudar a viabilizar e financiar a realização do meu grande sonho: a colação de grau e celebração de formatura de graduação!",
          }
        ];

        // Filter active/paused campaigns vs drawn campaigns
        const activeCamps = campList.filter(c => c.status === "active" || c.status === "paused");
        const drawnCamps = campList.filter(c => c.status === "drawn");

        // Add Active Campaign slides
        activeCamps.forEach(c => {
          initialSlides.push({
            type: "campaign",
            campaign: c,
            title: c.title,
            subtitle: `Rifa Ativa • R$ ${Number(c.ticketPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            description: c.description ? c.description.replace(/<[^>]*>/g, '').substring(0, 160) + "..." : "Participe adquirindo suas cotas 100% online e acompanhe as extrações baseadas na Loteria Federal!",
          });
        });

        // Fetch winner details securely for drawn campaigns to motivate signups
        const drawnSlides: any[] = [];
        for (const c of drawnCamps) {
          let winnerName = "Apoiador Solidário";
          if (c.winningNumber) {
            try {
              const ticketRef = doc(db, "campaigns", c.id, "tickets", c.winningNumber);
              const ticketSnap = await getDoc(ticketRef);
              if (ticketSnap.exists()) {
                const tData = ticketSnap.data();
                if (tData.buyerName) {
                  winnerName = maskWinnerName(tData.buyerName);
                }
              }
            } catch (tErr) {
              console.error("Error fetching winning ticket details for slide:", tErr);
            }
          }
          drawnSlides.push({
            type: "winner",
            campaign: c,
            title: `🏆 Cota Premiada: ${winnerName}`,
            subtitle: `Sorteio Realizado • Prêmio: ${c.title}`,
            description: `Bilhete contemplado: nº ${c.winningNumber}. Sorteio do concurso nº ${c.federalLotteryDrawId || "Oficial"} realizado em ${c.drawDate ? c.drawDate.split("-").reverse().join("/") : "data recente"}.`,
          });
        }

        initialSlides.push(...drawnSlides);

        if (active) {
          setSlides(initialSlides);
          setSlidesLoading(false);
        }
      } catch (err) {
        console.error("Error loading slideshow campaigns:", err);
        if (active) {
          setSlidesLoading(false);
        }
      }
    };

    loadSlidesData();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5500); // Rotate every 5.5s
    return () => clearInterval(interval);
  }, [slides]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setFormError("");
    const provider = new GoogleAuthProvider();

    try {
      // Use popup login for perfect safety on Sandboxed iFrames
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (user.email === "tio.chico.nh@gmail.com") {
        // Admin user - bypasses normal client profile registration check, routed directly
        onLoginSuccess(user);
        return;
      }

      // Check if user has an existing client profile
      const userDocRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        onLoginSuccess(user);
      } else {
        // First login: show registration completion form
        setCurrentUser(user);
        setName(user.displayName || "");
        setShowRegisterForm(true);
      }
    } catch (err: any) {
      console.error("Login attempt failed:", err);
      if (err.code === "auth/popup-blocked" || err.message?.includes("popup") || err.message?.includes("blocked")) {
        setFormError(
          "⚠️ O navegador bloqueou a janela de login do Google.\n\n" +
          "Isso ocorre por segurança ao rodar o aplicativo de demonstração dentro de um iFrame.\n\n" +
          "Para resolver:\n" +
          "1. Clique no botão \"Abrir em nova aba\" (ícone superior direito do visualizador da aplicação) para liberar o Google completo.\n" +
          "2. Ou utilize o login convencional de E-mail/Senha acima."
        );
      } else {
        setFormError("Não foi possível conectar com o Google. Certifique-se de autorizar popups e tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  const hashString = async (str: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const handleVerifySecret = async () => {
    try {
      const hashed = await hashString(secretPassword);
      if (hashed === "2a337a851d12f199c57f6951fd7ad5f404a0e0c6b4ea93368d1dcda76797c539") {
        setShowSecretModal(false);
        setSecretPassword("");
        setSecretError("");
        handleGoogleLogin();
      } else {
        setSecretError("Senha incorreta. Acesso negado.");
      }
    } catch (err) {
      setSecretError("Erro ao processar validação segura.");
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setResetSuccessMessage("");

    if (!email.trim()) {
      setFormError("Por favor, digite seu endereço de e-mail.");
      return;
    }

    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSuccessMessage("✓ Link de redefinição enviado com sucesso! Verifique sua caixa de entrada e de spam.");
    } catch (err: any) {
      console.error("Password reset failed:", err);
      if (err.code === "auth/user-not-found") {
        setFormError("Nenhum usuário cadastrado com este e-mail.");
      } else if (err.code === "auth/invalid-email") {
        setFormError("O formato do e-mail é inválido.");
      } else {
        setFormError("Não foi possível enviar o e-mail de redefinição. Tente novamente mais tarde.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const cleanCpf = quickCpf.replace(/\D/g, "");
    if (!validateCPF(cleanCpf)) {
      setFormError("CPF inválido. Por favor, digite um CPF válido.");
      return;
    }

    const cleanPhone = quickPhone.replace(/\D/g, "");
    if (!validatePhone(quickPhone)) {
      setFormError("WhatsApp/Celular inválido. Digite um número celular válido com DDD.");
      return;
    }

    setLoading(true);

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("cpf", "==", cleanCpf), limit(5));
      const querySnapshot = await getDocs(q);

      const quickEmail = `${cleanCpf}@quicklogin.com`;
      const quickPassword = `ql_${cleanCpf}_${cleanPhone}`;

      if (querySnapshot.empty) {
        setQuickRegisterMode(true);
        setFormError("⚠️ Cadastro não encontrado para este CPF. Preencha seu Nome e Cidade abaixo para criar uma conta e entrar instantaneamente!");
        setLoading(false);
        return;
      }

      // Look for a matching user profile by phone number (clean match)
      let matchedDoc = null;
      let userData = null;

      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        const storedPhoneClean = (data.phone || "").replace(/\D/g, "");
        const inputPhoneClean = cleanPhone.replace(/\D/g, "");
        if (storedPhoneClean === inputPhoneClean) {
          matchedDoc = docSnap;
          userData = data;
          break;
        }
      }

      if (!matchedDoc || !userData) {
        setFormError("❌ O número de WhatsApp/Celular informado não coincide com o CPF cadastrado.");
        setLoading(false);
        return;
      }

      if (userData.isBlocked) {
        setFormError("⚠️ Esta conta está suspensa ou bloqueada pelo administrador do sistema.");
        setLoading(false);
        return;
      }

      try {
        let authResult;
        try {
          authResult = await signInWithEmailAndPassword(auth, quickEmail, quickPassword);
        } catch (authErr: any) {
          console.log("Quick Auth login failed, checking code", authErr.code);
          if (authErr.code === "auth/user-not-found" || authErr.code === "auth/invalid-credential" || authErr.code === "auth/wrong-password") {
            try {
              authResult = await createUserWithEmailAndPassword(auth, quickEmail, quickPassword);
            } catch (recreateErr: any) {
              console.error("Failed to create quick login user:", recreateErr);
              setFormError("Erro ao sincronizar autenticação. Tente novamente.");
              setLoading(false);
              return;
            }
          } else {
            throw authErr;
          }
        }

        const newUid = authResult.user.uid;

        // Check if we need to copy/migrate the user profile document to the new UID
        const newProfileRef = doc(db, "users", newUid);
        const newProfileSnap = await getDoc(newProfileRef);

        if (!newProfileSnap.exists()) {
          console.log("Creating/migrating user profile to new UID:", newUid);
          const migratedProfile = {
            ...userData,
            uid: newUid,
            email: quickEmail,
            traditionalEmail: userData.email || null,
            migratedFromUid: userData.uid || matchedDoc.id,
            migratedAt: new Date().toISOString(),
          };
          await setDoc(newProfileRef, migratedProfile);
        }

        onLoginSuccess(authResult.user);
      } catch (authErr: any) {
        console.error("Quick Auth login failed:", authErr);
        setFormError("Erro de autenticação. Por favor, verifique seus dados ou tente novamente.");
      }
    } catch (err: any) {
      console.error("Quick login failed:", err);
      setFormError("Erro ao processar login rápido. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!quickLgpdAgree) {
      setFormError("Você precisa aceitar os Termos de Uso e a Política de Privacidade (LGPD) para prosseguir.");
      return;
    }

    if (!quickName.trim()) {
      setFormError("O nome completo é obrigatório.");
      return;
    }

    if (!quickCity.trim()) {
      setFormError("A cidade é obrigatória.");
      return;
    }

    const cleanCpf = quickCpf.replace(/\D/g, "");
    const cleanPhone = quickPhone.replace(/\D/g, "");

    setLoading(true);

    const quickEmail = `${cleanCpf}@quicklogin.com`;
    const quickPassword = `ql_${cleanCpf}_${cleanPhone}`;

    try {
      const usersRef = collection(db, "users");
      const phoneQuery = query(usersRef, where("phone", "==", cleanPhone), limit(1));
      const phoneSnap = await getDocs(phoneQuery);

      if (!phoneSnap.empty) {
        setFormError("Este número de WhatsApp/Celular já está cadastrado no sistema.");
        setLoading(false);
        return;
      }

      const result = await createUserWithEmailAndPassword(auth, quickEmail, quickPassword);
      const newUser = result.user;

      const userData = {
        uid: newUser.uid,
        name: quickName.trim(),
        email: quickEmail,
        cpf: cleanCpf,
        city: quickCity.trim(),
        phone: cleanPhone,
        role: "client" as const,
        createdAt: new Date().toISOString(),
      };

      const userDocRef = doc(db, "users", newUser.uid);
      await setDoc(userDocRef, userData);

      onLoginSuccess(newUser);
    } catch (err: any) {
      console.error("Quick registration failed:", err);
      if (err.code === "auth/email-already-in-use") {
        setFormError("Este CPF já possui uma conta de login rápido ativa.");
      } else {
        try {
          handleFirestoreError(err, OperationType.WRITE, `users`);
        } catch (mappedErr: any) {
          setFormError("Não foi possível salvar os dados do seu cadastro rápido. Tente novamente.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!email.trim() || !password.trim()) {
      setFormError("É necessário preencher o e-mail e a senha.");
      return;
    }

    setLoading(true);

    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      onLoginSuccess(result.user);
    } catch (err: any) {
      console.error("Email login failed:", err);
      if (err.code === "auth/operation-not-allowed") {
        setFormError("O provedor de E-mail e Senha não está ativado no seu projeto Firebase. Por favor, clique abaixo em 'Entrar rapidamente com o Google' ou ative o provedor de E-mail/Senha no Console do Firebase.");
      } else if (
        err.code === "auth/invalid-credential" || 
        err.code === "auth/wrong-password" || 
        err.code === "auth/user-not-found"
      ) {
        setFormError("E-mail ou senha incorretos.");
      } else if (err.code === "auth/invalid-email") {
        setFormError("O formato do e-mail é inválido.");
      } else {
        setFormError("Erro de conexão. Certifique-se de habilitar o login por E-mail e Senha no Console do Firebase.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!lgpdAgree) {
      setFormError("Você precisa aceitar os Termos de Uso e a Política de Privacidade (LGPD) para prosseguir.");
      return;
    }

    if (!email.trim() || !password.trim()) {
      setFormError("O e-mail e a senha são obrigatórios.");
      return;
    }

    if (password.length < 6) {
      setFormError("A senha precisa ter no mínimo 6 caracteres.");
      return;
    }

    if (!name.trim()) {
      setFormError("O nome completo é obrigatório.");
      return;
    }

    const cleanCpf = cpf.replace(/\D/g, "");
    if (!validateCPF(cleanCpf)) {
      setFormError("CPF inválido. Por favor, verifique todos os dígitos do número digitado.");
      return;
    }

    if (!city.trim()) {
      setFormError("A cidade é obrigatória.");
      return;
    }

    const cleanPhone = phone.replace(/\D/g, "");
    if (!validatePhone(phone)) {
      setFormError("WhatsApp/Celular inválido. Digite um número celular válido com DDD no formato (XX) 9XXXX-XXXX.");
      return;
    }

    setLoading(true);

    try {
      // Check for duplicate CPF or Phone Number
      const usersRef = collection(db, "users");
      const cpfQuery = query(usersRef, where("cpf", "==", cleanCpf), limit(1));
      const phoneQuery = query(usersRef, where("phone", "==", cleanPhone), limit(1));

      const [cpfSnap, phoneSnap] = await Promise.all([
        getDocs(cpfQuery),
        getDocs(phoneQuery),
      ]);

      if (!cpfSnap.empty) {
        setFormError("Este CPF já está cadastrado no sistema.");
        setLoading(false);
        return;
      }

      if (!phoneSnap.empty) {
        setFormError("Este número de WhatsApp/Celular já está cadastrado no sistema.");
        setLoading(false);
        return;
      }

      // 1. Create client user credential in Firebase Auth
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const newUser = result.user;

      // 2. Write client profile directly under 'users/{uid}'
      const userData = {
        uid: newUser.uid,
        name: name.trim(),
        email: email.trim(),
        cpf: cleanCpf,
        city: city.trim(),
        phone: cleanPhone,
        role: "client" as const,
        createdAt: new Date().toISOString(),
      };

      const userDocRef = doc(db, "users", newUser.uid);
      await setDoc(userDocRef, userData);

      onLoginSuccess(newUser);
    } catch (err: any) {
      console.error("Email registration failed:", err);
      if (err.code === "auth/operation-not-allowed") {
        setFormError("O provedor de E-mail e Senha não está ativado no seu projeto Firebase. Por favor, faça login utilizando o botão 'Entrar rapidamente com o Google' ou ative o provedor de E-mail e Senha no painel do Firebase.");
      } else if (err.code === "auth/email-already-in-use") {
        setFormError("Este e-mail já está sendo utilizado por outra conta.");
      } else if (err.code === "auth/invalid-email") {
        setFormError("Endereço de e-mail inválido.");
      } else if (err.code === "auth/weak-password") {
        setFormError("Escolha uma senha mais forte.");
      } else {
        try {
          handleFirestoreError(err, OperationType.WRITE, `users`);
        } catch (mappedErr: any) {
          setFormError("Não foi possível salvar os dados do seu cadastro. Tente novamente.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!currentUser) return;

    if (!lgpdAgree) {
      setFormError("Você precisa aceitar os Termos de Uso e a Política de Privacidade (LGPD) para prosseguir.");
      return;
    }

    if (!name.trim()) {
      setFormError("O nome completo é obrigatório.");
      return;
    }

    const cleanCpf = cpf.replace(/\D/g, "");
    if (!validateCPF(cleanCpf)) {
      setFormError("CPF inválido. Por favor, verifique o número digitado.");
      return;
    }

    if (!city.trim()) {
      setFormError("A cidade é obrigatória.");
      return;
    }

    const cleanPhone = phone.replace(/\D/g, "");
    if (!validatePhone(phone)) {
      setFormError("WhatsApp/Celular inválido. Digite um número celular válido com DDD no formato (XX) 9XXXX-XXXX.");
      return;
    }

    setLoading(true);

    try {
      // Check for duplicate CPF or Phone (excluding current user UID)
      const usersRef = collection(db, "users");
      const cpfQuery = query(usersRef, where("cpf", "==", cleanCpf), limit(2));
      const phoneQuery = query(usersRef, where("phone", "==", cleanPhone), limit(2));

      const [cpfSnap, phoneSnap] = await Promise.all([
        getDocs(cpfQuery),
        getDocs(phoneQuery),
      ]);

      const otherUserWithCpf = cpfSnap.docs.find(d => d.id !== currentUser.uid);
      if (otherUserWithCpf) {
        setFormError("Este CPF já está cadastrado no sistema por outro usuário.");
        setLoading(false);
        return;
      }

      const otherUserWithPhone = phoneSnap.docs.find(d => d.id !== currentUser.uid);
      if (otherUserWithPhone) {
        setFormError("Este número de WhatsApp/Celular já está cadastrado no sistema por outro usuário.");
        setLoading(false);
        return;
      }

      const userData = {
        uid: currentUser.uid,
        name: name.trim(),
        email: currentUser.email || "",
        cpf: cleanCpf,
        city: city.trim(),
        phone: cleanPhone,
        role: "client" as const,
        createdAt: new Date().toISOString(),
      };

      const userDocRef = doc(db, "users", currentUser.uid);
      await setDoc(userDocRef, userData);

      onLoginSuccess(currentUser);
    } catch (err: any) {
      console.error("Error completing user profile:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
      } catch (mappedErr: any) {
        setFormError("Erro ao salvar cadastro. Verifique os dados.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRegistration = async () => {
    setLoading(true);
    await signOut(auth);
    setCurrentUser(null);
    setShowRegisterForm(false);
    setFormError("");
    setName("");
    setCpf("");
    setCity("");
    setPhone("");
    setLoading(false);
  };

  return (
    <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 min-h-0 md:min-h-[580px] bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 font-sans">
      
      {/* Branding left panel: Graduation message */}
      <div className="md:col-span-5 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white p-6 sm:p-8 md:p-11 flex flex-col justify-between relative overflow-hidden order-2 md:order-1">
        {/* Subtle decorative background circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl translate-x-12 -translate-y-12"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -translate-x-1/4 translate-y-1/4"></div>
 
        <div className="relative flex items-center gap-3.5 mb-2">
          <AppLogo settings={settings as any} size="lg" className="ring-2 ring-yellow-450 shrink-0" />
          <div>
            <h2 className="text-xl font-black tracking-tight text-amber-400 leading-snug font-sans">Rifa do Chiquinho</h2>
            <p className="text-[10px] text-indigo-300 uppercase font-extrabold tracking-widest leading-none">Campanhas Online</p>
          </div>
        </div>
 
        {/* Dynamic Slideshow Panel */}
        <div className="relative flex-1 flex flex-col justify-between my-4 z-10 min-h-[180px] sm:min-h-[220px] md:min-h-[300px]">
          <AnimatePresence mode="wait">
            {slidesLoading ? (
              <motion.div
                key="loading-skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 py-8 animate-pulse flex-1 flex flex-col justify-center"
              >
                <div className="h-6 w-2/3 bg-white/25 rounded-md"></div>
                <div className="h-4 w-full bg-white/15 rounded-md"></div>
                <div className="h-4 w-5/6 bg-white/15 rounded-md"></div>
              </motion.div>
            ) : slides.length > 0 ? (
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col justify-between h-full flex-1"
              >
                <div className="space-y-4">
                  {/* Category Badge */}
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 border border-white/10 rounded-full text-[10px] font-extrabold uppercase tracking-widest text-indigo-200">
                    {slides[currentSlide].type === "story" && (
                      <>
                        <Heart className="w-3 h-3 text-indigo-300 fill-indigo-300" />
                        <span>Minha Jornada</span>
                      </>
                    )}
                    {slides[currentSlide].type === "campaign" && (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
                        <span>Campanha Ativa</span>
                      </>
                    )}
                    {slides[currentSlide].type === "winner" && (
                      <>
                        <Trophy className="w-3 h-3 text-yellow-400 fill-yellow-400/20" />
                        <span>Premiados!</span>
                      </>
                    )}
                  </div>

                  {/* Slide Main Image (if campaign has one) */}
                  {slides[currentSlide].type === "campaign" && slides[currentSlide].campaign?.imageUrl && (
                    <div className="w-full h-32 rounded-2xl overflow-hidden border border-white/10 relative shadow-inner">
                      <img
                        src={slides[currentSlide].campaign.imageUrl}
                        alt={slides[currentSlide].title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover select-none"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    </div>
                  )}

                  <div className="space-y-1">
                    <h2 className="text-xl md:text-2xl font-black leading-tight tracking-tight text-white">
                      {slides[currentSlide].title}
                    </h2>
                    {slides[currentSlide].subtitle && (
                      <p className="text-indigo-300 text-[10px] font-extrabold font-mono tracking-wider uppercase">
                        {slides[currentSlide].subtitle}
                      </p>
                    )}
                  </div>

                  <p className="text-indigo-100/80 text-xs md:text-sm leading-relaxed font-normal">
                    {slides[currentSlide].description}
                  </p>

                  {/* Slide stats and traction items */}
                  {slides[currentSlide].type === "campaign" && (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="bg-white/5 border border-white/5 p-2.5 rounded-xl flex flex-col gap-1 backdrop-blur-xs">
                        <span className="text-[9px] uppercase tracking-wider text-indigo-300 font-bold">Valor da Cota</span>
                        <div className="flex items-center gap-1.5 font-extrabold text-sm text-yellow-400">
                          <Coins className="w-4 h-4" />
                          <span>R$ {Number(slides[currentSlide].campaign.ticketPrice).toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="bg-white/5 border border-white/5 p-2.5 rounded-xl flex flex-col gap-1 backdrop-blur-xs">
                        <span className="text-[9px] uppercase tracking-wider text-indigo-300 font-bold">Total Bilhetes</span>
                        <div className="flex items-center gap-1.5 font-bold text-sm text-indigo-100">
                          <Ticket className="w-4 h-4 text-indigo-400" />
                          <span>{slides[currentSlide].campaign.totalTickets} {slides[currentSlide].campaign.totalTickets === 100 ? "Centena" : "Milhar"}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {slides[currentSlide].type === "winner" && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-300 font-extrabold uppercase tracking-wider text-[9px]">Cota Extraída</span>
                        <span className="font-mono bg-emerald-500 text-slate-950 text-xs px-2.5 py-0.5 rounded-full font-black">
                          nº {slides[currentSlide].campaign.winningNumber}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-emerald-100/80 leading-normal">
                        <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Sorteado via extração do concurso do prêmio {slides[currentSlide].campaign.title}!</span>
                      </div>
                    </div>
                  )}

                  {slides[currentSlide].type === "story" && (
                    <div className="space-y-2 pt-2 text-[11px] text-slate-305">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span>Rifa 100% online segura e transparente</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span>Resultados vinculados à extração da Loteria Federal</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="text-xs text-indigo-200">Acompanhe nossas campanhas e resultados.</div>
            )}
          </AnimatePresence>
        </div>

        {/* Slideshow dot navigation indicators & Arrow Controls */}
        {!slidesLoading && slides.length > 1 && (
          <div className="flex items-center justify-between gap-2.5 py-2 relative border-t border-white/10 mt-auto">
            <button
              type="button"
              onClick={() => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-white transition-all cursor-pointer border border-white/5"
              title="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex justify-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentSlide(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    i === currentSlide ? "w-6 bg-indigo-400" : "w-1.5 bg-white/20 hover:bg-white/40"
                  }`}
                  title={`Ir para o slide ${i + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-white transition-all cursor-pointer border border-white/5"
              title="Próximo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="text-[10px] text-indigo-100/40 pt-3 border-t border-white/5 mt-4 relative">
          © {new Date().getFullYear()} Campanhas de Formatura. Todos os direitos reservados.
        </div>

        {/* Discreet secret Google trigger in bottom-left */}
        <button
          type="button"
          onClick={() => {
            setSecretPassword("");
            setSecretError("");
            setShowSecretModal(true);
          }}
          className="absolute bottom-2.5 left-2.5 w-6 h-6 rounded-md hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer opacity-15 hover:opacity-100 z-50 text-indigo-200"
          title="Autenticação Oculta"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.6c-.3 1.55-1.15 2.86-2.45 3.75v3.13h3.95c2.3-2.12 3.64-5.25 3.64-8.73z" />
            <path d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.95-3.13c-1.1.74-2.5 1.18-4.01 1.18-3.08 0-5.69-2.08-6.62-4.88H1.31v3.23c2 3.98 6.1 6.6 10.69 6.6z" />
            <path d="M5.38 14.26c-.24-.71-.38-1.47-.38-2.26s.14-1.55.38-2.26V6.51H1.31C.47 8.2.0 10.05.0 12s.47 3.8 1.31 5.49l4.07-3.23z" />
            <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.22.0 12 .0 7.41.0 3.31 2.62 1.31 6.6l4.07 3.23c.93-2.8 3.54-4.88 6.62-4.88z" />
          </svg>
        </button>
      </div>

      {/* Action right panel: Auth choices or Profile Form */}
      <div className="md:col-span-7 p-6 md:p-10 flex flex-col justify-center bg-slate-50 overflow-hidden order-1 md:order-2">
        <AnimatePresence mode="wait">
          {!showRegisterForm ? (
            /* Sign-in + Registration prompt block */
            <motion.div
              key="auth-choices-panel"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="max-w-md mx-auto w-full space-y-5"
            >
              <div className="space-y-1 text-center md:text-left">
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">Participar de Rifas</h2>
                <p className="text-slate-500 text-xs">
                  Para ter acesso às campanhas e reservar seus bilhetes de forma segura.
                </p>
              </div>

              {/* Custom Tabs with visual elegance: two large buttons */}
              <div className="grid grid-cols-2 gap-3.5 select-none">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("login");
                    setFormError("");
                    setShowForgotPassword(false);
                    setResetSuccessMessage("");
                  }}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-4 px-3 rounded-2xl font-black text-[12px] sm:text-xs tracking-wider transition-all duration-150 cursor-pointer ${
                    activeTab === "login"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20 border border-indigo-600 scale-[1.02]"
                      : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-200 hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  <LogIn className={`w-4 h-4 ${activeTab === "login" ? "text-white" : "text-slate-400"}`} />
                  ENTRAR
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("register");
                    setFormError("");
                    setShowForgotPassword(false);
                    setResetSuccessMessage("");
                  }}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-4 px-3 rounded-2xl font-black text-[12px] sm:text-xs tracking-wider transition-all duration-150 cursor-pointer ${
                    activeTab === "register"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20 border border-indigo-600 scale-[1.02]"
                      : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-200 hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  <UserPlus className={`w-4 h-4 ${activeTab === "register" ? "text-white" : "text-slate-400"}`} />
                  CADASTRAR-SE
                </button>
              </div>

              {formError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ 
                    opacity: 1, 
                    scale: 1,
                    x: [0, -10, 10, -10, 10, -5, 5, 0]
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="p-3.5 bg-rose-50 text-rose-800 rounded-2xl border border-rose-150 text-xs leading-relaxed font-semibold whitespace-pre-line flex items-start gap-2.5 shadow-sm shadow-rose-100/50 relative"
                >
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="flex-1 pr-6">
                    {formError}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormError("")}
                    className="absolute top-3 right-3 text-rose-400 hover:text-rose-600 transition p-0.5 rounded-lg hover:bg-rose-100"
                    title="Fechar aviso"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              <AnimatePresence mode="wait">
                {activeTab === "login" ? (
                  showForgotPassword ? (
                    /* FORGOT PASSWORD FORM */
                    <motion.form
                      key="forgot-password-tab"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.2 }}
                      onSubmit={handleForgotPasswordSubmit}
                      className="space-y-4"
                    >
                      <div className="text-slate-650 text-xs leading-relaxed">
                        Digite o e-mail associado à sua conta e enviaremos um link de redefinição de senha para você.
                      </div>

                      {resetSuccessMessage && (
                        <div className="p-3.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 text-xs leading-relaxed font-semibold">
                          {resetSuccessMessage}
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                          Endereço de E-mail
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Mail className="w-4 h-4" />
                          </div>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="pl-9 w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-slate-400 bg-white shadow-sm"
                            placeholder="Ex: seuemail@provedor.com"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-2">
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-xl text-sm shadow hover:shadow-md shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {loading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <>
                              Enviar Link de Recuperação
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            setShowForgotPassword(false);
                            setFormError("");
                            setResetSuccessMessage("");
                          }}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          Voltar para o Login
                        </button>
                      </div>
                    </motion.form>
                  ) : (
                    /* TAB: LOGIN FOR CLIENTS (QUICK BY DEFAULT OR TRADITIONAL) */
                    loginMethod === "quick" ? (
                      /* QUICK LOGIN: CPF + CELULAR */
                      <motion.form
                        key="quick-login-form-tab"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.2 }}
                        onSubmit={quickRegisterMode ? handleQuickRegister : handleQuickLogin}
                        className="space-y-4"
                      >
                        {!quickRegisterMode ? (
                          <>
                            <div className="bg-indigo-50/55 border border-indigo-100/40 p-3 rounded-xl text-slate-750 text-[11px] leading-relaxed font-semibold">
                              ⚡ <strong>Login Rápido:</strong> Digite seu CPF e Celular para acessar sua conta instantaneamente, sem precisar de senha!
                            </div>

                            {/* CPF Input */}
                            <div>
                              <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                                CPF do Titular
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                  <ShieldCheck className={`w-4 h-4 transition-colors duration-200 ${
                                    isQuickCpfValid === true ? "text-emerald-500" : isQuickCpfValid === false ? "text-rose-500" : "text-slate-400"
                                  }`} />
                                </div>
                                <input
                                  type="text"
                                  required
                                  value={quickCpf}
                                  maxLength={14}
                                  onChange={(e) => setQuickCpf(formatCPF(e.target.value))}
                                  className={`pl-9 w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 text-sm placeholder-slate-400 font-mono bg-white transition-all duration-200 ${
                                    isQuickCpfValid === true
                                      ? "border-emerald-500 focus:ring-emerald-500/20 focus:border-emerald-500"
                                      : isQuickCpfValid === false
                                        ? "border-rose-500 focus:ring-rose-500/20 focus:border-rose-500"
                                        : "border-slate-300 focus:ring-indigo-500 focus:border-indigo-500"
                                  }`}
                                  placeholder="000.000.000-00"
                                />
                              </div>
                            </div>

                            {/* Celular Input */}
                            <div>
                              <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                                WhatsApp / Celular
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                  <Phone className={`w-4 h-4 transition-colors duration-200 ${
                                    isQuickPhoneValid === true ? "text-emerald-500" : isQuickPhoneValid === false ? "text-rose-500" : "text-slate-400"
                                  }`} />
                                </div>
                                <input
                                  type="tel"
                                  required
                                  value={quickPhone}
                                  onChange={(e) => setQuickPhone(formatPhone(e.target.value))}
                                  className={`pl-9 w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 text-sm placeholder-slate-400 font-mono bg-white transition-all duration-200 ${
                                    isQuickPhoneValid === true
                                      ? "border-emerald-500 focus:ring-emerald-500/20 focus:border-emerald-500"
                                      : isQuickPhoneValid === false
                                        ? "border-rose-500 focus:ring-rose-500/20 focus:border-rose-500"
                                        : "border-slate-300 focus:ring-indigo-500 focus:border-indigo-500"
                                  }`}
                                  placeholder="(00) 90000-0000"
                                />
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-xl text-sm shadow hover:shadow-md shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              {loading ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <>
                                  Entrar Rapidamente ⚡
                                  <ArrowRight className="w-4 h-4" />
                                </>
                              )}
                            </button>
                          </>
                        ) : (
                          /* QUICK REGISTER MODE */
                          <>
                            <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-xl text-amber-850 text-xs leading-relaxed font-medium">
                              ✨ <strong>Cadastro Simplificado:</strong> Preencha apenas seu nome e cidade para concluir e garantir seus bilhetes!
                            </div>

                            <div className="flex gap-2 justify-center">
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-mono px-2 py-0.5 rounded-md font-bold">CPF: {quickCpf}</span>
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-mono px-2 py-0.5 rounded-md font-bold">Tel: {quickPhone}</span>
                            </div>

                            {/* Full Name */}
                            <div>
                              <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                                Nome Completo
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                  <UserIcon className="w-4 h-4" />
                                </div>
                                <input
                                  type="text"
                                  required
                                  value={quickName}
                                  onChange={(e) => setQuickName(e.target.value)}
                                  className="pl-9 w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 bg-white"
                                  placeholder="Seu nome completo para entrega do prêmio"
                                />
                              </div>
                            </div>

                            {/* City */}
                            <div>
                              <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                                Cidade / UF
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                  <MapPin className="w-4 h-4" />
                                </div>
                                <input
                                  type="text"
                                  required
                                  value={quickCity}
                                  onChange={(e) => setQuickCity(e.target.value)}
                                  className="pl-9 w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 bg-white"
                                  placeholder="Porto Alegre / RS"
                                />
                              </div>
                            </div>

                            {/* LGPD Consent */}
                            <div className="bg-white border border-slate-200 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-slate-650 leading-relaxed shadow-sm select-none">
                              <input
                                type="checkbox"
                                id="quickLgpdAgree"
                                required
                                checked={quickLgpdAgree}
                                onChange={(e) => setQuickLgpdAgree(e.target.checked)}
                                className="mt-0.5 rounded border-slate-300 text-indigo-650 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                              />
                              <label htmlFor="quickLgpdAgree" className="cursor-pointer">
                                Aceito as regras de uso dos meus dados conforme a{" "}
                                <button type="button" onClick={() => setShowTermsModal(true)} className="text-indigo-600 font-bold hover:underline cursor-pointer">
                                  Política de Privacidade
                                </button>{" "}
                                e os{" "}
                                <button type="button" onClick={() => setShowPrivacyModal(true)} className="text-indigo-600 font-bold hover:underline cursor-pointer">
                                  Termos de Uso (LGPD)
                                </button>.
                              </label>
                            </div>

                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-xl text-sm shadow hover:shadow-md shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              {loading ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <>
                                  Concluir Cadastro Rápido e Entrar ✅
                                  <ArrowRight className="w-4 h-4" />
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setQuickRegisterMode(false);
                                setFormError("");
                              }}
                              className="w-full text-xs text-slate-500 hover:text-slate-705 font-bold transition-colors py-1 cursor-pointer"
                            >
                              ← Voltar ao login rápido
                            </button>
                          </>
                        )}

                        <div className="pt-2 border-t border-slate-100 flex justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              setLoginMethod("traditional");
                              setFormError("");
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-extrabold hover:underline transition-colors flex items-center gap-1 py-1"
                          >
                            Entrar com e-mail e senha tradicional
                          </button>
                        </div>
                      </motion.form>
                    ) : (
                      /* TRADITIONAL EMAIL+PASSWORD LOGIN */
                      <motion.form
                        key="traditional-login-form-tab"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.2 }}
                        onSubmit={handleEmailLogin}
                        className="space-y-4"
                      >
                        {/* E-mail Input */}
                        <div>
                          <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                            Endereço de E-mail
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                              <Mail className="w-4 h-4" />
                            </div>
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="pl-9 w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-slate-400 bg-white shadow-sm"
                              placeholder="Ex: seuemail@provedor.com"
                            />
                          </div>
                        </div>

                        {/* Password Input */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                              Sua Senha
                            </label>
                          </div>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                              <Lock className="w-4 h-4" />
                            </div>
                            <input
                              type="password"
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="pl-9 w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-slate-400 bg-white shadow-sm"
                              placeholder="••••••••"
                            />
                          </div>
                          <div className="flex justify-end pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowForgotPassword(true);
                                setFormError("");
                                setResetSuccessMessage("");
                              }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-extrabold hover:underline cursor-pointer transition-colors flex items-center gap-1 py-1"
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                              Esqueceu sua senha? Recuperar acesso
                            </button>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-xl text-sm shadow hover:shadow-md shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {loading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <>
                              Entrar na Conta
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>

                        <div className="pt-2 border-t border-slate-100 flex justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              setLoginMethod("quick");
                              setFormError("");
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-extrabold hover:underline transition-colors flex items-center gap-1 py-1"
                          >
                            Entrar rapidamente com CPF + WhatsApp
                          </button>
                        </div>
                      </motion.form>
                    )
                  )
                ) : (
              /* TAB: REGISTRATION FOR CLIENTS */
              <motion.form
                key="registration-form-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleEmailRegister}
                className="space-y-3.5 max-h-[480px] overflow-y-auto pr-1"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                      Seu E-mail
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 bg-white"
                      placeholder="seuemail@provedor.com"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                      Crie uma Senha
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 bg-white"
                      placeholder="Mínimo 6 chars"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                    Nome Completo
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-9 w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 bg-white"
                      placeholder="Nome completo do comprador"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                    CPF (Necessário para a entrega do prêmio)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <ShieldCheck className={`w-4 h-4 transition-colors duration-200 ${
                        isCpfValid === true ? "text-emerald-500" : isCpfValid === false ? "text-rose-500" : "text-slate-400"
                      }`} />
                    </div>
                    <input
                      type="text"
                      required
                      value={cpf}
                      maxLength={14}
                      onChange={(e) => setCpf(formatCPF(e.target.value))}
                      className={`pl-9 w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 text-sm placeholder-slate-400 font-mono bg-white transition-all duration-200 ${
                        isCpfValid === true
                          ? "border-emerald-500 focus:ring-emerald-500/20 focus:border-emerald-555"
                          : isCpfValid === false
                            ? "border-rose-500 focus:ring-rose-500/20 focus:border-rose-500"
                            : "border-slate-300 focus:ring-indigo-500 focus:border-indigo-500"
                      }`}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  {isCpfValid === false && (
                    <p className="text-[10px] text-rose-600 mt-1 font-semibold">❌ CPF inválido. Verifique os dígitos.</p>
                  )}
                  {isCpfValid === true && (
                    <p className="text-[10px] text-emerald-600 mt-1 font-semibold">✓ CPF validado com sucesso!</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                      Cidade / UF
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="pl-9 w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 bg-white"
                        placeholder="Porto Alegre / RS"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                      WhatsApp / Celular
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Phone className={`w-4 h-4 transition-colors duration-200 ${
                          isPhoneValid === true ? "text-emerald-500" : isPhoneValid === false ? "text-rose-500" : "text-slate-400"
                        }`} />
                      </div>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                        className={`pl-9 w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 text-sm placeholder-slate-400 font-mono bg-white transition-all duration-200 ${
                          isPhoneValid === true
                            ? "border-emerald-500 focus:ring-emerald-500/20 focus:border-emerald-500"
                            : isPhoneValid === false
                              ? "border-rose-500 focus:ring-rose-500/20 focus:border-rose-500"
                              : "border-slate-300 focus:ring-indigo-500 focus:border-indigo-500"
                        }`}
                        placeholder="(00) 90000-0000"
                      />
                    </div>
                    {isPhoneValid === false && (
                      <p className="text-[10px] text-rose-600 mt-1 font-semibold">❌ WhatsApp inválido. Celular com 9 inicial e DDD.</p>
                    )}
                    {isPhoneValid === true && (
                      <p className="text-[10px] text-emerald-600 mt-1 font-semibold">✓ WhatsApp validado!</p>
                    )}
                  </div>
                </div>

                {/* LGPD Consent Checkbox */}
                <div className="bg-white border border-slate-250/60 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-slate-650 leading-relaxed shadow-sm">
                  <input
                    type="checkbox"
                    id="lgpdAgreeEmail"
                    checked={lgpdAgree}
                    onChange={(e) => setLgpdAgree(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 focus:ring-indigo-500 text-indigo-600 cursor-pointer"
                  />
                  <label htmlFor="lgpdAgreeEmail" className="select-none cursor-pointer text-slate-600 font-medium text-[11px]">
                    Declaro que li e concordo com os{" "}
                    <button type="button" onClick={() => setShowTermsModal(true)} className="text-indigo-605 font-bold hover:underline cursor-pointer">
                      Termos de Uso
                    </button>{" "}
                    e com a{" "}
                    <button type="button" onClick={() => setShowPrivacyModal(true)} className="text-indigo-605 font-bold hover:underline cursor-pointer">
                      Política de Privacidade
                    </button>{" "}
                    em total conformidade com a LGPD.
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-xl text-sm shadow hover:shadow-md shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 mt-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      Criar minha Conta e Acessar
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.form>
            )}
            </AnimatePresence>

            <div className="flex items-center gap-2 text-xs text-slate-400 justify-center pt-2">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-[10px] font-semibold text-slate-400">Banco de dados 100% Protegido em conformidade</span>
            </div>
          </motion.div>
        ) : (
          /* Profile completion registration form (typically for first-time Google sign-ins) */
          <motion.div
            key="google-profile-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="max-w-md mx-auto w-full space-y-5"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-indigo-600 font-semibold text-xs tracking-wider uppercase mb-1">
                <Sparkles className="w-4.5 h-4.5" />
                <span>Cadastro complementar</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-800 font-extrabold">Concluir meu Cadastro</h2>
              <p className="text-slate-500 text-xs leading-relaxed">
                Você se autenticou via Google! Para concluir o cadastro e reservar bilhetes, preencha os dados necessários para o controle das campanhas.
              </p>
            </div>

            {formError && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  x: [0, -10, 10, -10, 10, -5, 5, 0]
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="p-3.5 bg-rose-50 text-rose-800 rounded-2xl border border-rose-150 text-xs leading-relaxed font-semibold whitespace-pre-line flex items-start gap-2.5 shadow-sm shadow-rose-100/50 relative"
              >
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="flex-1 pr-6">
                  {formError}
                </div>
                <button
                  type="button"
                  onClick={() => setFormError("")}
                  className="absolute top-3 right-3 text-rose-400 hover:text-rose-600 transition p-0.5 rounded-lg hover:bg-rose-100"
                  title="Fechar aviso"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            <form onSubmit={handleGoogleProfileSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                  Nome Completo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-slate-400 bg-white"
                    placeholder="Seu nome completo"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                  CPF (Importante para validação do ganhador)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <ShieldCheck className={`w-4 h-4 transition-colors duration-200 ${
                      isCpfValid === true ? "text-emerald-500" : isCpfValid === false ? "text-rose-500" : "text-slate-400"
                    }`} />
                  </div>
                  <input
                    type="text"
                    required
                    value={cpf}
                    maxLength={14}
                    onChange={(e) => setCpf(formatCPF(e.target.value))}
                    className={`pl-10 w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 text-sm placeholder-slate-400 font-mono bg-white transition-all duration-200 ${
                      isCpfValid === true
                        ? "border-emerald-500 focus:ring-emerald-500/20 focus:border-emerald-500"
                        : isCpfValid === false
                          ? "border-rose-500 focus:ring-rose-500/20 focus:border-rose-500"
                          : "border-slate-300 focus:ring-indigo-500 focus:border-indigo-500"
                    }`}
                    placeholder="000.000.000-00"
                  />
                </div>
                {isCpfValid === false && (
                  <p className="text-[10px] text-rose-600 mt-1 font-semibold">❌ CPF inválido. Verifique os dígitos.</p>
                )}
                {isCpfValid === true && (
                  <p className="text-[10px] text-emerald-600 mt-1 font-semibold">✓ CPF validado com sucesso!</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                    Cidade / UF
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="pl-10 w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-slate-400 bg-white"
                      placeholder="Ex: Porto Alegre / RS"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
                    Telefone (WhatsApp)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Phone className={`w-4 h-4 transition-colors duration-200 ${
                        isPhoneValid === true ? "text-emerald-500" : isPhoneValid === false ? "text-rose-500" : "text-slate-400"
                      }`} />
                    </div>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                      className={`pl-10 w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 text-sm placeholder-slate-400 font-mono bg-white transition-all duration-200 ${
                        isPhoneValid === true
                          ? "border-emerald-500 focus:ring-emerald-500/20 focus:border-emerald-500"
                          : isPhoneValid === false
                            ? "border-rose-500 focus:ring-rose-500/20 focus:border-rose-500"
                            : "border-slate-300 focus:ring-indigo-500 focus:border-indigo-500"
                      }`}
                      placeholder="(00) 90000-0000"
                    />
                  </div>
                  {isPhoneValid === false && (
                    <p className="text-[10px] text-rose-600 mt-1 font-semibold">❌ WhatsApp inválido. Celular com 9 inicial e DDD.</p>
                  )}
                  {isPhoneValid === true && (
                    <p className="text-[10px] text-emerald-600 mt-1 font-semibold">✓ WhatsApp validado!</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                  E-mail de Contato (Vem do Google)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-300">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    disabled
                    value={currentUser?.email || ""}
                    className="pl-10 w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-100 text-slate-400 text-sm select-none"
                  />
                </div>
              </div>

              {/* LGPD Consent Checkbox */}
              <div className="bg-white border border-slate-250/60 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-slate-650 leading-relaxed shadow-sm">
                <input
                  type="checkbox"
                  id="lgpdAgreeGoogle"
                  checked={lgpdAgree}
                  onChange={(e) => setLgpdAgree(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 focus:ring-indigo-500 text-indigo-600 cursor-pointer"
                />
                <label htmlFor="lgpdAgreeGoogle" className="select-none cursor-pointer text-slate-600 font-medium text-[11px]">
                  Declaro que li e concordo com os{" "}
                  <button type="button" onClick={() => setShowTermsModal(true)} className="text-indigo-605 font-bold hover:underline cursor-pointer">
                    Termos de Uso
                  </button>{" "}
                  e com a{" "}
                  <button type="button" onClick={() => setShowPrivacyModal(true)} className="text-indigo-605 font-bold hover:underline cursor-pointer">
                    Política de Privacidade
                  </button>{" "}
                  em total conformidade com a LGPD.
                </label>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleCancelRegistration}
                  disabled={loading}
                  className="w-1/3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-xl text-sm transition-all cursor-pointer"
                >
                  Sair
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl text-sm shadow hover:shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      Salvar Cadastro
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Dynamic Terms of Use Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs select-none"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
            >
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
                  onClick={() => setShowTermsModal(false)}
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
                  onClick={() => setShowTermsModal(false)}
                  className="bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
                >
                  Fechar Termos
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Privacy Policy Modal */}
      <AnimatePresence>
        {showPrivacyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs select-none"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
            >
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
                  onClick={() => setShowPrivacyModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-white text-sm font-extrabold cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 md:p-8 overflow-y-auto flex-1 select-text space-y-4 text-xs md:text-sm text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-800">Esta política explica, nos termos da Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/18), como coletamos, armazenamos e protegemos seus dados pessoais de forma transparente.</p>

                <h4 className="font-bold text-slate-800 text-sm">1. Quais dados pessoais são coletados?</h4>
                <p>Tratamos apenas os dados essenciais fornecidos voluntariamente por você ao criar sua conta:</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-605">
                  <li><strong>Nome Completo:</strong> Para individualizar o participante das cotas.</li>
                  <li><strong>E-mail:</strong> Para autenticação do seu painel e comunicação de avisos.</li>
                  <li><strong>CPF (Cadastro de Pessoas Físicas):</strong> Utilizado estritamente para a finalidade de validação unívoca do ganhador de sorteio beneficente, mitigação de fraudes de reservas falsas e prevenção a prejuízo operacionais.</li>
                  <li><strong>Telefone (WhatsApp):</strong> Para contato urgente em caso de expiração iminente da cota reservada ou confirmação do envio do PIX.</li>
                  <li><strong>Cidade e Estado:</strong> Dados geográficos genéricos para relatórios operacionais do sorteio.</li>
                </ul>

                <h4 className="font-bold text-slate-800 text-sm">2. Segurança e Tecnologia de Armazenamento</h4>
                <p>Seus dados pessoais coletados são armazenados em nuvem sob o serviço de alto desempenho <strong>Google Firebase (Firestore e Authentication)</strong>, contando com camadas rigorosas de segurança, controle de acessos (Security Rules) e criptografia de ponta.</p>

                <h4 className="font-bold text-slate-800 text-sm">3. Prazo de Retenção</h4>
                <p>Os seus dados permanecem armazenados pelo tempo de existência da campanha e auditoria das extrações correspondentes, ou até que você solicite formalmente a exclusão da sua conta, exercendo seu Direito ao Esquecimento.</p>

                <h4 className="font-bold text-slate-800 text-sm">4. Direitos do Titular (Art. 18 LGPD)</h4>
                <p>Como titular dos dados, você pode exercer gratuitamente os seguintes direitos logado na plataforma:</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-605">
                  <li>Acessar e auditar seus dados pessoais.</li>
                  <li>Exportar seus dados em formato portátil (JSON).</li>
                  <li>Solicitar a revogação do consentimento e exclusão permanente dos seus dados do nosso banco de dados.</li>
                </ul>
              </div>
              <div className="bg-slate-50 border-t border-slate-150 p-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(false)}
                  className="bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
                >
                  Entendi, Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showSecretModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-[100] p-4 font-sans">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-slate-100 space-y-4"
          >
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-indigo-400">Acesso Restrito</h3>
              <p className="text-xs text-slate-400">Insira a chave de liberação secreta para entrar com o Google:</p>
            </div>
            
            <div className="space-y-2">
              <input
                type="password"
                value={secretPassword}
                onChange={(e) => {
                  setSecretPassword(e.target.value);
                  setSecretError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleVerifySecret();
                  }
                }}
                placeholder="Digitar senha..."
                className="w-full text-center tracking-widest font-mono text-xs px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                autoFocus
              />
              {secretError && (
                <p className="text-[11px] text-rose-500 font-medium text-center">{secretError}</p>
              )}
            </div>

            <div className="flex gap-2 text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowSecretModal(false);
                  setSecretPassword("");
                  setSecretError("");
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold transition cursor-pointer text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleVerifySecret}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
