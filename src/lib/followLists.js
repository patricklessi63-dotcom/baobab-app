import { selectAllPages, PAGE_SIZE } from "./inChunks";

// Listes « Abonnements » / « Abonnés » du compte courant (SocialShell).
// Historiquement `.limit(2000)` : mais PostgREST plafonne chaque réponse à
// `max_rows` (1000 par défaut sur Supabase) SANS erreur, donc la liste s'arrêtait
// en réalité à 1000 (un compte suivi par plus de 1000 personnes perdait des
// abonnés dans « Abonnés »). Pagination `.range()` jusqu'à FOLLOWS_LIMIT lignes,
// tri created_at desc + id (clé unique : pages stables malgré les ex æquo).
export const FOLLOWS_LIMIT = 2000;

const PROFILE_COLUMNS =
  "id,name,avatar_url,city,show_city,age,show_birth_year,looking_for,email_verified,phone_verified,is_founder,is_premium,banned_at,suspended_until";

function paged(client, select, column, userId) {
  return selectAllPages((from, to) =>
    client
      .from("follows")
      .select(select)
      .eq(column, userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
    // 2 pages de 1000 = FOLLOWS_LIMIT : pas de 3e requête (range vide) quand la 2e est pleine.
    { maxPages: Math.ceil(FOLLOWS_LIMIT / PAGE_SIZE) }
  );
}

export const fetchFollowing = (client, userId) =>
  paged(client, `to_id, profile:to_id(${PROFILE_COLUMNS})`, "from_id", userId);

export const fetchFollowers = (client, userId) =>
  paged(client, `from_id, profile:from_id(${PROFILE_COLUMNS})`, "to_id", userId);
