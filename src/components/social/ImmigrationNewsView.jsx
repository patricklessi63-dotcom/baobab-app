import React, { useEffect, useState } from "react";
import {
  ArrowLeft, ExternalLink, AlertTriangle, Landmark, ShieldCheck,
  CreditCard, Stethoscope, Wallet, Car, Receipt, Home, Phone,
  GraduationCap, PhoneCall, BadgeCheck, Compass,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { primary, navy, coral, muted, card, bg, surface } from "./theme";

const GUIDE_SECTIONS = [
  {
    icon: CreditCard,
    title: "Numéro d'assurance sociale (NAS)",
    body: "Indispensable pour travailler et pour accéder à la plupart des prestations. À demander dès l'arrivée auprès de Service Canada, en ligne ou en personne — gratuit.",
    linkLabel: "Service Canada — NAS",
    href: "https://www.canada.ca/fr/emploi-developpement-social/services/numero-assurance-sociale.html",
  },
  {
    icon: Stethoscope,
    title: "Carte d'assurance maladie provinciale",
    body: "Chaque province gère son propre régime (RAMQ au Québec, OHIP en Ontario, etc.). Un délai de carence de quelques mois s'applique souvent — prévoir une assurance privée temporaire si besoin.",
    linkLabel: "Trouver le régime de ta province",
    href: "https://www.canada.ca/fr/sante-canada/services/systeme-soins-sante/rapports-publications/regimes-assurance-maladie-provinciaux-territoriaux.html",
  },
  {
    icon: Wallet,
    title: "Compte bancaire",
    body: "La plupart des grandes banques offrent un compte pensé pour les nouveaux arrivants (sans historique de crédit canadien exigé) — utile aussi pour bâtir sa cote de crédit.",
  },
  {
    icon: Car,
    title: "Permis de conduire",
    body: "Les règles d'échange d'un permis étranger varient selon la province et le pays d'origine — certains permis s'échangent directement, d'autres exigent des examens.",
  },
  {
    icon: Receipt,
    title: "Déclaration de revenus (ARC)",
    body: "Même sans revenu canadien, produire une déclaration dès la première année complète permet souvent de débloquer des crédits et prestations (Allocation canadienne pour enfants, crédit de TPS/TVH, etc.).",
    linkLabel: "Agence du revenu du Canada",
    href: "https://www.canada.ca/fr/agence-revenu.html",
  },
  {
    icon: Home,
    title: "Logement",
    body: "Bail, dépôt de garantie, droits et obligations du locataire diffèrent selon la province. Vérifie les règles locales avant de signer quoi que ce soit.",
  },
  {
    icon: Phone,
    title: "Téléphone et internet",
    body: "Comparer les forfaits est essentiel : certains fournisseurs proposent des offres sans engagement, utiles le temps de bâtir un historique de crédit.",
  },
  {
    icon: GraduationCap,
    title: "Reconnaissance des diplômes",
    body: "Selon la profession et la province, une évaluation ou un ordre professionnel peut être requis avant de pratiquer. Les délais peuvent être longs — s'y prendre tôt.",
  },
  {
    icon: BadgeCheck,
    title: "Carte de résident permanent",
    body: "Nécessaire pour voyager et revenir au Canada si tu es résident permanent. Vérifie sa date d'expiration et prévois le renouvellement à l'avance.",
    linkLabel: "IRCC — Carte de RP",
    href: "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/nouveaux-immigrants/carte-rp.html",
  },
  {
    icon: PhoneCall,
    title: "Numéros utiles",
    body: "911 pour toute urgence (police, feu, ambulance). Chaque province a aussi une ligne santé non urgente (ex. Info-Santé 811 au Québec) pour un avis médical par téléphone.",
  },
];

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

function GuideCard({ section }) {
  const Icon = section.icon;
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(20,110,70,.08)" }}>
          <Icon size={17} style={{ color: primary }} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-black leading-snug" style={{ color: primary }}>{section.title}</h3>
          <p className="text-xs leading-5 mt-1.5" style={{ color: muted }}>{section.body}</p>
          {section.href && (
            <a href={section.href} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold flex items-center gap-1 mt-2" style={{ color: coral }}>
              {section.linkLabel} <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ImmigrationNewsView({ onBack, onError }) {
  const [view, setView] = useState("news"); // news | guide
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
        <p className="text-sm mt-1" style={{ color: muted }}>Actualités officielles et repères essentiels pour ton installation au Canada.</p>
      </div>

      <div className="flex gap-2 mb-6 p-1 rounded-2xl" style={{ background: bg }}>
        <button
          onClick={() => setView("news")}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
          style={view === "news" ? { background: surface, color: primary, boxShadow: "0 1px 3px rgba(8,20,14,0.1)" } : { color: muted }}
        >
          <ShieldCheck size={15} /> Actualités
        </button>
        <button
          onClick={() => setView("guide")}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
          style={view === "guide" ? { background: surface, color: primary, boxShadow: "0 1px 3px rgba(8,20,14,0.1)" } : { color: muted }}
        >
          <Compass size={15} /> Guide du nouvel arrivant
        </button>
      </div>

      {view === "guide" ? (
        <>
          <div className="rounded-2xl p-4 mb-6 flex gap-3" style={{ background: "#FFF3D6", border: "1px solid rgba(242,184,75,.3)" }}>
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#A5761F" }} />
            <p className="text-xs leading-5" style={{ color: "#5A4218" }}>
              Repères généraux, non exhaustifs et pas un conseil juridique — les démarches exactes varient selon ta province et ta situation. Vérifie toujours auprès des sources officielles.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {GUIDE_SECTIONS.map((section) => <GuideCard key={section.title} section={section} />)}
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}
