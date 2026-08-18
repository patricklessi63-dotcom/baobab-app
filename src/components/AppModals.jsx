import React from "react";
import { Circle, Bell, Moon, Shield, Info, ArrowLeft, ShieldCheck, Smartphone, UserX, AlertTriangle } from "lucide-react";
import { C } from "../constants";
import { PrivacyPolicyContent, TermsOfServiceContent } from "../legalContent";
import Avatar from "./Avatar";
import PrivacyFieldsModal from "./PrivacyFieldsModal";
import DeleteAccountModal from "./DeleteAccountModal";
import ReportModal from "./social/ReportModal";
import BlockConfirmModal from "./social/BlockConfirmModal";
import { useEscapeKey } from "../hooks/useEscapeKey";

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
  onToggleField,
  blockedProfiles = [],
  onUnblock,
  privacyOpen,
  setPrivacyOpen,
  termsOpen,
  setTermsOpen,
  aboutOpen,
  setAboutOpen,
  onAccountDeleted = () => {},
}) {
  const [blockedOpen, setBlockedOpen] = React.useState(false);
  const [privacyFieldsOpen, setPrivacyFieldsOpen] = React.useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = React.useState(false);
  useEscapeKey(settingsOpen, () => setSettingsOpen(false));
  useEscapeKey(blockedOpen, () => setBlockedOpen(false));
  useEscapeKey(privacyOpen, () => setPrivacyOpen(false));
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
        <div className="bb-fade-in fixed inset-0 flex items-end justify-center z-30" style={{ background: "rgba(20,29,56,0.55)", backdropFilter: "blur(3px)" }} onClick={() => setSettingsOpen(false)} role="dialog" aria-modal="true" aria-label="Paramètres">
          <div className="bb-card p-6 w-full max-w-md" style={{ borderRadius: "20px 20px 0 0", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: C.indigo }} className="mb-4">
              Paramètres
            </div>

            <div className="text-[11px] font-black uppercase tracking-wider mt-2" style={{ color: "rgba(43,36,32,0.4)" }}>Confidentialité</div>
            <label className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(43,36,32,0.08)", minHeight: 44 }}>
              <div className="flex items-center gap-2 text-sm"><Circle size={14} color={C.acacia || C.ochre} /> Statut en ligne visible</div>
              <input
                type="checkbox"
                checked={currentUser?.show_online_status !== false}
                onChange={(e) => onToggleOnlineStatus?.(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
            </label>
            <label className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(43,36,32,0.08)", minHeight: 44 }}>
              <div className="flex items-center gap-2 text-sm"><Bell size={14} color={C.ochre} /> Notifications</div>
              <input type="checkbox" defaultChecked style={{ width: 18, height: 18 }} />
            </label>
            <div className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(43,36,32,0.08)" }}>
              <div className="flex items-center gap-2 text-sm"><Moon size={14} color={C.indigo} /> Mode sombre</div>
              <span className="text-xs" style={{ color: "rgba(43,36,32,0.4)" }}>Bientôt</span>
            </div>
            <button onClick={() => { setSettingsOpen(false); setBlockedOpen(true); }} className="w-full flex items-center justify-between py-3" style={{ borderTop: "1px solid rgba(43,36,32,0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><UserX size={14} color={C.indigo} /> Comptes bloqués</span>
              <span className="flex items-center gap-2">
                {blockedProfiles.length > 0 && <span className="text-xs font-bold" style={{ color: "rgba(43,36,32,0.4)" }}>{blockedProfiles.length}</span>}
                <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(43,36,32,0.35)" }} />
              </span>
            </button>
            <button onClick={() => { setSettingsOpen(false); setPrivacyFieldsOpen(true); }} className="w-full flex items-center justify-between py-3" style={{ borderTop: "1px solid rgba(43,36,32,0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><Shield size={14} color={C.indigo} /> Confidentialité des champs</span>
              <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(43,36,32,0.35)" }} />
            </button>

            <div className="text-[11px] font-black uppercase tracking-wider mt-4" style={{ color: "rgba(43,36,32,0.4)" }}>Baobab Protect</div>
            <div className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(43,36,32,0.08)" }}>
              <div className="flex items-center gap-2 text-sm"><ShieldCheck size={14} color={currentUser?.email_verified ? "#3897F0" : C.ink} /> Email vérifié</div>
              <span className="text-xs font-bold" style={{ color: currentUser?.email_verified ? "#3897F0" : "rgba(43,36,32,0.4)" }}>
                {currentUser?.email_verified ? "Vérifié" : "Non vérifié"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(43,36,32,0.08)" }}>
              <div className="flex items-center gap-2 text-sm"><Smartphone size={14} color={C.ink} /> Téléphone vérifié</div>
              <span className="text-xs" style={{ color: "rgba(43,36,32,0.4)" }}>Bientôt</span>
            </div>

            <button onClick={() => { setSettingsOpen(false); setPrivacyOpen(true); }} className="w-full flex items-center justify-between py-3 mt-2" style={{ borderTop: "1px solid rgba(43,36,32,0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><Shield size={14} color={C.indigo} /> Politique de confidentialité</span>
              <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(43,36,32,0.35)" }} />
            </button>
            <button onClick={() => { setSettingsOpen(false); setTermsOpen(true); }} className="w-full flex items-center justify-between py-3" style={{ borderTop: "1px solid rgba(43,36,32,0.08)", minHeight: 44 }}>
              <span className="flex items-center gap-2 text-sm"><Info size={14} color={C.indigo} /> Conditions d'utilisation</span>
              <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "rgba(43,36,32,0.35)" }} />
            </button>
            <div className="text-[11px] font-black uppercase tracking-wider mt-4" style={{ color: C.clay }}>Zone de danger</div>
            <button onClick={() => { setSettingsOpen(false); setDeleteAccountOpen(true); }} className="w-full flex items-center gap-2 py-3" style={{ borderTop: "1px solid rgba(43,36,32,0.08)", minHeight: 44, color: C.clay }}>
              <AlertTriangle size={14} /> <span className="text-sm font-semibold">Supprimer mon compte</span>
            </button>

            <button onClick={() => setSettingsOpen(false)} className="w-full mt-4 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(43,36,32,0.15)", color: C.ink, minHeight: 44 }}>
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

      {/* ---------- MODAL SUPPRESSION DE COMPTE ---------- */}
      <DeleteAccountModal
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        onDeleted={onAccountDeleted}
      />

      {/* ---------- MODAL COMPTES BLOQUÉS ---------- */}
      {blockedOpen && (
        <div className="bb-fade-in fixed inset-0 flex items-end justify-center z-30" style={{ background: "rgba(20,29,56,0.55)", backdropFilter: "blur(3px)" }} onClick={() => setBlockedOpen(false)} role="dialog" aria-modal="true" aria-label="Comptes bloqués">
          <div className="bb-card p-6 w-full max-w-md" style={{ borderRadius: "20px 20px 0 0", maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => { setBlockedOpen(false); setSettingsOpen(true); }} style={{ color: C.indigo }}><ArrowLeft size={16} /></button>
              <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: C.indigo }}>Comptes bloqués</div>
            </div>
            <p className="text-sm mb-3" style={{ color: "rgba(43,36,32,0.6)" }}>
              Ces profils ne peuvent plus te contacter ni apparaître dans ta liste de découverte.
            </p>
            {blockedProfiles.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "rgba(43,36,32,0.5)" }}>Aucun compte bloqué pour l'instant.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {blockedProfiles.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl" style={{ background: "rgba(43,36,32,0.03)" }}>
                    <Avatar name={p.name} url={p.avatar_url} size={38} />
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{p.name}</div></div>
                    <button
                      onClick={() => onUnblock?.(p)}
                      className="text-xs font-bold px-3 py-2 rounded-full"
                      style={{ border: "1px solid rgba(43,36,32,0.15)", color: C.clay, minHeight: 36 }}
                    >
                      Débloquer
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setBlockedOpen(false)} className="w-full py-3 mt-4 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(43,36,32,0.15)", color: C.ink, minHeight: 44 }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ---------- MODAL POLITIQUE DE CONFIDENTIALITÉ ---------- */}
      {privacyOpen && (
        <div className="bb-fade-in fixed inset-0 flex items-end justify-center z-30" style={{ background: "rgba(20,29,56,0.55)", backdropFilter: "blur(3px)" }} onClick={() => setPrivacyOpen(false)} role="dialog" aria-modal="true" aria-label="Politique de confidentialité">
          <div className="bb-card p-6 w-full max-w-md" style={{ borderRadius: "20px 20px 0 0", maxHeight: "80vh", overflowY: "auto", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: C.indigo }} className="mb-3">
              Politique de confidentialité
            </div>
            <div className="text-sm" style={{ color: "rgba(43,36,32,0.72)" }}>
              <PrivacyPolicyContent />
            </div>
            <button onClick={() => setPrivacyOpen(false)} className="w-full py-3 mt-2 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(43,36,32,0.15)", color: C.ink, minHeight: 44 }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ---------- MODAL CONDITIONS D'UTILISATION ---------- */}
      {termsOpen && (
        <div className="bb-fade-in fixed inset-0 flex items-end justify-center z-30" style={{ background: "rgba(20,29,56,0.55)", backdropFilter: "blur(3px)" }} onClick={() => setTermsOpen(false)} role="dialog" aria-modal="true" aria-label="Conditions d'utilisation">
          <div className="bb-card p-6 w-full max-w-md" style={{ borderRadius: "20px 20px 0 0", maxHeight: "80vh", overflowY: "auto", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: C.indigo }} className="mb-3">
              Conditions d'utilisation
            </div>
            <div className="text-sm" style={{ color: "rgba(43,36,32,0.72)" }}>
              <TermsOfServiceContent />
            </div>
            <button onClick={() => setTermsOpen(false)} className="w-full py-3 mt-2 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(43,36,32,0.15)", color: C.ink, minHeight: 44 }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ---------- MODAL À PROPOS ---------- */}
      {aboutOpen && (
        <div className="bb-fade-in fixed inset-0 flex items-end justify-center z-30" style={{ background: "rgba(20,29,56,0.55)", backdropFilter: "blur(3px)" }} onClick={() => setAboutOpen(false)} role="dialog" aria-modal="true" aria-label="À propos">
          <div className="bb-card p-6 w-full max-w-md text-center" style={{ borderRadius: "20px 20px 0 0" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 600, fontSize: 24, color: C.indigo }} className="mb-1">
              Baobab
            </div>
            <p className="text-sm mb-4" style={{ color: "rgba(43,36,32,0.6)" }}>
              L'app de rencontres pensée pour la communauté qui s'installe au Canada.
            </p>
            <p style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.06em", color: "rgba(43,36,32,0.45)" }}>
              BAOBAB — BY LESSI PATRICK
            </p>
            <button onClick={() => setAboutOpen(false)} className="w-full mt-4 py-2.5 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(43,36,32,0.15)", color: C.ink }}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
