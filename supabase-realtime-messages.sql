-- Corrige le délai de livraison des messages : la table "messages" n'était
-- jamais ajoutée à la publication "supabase_realtime" (vérifié en direct —
-- seule "message_reactions" y figurait). Résultat : les événements INSERT/
-- UPDATE sur messages ne sont jamais poussés en direct aux clients abonnés
-- (App.jsx, channel `messages:${key}`) ; un message envoyé n'apparaît chez
-- le destinataire qu'au prochain rechargement de la conversation, pas
-- immédiatement — c'est le bug "les messages n'arrivent pas à temps".
alter publication supabase_realtime add table public.messages;
