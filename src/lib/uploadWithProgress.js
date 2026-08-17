import { supabase } from "../supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// @supabase/storage-js n'expose aucune callback de progression sur
// .upload() (confirmé en lisant la version installée). Upload en XHR brut
// vers l'endpoint REST Storage pour obtenir un vrai pourcentage — aucune
// nouvelle dépendance.
export async function uploadWithProgress({ bucket, path, file, onProgress, signal }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Session expirée. Reconnecte-toi.");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Échec de l'upload (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'upload."));
    xhr.onabort = () => reject(new Error("Upload annulé."));
    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener("abort", () => xhr.abort());
    }
    xhr.send(file);
  });
}
