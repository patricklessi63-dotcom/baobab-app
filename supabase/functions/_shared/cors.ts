// Partagé par les Edge Functions appelées directement depuis le navigateur
// (create-checkout-session, create-portal-session) — stripe-webhook n'en a
// pas besoin (appelé serveur à serveur par Stripe, jamais par le navigateur).
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
