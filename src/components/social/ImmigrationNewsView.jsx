import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ExternalLink, AlertTriangle, Landmark, ShieldCheck,
  CreditCard, Stethoscope, Wallet, Car, Receipt, Home, Phone,
  GraduationCap, PhoneCall, BadgeCheck, Compass, Search, X, Heart,
  CheckCircle2, MapPin, Mail, Clock, Building2, Globe2,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { primary, coral, gold, muted, card, bg, surface } from "./theme";
import {
  ESSENTIAL_DOCUMENTS, BORDER_NOTE, PRIORITY_STEPS, EXTRA_TIPS,
  PROVINCE_DIRECTORY, GENERALIST_DIRECTORY, FEDERAL_RESOURCES, GUIDE_LIMITS,
} from "../../lib/newcomerGuideData";

const STEP_ICONS = { CreditCard, Stethoscope, Wallet, Car, Receipt, Home, Phone, GraduationCap, PhoneCall, BadgeCheck };

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
  ircc: { label: "IRCC", full: "Immigration, Réfugiés et Citoyenneté Canada", icon: ShieldCheck, color: primary },
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

// Fraicheur (item 31 du cahier des charges) — calculee cote client a partir
// de published_at, aucune colonne supplementaire necessaire. Seuils
// génériques (pas une garantie officielle de validité) : une actualité
// gouvernementale récente est réputée fiable ; au-delà d'un mois, on
// encourage à revérifier sur la source plutôt que de laisser croire que
// rien n'a changé depuis.
function freshness(publishedAt) {
  const days = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
  if (days <= 14) return { emoji: "🟢", label: "Vérifiée récemment", color: "#1E7A4C" };
  if (days <= 45) return { emoji: "🟡", label: "À revérifier", color: "#A5761F" };
  return { emoji: "🔴", label: "Ancienne — vérifier la source", color: "#B3432B" };
}

function NewsCard({ item, featured, isFavorite, onToggleFavorite }) {
  const meta = SOURCE_META[item.source] || {};
  const Icon = meta.icon || ShieldCheck;
  const fresh = freshness(item.published_at);
  return (
    <div className={`${card} relative overflow-hidden hover:-translate-y-0.5 transition-transform duration-200`}>
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(item.id); }}
          aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={isFavorite}
          className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,.85)", backdropFilter: "blur(2px)" }}
        >
          <Heart size={15} color={coral} fill={isFavorite ? coral : "none"} />
        </button>
      )}
      <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="block">
        <div className="p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider" style={{ color: meta.color }}>
              <Icon size={13} /> {meta.full}
            </div>
            <span className="text-[11px] font-bold shrink-0" style={{ color: fresh.color }} title={fresh.label}>
              {fresh.emoji}
            </span>
          </div>
          <h3 className={featured ? "text-lg font-black leading-snug pr-8" : "text-sm font-black leading-snug pr-8"} style={{ color: primary }}>
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
    </div>
  );
}

function GuideCard({ section, step }) {
  const Icon = STEP_ICONS[section.icon] || section.icon;
  return (
    <div className={`${card} p-4 relative`}>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 relative" style={{ background: "rgba(20,110,70,.08)" }}>
          <Icon size={17} style={{ color: primary }} />
          {step && (
            <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full text-[9px] font-black text-white flex items-center justify-center" style={{ background: coral }}>
              {step}
            </span>
          )}
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

function DocumentsChecklist() {
  return (
    <div className={`${card} p-4 mb-6`}>
      <h3 className="text-sm font-black mb-3 flex items-center gap-2" style={{ color: primary }}>
        🎒 Documents essentiels à apporter (en bagage à main)
      </h3>
      <ul className="space-y-2">
        {ESSENTIAL_DOCUMENTS.map((doc) => (
          <li key={doc} className="flex items-start gap-2 text-xs leading-5" style={{ color: muted }}>
            <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" style={{ color: primary }} />
            <span>{doc}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-5 mt-3 pt-3" style={{ color: muted, borderTop: `1px solid rgba(20,110,70,.08)` }}>{BORDER_NOTE}</p>
    </div>
  );
}

function OrgEntry({ org }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0" style={{ borderBottom: "1px solid rgba(20,110,70,.06)" }}>
      <h4 className="text-xs font-black" style={{ color: primary }}>{org.name}</h4>
      <div className="mt-1.5 space-y-1">
        {org.address && (
          <p className="text-[11px] leading-4 flex items-start gap-1.5" style={{ color: muted }}>
            <MapPin size={12} className="flex-shrink-0 mt-0.5" /> {org.address}
          </p>
        )}
        {org.phone && (
          <p className="text-[11px] leading-4 flex items-start gap-1.5" style={{ color: muted }}>
            <Phone size={12} className="flex-shrink-0 mt-0.5" /> {org.phone}
          </p>
        )}
        {org.email && (
          <p className="text-[11px] leading-4 flex items-start gap-1.5" style={{ color: muted }}>
            <Mail size={12} className="flex-shrink-0 mt-0.5" /> {org.email}
          </p>
        )}
        {org.website && (
          <p className="text-[11px] leading-4 flex items-start gap-1.5" style={{ color: muted }}>
            <Globe2 size={12} className="flex-shrink-0 mt-0.5" /> {org.website}
          </p>
        )}
        {org.hours && (
          <p className="text-[11px] leading-4 flex items-start gap-1.5" style={{ color: muted }}>
            <Clock size={12} className="flex-shrink-0 mt-0.5" /> {org.hours}
          </p>
        )}
      </div>
      {org.services && <p className="text-[11px] leading-5 mt-2" style={{ color: muted }}>{org.services}</p>}
      {org.note && (
        <p className="text-[11px] leading-5 mt-2 italic" style={{ color: "#A5761F" }}>{org.note}</p>
      )}
    </div>
  );
}

function GeneralistDirectory() {
  const [selected, setSelected] = useState(null);
  const entry = GENERALIST_DIRECTORY.find((c) => c.city === selected);
  return (
    <div className={`${card} p-4 mb-6`}>
      <h3 className="text-sm font-black mb-1 flex items-center gap-2" style={{ color: primary }}>
        <Globe2 size={16} /> Organismes d'établissement généralistes
      </h3>
      <p className="text-xs leading-5 mb-3" style={{ color: muted }}>
        Ouverts à toutes origines et langues, en plus du réseau francophone ci-dessus — choisis ta ville. Répertoire encore limité à sept grandes villes, à étendre.
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {GENERALIST_DIRECTORY.map((c) => (
          <button
            key={c.city}
            onClick={() => setSelected((s) => (s === c.city ? null : c.city))}
            className="px-3 py-1.5 rounded-full text-[11px] font-bold flex-shrink-0"
            style={selected === c.city ? { background: primary, color: "#fff" } : { background: bg, color: muted }}
          >
            {c.city}
          </button>
        ))}
      </div>
      {entry ? (
        <div className="mt-4 pt-1">
          {entry.orgs.map((org) => <OrgEntry key={org.name} org={org} />)}
        </div>
      ) : (
        <p className="text-xs text-center py-4" style={{ color: muted }}>Sélectionne ta ville pour voir les organismes près de toi.</p>
      )}
    </div>
  );
}

function ProvinceDirectory() {
  const [selected, setSelected] = useState(null);
  const entry = PROVINCE_DIRECTORY.find((p) => p.province === selected);
  return (
    <div className={`${card} p-4 mb-6`}>
      <h3 className="text-sm font-black mb-1 flex items-center gap-2" style={{ color: primary }}>
        <Building2 size={16} /> Organismes d'accueil francophones
      </h3>
      <p className="text-xs leading-5 mb-3" style={{ color: muted }}>
        Réseau RIF (financé par IRCC) — choisis ta province ou ton territoire.
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {PROVINCE_DIRECTORY.map((p) => (
          <button
            key={p.province}
            onClick={() => setSelected((s) => (s === p.province ? null : p.province))}
            className="px-3 py-1.5 rounded-full text-[11px] font-bold flex-shrink-0"
            style={selected === p.province ? { background: primary, color: "#fff" } : { background: bg, color: muted }}
          >
            {p.province}
          </button>
        ))}
      </div>
      {entry && (
        <div className="mt-4 pt-1">
          {entry.orgs.length > 0 ? (
            entry.orgs.map((org) => <OrgEntry key={org.name} org={org} />)
          ) : (
            <p className="text-xs leading-5" style={{ color: muted }}>{entry.note}</p>
          )}
          {entry.orgs.length > 0 && entry.note && (
            <p className="text-[11px] leading-5 mt-2 italic" style={{ color: "#A5761F" }}>{entry.note}</p>
          )}
        </div>
      )}
      {!entry && (
        <p className="text-xs text-center py-4" style={{ color: muted }}>Sélectionne ta province pour voir les organismes près de toi.</p>
      )}
    </div>
  );
}

export default function ImmigrationNewsView({ onBack, onError, currentUser }) {
  const [view, setView] = useState("news"); // news | guide
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchLogs, setFetchLogs] = useState({});
  const [search, setSearch] = useState("");
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // Garde synchrone contre le double clic/tap rapide sur le cœur : sans elle,
  // deux appels quasi simultanés lisent tous les deux favoriteIds.has(newsId)
  // avant que le premier setFavoriteIds ne soit commité, partent tous les
  // deux en insertion, le second échoue sur la contrainte unique
  // (profile_id, news_id) et son catch — construit avec un isFav figé au
  // moment du clic, donc faux — retire à tort le favori que le premier appel
  // venait d'ajouter avec succès. Même pattern que likeInFlightRef (App.jsx).
  const favoriteInFlightRef = useRef(new Set());

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from("immigration_news").select("*").order("published_at", { ascending: false }).limit(200),
      supabase.from("immigration_news_fetch_log").select("*").order("fetched_at", { ascending: false }).limit(20),
      currentUser ? supabase.from("immigration_news_favorites").select("news_id").eq("profile_id", currentUser.id) : Promise.resolve({ data: [] }),
    ]).then(([newsRes, logRes, favRes]) => {
      if (!alive) return;
      if (newsRes.error) { onError?.("Impossible de charger les actualités."); setLoading(false); return; }
      setItems(newsRes.data || []);
      const bySource = {};
      for (const log of logRes.data || []) {
        if (!bySource[log.source]) bySource[log.source] = log;
      }
      setFetchLogs(bySource);
      setFavoriteIds(new Set((favRes.data || []).map((r) => r.news_id)));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [onError, currentUser]);

  const toggleFavorite = async (newsId) => {
    if (!currentUser || favoriteInFlightRef.current.has(newsId)) return;
    favoriteInFlightRef.current.add(newsId);
    const isFav = favoriteIds.has(newsId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(newsId); else next.add(newsId);
      return next;
    });
    try {
      if (isFav) {
        const { error } = await supabase.from("immigration_news_favorites").delete().eq("profile_id", currentUser.id).eq("news_id", newsId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("immigration_news_favorites").insert({ profile_id: currentUser.id, news_id: newsId });
        if (error) throw error;
      }
    } catch (e) {
      console.error(e);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(newsId); else next.delete(newsId);
        return next;
      });
      onError?.("Impossible de mettre à jour tes favoris. Réessaie.");
    } finally {
      favoriteInFlightRef.current.delete(newsId);
    }
  };

  const searchedItems = useMemo(() => {
    let list = items;
    if (favoritesOnly) list = list.filter((i) => favoriteIds.has(i.id));
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) =>
      i.title?.toLowerCase().includes(q) ||
      i.summary?.toLowerCase().includes(q) ||
      (CATEGORY_LABELS[i.category] || "").toLowerCase().includes(q)
    );
  }, [items, search, favoritesOnly, favoriteIds]);

  const isFiltering = Boolean(search.trim()) || favoritesOnly;
  const featured = isFiltering ? null : searchedItems[0];
  const rest = isFiltering ? searchedItems : searchedItems.slice(1);
  const grouped = isFiltering
    ? [{ cat: null, items: rest }]
    : CATEGORY_ORDER.map((cat) => ({ cat, items: rest.filter((i) => i.category === cat) })).filter((g) => g.items.length > 0);

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
          <div className="rounded-2xl p-4 mb-6 flex gap-3" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)" }}>
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: gold }} />
            <p className="text-xs leading-5" style={{ color: muted }}>
              Repères généraux, non exhaustifs et pas un conseil juridique — les démarches exactes varient selon ta province et ta situation. Vérifie toujours auprès des sources officielles.
            </p>
          </div>

          <DocumentsChecklist />

          <h2 className="text-sm font-black mb-3" style={{ color: primary }}>Démarches prioritaires, dans l'ordre</h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-6">
            {PRIORITY_STEPS.map((section, i) => <GuideCard key={section.title} section={section} step={i + 1} />)}
          </div>

          <h2 className="text-sm font-black mb-3" style={{ color: primary }}>Autres repères utiles</h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-6">
            {EXTRA_TIPS.map((section) => <GuideCard key={section.title} section={section} />)}
          </div>

          <GeneralistDirectory />

          <ProvinceDirectory />

          <div className={`${card} p-4 mb-6`}>
            <h3 className="text-sm font-black mb-3" style={{ color: primary }}>Ressources fédérales</h3>
            <div className="space-y-2.5">
              {FEDERAL_RESOURCES.map((r) => (
                <a key={r.label} href={r.href} target="_blank" rel="noopener noreferrer" className="block">
                  <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: coral }}>{r.label} <ExternalLink size={11} /></p>
                  <p className="text-[11px] mt-0.5" style={{ color: muted }}>{r.detail}</p>
                </a>
              ))}
            </div>
          </div>

          <p className="text-[11px] leading-5 text-center px-4" style={{ color: muted }}>{GUIDE_LIMITS}</p>
        </>
      ) : (
        <>
          <div className="rounded-2xl p-4 mb-6 flex gap-3" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)" }}>
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: gold }} />
            <p className="text-xs leading-5" style={{ color: muted }}>
              Ceci n'est pas un conseil juridique ou d'immigration. Baobab indexe uniquement les titres et résumés publiés par les sources officielles ci-dessous — vérifie toujours l'information complète sur le site officiel, ou auprès d'un consultant ou avocat en immigration agréé.
            </p>
          </div>

          {anyFetchFailed && (
            <div className="rounded-2xl p-3 mb-5 text-xs" style={{ background: bg, color: muted }}>
              Une source n'a pas pu être actualisée récemment — le dernier contenu récupéré avec succès reste affiché ci-dessous
              {oldestSuccessfulFetch ? ` (dernière mise à jour réussie : ${timeAgo(oldestSuccessfulFetch)}).` : "."}
            </div>
          )}

          <div className="flex gap-2 mb-6">
            <div className="flex-1 flex items-center gap-2 rounded-full px-4 py-2.5" style={{ background: bg }}>
              <Search size={15} color={muted} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une actualité, un mot-clé..."
                className="flex-1 bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)] text-sm"
                style={{ color: primary }}
              />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Effacer la recherche">
                  <X size={14} color={muted} />
                </button>
              )}
            </div>
            {currentUser && (
              <button
                onClick={() => setFavoritesOnly((v) => !v)}
                aria-pressed={favoritesOnly}
                aria-label="Afficher uniquement mes favoris"
                className="shrink-0 h-11 w-11 rounded-full flex items-center justify-center"
                style={favoritesOnly ? { background: coral } : { background: bg }}
              >
                <Heart size={16} color={favoritesOnly ? "#fff" : coral} fill={favoritesOnly ? "#fff" : "none"} />
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-center py-10" style={{ color: muted }}>Chargement...</p>
          ) : items.length === 0 ? (
            <div className={`${card} p-8 text-center`}>
              <p className="text-sm" style={{ color: muted }}>Aucune actualité indexée pour l'instant. Reviens bientôt.</p>
            </div>
          ) : searchedItems.length === 0 ? (
            <div className={`${card} p-8 text-center`}>
              <p className="text-sm" style={{ color: muted }}>
                {favoritesOnly ? "Aucun favori pour l'instant." : "Aucun résultat pour cette recherche."}
              </p>
            </div>
          ) : (
            <>
              {featured && (
                <div className="mb-6">
                  <NewsCard item={featured} featured isFavorite={favoriteIds.has(featured.id)} onToggleFavorite={currentUser ? toggleFavorite : null} />
                </div>
              )}
              {grouped.map(({ cat, items: catItems }) => (
                <div key={cat || "resultats"} className="mb-7">
                  {cat && <h2 className="text-sm font-black mb-3" style={{ color: primary }}>{CATEGORY_LABELS[cat]}</h2>}
                  <div className="grid sm:grid-cols-2 gap-3">
                    {catItems.map((item) => (
                      <NewsCard key={item.id} item={item} isFavorite={favoriteIds.has(item.id)} onToggleFavorite={currentUser ? toggleFavorite : null} />
                    ))}
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
