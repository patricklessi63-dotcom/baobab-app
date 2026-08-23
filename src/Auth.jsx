import React, { useEffect, useState } from "react";
import { Loader2, Mail, ArrowLeft, MapPin, X, ShieldCheck, FileText, CheckCircle2, AlertTriangle, MailCheck } from "lucide-react";
import { supabase } from "./supabaseClient";
import { getCurrentPositionSafe } from "./lib/geolocation";
import loginBackground from "./assets/baobab-canada-bg.svg";
import logoIcon from "./assets/logo-baobab-icon.png";
import { PrivacyPolicyContent, TermsOfServiceContent } from "./legalContent";
import { useEscapeKey } from "./hooks/useEscapeKey";
import { useCountdown } from "./hooks/useCountdown";
import { C } from "./components/auth/authTheme";
import PasswordField from "./components/auth/PasswordField";
import PasswordStrengthMeter from "./components/auth/PasswordStrengthMeter";
import { scorePassword, passwordMeetsMinimum } from "./lib/passwordStrength";
import { traduireAuthErreur } from "./lib/authErrors";

const RESEND_COOLDOWN_S = 45;
const RESET_COOLDOWN_S = 45;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  return EMAIL_RE.test(value.trim());
}

function isEmailNotConfirmed(err) {
  return err?.code === "email_not_confirmed" || (err?.message || "").toLowerCase().includes("email not confirmed");
}

// Traduction déplacée dans lib/authErrors.js (traduireAuthErreur) — partagée
// avec UpdatePasswordScreen.jsx, qui affichait auparavant le message anglais
// brut de Supabase sur les erreurs updateUser().
const traduireErreur = traduireAuthErreur;

// Écran unique d'authentification (inscription/connexion/reset), étendu
// avec les nouveaux modes du parcours de vérification email — un seul
// composant, pas un deuxième système. justVerified/authLinkError arrivent
// de App.jsx, qui détecte le retour d'un lien de confirmation/reset
// (voir la détection dans App.jsx : ni un routeur ni un backend n'existent
// dans ce projet, donc c'est le seul point d'entrée possible).
export default function Auth({ justVerified = false, onAcknowledgeVerified = () => {}, authLinkError = null, onDismissLinkError = () => {}, initialMode = "signin", onGoHome = () => {} }) {
  const [mode, setMode] = useState(initialMode); // signin | signup | reset | check-email | unverified | link-error
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [legalView, setLegalView] = useState(null); // "privacy" | "terms" | null
  const [resendLoading, setResendLoading] = useState(false);
  const [signupEmailExists, setSignupEmailExists] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  // Deux cooldowns distincts (reset password vs renvoi de confirmation sont
  // deux flux séparés) mais un seul mécanisme de compte à rebours partagé.
  const [resendCooldown, setResendCooldown] = useCountdown();
  const [resetCooldown, setResetCooldown] = useCountdown();
  useEscapeKey(Boolean(legalView), () => setLegalView(null));

  useEffect(() => {
    if (authLinkError) setMode("link-error");
  }, [authLinkError]);

  useEffect(() => {
    if (justVerified) onAcknowledgeVerified();
  }, [justVerified]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSignupEmailExists(false);
    // Normalisation (item 2 du cahier des charges) : espaces + casse ne
    // doivent jamais créer deux comptes distincts pour la même adresse —
    // Patrick@Email.com et patrick@email.com sont la même personne.
    const cleanEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      setError("Veuillez entrer une adresse email valide.");
      return;
    }

    if (mode === "signup") {
      if (!passwordMeetsMinimum(scorePassword(password).checks)) {
        setError("Ton mot de passe ne respecte pas encore toutes les règles minimales.");
        return;
      }
      if (password !== passwordConfirm) {
        setError("Les mots de passe ne correspondent pas.");
        return;
      }
    }

    // Coupe-circuit local (en plus du rate limit serveur de Supabase) :
    // un clic répété sur "Envoyer le lien" pendant le cooldown ne doit
    // jamais déclencher un nouvel envoi.
    if (mode === "reset" && resetCooldown > 0) return;

    setLoading(true);
    try {
      if (mode === "signup") {
        // Localisation obligatoire à la création du compte (item 2 des specs
        // navigation/auth) : condition d'accès au bêta privé, demandée une
        // seule fois ici via la popup native, jamais à chaque lancement.
        // Aucune session n'existe encore à ce stade (email pas confirmé),
        // donc impossible d'écrire dans user_locations (RLS = auth.uid()) —
        // les coordonnées sont stashées et persistées par App.jsx dès que la
        // session s'établit après vérification.
        const locResult = await getCurrentPositionSafe();
        if (!locResult.ok) {
          setError("La localisation est obligatoire pour créer un compte sur Baobab (accès bêta privé). " + (locResult.message || ""));
          setLoading(false);
          return;
        }
        try {
          sessionStorage.setItem("bb-pending-location", JSON.stringify({ latitude: locResult.latitude, longitude: locResult.longitude }));
        } catch (_) {}

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/?verified=1` },
        });
        if (signUpError) throw signUpError;
        // Un compte confirmé existant fait échouer signUp() (catch plus bas).
        // Un compte NON confirmé existant, lui, ne fait PAS échouer signUp()
        // — Supabase renvoie juste un nouveau code/lien sans créer de second
        // compte (comportement voulu, anti-énumération). Seul un tableau
        // "identities" vide permet de distinguer ce cas d'une vraie première
        // inscription (item 5 du cahier des charges) : sans ce contrôle, les
        // deux flux étaient indiscernables pour l'utilisateur.
        if (signUpData?.user && signUpData.user.identities?.length === 0) {
          setNotice("Un compte Baobab existe déjà avec cette adresse, pas encore confirmé. On vient de t'envoyer un nouveau code.");
        }
        setMode("check-email");
        setResendCooldown(RESEND_COOLDOWN_S);
      } else if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail, password,
        });
        if (signInError) throw signInError;
      } else if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/update-password`,
        });
        if (resetError) throw resetError;
        setNotice("Email de réinitialisation envoyé, si ce compte existe.");
        setResetCooldown(RESET_COOLDOWN_S);
        setMode("signin");
      }
    } catch (err) {
      if (mode === "signin" && isEmailNotConfirmed(err)) {
        setMode("unverified");
      } else if (mode === "signup" && (err?.code === "user_already_exists" || (err?.message || "").includes("User already registered"))) {
        setSignupEmailExists(true);
        setError(traduireErreur(err));
      } else {
        setError(traduireErreur(err));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resendLoading) return;
    if (!isValidEmail(email)) {
      setError("Veuillez entrer une adresse email valide.");
      return;
    }
    setResendLoading(true);
    setError("");
    try {
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email: email.trim().toLowerCase() });
      if (resendError) throw resendError;
      setNotice("Un nouveau lien vient d'être envoyé.");
      setResendCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(traduireErreur(err));
    } finally {
      setResendLoading(false);
    }
  }

  // Vérification par code (item 4 des specs navigation/auth) — utilise
  // l'OTP natif de Supabase Auth (type "signup") plutôt qu'une
  // infrastructure d'envoi d'email custom : le même email de confirmation
  // envoyé par signUp() contient ce code si le modèle d'email Supabase
  // inclut {{ .Token }} (réglage du tableau de bord Supabase, hors de ce
  // dépôt). Succès = session établie normalement, comme une connexion
  // classique — contrairement au lien (voir App.jsx), rien ne la referme
  // ici : l'utilisateur vient de saisir son mot de passe puis ce code sur
  // le même appareil, l'auto-connexion est donc légitime.
  async function handleVerifyCode(e) {
    e.preventDefault();
    const cleanCode = otpCode.trim();
    if (!cleanCode) {
      setError("Entre le code reçu par email.");
      return;
    }
    setVerifyLoading(true);
    setError("");
    setNotice("");
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(), token: cleanCode, type: "signup",
      });
      if (verifyError) throw verifyError;
      // Pas de setMode ici : onAuthStateChange (App.jsx) détecte la session
      // et fait sortir l'utilisateur de l'écran d'authentification.
    } catch (err) {
      setError(traduireErreur(err) || "Code invalide ou expiré. Réessaie ou demande un nouveau code.");
    } finally {
      setVerifyLoading(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    setNotice("");
    setSignupEmailExists(false);
    setPassword("");
    setPasswordConfirm("");
    if (authLinkError) onDismissLinkError();
  }

  const title = mode === "signup" ? "Crée ton compte"
    : mode === "reset" ? "Réinitialise ton mot de passe"
    : mode === "check-email" ? "Vérifie ton email"
    : mode === "unverified" ? "Email non vérifié"
    : mode === "link-error" ? (authLinkError === "otp_expired" ? "Lien expiré" : "Lien invalide")
    : "Bienvenue sur Baobab";

  const subtitle = mode === "signup" ? "Rejoins une communauté d'immigrants au Canada."
    : mode === "reset" ? "Entre ton adresse email pour recevoir un nouveau lien."
    : mode === "check-email" ? "Un email de confirmation vient d'être envoyé."
    : mode === "unverified" ? "Confirme ton adresse avant de te connecter."
    : mode === "link-error" ? "Pas d'inquiétude, on peut t'en envoyer un autre."
    : "Rencontre, échange et crée des connexions avec des immigrants partout au Canada.";

  const passwordCheckResult = scorePassword(password);
  const confirmMatches = passwordConfirm.length > 0 && password === passwordConfirm;
  const confirmMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const signupReady = passwordMeetsMinimum(passwordCheckResult.checks) && password === passwordConfirm;

  return (
    <main className="bb-auth min-h-screen relative flex items-center justify-center overflow-hidden px-4 py-6 sm:px-6"
      style={{ fontFamily: "Inter, system-ui, sans-serif", color: C.sand, background: C.dusk,
        paddingTop: "max(1.5rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
      <style>{`
        @keyframes bbKenBurns { from { transform: scale(1.04); } to { transform: scale(1.12); } }
        @keyframes bbRise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bbWord { from { opacity: 0; transform: translateY(34px) rotateX(60deg) scale(.94); filter: blur(6px); } 60% { filter: blur(0); } to { opacity: 1; transform: translateY(0) rotateX(0) scale(1); filter: blur(0); } }
        @keyframes bbGradientMove { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes bbGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(217,164,65,.12); } 50% { box-shadow: 0 0 0 14px rgba(217,164,65,0); } }
        @keyframes bbFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes bbShimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
        @keyframes bbCaret { 0%,45% { opacity: 1; } 50%,95% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes bbCheckPop { 0% { transform: scale(.5); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes bbHaloPulse { 0% { box-shadow: 0 0 0 0 rgba(143,174,134,.35); } 100% { box-shadow: 0 0 0 22px rgba(143,174,134,0); } }
        @keyframes bbShake { 10%,90% { transform: translateX(-1px); } 20%,80% { transform: translateX(2px); } 30%,50%,70% { transform: translateX(-4px); } 40%,60% { transform: translateX(4px); } }
        @keyframes bbParticle { 0% { transform: translateY(0) translateX(0); opacity: 0; } 10% { opacity: .5; } 90% { opacity: .5; } 100% { transform: translateY(-70px) translateX(12px); opacity: 0; } }
        .bb-auth .bb-bg { animation: bbKenBurns 22s ease-in-out alternate infinite; }
        .bb-auth .bb-hero { animation: bbRise .8s cubic-bezier(.22,1,.36,1) both; }
        .bb-auth .bb-card { animation: bbRise .9s .12s cubic-bezier(.22,1,.36,1) both; }
        .bb-auth .bb-word { display:inline-block; opacity:0; animation: bbWord .75s cubic-bezier(.22,1,.36,1) both; transform-origin: 50% 100%; }
        .bb-auth .bb-word-gradient { background: linear-gradient(90deg, ${C.ochre}, #F0C878, ${C.ochre}); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: bbWord .75s cubic-bezier(.22,1,.36,1) both, bbGradientMove 4s ease-in-out .9s infinite; }
        .bb-auth .bb-caret { display:inline-block; width: 2px; margin-left: 2px; animation: bbCaret 1.1s step-end infinite; }
        .bb-auth .bb-badge { animation: bbFloat 5s ease-in-out infinite; }
        .bb-auth .bb-brand-icon { animation: bbGlow 3s ease-in-out infinite; }
        .bb-auth .bb-submit { position:relative; overflow:hidden; }
        .bb-auth .bb-submit::after { content:""; position:absolute; inset:0 auto 0 -40%; width:35%; background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent); transform:skewX(-18deg); animation:bbShimmer 3.8s ease-in-out infinite; }
        .bb-auth .bb-field { transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease, background .25s ease; }
        .bb-auth .bb-field:focus-within { transform: translateY(-1px); border-color: rgba(217,164,65,.55) !important; box-shadow: 0 10px 30px rgba(0,0,0,.16), 0 0 0 3px rgba(217,164,65,.08); background: rgba(26,54,38,.92) !important; }
        .bb-auth .bb-check-pop { animation: bbCheckPop .5s cubic-bezier(.22,1.4,.36,1) both, bbHaloPulse 1.6s ease-out .3s; }
        .bb-auth .bb-alert-shake { animation: bbShake .4s linear; }
        .bb-auth .bb-particle { position:absolute; border-radius:9999px; background:${C.ochre}; animation: bbParticle linear infinite; }
        .bb-auth input { font-size: 16px; }
        .bb-auth .bb-tap { min-height: 44px; }
        @media (prefers-reduced-motion: reduce) { .bb-auth * { animation: none !important; transition: none !important; } }
      `}</style>

      <div aria-hidden="true" className="bb-bg absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${loginBackground})`, backgroundPosition: "center center" }} />

      <div aria-hidden="true" className="absolute inset-0"
        style={{ background: "linear-gradient(90deg, rgba(7,20,13,0.08) 0%, rgba(7,20,13,0.18) 32%, rgba(7,20,13,0.72) 57%, rgba(7,20,13,0.96) 100%)" }} />

      <div aria-hidden="true" className="absolute inset-0 md:hidden"
        style={{ background: "linear-gradient(180deg, rgba(7,20,13,0.20), rgba(7,20,13,0.58) 35%, rgba(7,20,13,0.96) 72%, rgba(7,20,13,1) 100%)" }} />

      {/* Halo discret + particules très légères — décor uniquement, jamais lourd. */}
      <div aria-hidden="true" className="absolute -top-32 right-[12%] h-72 w-72 rounded-full pointer-events-none hidden md:block"
        style={{ background: `radial-gradient(circle, rgba(217,164,65,.16), transparent 70%)`, filter: "blur(10px)" }} />
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden hidden lg:block">
        {[18, 34, 52, 68, 81].map((left, i) => (
          <span key={left} className="bb-particle" style={{ left: `${left}%`, bottom: "-10px", width: 3, height: 3, animationDuration: `${9 + i}s`, animationDelay: `${i * 1.6}s` }} />
        ))}
      </div>

      <div className="bb-hero relative z-10 hidden md:block w-full max-w-6xl mr-auto">
        <div className="max-w-lg pl-4 lg:pl-10">
          <div className="bb-badge inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
            style={{ background: "rgba(13,32,22,0.52)", border: "1px solid rgba(242,233,220,0.16)", backdropFilter: "blur(12px)" }}>
            <MapPin size={14} color={C.ochre} /> Une communauté partout au Canada
          </div>
          <h2 className="mt-5 text-4xl lg:text-6xl font-bold leading-[1.05]" style={{ fontFamily: "Fraunces, serif", perspective: "700px" }}>
            <span className="bb-word" style={{ animationDelay: ".12s" }}>Nouvelle</span> <span className="bb-word" style={{ animationDelay: ".2s" }}>vie.</span><br />
            <span className="bb-word bb-word-gradient" style={{ animationDelay: ".34s" }}>Nouvelles</span> <span className="bb-word bb-word-gradient" style={{ animationDelay: ".42s" }}>connexions.</span><span className="bb-caret" style={{ height: "0.85em", background: C.ochre, verticalAlign: "-0.1em" }} />
          </h2>
          <p className="mt-5 max-w-md text-base lg:text-lg leading-7" style={{ color: C.sandDim }}>
            Baobab rapproche les immigrants au Canada pour l'amour, l'amitié, les rencontres et les nouvelles communautés.
          </p>
        </div>
      </div>

      <section className="relative z-20 w-full max-w-md md:absolute md:right-[5vw] lg:right-[7vw]" aria-label="Authentification Baobab">
        <div className="bb-card rounded-[30px] p-5 sm:p-7 md:p-8"
          style={{ background: "rgba(13,32,22,0.80)", border: "1px solid rgba(242,233,220,0.16)",
            boxShadow: "0 30px 90px rgba(0,0,0,0.52)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)" }}>

          <button type="button" onClick={onGoHome} className="flex items-center gap-3 mb-6 text-left">
            <div className="bb-brand-icon h-12 w-12 rounded-2xl overflow-hidden"
              style={{ background: "#000", border: "1px solid rgba(217,164,65,0.25)" }}>
              <img src={logoIcon} alt="" className="h-full w-full object-cover" />
            </div>
            <div>
              <div style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontWeight: 600, fontSize: 28, lineHeight: 1 }}>Baobab</div>
              <div className="mt-1" style={{ fontSize: 9, letterSpacing: "0.22em", color: C.sandDim }}>BY LESSI PATRICK</div>
            </div>
          </button>

          {/* Bandeau "email vérifié" — uniquement en mode signin, jamais après une connexion normale. */}
          {mode === "signin" && justVerified && (
            <div className="mb-5 rounded-2xl px-4 py-4 flex items-center gap-3" style={{ background: "rgba(143,174,134,0.14)", border: "1px solid rgba(143,174,134,0.28)" }}>
              <span className="bb-check-pop flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center" style={{ background: "rgba(143,174,134,0.25)" }}>
                <CheckCircle2 size={19} color={C.acacia} />
              </span>
              <div>
                <div className="text-sm font-bold" style={{ color: C.acacia }}>Email vérifié</div>
                <p className="text-xs mt-0.5" style={{ color: C.sandDim }}>Ton adresse a bien été vérifiée. Entre ton mot de passe pour continuer.</p>
              </div>
            </div>
          )}

          {mode !== "check-email" && mode !== "link-error" && (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {title.split(" ").map((word, i) => <span key={`${word}-${i}`} className="bb-word mr-[.28em]" style={{ animationDelay: `${.28 + i * .055}s` }}>{word}</span>)}
              </h1>
              <p className="bb-hero mt-2 text-sm leading-6" style={{ color: C.sandDim }}>{subtitle}</p>
            </>
          )}

          {error && <div role="alert" className="bb-alert-shake mt-5 rounded-2xl px-4 py-3 text-sm"
            style={{ background: "rgba(193,97,61,0.15)", color: "#F4A48C", border: "1px solid rgba(193,97,61,0.28)" }}>{error}</div>}

          {/* Email déjà utilisé à l'inscription : proposer directement les deux issues
              plutôt que de laisser l'utilisateur retaper son email lui-même. */}
          {error && mode === "signup" && signupEmailExists && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => switchMode("signin")} className="bb-tap rounded-xl px-3.5 py-2 text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${C.clay}, #A94F30)` }}>
                Se connecter
              </button>
              <button type="button" onClick={() => switchMode("reset")} className="bb-tap rounded-xl px-3.5 py-2 text-xs font-semibold" style={{ color: C.ochre, border: "1px solid rgba(217,164,65,0.35)" }}>
                Mot de passe oublié ?
              </button>
            </div>
          )}

          {notice && <div role="status" className="mt-5 rounded-2xl px-4 py-3 text-sm"
            style={{ background: "rgba(143,174,134,0.15)", color: "#B9D5B2", border: "1px solid rgba(143,174,134,0.25)" }}>{notice}</div>}

          {/* ---------- Lien mort (confirmation ou reset expiré/invalide) ---------- */}
          {mode === "link-error" && (
            <div className="mt-1">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center" style={{ background: "rgba(193,97,61,0.16)" }}>
                  <AlertTriangle size={20} color="#F4A48C" />
                </span>
                <div>
                  <h1 className="text-xl font-bold">{title}</h1>
                  <p className="text-sm mt-0.5" style={{ color: C.sandDim }}>{subtitle}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <button onClick={() => switchMode("reset")} className="bb-tap py-3.5 rounded-2xl text-sm font-bold text-white" style={{ background: `linear-gradient(135deg, ${C.clay}, #A94F30)` }}>
                  Recevoir un nouveau lien
                </button>
                <button onClick={() => switchMode("signin")} className="bb-tap py-3 rounded-2xl text-sm font-semibold" style={{ color: C.sandDim }}>
                  Retour à la connexion
                </button>
              </div>
            </div>
          )}

          {/* ---------- Vérifie ton email (juste après inscription) ---------- */}
          {mode === "check-email" && (
            <div className="mt-1">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center" style={{ background: "rgba(217,164,65,0.14)" }}>
                  <MailCheck size={20} color={C.ochre} />
                </span>
                <div>
                  <h1 className="text-xl font-bold">{title}</h1>
                  <p className="text-sm mt-0.5" style={{ color: C.sandDim }}>Envoyé à <b style={{ color: C.sand }}>{email.trim()}</b></p>
                </div>
              </div>
              <p className="text-sm leading-6" style={{ color: C.sandDim }}>
                Ouvre l'email : clique sur le lien de confirmation, ou entre ci-dessous le code qu'il contient.
              </p>
              <form onSubmit={handleVerifyCode} className="mt-4 flex flex-col gap-2.5">
                <label htmlFor="otp-code" className="block text-xs font-semibold" style={{ color: C.sandDim }}>Code de vérification</label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\s+/g, ""))}
                  maxLength={8}
                  className="bb-field rounded-2xl px-4 py-4 text-center text-lg tracking-[0.3em] outline-none"
                  style={{ background: "rgba(26,54,38,0.78)", border: "1px solid rgba(242,233,220,0.11)", color: C.sand }}
                />
                <button type="submit" disabled={verifyLoading || !otpCode.trim()} className="bb-tap py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${C.clay}, #A94F30)` }}>
                  {verifyLoading ? "Vérification..." : "Vérifier le code"}
                </button>
              </form>
              <div className="mt-5 text-center text-xs" style={{ color: C.sandDim }}>
                Tu n'as rien reçu ?{" "}
                <button onClick={handleResend} disabled={resendCooldown > 0 || resendLoading} className="bb-tap font-bold disabled:opacity-50" style={{ color: C.ochre }}>
                  {resendLoading ? "Envoi..." : resendCooldown > 0 ? `Renvoyer (${resendCooldown}s)` : "Renvoyer le code"}
                </button>
              </div>
              <button onClick={() => switchMode("signin")} className="bb-tap mt-4 w-full inline-flex items-center justify-center gap-1 text-xs font-semibold" style={{ color: C.sandDim }}>
                <ArrowLeft size={14} /> Retour à la connexion
              </button>
            </div>
          )}

          {/* ---------- Email non vérifié (tentative de connexion bloquée) ---------- */}
          {mode === "unverified" && (
            <div className="mt-1">
              <p className="text-sm leading-6" style={{ color: C.sandDim }}>
                Confirme <b style={{ color: C.sand }}>{email.trim()}</b> avant de te connecter — clique sur le lien reçu par email, ou entre le code qu'il contient ci-dessous.
              </p>
              <form onSubmit={handleVerifyCode} className="mt-4 flex flex-col gap-2.5">
                <label htmlFor="otp-code-unverified" className="block text-xs font-semibold" style={{ color: C.sandDim }}>Code de vérification</label>
                <input
                  id="otp-code-unverified"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\s+/g, ""))}
                  maxLength={8}
                  className="bb-field rounded-2xl px-4 py-4 text-center text-lg tracking-[0.3em] outline-none"
                  style={{ background: "rgba(26,54,38,0.78)", border: "1px solid rgba(242,233,220,0.11)", color: C.sand }}
                />
                <button type="submit" disabled={verifyLoading || !otpCode.trim()} className="bb-tap py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${C.clay}, #A94F30)` }}>
                  {verifyLoading ? "Vérification..." : "Vérifier le code"}
                </button>
              </form>
              <div className="mt-5 flex flex-col gap-2.5">
                <button onClick={handleResend} disabled={resendCooldown > 0 || resendLoading} className="bb-tap py-3 rounded-2xl text-sm font-semibold disabled:opacity-50" style={{ color: C.ochre, border: "1px solid rgba(217,164,65,0.3)" }}>
                  {resendLoading ? "Envoi..." : resendCooldown > 0 ? `Renvoyer (${resendCooldown}s)` : "Renvoyer l'email"}
                </button>
                <button onClick={() => switchMode("signup")} className="bb-tap py-3 rounded-2xl text-sm font-semibold" style={{ color: C.sandDim }}>
                  Modifier mon email
                </button>
              </div>
            </div>
          )}

          {/* ---------- Formulaire signin / signup / reset ---------- */}
          {(mode === "signin" || mode === "signup" || mode === "reset") && (
            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-xs font-semibold" style={{ color: C.sandDim }}>Adresse email</label>
                <div className="bb-field flex items-center gap-3 rounded-2xl px-4"
                  style={{ background: "rgba(26,54,38,0.78)", border: "1px solid rgba(242,233,220,0.11)" }}>
                  <Mail size={17} color={C.sandDim} />
                  <input id="email" type="email" placeholder="Ton adresse email" value={email}
                    onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email"
                    className="min-w-0 flex-1 bg-transparent py-4 text-sm outline-none" style={{ color: C.sand }} />
                </div>
              </div>

              {mode === "signin" && (
                <PasswordField
                  id="password"
                  label="Mot de passe"
                  labelRight={<button type="button" onClick={() => switchMode("reset")} className="bb-tap text-xs font-semibold flex items-center" style={{ color: C.ochre }}>Mot de passe oublié ?</button>}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              )}

              {mode === "signup" && (
                <>
                  <PasswordField
                    id="password"
                    label="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                  />
                  <PasswordStrengthMeter password={password} />
                  <PasswordField
                    id="password-confirm"
                    label="Confirmer le mot de passe"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    invalid={confirmMismatch}
                  />
                  {(confirmMatches || confirmMismatch) && (
                    <p className="-mt-2.5 text-xs font-semibold flex items-center gap-1.5" style={{ color: confirmMatches ? C.acacia : "#F4A48C" }}>
                      {confirmMatches ? "✓ Les mots de passe correspondent" : "⚠ Les mots de passe ne correspondent pas"}
                    </p>
                  )}
                </>
              )}

              <button type="submit" disabled={loading || (mode === "signup" && !signupReady) || (mode === "reset" && resetCooldown > 0)}
                className="bb-submit bb-tap mt-1 flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-transform duration-200 active:scale-[0.98] hover:scale-[1.01] disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${C.clay}, #A94F30)`, color: "#FFF8EF", boxShadow: "0 14px 32px -10px rgba(193,97,61,.65)" }}>
                {loading && <Loader2 size={17} className="animate-spin" />}
                {loading ? (mode === "signup" ? "Création..." : mode === "reset" ? "Envoi..." : "Connexion...")
                  : mode === "signup" ? "Créer mon compte"
                  : mode === "reset" ? (resetCooldown > 0 ? `Renvoyer (${resetCooldown}s)` : "Envoyer le lien")
                  : "Se connecter"}
              </button>
              {mode === "reset" && resetCooldown > 0 && (
                <p className="-mt-1.5 text-center text-xs" style={{ color: C.sandDim }}>
                  Un nouvel email pourra être envoyé dans {resetCooldown}s.
                </p>
              )}
            </form>
          )}

          {(mode === "signin" || mode === "signup" || mode === "reset") && (
            <div className="mt-6 text-center text-xs" style={{ color: C.sandDim }}>
              {mode === "signin" && <span>Pas encore de compte ?{" "}
                <button onClick={() => switchMode("signup")} className="bb-tap font-bold" style={{ color: C.ochre }}>Inscris-toi</button>
              </span>}
              {mode !== "signin" && <button onClick={() => switchMode("signin")} className="bb-tap inline-flex items-center gap-1 font-semibold" style={{ color: C.ochre }}>
                <ArrowLeft size={14} /> Retour à la connexion
              </button>}
            </div>
          )}

          <div className="mt-7 border-t pt-5 text-center text-[10px]"
            style={{ borderColor: "rgba(242,233,220,0.10)", color: "rgba(242,233,220,0.42)" }}>
            <div className="flex justify-center flex-wrap gap-x-4 gap-y-2">
              <button type="button" onClick={() => setLegalView("privacy")} className="bb-tap underline decoration-dotted underline-offset-2">Confidentialité</button>
              <span>•</span>
              <button type="button" onClick={() => setLegalView("terms")} className="bb-tap underline decoration-dotted underline-offset-2">Conditions</button>
            </div>
            <div className="mt-3" style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>BAOBAB — BY LESSI PATRICK</div>
          </div>
        </div>
      </section>

      {legalView && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(7,20,13,0.72)" }} onClick={() => setLegalView(null)} role="dialog" aria-modal="true" aria-label={legalView === "privacy" ? "Politique de confidentialité" : "Conditions d'utilisation"}>
          <div className="w-full sm:max-w-lg max-h-[88vh] sm:max-h-[80vh] flex flex-col rounded-t-[28px] sm:rounded-[24px] overflow-hidden"
            style={{ background: C.dusk3, color: C.sand, paddingBottom: "env(safe-area-inset-bottom)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: "rgba(242,233,220,0.12)" }}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {legalView === "privacy" ? <ShieldCheck size={16} color={C.ochre} /> : <FileText size={16} color={C.ochre} />}
                {legalView === "privacy" ? "Politique de confidentialité" : "Conditions d'utilisation"}
              </div>
              <button onClick={() => setLegalView(null)} aria-label="Fermer" className="bb-tap h-9 w-9 flex items-center justify-center rounded-full" style={{ background: "rgba(242,233,220,0.1)" }}><X size={16} /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-xs leading-6" style={{ color: C.sandDim }}>
              {legalView === "privacy" ? <PrivacyPolicyContent /> : <TermsOfServiceContent />}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
