// Récupère les actualités officielles IRCC + ASFC (flux Atom du gouvernement
// du Canada, api.io.canada.ca — vérifiés manuellement le 2026-08-20, contenu
// réel confirmé) et les indexe dans immigration_news. Appelée exclusivement
// par pg_cron/pg_net toutes les 6h (voir supabase-immigration-news.sql),
// jamais directement par un client — même motif d'autorisation que
// process-scheduled-deletions/index.ts (correspondance exacte avec la clé
// service role, pas de JWT utilisateur).
//
// RÈGLE ABSOLUE : ce fichier n'invente, ne résume ni ne reformule jamais un
// contenu — titre/résumé/date/lien sont copiés tels quels depuis le flux
// officiel. "category" est une classification par mots-clés, best-effort,
// jamais présentée comme officielle (voir CATEGORY_KEYWORDS).
//
// MIFI (Québec) volontairement absent : aucun flux RSS/Atom trouvé lors de
// la recherche de sources (validé avec l'utilisateur avant implémentation).

import { XMLParser } from "npm:fast-xml-parser@4";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

const SOURCES = [
  {
    source: "ircc" as const,
    label: "Immigration, Réfugiés et Citoyenneté Canada",
    url: "https://api.io.canada.ca/io-server/gc/news/fr/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&pick=30&format=atom&atomtitle=IRCC",
  },
  {
    source: "asfc" as const,
    label: "Agence des services frontaliers du Canada",
    url: "https://api.io.canada.ca/io-server/gc/news/fr/v2?dept=canadaborderservicesagency&sort=publishedDate&orderBy=desc&pick=30&format=atom&atomtitle=ASFC",
  },
];

// Best-effort uniquement — voir avertissement en tête de fichier.
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["emploi", ["travail", "emploi", "permis de travail", "employeur"]],
  ["installation", ["logement", "installation", "s'établir", "accueil"]],
  ["sante", ["santé", "assurance-maladie", "soins"]],
  ["education", ["étude", "étudiant", "éducation", "établissement d'enseignement"]],
  ["frontiere", ["frontière", "douane", "entrée au pays", "voyageur"]],
  ["procedures", ["demande", "délai de traitement", "admissibilité", "résidence permanente", "citoyenneté", "visa"]],
];

function categorize(text: string): string {
  const lower = text.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return "general";
}

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

async function fetchSource(src: (typeof SOURCES)[number]) {
  const res = await fetch(src.url, { headers: { "User-Agent": "BaobabApp/1.0 (immigration news aggregator)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${src.source}`);
  const xml = await res.text();
  const parsed = parser.parse(xml);
  const entries = parsed?.feed?.entry;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  if (list.length === 0) throw new Error(`Flux ${src.source} vide ou format inattendu`);

  const rows = list.map((entry: Record<string, unknown>) => {
    const link = Array.isArray(entry.link) ? entry.link[0] : entry.link;
    const href = typeof link === "object" && link !== null ? (link as Record<string, string>)["@_href"] : String(link || "");
    const title = typeof entry.title === "object" ? (entry.title as Record<string, string>)["#text"] ?? "" : String(entry.title || "");
    const summaryRaw = typeof entry.summary === "object" ? (entry.summary as Record<string, string>)["#text"] ?? "" : String(entry.summary || "");
    const summary = stripHtml(summaryRaw).slice(0, 600);
    const published = String(entry.updated || entry.published || "");
    const id = String(entry.id || href);
    return {
      source: src.source,
      source_label: src.label,
      external_id: id,
      title: stripHtml(title),
      summary,
      category: categorize(`${title} ${summary}`),
      published_at: published ? new Date(published).toISOString() : new Date().toISOString(),
      source_url: href,
      fetched_at: new Date().toISOString(),
    };
  }).filter((r) => r.title && r.source_url);

  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Non autorisé." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: { source: string; ok: boolean; count?: number; error?: string }[] = [];

  for (const src of SOURCES) {
    try {
      const rows = await fetchSource(src);
      if (rows.length > 0) {
        const { error } = await admin.from("immigration_news").upsert(rows, { onConflict: "source,external_id" });
        if (error) throw error;
      }
      await admin.from("immigration_news_fetch_log").insert({ source: src.source, ok: true, items_count: rows.length });
      results.push({ source: src.source, ok: true, count: rows.length });
    } catch (e) {
      // Échec d'UNE source : on continue avec l'autre, on journalise l'échec,
      // on ne touche jamais aux lignes déjà indexées pour cette source (le
      // dernier contenu récupéré avec succès reste affiché côté client).
      console.error(`Échec récupération ${src.source}:`, e);
      await admin.from("immigration_news_fetch_log").insert({ source: src.source, ok: false, error: String(e) });
      results.push({ source: src.source, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
