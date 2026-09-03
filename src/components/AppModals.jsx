import React, { useState } from "react";
import { Circle, Bell, Moon, Shield, Info, ArrowLeft, ShieldCheck, Smartphone, UserX, AlertTriangle, MapPin, Heart, Languages, RefreshCw, CheckCircle2, Download } from "lucide-react";
import { C } from "../constants";
import { CURRENT_VERSION, checkForUpdate } from "../lib/version";
import { PrivacyPolicyContent, TermsOfServiceContent } from "../legalContent";
import Avatar from "./Avatar";
import PrivacyFieldsModal from "./PrivacyFieldsModal";
import NotificationPreferencesModal from "./NotificationPreferencesModal";
import LocationSettingsModal from "./LocationSettingsModal";
import DeleteAccountModal from "./DeleteAccountModal";
import ReportModal from "./social/ReportModal";
import BlockConfirmModal from "./social/BlockConfirmModal";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useTheme } from "../hooks/useTheme";
import { useLanguage } from "../hooks/useLanguage";

export default function AppModals({
  reportTarget,
  setReportTarget,
  reportReason,
  setReportReason,
  reportCategory,
  setReportCategory,
  reportSending,
  reportSubmitted,
  submitReport,
  cancelReport,
  dismissReportAfterSubmit,
  blockTarget,
  setBlockTarget,
  confirmBlock,
  settingsOpen,
  setSettingsOpen,
  currentUser,
  onToggleOnlineStatus,
  onToggleDating,
  onToggleField,
  onUpdateNotificationPreference,
  blockedProfiles = [],
  onUnblock,
  privacyOpen,
  setPrivacyOpen,
  termsOpen,
  setTermsOpen,
  aboutOpen,
  setAboutOpen,
  myLocation,
  onEnableLocation,
  onDisableLocation,
  onUpdateLocationPref,
  onAccountDeletionRequested = () => {},
  onExportData = () => {},
}) {
  const [blockedOpen, setBlockedOpen] = React.useState(false);
  const [privacyFieldsOpen, setPrivacyFieldsOpen] = React.useState(false);
  const [notificationPrefsOpen, setNotificationPrefsOpen] = React.useState(false);
  const [locationOpen, setLocationOpen] = React.useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = React.useState(false);
  const [theme, setTheme] = useTheme();
  const [language, setLanguage] = useLanguage();
  const [updateCheck, setUpdateCheck] = useState({ status: "idle" }); // idle | checking | up-to-date | available
  const runManualUpdateCheck = async () => {
    setUpdateCheck({ status: "checking" });
    const result = await checkForUpdate();
    if (!result.ok) { setUpdateCheck({ status: "idle" }); return; }
    setUpdateCheck(
      result.mandatory || result.recommended
        ? { status: "available", info: result.info }
        : { status: "up-to-date" }
    );
  };
  const settingsDialogRef = React.useRef(null);
  useFocusTrap(settingsOpen, settingsDialogRef);
  useEscapeKey(settingsOpen, () => setSettingsOpen(false));
  useEscapeKey(blockedOpen, () => setBlockedOpen(false));
  useEscapeKey(privacyOpen, () => setPrivacyOpen(false));
  useEscapeKey(notificationPrefsOpen, () => setNotificationPrefsOpen(false));
  useEscapeKey(termsOpen, () => setTermsOpen(false));
  useEscapeKey(aboutOpen, () => setAboutOpen(false));
  return (
    <>
      {/* ---------- MODAL SIGNALEMENT ---------- */}
      <ReportModal
        target={reportTarget}
        category={reportCategory}
        setCategory={setReportCategory}
        reason={reportReason}
        setReason={setReportReason}
        sending={reportSending}
        submitted={reportSubmitted}
        onCancel={cancelReport}
        onSubmit={submitReport}
        onBlockAlso={(target) => { dismissReportAfterSubmit(); setBlockTarget(target); }}
        onDismissAfterSubmit={dismissReportAfterSubmit}
      />

      {/* ---------- MODAL CONFIRMATION DE BLOCAGE ---------- */}
      <BlockConfirmModal
        target={blockTarget}
        onCancel={() => setBlockTarget(null)}
        onConfirm={confirmBlock}
      />

      {/* ---------- MODAL PARAMÈTRES ---------- */}
      {settingsOpen && (
        <div className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-[70] p-0 md:p-5" style={{ background: "rgba(8,20,14,0.55)", backdropFilter: "blur(3px)" }} onClick={() => setSettingsOpen(false)} role="dialog" aria-modal="true" aria-label="Paramètres">
          <div ref={settingsDialogRef} tabIndex={-1} className="bb-card p-6 w-full max-w-md rounded-t-[20px] md:rounded-[20px]" style={{ maxHeight: "85vh", overflowY: "auto", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: "var(--bb-text)" }} className="mb-4">
              Paramètres
            </div>

            <div className="text-[11px] font-black uppercase tracking-wider mt-2" style={{ color: "rgba(var(--bb-ink-rgb),0.4)" }}>Rencontres</div>
            <label className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
              <div className="flex items-center gap-2 text-sm"><Heart size={14} color={C.clay} /> Activer les Rencontres</div>
              <input
                type="checkbox"
                checked={currentUser?.dating_enabled !== false}
                onChange={(e) => onToggleDating?.(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
            </label>
            <p className="text-[11px] mt-1 mb-2" style={{ color: "rgba(var(--bb-ink-rgb),0.45)" }}>
              Désactive pour ne plus apparaître dans Découverte ni recevoir de nouveaux likes.
            </p>

            <div className="text-[11px] font-black uppercase tracking-wider mt-2" style={{ color: "rgba(var(--bb-ink-rgb),0.4)" }}>Confidentialité</div>
            <label className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
              <div className="flex items-center gap-2 text-sm"><Circle size={14} color={C.acacia} /> Statut en ligne visible</div>
              <input
                type="checkbox"
                checked={currentUser?.show_online_status !== false}
                onChange={(e) => onToggleOnlineStatus?.(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
            </label>
            <button onClick={() => { setSettingsOpen(false); setNotificationPrefsOpen(true); }} className="w-full flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><Bell size={14} color={C.ochre} /> Notifications</span>
              <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(var(--bb-ink-rgb),0.35)" }} />
            </button>
            <div className="py-2.5" style={{ borderTop: "1px solid var(--bb-border)" }}>
              <div className="flex items-center gap-2 text-sm mb-2"><Moon size={14} color="var(--bb-text)" /> Apparence</div>
              <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--bb-border)" }} role="radiogroup" aria-label="Apparence">
                {[["light", "☀️ Clair"], ["dark", "🌙 Sombre"], ["system", "💻 Système"]].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={theme === value}
                    onClick={() => setTheme(value)}
                    className="flex-1 text-xs font-bold py-2 focus-visible:outline focus-visible:outline-2"
                    style={{
                      background: theme === value ? C.indigo : "transparent",
                      color: theme === value ? "#fff" : "var(--bb-text)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="py-2.5" style={{ borderTop: "1px solid var(--bb-border)" }}>
              <div className="flex items-center gap-2 text-sm mb-2"><Languages size={14} color="var(--bb-text)" /> Langue</div>
              <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--bb-border)" }} role="radiogroup" aria-label="Langue">
                {[["fr", "🇫🇷 Français"], ["en", "🇬🇧 English"]].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={language === value}
                    onClick={() => setLanguage(value)}
                    className="flex-1 text-xs font-bold py-2 focus-visible:outline focus-visible:outline-2"
                    style={{
                      background: language === value ? C.indigo : "transparent",
                      color: language === value ? "#fff" : "var(--bb-text)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {language === "en" && (
                <p className="text-[11px] mt-2" style={{ color: "rgba(var(--bb-ink-rgb),0.45)" }}>
                  Baobab is currently only available in French — full English translation is coming soon. Your preference has been saved.
                </p>
              )}
            </div>
            <button onClick={() => { setSettingsOpen(false); setBlockedOpen(true); }} className="w-full flex items-center justify-between py-3" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><UserX size={14} color="var(--bb-text)" /> Comptes bloqués</span>
              <span className="flex items-center gap-2">
                {blockedProfiles.length > 0 && <span className="text-xs font-bold" style={{ color: "rgba(var(--bb-ink-rgb),0.4)" }}>{blockedProfiles.length}</span>}
                <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(var(--bb-ink-rgb),0.35)" }} />
              </span>
            </button>
            <button onClick={() => { setSettingsOpen(false); setPrivacyFieldsOpen(true); }} className="w-full flex items-center justify-between py-3" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><Shield size={14} color="var(--bb-text)" /> Confidentialité des champs</span>
              <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(var(--bb-ink-rgb),0.35)" }} />
            </button>
            <button onClick={() => { setSettingsOpen(false); setLocationOpen(true); }} className="w-full flex items-center justify-between py-3" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><MapPin size={14} color="var(--bb-text)" /> Localisation</span>
              <span className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: myLocation?.location_enabled ? C.acacia : "rgba(var(--bb-ink-rgb),0.4)" }}>{myLocation?.location_enabled ? "Activée" : "Désactivée"}</span>
                <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(var(--bb-ink-rgb),0.35)" }} />
              </span>
            </button>

            <div className="text-[11px] font-black uppercase tracking-wider mt-4" style={{ color: "rgba(var(--bb-ink-rgb),0.4)" }}>Baobab Protect</div>
            <div className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)" }}>
              {/* Bug corrigé : C.ink est un jeton FIXE (voir constants.js, "Chrome
              applicatif" à fond crème fixe C.sand) — ici l'icône est dans une
              modale .bb-card à fond RÉACTIF (var(--bb-surface)). En thème
              sombre C.ink restait #2B2420 (quasi noir) sur un fond #1C1912
              (quasi noir aussi) → icône invisible. "var(--bb-text)" est
              l'équivalent réactif, cohérent avec le reste de cette modale. */}
              <div className="flex items-center gap-2 text-sm"><ShieldCheck size={14} color={currentUser?.email_verified ? C.verified : "var(--bb-text)"} /> Email vérifié</div>
              <span className="text-xs font-bold" style={{ color: currentUser?.email_verified ? C.verified : "rgba(var(--bb-ink-rgb),0.4)" }}>
                {currentUser?.email_verified ? "Vérifié" : "Non vérifié"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)" }}>
              <div className="flex items-center gap-2 text-sm"><Smartphone size={14} color="var(--bb-text)" /> Téléphone vérifié</div>
              <span className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb),0.4)" }}>Bientôt</span>
            </div>

            <button onClick={() => { setSettingsOpen(false); setPrivacyOpen(true); }} className="w-full flex items-center justify-between py-3 mt-2" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><Shield size={14} color="var(--bb-text)" /> Politique de confidentialité</span>
              <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(var(--bb-ink-rgb),0.35)" }} />
            </button>
            <button onClick={() => { setSettingsOpen(false); setTermsOpen(true); }} className="w-full flex items-center justify-between py-3" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><Info size={14} color="var(--bb-text)" /> Conditions d'utilisation</span>
              <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(var(--bb-ink-rgb),0.35)" }} />
            </button>
            {/* Bug corrigé : cette entrée n'existait nulle part dans l'app — ni ici, ni
                dans le menu déroulant de SocialShell — donc `aboutOpen`/`setAboutOpen`
                (numéro de version + vérification manuelle de mise à jour) était du code
                mort côté UI, impossible à atteindre pour un utilisateur. */}
            <button onClick={() => { setSettingsOpen(false); setAboutOpen(true); }} className="w-full flex items-center justify-between py-3" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><Info size={14} color="var(--bb-text)" /> À propos de Baobab</span>
              <span className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: "rgba(var(--bb-ink-rgb),0.4)" }}>v{CURRENT_VERSION}</span>
                <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(var(--bb-ink-rgb),0.35)" }} />
              </span>
            </button>
            <button onClick={onExportData} className="w-full flex items-center justify-between py-3 mt-2" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><Download size={14} color="var(--bb-text)" /> Exporter mes données</span>
              <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(var(--bb-ink-rgb),0.35)" }} />
            </button>

            <div className="text-[11px] font-black uppercase tracking-wider mt-4" style={{ color: C.clay }}>Zone de danger</div>
            <button onClick={() => { setSettingsOpen(false); setDeleteAccountOpen(true); }} className="w-full flex items-center gap-2 py-3" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44, color: C.clay }}>
              <AlertTriangle size={14} /> <span className="text-sm font-semibold">Supprimer mon compte</span>
            </button>

            <button onClick={() => setSettingsOpen(false)} className="w-full mt-4 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: "var(--bb-text)", minHeight: 44 }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ---------- MODAL CONFIDENTIALITÉ DES CHAMPS ---------- */}
      <PrivacyFieldsModal
        open={privacyFieldsOpen}
        onClose={() => setPrivacyFieldsOpen(false)}
        onBack={() => { setPrivacyFieldsOpen(false); setSettingsOpen(true); }}
        currentUser={currentUser}
        onToggleField={onToggleField}
      />

      {/* ---------- MODAL PRÉFÉRENCES DE NOTIFICATIONS ---------- */}
      <NotificationPreferencesModal
        open={notificationPrefsOpen}
        onClose={() => setNotificationPrefsOpen(false)}
        onBack={() => { setNotificationPrefsOpen(false); setSettingsOpen(true); }}
        currentUser={currentUser}
        onUpdatePreference={onUpdateNotificationPreference}
      />

      {/* ---------- MODAL LOCALISATION ---------- */}
      <LocationSettingsModal
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        onBack={() => { setLocationOpen(false); setSettingsOpen(true); }}
        location={myLocation}
        onEnable={onEnableLocation}
        onDisable={onDisableLocation}
        onUpdatePref={onUpdateLocationPref}
      />

      {/* ---------- MODAL SUPPRESSION DE COMPTE ---------- */}
      <DeleteAccountModal
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        currentUser={currentUser}
        onRequested={() => { setDeleteAccountOpen(false); onAccountDeletionRequested(); }}
      />

      {/* ---------- MODAL COMPTES BLOQUÉS ---------- */}
      {blockedOpen && (
        <div className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-[70] p-0 md:p-5" style={{ background: "rgba(8,20,14,0.55)", backdropFilter: "blur(3px)" }} onClick={() => setBlockedOpen(false)} role="dialog" aria-modal="true" aria-label="Comptes bloqués">
          <div className="bb-card p-6 w-full max-w-md rounded-t-[20px] md:rounded-[20px]" style={{ maxHeight: "80vh", overflowY: "auto", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => { setBlockedOpen(false); setSettingsOpen(true); }} aria-label="Retour aux réglages" className="focus-visible:outline focus-visible:outline-2" style={{ color: "var(--bb-text)" }}><ArrowLeft size={16} /></button>
              <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: "var(--bb-text)" }}>Comptes bloqués</div>
            </div>
            <p className="text-sm mb-3" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
              Ces profils ne peuvent plus te contacter ni apparaître dans ta liste de découverte.
            </p>
            {blockedProfiles.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "rgba(var(--bb-ink-rgb),0.5)" }}>Aucun compte bloqué pour l'instant.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {blockedProfiles.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl" style={{ background: "rgba(var(--bb-ink-rgb),0.03)" }}>
                    <Avatar name={p.name} url={p.avatar_url} size={38} />
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{p.name}</div></div>
                    <button
                      onClick={() => onUnblock?.(p)}
                      className="text-xs font-bold px-3 py-2 rounded-full"
                      style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: C.clay, minHeight: 36 }}
                    >
                      Débloquer
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setBlockedOpen(false)} className="w-full py-3 mt-4 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: "var(--bb-text)", minHeight: 44 }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ---------- MODAL POLITIQUE DE CONFIDENTIALITÉ ---------- */}
      {/* Bug corrigé : ce modal utilisait la classe "bb-card" (fond
          var(--bb-surface), réactif au thème clair/sombre de l'app), alors
          que PrivacyPolicyContent (legalContent.jsx) code en dur ses titres
          de section en #F2E9DC (= C.sand) — couleur pensée pour le fond
          sombre FIXE des "pages légales" (C.dusk3, voir Auth.jsx et
          PublicPageShell.jsx, cf. leurs commentaires). En thème clair (le
          défaut), le fond de bb-card est blanc : les titres de section
          crème y devenaient quasi invisibles. On force ici le même fond
          sombre fixe que les autres surfaces où ce contenu s'affiche déjà
          (Auth.jsx, /confidentialite), pour que les titres restent lisibles
          quel que soit le thème et que le rendu soit cohérent partout. */}
      {privacyOpen && (
        <div className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-[70] p-0 md:p-5" style={{ background: "rgba(8,20,14,0.55)", backdropFilter: "blur(3px)" }} onClick={() => setPrivacyOpen(false)} role="dialog" aria-modal="true" aria-label="Politique de confidentialité">
          <div className="p-6 w-full max-w-md rounded-t-[20px] md:rounded-[20px]" style={{ background: C.dusk3, border: "1px solid rgba(242,233,220,0.12)", boxShadow: "var(--bb-shadow-lg)", maxHeight: "80vh", overflowY: "auto", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: C.sand }} className="mb-3">
              Politique de confidentialité
            </div>
            <div className="text-sm" style={{ color: C.sandDim }}>
              <PrivacyPolicyContent />
            </div>
            <button onClick={() => setPrivacyOpen(false)} className="w-full py-3 mt-2 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(242,233,220,0.2)", color: C.sand, minHeight: 44 }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ---------- MODAL CONDITIONS D'UTILISATION ---------- */}
      {/* Même bug de contraste que le modal de confidentialité ci-dessus,
          même correctif (fond sombre fixe C.dusk3 au lieu de bb-card). */}
      {termsOpen && (
        <div className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-[70] p-0 md:p-5" style={{ background: "rgba(8,20,14,0.55)", backdropFilter: "blur(3px)" }} onClick={() => setTermsOpen(false)} role="dialog" aria-modal="true" aria-label="Conditions d'utilisation">
          <div className="p-6 w-full max-w-md rounded-t-[20px] md:rounded-[20px]" style={{ background: C.dusk3, border: "1px solid rgba(242,233,220,0.12)", boxShadow: "var(--bb-shadow-lg)", maxHeight: "80vh", overflowY: "auto", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: C.sand }} className="mb-3">
              Conditions d'utilisation
            </div>
            <div className="text-sm" style={{ color: C.sandDim }}>
              <TermsOfServiceContent />
            </div>
            <button onClick={() => setTermsOpen(false)} className="w-full py-3 mt-2 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(242,233,220,0.2)", color: C.sand, minHeight: 44 }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ---------- MODAL À PROPOS ---------- */}
      {aboutOpen && (
        <div className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-[70] p-0 md:p-5" style={{ background: "rgba(8,20,14,0.55)", backdropFilter: "blur(3px)" }} onClick={() => setAboutOpen(false)} role="dialog" aria-modal="true" aria-label="À propos">
          <div className="bb-card p-6 w-full max-w-md text-center rounded-t-[20px] md:rounded-[20px]" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 600, fontSize: 24, color: "var(--bb-text)" }} className="mb-1">
              Baobab
            </div>
            <p className="text-sm mb-4" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
              L'app de rencontres pensée pour la communauté qui s'installe au Canada.
            </p>
            <p style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.06em", color: "rgba(var(--bb-ink-rgb),0.45)" }}>
              BAOBAB — BY LESSI PATRICK
            </p>

            <div className="mt-4 rounded-2xl p-3.5 text-left" style={{ background: "rgba(var(--bb-ink-rgb),0.04)" }}>
              <p className="text-xs font-bold" style={{ color: "var(--bb-text)" }}>Version {CURRENT_VERSION}</p>
              {updateCheck.status === "up-to-date" && (
                <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: "var(--bb-text)" }}>
                  <CheckCircle2 size={13} /> Vous utilisez la dernière version.
                </p>
              )}
              {updateCheck.status === "available" && (
                <div className="mt-1.5">
                  <p className="text-xs font-semibold" style={{ color: C.clay }}>
                    Baobab {updateCheck.info.latestVersion} est disponible
                  </p>
                  {updateCheck.info.releaseNotes?.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {updateCheck.info.releaseNotes.map((note, i) => (
                        <li key={i} className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>• {note}</li>
                      ))}
                    </ul>
                  )}
                  <button onClick={() => window.location.reload()} className="w-full mt-2.5 py-2 rounded-full text-xs font-bold text-white" style={{ background: C.indigo }}>
                    Mettre à jour maintenant
                  </button>
                </div>
              )}
              {(updateCheck.status === "idle" || updateCheck.status === "checking") && (
                <button
                  onClick={runManualUpdateCheck}
                  disabled={updateCheck.status === "checking"}
                  className="w-full mt-2 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
                  style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: "var(--bb-text)" }}
                >
                  <RefreshCw size={13} className={updateCheck.status === "checking" ? "animate-spin" : ""} />
                  {updateCheck.status === "checking" ? "Recherche..." : "Rechercher une mise à jour"}
                </button>
              )}
            </div>

            <button onClick={() => setAboutOpen(false)} className="w-full mt-3 py-2.5 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: "var(--bb-text)" }}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
