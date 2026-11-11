import React, { useCallback, useEffect, useState } from "react";
import Paywall from "./Paywall";
import { usePremiumStatus } from "../../lib/premium/usePremiumStatus";
import { openPremium } from "../../lib/premium/premiumIntent";
import {
  STATS_PERIODS, DEFAULT_STATS_PERIOD, loadCreatorStats, isStatsEmpty, weekLabel, statsErrorMessage,
} from "../../lib/premium/creatorStats";
import { primary, muted, card, goldText, navy, bg } from "../social/theme";

// « Mes statistiques » (avantage Premium, SQL-40). Uniquement des interactions RÉELLES déjà
// enregistrées (j'aime, commentaires, abonnés, publications) : Baobab n'enregistre pas qui consulte un
// profil ou une publication, donc ne l'affiche pas — et l'écran le dit. Des nombres, jamais des personnes.
// Compte gratuit : fiche Premium (aucun faux chiffre en aperçu). Le droit est de toute façon re-vérifié
// par la base (my_creator_stats).

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: bg }}>
      <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: muted }}>{label}</p>
      <p className="text-2xl font-black mt-1" style={{ color: primary }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: muted }}>{hint}</p>
    </div>
  );
}

function WeeklyBars({ weekly }) {
  const totals = weekly.map((w) => w.likes + w.comments);
  const max = Math.max(1, ...totals);
  return (
    <ul className="flex flex-col gap-2" aria-label="Interactions reçues par semaine">
      {weekly.map((w, i) => (
        <li key={w.week} className="flex items-center gap-2 text-xs">
          <span className="w-16 flex-shrink-0" style={{ color: muted }}>Sem. du {weekLabel(w.week)}</span>
          <span className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: bg }} aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${Math.round((totals[i] / max) * 100)}%`, background: navy }} />
          </span>
          <span className="w-24 flex-shrink-0 text-right font-semibold" style={{ color: primary }}>
            {totals[i]} {totals[i] > 1 ? "interactions" : "interaction"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function CreatorStats({ currentUser }) {
  const { isPremium, loading: premiumLoading } = usePremiumStatus(currentUser);
  const [days, setDays] = useState(DEFAULT_STATS_PERIOD);
  const [state, setState] = useState({ status: "loading", stats: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isPremium) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading", error: null }));
    loadCreatorStats(days)
      .then((stats) => { if (!cancelled) setState({ status: "ready", stats, error: null }); })
      .catch((error) => { if (!cancelled) setState({ status: "error", stats: null, error }); });
    return () => { cancelled = true; };
  }, [isPremium, days, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (premiumLoading) return <p className="p-5 text-sm" style={{ color: muted }} role="status">Chargement…</p>;

  if (!isPremium) {
    return (
      <div className="p-5" style={{ color: primary }}>
        <Paywall
          title="Mes statistiques"
          featureKey="creator_stats"
          onDiscover={() => openPremium("discover")}
          onSubscribe={() => openPremium("plans")}
        />
      </div>
    );
  }

  const { status, stats, error } = state;
  return (
    <section className="p-5" aria-labelledby="creator-stats-title">
      <h2 id="creator-stats-title" className="text-base font-black" style={{ color: primary }}>📊 Mes statistiques</h2>
      <p className="text-xs mt-1" style={{ color: muted }}>
        Les interactions reçues par tes publications et ton profil. Des chiffres, jamais la liste des personnes.
      </p>

      <div className="flex gap-2 mt-3" role="group" aria-label="Période">
        {STATS_PERIODS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className="flex-1 py-2 rounded-xl text-sm font-bold focus-visible:outline focus-visible:outline-2"
            style={{ background: days === d ? navy : bg, color: days === d ? "#fff" : muted }}
          >
            {d} jours
          </button>
        ))}
      </div>

      {status === "loading" && <p className="text-sm mt-4" style={{ color: muted }} role="status">Calcul de tes statistiques…</p>}

      {status === "error" && (
        <div className="mt-4" role="alert">
          <p className="text-sm" style={{ color: primary }}>
            {statsErrorMessage(error) || "Impossible de charger tes statistiques pour le moment."}
          </p>
          <button type="button" onClick={retry} className="bb-btn-gold mt-2 px-4 py-2 rounded-xl text-sm font-bold">Réessayer</button>
        </div>
      )}

      {status === "ready" && stats && (
        <>
          {isStatsEmpty(stats) && (
            <p className="text-sm mt-4" style={{ color: primary }}>
              Rien à mesurer pour l'instant. Dès que tu publies et que d'autres réagissent, tes chiffres apparaissent ici.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2.5 mt-4">
            <StatCard label="Publications" value={stats.posts.total} hint={`${stats.posts.period} sur ${stats.periodDays} jours`} />
            <StatCard label="J'aime reçus" value={stats.likes.total} hint={`${stats.likes.period} sur ${stats.periodDays} jours`} />
            <StatCard label="Commentaires reçus" value={stats.comments.total} hint={`${stats.comments.period} sur ${stats.periodDays} jours`} />
            <StatCard label="Abonnés" value={stats.followers.total} hint={`${stats.followers.period} de plus sur ${stats.periodDays} jours`} />
          </div>

          {stats.weekly.length > 0 && (
            <div className={`${card} p-4 mt-4`}>
              <h3 className="text-xs font-black uppercase tracking-wide mb-3" style={{ color: muted }}>Évolution par semaine</h3>
              <WeeklyBars weekly={stats.weekly} />
            </div>
          )}

          {stats.topPosts.length > 0 && (
            <div className={`${card} p-4 mt-4`}>
              <h3 className="text-xs font-black uppercase tracking-wide mb-3" style={{ color: muted }}>Tes publications les plus appréciées</h3>
              <ol className="flex flex-col gap-3">
                {stats.topPosts.map((p, i) => (
                  <li key={p.id} className="flex gap-2.5 items-start">
                    <span className="text-sm font-black w-5 flex-shrink-0" style={{ color: goldText }}>{i + 1}.</span>
                    <div className="min-w-0">
                      <p className="text-sm break-words" style={{ color: primary }}>{p.excerpt}{p.excerpt.length >= 140 ? "…" : ""}</p>
                      <p className="text-xs mt-0.5" style={{ color: muted }}>
                        {p.likes} j'aime · {p.comments} {p.comments > 1 ? "commentaires" : "commentaire"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-[11px] mt-4" style={{ color: muted }}>
            Ces chiffres comptent des interactions réelles (j'aime, commentaires, abonnés). Baobab ne suit pas qui consulte ton profil ou lit tes publications, et ne l'affiche donc pas.
          </p>
        </>
      )}
    </section>
  );
}
