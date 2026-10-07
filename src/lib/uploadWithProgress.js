import { supabase } from "../supabaseClient";
import { effectiveMime } from "./mediaConstants";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// @supabase/storage-js n'expose aucune callback de progression sur
// .upload() (confirmé en lisant la version installée). Upload en XHR brut
// vers l'endpoint REST Storage pour obtenir un vrai pourcentage — aucune
// nouvelle dépendance.
// Aucune activité réseau pendant ce délai (aucun octet envoyé, pas de réponse) :
// la connexion est considérée comme bloquée. Sur un réseau mobile qui décroche
// (tunnel, changement d'antenne, data épuisée), un XHR peut rester ouvert
// indéfiniment sans jamais lever d'erreur : le message restait « en cours
// d'envoi » à l'infini, sans bouton Réessayer. Un envoi qui progresse, même
// très lentement, ne déclenche jamais ce garde-fou (il est réarmé à chaque
// événement de progression).
export const UPLOAD_STALL_TIMEOUT_MS = 60000;

export async function uploadWithProgress({ bucket, path, file, onProgress, signal, stallMs = UPLOAD_STALL_TIMEOUT_MS }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Session expirée. Reconnecte-toi.");

  return uploadXhr({ bucket, path, file, onProgress, signal, accessToken, stallMs });
}

function uploadXhr({ bucket, path, file, onProgress, signal, accessToken, stallMs }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stallTimer = null;
    let stalled = false;
    const disarmStall = () => { clearTimeout(stallTimer); stallTimer = null; };
    const armStall = () => {
      clearTimeout(stallTimer);
      if (!(stallMs > 0)) return;
      stallTimer = setTimeout(() => { stalled = true; xhr.abort(); }, stallMs);
    };
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Content-Type", effectiveMime(file.type) || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (e) => {
      armStall();
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    // Corps entièrement envoyé : on attend la réponse du serveur (nouveau délai).
    xhr.upload.onload = () => armStall();
    xhr.onload = () => {
      disarmStall();
      if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
      const err = new Error(
        xhr.status === 413
          ? "Fichier trop volumineux pour être envoyé."
          : `Échec de l'upload (${xhr.status}).`
      );
      err.status = xhr.status;
      reject(err);
    };
    xhr.onerror = () => { disarmStall(); reject(new Error("Erreur réseau pendant l'upload.")); };
    xhr.onabort = () => {
      disarmStall();
      reject(new Error(stalled ? "Envoi interrompu : connexion trop lente ou coupée. Réessaie." : "Upload annulé."));
    };
    // xhr.abort() avant xhr.send() est un no-op silencieux côté navigateur
    // (aucun événement "abort" n'est déclenché tant que la requête n'a pas
    // été envoyée) : appeler xhr.abort() puis `return` ici laissait la
    // promesse indéfiniment en attente (ni resolve ni reject) pour un signal
    // déjà annulé avant même l'appel.
    if (signal?.aborted) { reject(new Error("Upload annulé.")); return; }
    if (signal) signal.addEventListener("abort", () => xhr.abort());
    armStall();
    xhr.send(file);
  });
}
