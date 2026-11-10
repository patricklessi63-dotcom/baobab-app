import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import Paywall from "../premium/Paywall";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { usePremiumStatus } from "../../lib/premium/usePremiumStatus";
import {
  COLLECTION_NAME_MAX,
  addToCollection,
  cleanCollectionName,
  collectionErrorMessage,
  createCollection,
  deleteCollection,
  listCollections,
  loadCollectionPosts,
  removeFromCollection,
} from "../../lib/premium/collections";
import { truncateUnicodeSafe } from "../../utils/format";
import { primary, coral, muted, bg, card, primaryRgb } from "./theme";

// Collections privées de publications (avantage Premium, SQL-38).
//  - avec `post` : « Enregistrer dans une collection » (cocher / décocher, créer) ;
//  - sans `post` : « Mes collections » (consulter, retirer, supprimer).
// Le droit de créer et d'ajouter est vérifié côté serveur (RLS) : le contrôle
// d'ici n'est qu'un confort d'affichage. Après la fin d'un abonnement, les
// collections existantes restent consultables et modifiables à la baisse.
export default function CollectionsModal({ open, onClose, post = null, currentUser, onOpenPremium = () => {} }) {
  const { isPremium, loading: premiumLoading } = usePremiumStatus(currentUser);
  const [collections, setCollections] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState(null);
  const [previews, setPreviews] = useState({});
  const panelRef = useRef(null);
  useEscapeKey(open, onClose);
  useFocusTrap(open, panelRef);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setCollections(await listCollections());
    } catch (e) {
      console.error(e);
      setCollections([]);
      setLoadError(collectionErrorMessage(e) || "Impossible de charger tes collections.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setCollections(null);
    setError(null);
    setNewName("");
    setOpenId(null);
    setPreviews({});
    load();
  }, [open, load]);

  if (!open) return null;

  // Une seule écriture à la fois (double-tap) ; le message d'erreur est celui de la base si connu.
  const run = async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setError(collectionErrorMessage(e) || (e?.code === "INVALID_NAME" ? `Donne un nom de 1 à ${COLLECTION_NAME_MAX} caractères.` : "Une erreur est survenue. Réessaie dans un instant."));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const toggleMembership = (c) => run(async () => {
    const has = c.postIds.includes(post.id);
    if (has) await removeFromCollection(c.id, post.id);
    else await addToCollection(currentUser.id, c.id, post.id);
    setCollections((list) => list.map((x) => (x.id === c.id ? { ...x, postIds: has ? x.postIds.filter((id) => id !== post.id) : [...x.postIds, post.id] } : x)));
  });

  const submitNew = (e) => {
    e.preventDefault();
    if (!cleanCollectionName(newName)) { setError(`Donne un nom de 1 à ${COLLECTION_NAME_MAX} caractères.`); return; }
    run(async () => {
      const created = await createCollection(currentUser.id, newName);
      if (post) await addToCollection(currentUser.id, created.id, post.id);
      setCollections((list) => [...list, post ? { ...created, postIds: [post.id] } : created]);
      setNewName("");
    });
  };

  const remove = (c) => run(async () => {
    await deleteCollection(c.id);
    setCollections((list) => list.filter((x) => x.id !== c.id));
    if (openId === c.id) setOpenId(null);
  });

  const toggleOpen = async (c) => {
    if (openId === c.id) { setOpenId(null); return; }
    setOpenId(c.id);
    if (previews[c.id]) return;
    try {
      const rows = await loadCollectionPosts(c.postIds);
      setPreviews((p) => ({ ...p, [c.id]: rows }));
    } catch (e) {
      console.error(e);
      setError("Impossible d'afficher cette collection pour l'instant.");
    }
  };

  const removeSaved = (c, postId) => run(async () => {
    await removeFromCollection(c.id, postId);
    setCollections((list) => list.map((x) => (x.id === c.id ? { ...x, postIds: x.postIds.filter((id) => id !== postId) } : x)));
    setPreviews((p) => ({ ...p, [c.id]: (p[c.id] || []).filter((r) => r.id !== postId) }));
  });

  const title = post ? "Enregistrer dans une collection" : "Mes collections";
  const hasAny = (collections || []).length > 0;
  const canCreate = isPremium;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-5"
      style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div ref={panelRef} tabIndex={-1} className={`${card} w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 max-h-[85vh] overflow-y-auto`} style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black" style={{ color: primary }}>📚 {title}</h2>
          <button className="bb-hit" onClick={onClose} aria-label="Fermer"><X /></button>
        </div>

        {premiumLoading || collections === null ? (
          <p className="text-sm text-center py-6" style={{ color: muted }}>Chargement...</p>
        ) : (
          <>
            {!isPremium && (
              <div className="mb-4">
                {hasAny ? (
                  <p className="text-xs rounded-xl p-3" style={{ background: bg, color: muted }}>
                    Ton abonnement Premium n'est pas actif : tu gardes tes collections et tu peux les consulter ou les vider, mais pas en créer ni y ajouter.{" "}
                    <button type="button" onClick={() => { onClose(); onOpenPremium("discover"); }} className="font-bold underline" style={{ color: primary }}>Découvrir Premium</button>
                  </p>
                ) : (
                  <Paywall
                    title="Collections privées"
                    featureKey="private_collections"
                    onDiscover={() => { onClose(); onOpenPremium("discover"); }}
                    onSubscribe={() => { onClose(); onOpenPremium("plans"); }}
                  />
                )}
              </div>
            )}

            {loadError && <p role="alert" className="text-sm mb-3" style={{ color: coral }}>{loadError}</p>}
            {error && <p role="alert" className="text-sm mb-3" style={{ color: coral }}>{error}</p>}

            {hasAny && (
              <ul className="flex flex-col gap-2 mb-4">
                {collections.map((c) => {
                  const checked = post ? c.postIds.includes(post.id) : false;
                  const expanded = openId === c.id;
                  return (
                    <li key={c.id} className="rounded-2xl" style={{ background: bg }}>
                      <div className="flex items-center gap-2 p-3">
                        {post ? (
                          <label className="flex items-center gap-2.5 flex-1 min-w-0 text-sm font-semibold cursor-pointer" style={{ color: primary }}>
                            <input type="checkbox" checked={checked} disabled={busy || (!isPremium && !checked)} onChange={() => toggleMembership(c)} />
                            <span className="truncate">{c.name}</span>
                            <span className="text-xs font-normal flex-shrink-0" style={{ color: muted }}>{c.postIds.length}</span>
                          </label>
                        ) : (
                          <button type="button" onClick={() => toggleOpen(c)} aria-expanded={expanded} className="flex items-center gap-2 flex-1 min-w-0 text-left text-sm font-semibold" style={{ color: primary }}>
                            {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                            <span className="truncate">{c.name}</span>
                            <span className="text-xs font-normal flex-shrink-0" style={{ color: muted }}>{c.postIds.length}</span>
                          </button>
                        )}
                        <button type="button" onClick={() => remove(c)} disabled={busy} aria-label={`Supprimer la collection ${c.name}`} className="bb-hit p-1.5 flex-shrink-0 disabled:opacity-50" style={{ color: muted }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                      {expanded && (
                        <ul className="px-3 pb-3 flex flex-col gap-2">
                          {(previews[c.id] || []).length === 0 && (
                            <li className="text-xs" style={{ color: muted }}>{previews[c.id] ? "Aucune publication à afficher." : "Chargement..."}</li>
                          )}
                          {(previews[c.id] || []).map((p) => (
                            <li key={p.id} className="flex items-start gap-2 text-xs rounded-xl p-2.5" style={{ background: "var(--bb-surface)", color: primary }}>
                              <span className="flex-1 min-w-0">
                                <span className="font-bold">{p.profiles?.name || "Membre"}</span>
                                <span className="block" style={{ color: muted }}>{truncateUnicodeSafe(p.body || "", 140)}</span>
                              </span>
                              <button type="button" onClick={() => removeSaved(c, p.id)} disabled={busy} aria-label="Retirer de la collection" className="bb-hit flex-shrink-0 disabled:opacity-50" style={{ color: muted }}><X size={14} /></button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {!hasAny && isPremium && (
              <p className="text-sm mb-4" style={{ color: muted }}>
                Aucune collection pour l'instant. Crée-en une pour ranger les publications à retrouver plus tard. Elles restent privées.
              </p>
            )}

            {canCreate && (
              <form onSubmit={submitNew} className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={COLLECTION_NAME_MAX}
                  placeholder="Nouvelle collection"
                  aria-label="Nom de la nouvelle collection"
                  className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl text-sm"
                  style={{ background: bg, color: primary }}
                />
                <button type="submit" disabled={busy || !newName.trim()} className="bb-btn-gold px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60">
                  Créer
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
