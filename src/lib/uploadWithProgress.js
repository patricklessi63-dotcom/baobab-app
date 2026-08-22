import { supabase } from "../supabaseClient";
import { beginCriticalOperation, endCriticalOperation } from "./criticalOperationGuard";
import { effectiveMime } from "./mediaConstants";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// @supabase/storage-js n'expose aucune callback de progression sur
// .upload() (confirmé en lisant la version installée). Upload en XHR brut
// vers l'endpoint REST Storage pour obtenir un vrai pourcentage — aucune
// nouvelle dépendance.
//
// Le garde critical-operation vit ici (plutôt que chez chaque appelant) pour
// que tout upload passant par ce helper soit protégé de la déconnexion
// automatique par inactivité (App.jsx) sans que chaque écran ait à y penser.
export async function uploadWithProgress({ bucket, path, file, onProgress, signal }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Session expirée. Reconnecte-toi.");

  beginCriticalOperation();
  try {
    return await uploadXhr({ bucket, path, file, onProgress, signal, accessToken });
  } finally {
    endCriticalOperation();
  }
}

function uploadXhr({ bucket, path, file, onProgress, signal, accessToken }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Content-Type", effectiveMime(file.type) || "application/octet-stream");
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
