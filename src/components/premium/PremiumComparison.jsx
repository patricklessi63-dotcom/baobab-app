import React from "react";
import { Check, Minus } from "lucide-react";
import { COMPARISON_ROWS } from "../../lib/premium/premiumConfig";
import { primary, muted, card, goldText, green } from "../social/theme";

// Tableau comparatif Gratuit / Premium. Consultable par tout le monde, sans
// abonnement ni paiement. Les lignes viennent de COMPARISON_ROWS
// (premiumConfig.js) : uniquement ce que le code fait aujourd'hui. Vrai
// <table> pour que les lecteurs d'écran annoncent « Gratuit » / « Premium »
// avant chaque cellule ; l'état « inclus / non inclus » n'est jamais porté
// par la couleur seule (icône + texte masqué visuellement).
function Cell({ value }) {
  if (value === true) {
    return (
      <>
        <Check size={18} aria-hidden="true" style={{ color: green }} className="inline-block" />
        <span className="sr-only">Inclus</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus size={18} aria-hidden="true" style={{ color: muted }} className="inline-block" />
        <span className="sr-only">Non inclus</span>
      </>
    );
  }
  return <span className="text-xs font-semibold leading-snug">{value}</span>;
}

export default function PremiumComparison({ rows = COMPARISON_ROWS }) {
  return (
    <section className={`${card} p-4 sm:p-5 mb-6`} aria-labelledby="premium-comparison-title">
      <h2 id="premium-comparison-title" className="text-xs font-black uppercase tracking-wider" style={{ color: muted }}>
        Gratuit ou Premium
      </h2>
      <p className="text-xs mt-1.5" style={{ color: muted }}>
        Baobab gratuit reste complet. Premium ajoute des outils, il n'enlève rien.
      </p>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">Comparaison entre Baobab gratuit et Baobab Premium</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left py-2 pr-2 font-black text-xs" style={{ color: muted }}>Fonctionnalité</th>
              <th scope="col" className="py-2 px-2 w-24 sm:w-32 text-center font-black text-xs" style={{ color: primary }}>Gratuit</th>
              <th scope="col" className="py-2 pl-2 w-24 sm:w-32 text-center font-black text-xs rounded-t-xl" style={{ color: goldText, background: "rgba(242,163,58,.14)" }}>
                <span aria-hidden="true">💎 </span>Premium
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} style={{ borderTop: "1px solid var(--bb-border)" }}>
                <th scope="row" className="text-left py-3 pr-2 font-semibold align-middle" style={{ color: primary }}>
                  <span aria-hidden="true" className="mr-1.5">{row.icon}</span>{row.label}
                </th>
                <td className="py-3 px-2 text-center align-middle" style={{ color: primary }}><Cell value={row.free} /></td>
                <td className="py-3 pl-2 text-center align-middle" style={{ color: primary, background: "rgba(242,163,58,.10)" }}><Cell value={row.premium} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
