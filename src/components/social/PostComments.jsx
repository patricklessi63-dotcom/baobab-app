import React, { useMemo, useState } from "react";
import { Flag, Ban, CornerDownRight, X } from "lucide-react";
import Avatar from "../Avatar";
import MentionInput from "./MentionInput";
import MentionText from "./MentionText";
import { addMention, prunedMentions } from "../../lib/mentions";
import { truncateUnicodeSafe } from "../../utils/format";
import { isImeComposing } from "../../utils/keyboard";
import { primary, coralText, muted, bg } from "./theme";

const PAGE = 5;          // commentaires racine affichés d'un coup
const REPLIES_SHOWN = 2; // réponses visibles avant « Voir les N réponses »

export const COMMENT_SORTS = [
  ["oldest", "Plus anciens"],
  ["recent", "Plus récents"],
  ["relevant", "Plus pertinents"],
];

// Commentaires d'une publication du fil : fil de discussion à UN niveau (les réponses à une réponse
// sont rattachées au commentaire racine), tri, pagination, mentions « @ ». Les réponses exigent SQL-33
// (colonne parent_id) : tant qu'il n'est pas exécuté, le commentaire part à plat avec son « @Nom ».
export default function PostComments({ comments = [], currentUserId, onSubmit, onReportComment, onBlockAuthor, onSearchMentions, onOpenProfile }) {
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState([]);
  const [replyTo, setReplyTo] = useState(null); // { rootId, name, authorId }
  const [sort, setSort] = useState("oldest");
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState(() => new Set());

  const { roots, repliesByRoot } = useMemo(() => {
    const ids = new Set(comments.map((c) => c.id));
    const byRoot = new Map();
    const rootList = [];
    for (const c of comments) {
      if (c.parent_id && ids.has(c.parent_id)) {
        if (!byRoot.has(c.parent_id)) byRoot.set(c.parent_id, []);
        byRoot.get(c.parent_id).push(c);
      } else rootList.push(c);
    }
    const time = (c) => new Date(c.created_at || 0).getTime();
    const sorted = [...rootList];
    if (sort === "recent") sorted.sort((a, b) => time(b) - time(a));
    else if (sort === "relevant") sorted.sort((a, b) => ((byRoot.get(b.id)?.length || 0) - (byRoot.get(a.id)?.length || 0)) || time(b) - time(a));
    else sorted.sort((a, b) => time(a) - time(b));
    for (const list of byRoot.values()) list.sort((a, b) => time(a) - time(b));
    return { roots: sorted, repliesByRoot: byRoot };
  }, [comments, sort]);

  const startReply = (root, target) => {
    const name = target.profiles?.name || "Membre";
    setReplyTo({ rootId: root.id, name, authorId: target.author_id });
    const prefix = `@${name} `;
    setDraft((d) => (d.startsWith(prefix) ? d : prefix + d));
    setMentions((m) => addMention(m, { id: target.author_id, name }));
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    const keep = prunedMentions(text, mentions);
    const opts = {};
    if (replyTo) opts.parentId = replyTo.rootId;
    if (keep.length) opts.mentions = keep;
    const saved = { draft, mentions, replyTo };
    setDraft(""); setMentions([]); setReplyTo(null);
    // Appel à deux arguments quand il n'y a ni réponse ni mention : contrat historique inchangé.
    const ok = await (Object.keys(opts).length ? onSubmit(text, opts) : onSubmit(text));
    // Échec (réseau coupé...) : le texte tapé était effacé sans retour possible ; on le remet,
    // sauf si une nouvelle saisie a déjà commencé.
    if (ok === false) { setDraft((d) => d || saved.draft); setMentions((m) => (m.length ? m : saved.mentions)); setReplyTo((r) => r || saved.replyTo); }
  };

  const renderComment = (c, root, isReply) => (
    <div key={c.id} className="flex items-start gap-2" style={isReply ? { marginLeft: 34 } : undefined}>
      <Avatar name={c.profiles?.name} url={c.profiles?.avatar_url} size={isReply ? 22 : 26} />
      <div className="flex-1 min-w-0">
        <div className="rounded-xl px-3 py-2" style={{ background: bg }}>
          <span className="text-xs font-bold" style={{ color: primary }}>{c.profiles?.name || "Membre"}</span>
          <p className="text-xs mt-0.5 whitespace-pre-wrap break-words"><MentionText body={c.body} mentions={c.mentions} onOpenProfile={onOpenProfile} /></p>
        </div>
        {onSubmit && c.author_id !== currentUserId && (
          <button onClick={() => startReply(root, c)} className="bb-hit-v text-[11px] font-bold px-2 mt-0.5 focus-visible:outline focus-visible:outline-2" style={{ color: muted }} aria-label={`Répondre à ${c.profiles?.name || "ce membre"}`}>
            Répondre
          </button>
        )}
      </div>
      {/* Bug corrigé : post_reports.target_type autorise déjà ('post','comment') côté base
          (supabase-feed-posts.sql) et submitReport() de PostsFeed.jsx est générique — mais aucun bouton
          n'exposait "comment", rendant les commentaires impossibles à signaler individuellement. */}
      {onReportComment && c.author_id !== currentUserId && (
        <button onClick={() => onReportComment(c)} aria-label="Signaler ce commentaire" className="bb-hit-v px-1.5 shrink-0 mt-1 focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
          <Flag size={12} />
        </button>
      )}
      {onBlockAuthor && c.author_id && c.author_id !== currentUserId && (
        <button onClick={() => onBlockAuthor({ id: c.author_id, name: c.profiles?.name || "cet auteur" })} aria-label="Bloquer l'auteur de ce commentaire" className="bb-hit-v px-1.5 shrink-0 mt-1 focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
          <Ban size={12} />
        </button>
      )}
    </div>
  );

  const shownRoots = roots.slice(0, limit);
  const hiddenRoots = roots.length - shownRoots.length;

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {roots.length > 1 && (
        <label className="flex items-center gap-2 text-[11px]" style={{ color: muted }}>
          Trier par
          <select value={sort} onChange={(e) => { setSort(e.target.value); setLimit(PAGE); }} aria-label="Trier les commentaires" className="text-[11px] rounded-lg px-2 py-1" style={{ background: bg, color: primary }}>
            {COMMENT_SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      )}

      {shownRoots.map((root) => {
        const replies = repliesByRoot.get(root.id) || [];
        const open = expanded.has(root.id);
        const visibleReplies = open ? replies : replies.slice(0, REPLIES_SHOWN);
        return (
          <div key={root.id} className="flex flex-col gap-1.5">
            {renderComment(root, root, false)}
            {visibleReplies.map((r) => renderComment(r, root, true))}
            {replies.length > REPLIES_SHOWN && !open && (
              <button onClick={() => setExpanded((s) => new Set(s).add(root.id))} className="text-[11px] font-bold text-left focus-visible:outline focus-visible:outline-2" style={{ marginLeft: 34, color: muted }}>
                Voir les {replies.length} réponses
              </button>
            )}
          </div>
        );
      })}

      {hiddenRoots > 0 && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="text-xs font-bold text-left focus-visible:outline focus-visible:outline-2" style={{ color: coralText }}>
          Voir plus de commentaires ({hiddenRoots})
        </button>
      )}

      {replyTo && (
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: muted }}>
          <CornerDownRight size={12} /> Réponse à {replyTo.name}
          <button onClick={() => { setReplyTo(null); setDraft((d) => d.replace(`@${replyTo.name} `, "")); setMentions((m) => m.filter((x) => x.id !== replyTo.authorId)); }} aria-label="Annuler la réponse" className="bb-hit-v px-1 focus-visible:outline focus-visible:outline-2">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mt-1">
        <MentionInput
          dir="auto"
          value={draft}
          onChange={(v) => setDraft(truncateUnicodeSafe(v, 1000))}
          mentions={mentions}
          onMentionsChange={setMentions}
          search={onSearchMentions}
          onKeyDown={(e) => { if (e.key === "Enter" && !isImeComposing(e)) submit(); }}
          placeholder={replyTo ? `Répondre à ${replyTo.name}...` : "Écrire un commentaire..."}
          aria-label="Écrire un commentaire"
          className="flex-1 text-xs rounded-full px-3.5 py-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-accent)]"
          style={{ background: bg }}
        />
        <button onClick={submit} disabled={!draft.trim()} className="bb-hit text-xs font-bold px-3 py-2 rounded-full disabled:opacity-40" style={{ color: coralText }}>
          Envoyer
        </button>
      </div>
    </div>
  );
}
