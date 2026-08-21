import React, { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, AlertTriangle, Landmark, ShieldCheck } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { primary, navy, coral, muted, card, bg } from "./theme";

const CATEGORY_LABELS = {
  procedures: "Procédures d'immigration",
  installation: "Installation & logement",
  emploi: "Emploi",
  sante: "Santé",
  education: "Éducation",
  frontiere: "Entrée au pays & frontière",
  general: "Actualités générales",
};
const CATEGORY_ORDER = ["procedures", "frontiere", "emploi", "installation", "sante", "education", "general"];

const SOURCE_META = {
  ircc: { label: "IRCC", full: "Immigration, Réfugiés et Citoyenneté Canada", icon: ShieldCheck, color: navy },
  asfc: { label: "ASFC", full: "Agence des services frontaliers du Canada", icon: Landmark, color: coral },
};

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "à l'instant";
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

function NewsCard({ item, featured }) {
  const meta = SOURCE_META[item.source] || {};
  const Icon = meta.icon || ShieldCheck;
  return (
    <a
      href={item.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${card} block overflow-hidden hover:-translate-y-0.5 transition-transform duration-200 ${featured ? "" : ""}`}
    >
      <div className="p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: meta.color }}>
          <Icon size={13} /> {meta.full}
        </div>
        <h3 className={featured ? "text-lg font-black leading-snug" : "text-sm font-black leading-snug"} style={{ color: primary }}>
          {item.title}
        </h3>
        {item.summary && (
          <p className={`mt-2 ${featured ? "text-sm" : "text-xs"} leading-5`} style={{ color: muted }}>
            {featured ? item.summary.slice(0, 220) : item.summary.slice(0, 130)}
            {item.summary.length > (featured ? 220 : 130) ? "…" : ""}
          </p>
        )}
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px]" style={{ color: muted }}>{new Date(item.published_at).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" })}</span>
          <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: coral }}>
            Source officielle <ExternalLink size={11} />
          </span>
        </div>
      </div>
    </a>
  );
}

export default function ImmigrationNewsView({ onBack, onError }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchLogs, setFetchLogs] = useState({});

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from("immigration_news").select("*").order("published_at", { ascending: false }).limit(200),
      supabase.from("immigration_news_fetch_log").select("*").order("fetched_at", { ascending: false }).limit(20),
    ]).then(([newsRes, logRes]) => {
      if (!alive) return;
      if (newsRes.error) { onError?.("Impossible de charger les actualités."); setLoading(false); return; }
      setItems(newsRes.data || []);
      const bySource = {};
      for (const log of logRes.data || []) {
        if (!bySource[log.source]) bySource[log.source] = log;
      }
      setFetchLogs(bySource);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [onError]);

  const featured = items[0];
  const rest = items.slice(1);
  const grouped = CATEGORY_ORDER.map((cat) => ({ cat, items: rest.filter((i) => i.category === cat) })).filter((g) => g.items.length > 0);

  const anyFetchFailed = Object.values(fetchLogs).some((l) => !l.ok);
  const oldestSuccessfulFetch = Object.values(fetchLogs)
    .filter((l) => l.ok)
    .map((l) => l.fetched_at)
    .sort()[0];

  return (
    <section className="max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold mb-4" style={{ color: muted }}>
        <ArrowLeft size={15} /> Accueil
      </button>

      <div className="mb-5">
        <h1 className="text-2xl font-black" style={{ color: primary }}>Immigration & Intégration</h1>
        <p className="text-sm mt-1" style={{ color: muted }}>Actualités officielles, directement depuis IRCC et l'ASFC.</p>
      </div>

      <div className="rounded-2xl p-4 mb-6 flex gap-3" style={{ background: "#FFF3D6", border: "1px solid rgba(242,184,75,.3)" }}>
        <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#A5761F" }} />
        <p className="text-xs leading-5" style={{ color: "#5A4218" }}>
          Ceci n'est pas un conseil juridique ou d'immigration. Baobab indexe uniquement les titres et résumés publiés par les sources officielles ci-dessous — vérifie toujours l'information complète sur le site officiel, ou auprès d'un consultant ou avocat en immigration agréé.
        </p>
      </div>

      {anyFetchFailed && (
        <div className="rounded-2xl p-3 mb-5 text-xs" style={{ background: bg, color: muted }}>
          Une source n'a pas pu être actualisée récemment — le dernier contenu récupéré avec succès reste affiché ci-dessous
          {oldestSuccessfulFetch ? ` (dernière mise à jour réussie : ${timeAgo(oldestSuccessfulFetch)}).` : "."}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-center py-10" style={{ color: muted }}>Chargement...</p>
      ) : items.length === 0 ? (
        <div className={`${card} p-8 text-center`}>
          <p className="text-sm" style={{ color: muted }}>Aucune actualité indexée pour l'instant. Reviens bientôt.</p>
        </div>
      ) : (
        <>
          {featured && (
            <div className="mb-6">
              <NewsCard item={featured} featured />
            </div>
          )}
          {grouped.map(({ cat, items: catItems }) => (
            <div key={cat} className="mb-7">
              <h2 className="text-sm font-black mb-3" style={{ color: primary }}>{CATEGORY_LABELS[cat]}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {catItems.map((item) => <NewsCard key={item.id} item={item} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
