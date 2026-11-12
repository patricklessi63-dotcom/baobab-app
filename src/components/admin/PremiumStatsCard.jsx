import React from "react";
import { Crown } from "lucide-react";
import { primary, muted, bg, card, gold } from "../social/theme";

// Statistiques d'abonnement Premium pour les administrateurs (admin_premium_stats, SQL-37).
// Chiffres réels de la table subscriptions, jamais de montants en dollars : Stripe fait foi pour les revenus.
// Les valeurs absentes s'affichent « 0 » seulement si la base les renvoie ; sinon la ligne n'est pas inventée.

const ROWS = [
  ["premium_total", "Abonnés Premium"],
  ["paid", "Payants"],
  ["trialing", "En essai"],
  ["monthly", "Formule mensuelle"],
  ["yearly", "Formule annuelle"],
  ["cancel_scheduled", "Résiliation programmée"],
  ["past_due", "Paiement en retard"],
  ["new_last_30_days", "Nouveaux (30 jours)"],
  ["canceled_last_30_days", "Résiliés (30 jours)"],
];
const n = (v) => (typeof v === "number" ? v : Number(v));

export default function PremiumStatsCard({ stats }) {
  if (!stats || typeof stats !== "object") return null;
  const conversion = n(stats.conversion_percent);
  return (
    <section aria-label="Statistiques Premium" className={`${card} p-4 mt-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Crown size={16} color={gold} />
        <h3 className="text-sm font-black" style={{ color: primary }}>Premium</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ROWS.filter(([key]) => Number.isFinite(n(stats[key]))).map(([key, label]) => (
          <div key={key} className="rounded-2xl p-3" style={{ background: bg }}>
            <div className="text-xl font-black" style={{ color: primary }}>{n(stats[key]).toLocaleString("fr-CA")}</div>
            <div className="text-[11px] mt-0.5" style={{ color: muted }}>{label}</div>
          </div>
        ))}
        {Number.isFinite(conversion) && (
          <div className="rounded-2xl p-3" style={{ background: bg }}>
            <div className="text-xl font-black" style={{ color: primary }}>{conversion.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %</div>
            <div className="text-[11px] mt-0.5" style={{ color: muted }}>Part des membres abonnés</div>
          </div>
        )}
      </div>
      <p className="text-[11px] mt-3" style={{ color: muted }}>Comptes de l'application, sans montants : les revenus se lisent dans Stripe.</p>
    </section>
  );
}
