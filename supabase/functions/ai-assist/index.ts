// Rédaction assistée par IA (Anthropic Claude) — action unique routée par
// "action" plutôt que 5 fonctions séparées, plus simple à déployer/opérer.
// Appelée par le client authentifié (supabase.functions.invoke, JWT vérifié
// automatiquement — pas de --no-verify-jwt sur cette fonction).
//
// Secrets requis : ANTHROPIC_API_KEY
// Optionnel : ANTHROPIC_MODEL (défaut claude-3-5-haiku-latest — rapide et
// économique, largement suffisant pour de courtes réécritures/suggestions),
// AI_RATE_LIMIT_PER_HOUR (défaut 20)
// SUPABASE_SERVICE_ROLE_KEY requis pour le rate limiting réel (table
// ai_usage — voir supabase-intelligence.sql, aucune policy INSERT cliente).

import Anthropic from "npm:@anthropic-ai/sdk@0.27";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { UserError, toUserMessage } from "../_shared/errors.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-haiku-latest";
const RATE_LIMIT_PER_HOUR = Number(Deno.env.get("AI_RATE_LIMIT_PER_HOUR") || "20");
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const ACTIONS = ["improve_bio", "improve_post", "improve_event_description", "suggest_community", "suggest_conversation"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new UserError("Non authentifié.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UserError("Non authentifié.");

    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("id, ai_suggestions_enabled").eq("user_id", user.id).single();
    if (profileError || !profile) throw new UserError("Profil introuvable.");
    if (profile.ai_suggestions_enabled === false) {
      throw new UserError("Les suggestions IA sont désactivées pour ce compte (Confidentialité → Suggestions IA).");
    }

    const body = await req.json();
    const { action } = body;
    if (!ACTIONS.includes(action)) throw new UserError("Action invalide.");

    // Rate limiting réel côté serveur (item 28) — jamais confié au client.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("ai_usage").select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id).gte("created_at", since);
    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return new Response(JSON.stringify({ error: "Limite de suggestions IA atteinte pour cette heure. Réessaie plus tard." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = buildPrompt(action, body);
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content?.[0];
    const text = block && block.type === "text" ? block.text : "";

    await admin.from("ai_usage").insert({ profile_id: profile.id, action });

    return new Response(JSON.stringify(parseResult(action, text)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: toUserMessage(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Minimisation des données (items 24-25) : chaque branche ne reçoit QUE ce
// qui est nécessaire à l'action — jamais l'objet profil complet, JAMAIS
// l'historique des messages (suggest_conversation ne reçoit que des champs
// publics déjà partagés entre deux profils mutuellement matchés).
function buildPrompt(action: string, body: Record<string, unknown>): string {
  switch (action) {
    case "improve_bio":
      return `Tu aides à améliorer une bio de profil sur Baobab, une app pour immigrants au Canada. Reformule ce texte en un paragraphe naturel et chaleureux, 2-3 phrases maximum, sans inventer d'information. Réponds uniquement avec le texte reformulé, sans guillemets ni commentaire.\n\nTexte original : "${String(body.text || "").slice(0, 500)}"`;

    case "improve_post":
      return `Améliore ce texte de publication pour un réseau social communautaire (Baobab). Corrige, rends plus naturel, garde le ton de l'auteur, ne rallonge pas inutilement. Réponds uniquement avec le texte amélioré, sans guillemets ni commentaire.\n\nTexte original : "${String(body.text || "").slice(0, 1000)}"`;

    case "improve_event_description":
      return `Améliore cette description d'événement pour qu'elle donne envie d'y participer, SANS jamais inventer de lieu, prix, date ou programme qui ne serait pas déjà mentionné. Réponds uniquement avec le texte amélioré.\n\nTitre : "${String(body.title || "").slice(0, 100)}"\nDescription originale : "${String(body.text || "").slice(0, 800)}"`;

    case "suggest_community":
      return `À partir de ces informations sur une nouvelle communauté Baobab, propose un nom court, une description d'une phrase, et une catégorie parmi exactement : etudes, profession, sport, musique, voyage, cuisine, art, technologie, entrepreneuriat, bien_etre, jeux, lecture, vie_au_canada, culture, sorties. Réponds strictement en JSON, rien d'autre : {"name": "...", "description": "...", "category": "..."}\n\nInformations fournies par l'utilisateur : "${String(body.text || "").slice(0, 400)}"`;

    case "suggest_conversation": {
      const me = (body.me as Record<string, string>) || {};
      const them = (body.them as Record<string, string>) || {};
      return `Propose 3 messages courts et naturels (une phrase chacun) pour démarrer une conversation entre deux personnes qui viennent de matcher sur Baobab, une app pour immigrants au Canada. Base-toi UNIQUEMENT sur ces informations publiques déjà partagées entre elles, n'invente rien d'autre :\nPersonne A — prénom : ${me.firstName || "?"}, ville : ${me.city || "?"}, intérêts : ${me.interests || "aucun renseigné"}\nPersonne B — prénom : ${them.firstName || "?"}, ville : ${them.city || "?"}, intérêts : ${them.interests || "aucun renseigné"}\nRéponds strictement en JSON, rien d'autre : {"suggestions": ["...", "...", "..."]}`;
    }

    default:
      throw new UserError("Action invalide.");
  }
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

function parseResult(action: string, text: string) {
  if (action === "suggest_community" || action === "suggest_conversation") {
    try {
      return parseJsonLoose(text);
    } catch {
      return { error: "Réponse IA invalide, réessaie." };
    }
  }
  return { text: text.trim() };
}
