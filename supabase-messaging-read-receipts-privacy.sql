-- Réglage de confidentialité pour les indicateurs de lecture et de saisie en
-- cours dans la messagerie (audit module Messagerie, 22 août 2026 — la
-- fonctionnalité elle-même existait déjà, mais aucun moyen de la désactiver).
--
-- true par défaut (comportement actuel inchangé pour tout le monde tant que
-- personne ne désactive). Quand false pour un utilisateur :
--   - ses propres messages ne sont plus marqués "lu" pour l'expéditeur
--     (App.jsx, markConversationRead) ;
--   - il/elle ne diffuse plus l'indicateur "en train d'écrire..." ;
--   - en retour (réciprocité, même logique que WhatsApp), il/elle ne voit
--     plus non plus les coches "lu" des messages envoyés aux autres
--     (ConversationPane.jsx) — évite un accès à sens unique à l'information.
--
-- À exécuter manuellement dans le SQL Editor Supabase du projet
-- vozehymbihnckzklxesw. Additive uniquement, aucune donnée existante touchée.

alter table profiles
  add column if not exists show_read_receipts boolean not null default true;
