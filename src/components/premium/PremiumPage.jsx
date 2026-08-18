import React, { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { PREMIUM_PLANS, PREMIUM_FEATURES } from "../../lib/premium/premiumConfig";
import { startCheckout } from "../../lib/premium/checkout";
import { usePremiumStatus } from "../../lib/premium/usePremiumStatus";
import { primary, coral, gold, green, muted, bg, card } from "../social/theme";

// Page complète (pas une modale), montée comme un onglet sans icône de
// nav dédiée — cohérente avec l'identité visuelle Baobab existante
// (theme.js), pas une DA "à part" pour Premium. Aucun dark pattern :
// prix/période/conditions toujours visibles, pas de case pré-cochée.
export default function PremiumPage({ currentUser, onBack, onError }) {
  const { isPremium, subscription } = usePremiumStatus(currentUser);
  const [selectedPlan, setSelectedPlan] = useState("yearly");
  const [submitting, setSubmitting] = useState(false);

  const handleSubscribe = async () => {
    setSubmitting(true);
    try {
      await startCheckout(selectedPlan);
    } catch (e) {
      console.error(e);
      onError?.(e.message);
      setSubmitting(false);
    }
  };

  const selected = PREMIUM_PLANS.find((p) => p.id === selectedPlan);

  return (
    <section className="max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold mb-5 focus-visible:outline focus-visible:outline-2" style={{ color: primary }}>
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider" style={{ background: "rgba(242,184,75,.16)", color: "#A5761F" }}>
          💎 Baobab Premium
        </div>
        <h1 className="text-3xl md:text-4xl font-black mt-3" style={{ color: primary }}>Plus de possibilités pour créer de vraies connexions.</h1>
        <p className="text-sm mt-2 max-w-lg mx-auto" style={{ color: muted }}>
          Baobab reste utilisable gratuitement. Premium ajoute des outils en plus, jamais une version bridée du reste.
        </p>
      </div>

      {isPremium ? (
        <div className={`${card} p-6 text-center`}>
          <span style={{ fontSize: 32 }}>💎</span>
          <h2 className="text-lg font-black mt-2" style={{ color: primary }}>Tu es déjà Premium</h2>
          <p className="text-sm mt-1" style={{ color: muted }}>
            {subscription?.plan === "yearly" ? "Plan annuel" : "Plan mensuel"}
            {subscription?.current_period_end && ` — renouvellement le ${new Date(subscription.current_period_end).toLocaleDateString("fr-CA")}`}
          </p>
          <p className="text-xs mt-3" style={{ color: muted }}>Gère ton abonnement depuis ton profil, onglet "Abonnement".</p>
        </div>
      ) : (
        <>
          <div className={`${card} p-5 mb-6`}>
            <span className="text-xs font-black uppercase tracking-wider" style={{ color: muted }}>Avantages</span>
            <ul className="flex flex-col gap-3 mt-3">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-3">
                  <span className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>{f.icon}</span>
                  <div>
                    <div className="text-sm font-bold" style={{ color: primary }}>{f.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: muted }}>{f.description}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {PREMIUM_PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                aria-pressed={selectedPlan === plan.id}
                className={`${card} p-5 text-left relative focus-visible:outline focus-visible:outline-2`}
                style={{ border: selectedPlan === plan.id ? `2px solid ${coral}` : "2px solid transparent" }}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 right-4 text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{ background: green }}>{plan.badge}</span>
                )}
                <div className="text-sm font-bold" style={{ color: primary }}>{plan.label}</div>
                <div className="mt-1">
                  <span className="text-2xl font-black" style={{ color: primary }}>{plan.priceLabel}</span>
                  <span className="text-sm" style={{ color: muted }}> {plan.currency}{plan.period}</span>
                </div>
                {plan.subLabel && <div className="text-xs mt-0.5" style={{ color: muted }}>{plan.subLabel}</div>}
                {selectedPlan === plan.id && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-bold" style={{ color: coral }}>
                    <Check size={14} /> Sélectionné
                  </div>
                )}
              </button>
            ))}
          </div>

          <button onClick={handleSubscribe} disabled={submitting} className="w-full py-4 rounded-2xl text-sm font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${coral}, ${gold})` }}>
            {submitting ? "Redirection vers le paiement sécurisé..." : `Choisir le plan ${selected?.label.toLowerCase()}`}
          </button>
          <p className="text-[11px] text-center mt-3 leading-5" style={{ color: muted }}>
            Paiement sécurisé par Stripe, renouvellement automatique au tarif affiché jusqu'à annulation.
            Aucune donnée bancaire n'est stockée par Baobab. Annulation possible à tout moment depuis ton profil.
          </p>
        </>
      )}
    </section>
  );
}
