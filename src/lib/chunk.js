// Découpe un tableau en lots de taille fixe. Sert à borner la longueur d'URL des
// requêtes PostgREST `.in("col", [...])` : supabase-js les envoie en GET avec
// toutes les valeurs dans l'URL, et la passerelle refuse une URL trop longue
// (de l'ordre de 8 à 16 ko selon l'infrastructure). Un uuid pèse ~37 octets dans
// l'URL : ~220 ids suffisent à dépasser 8 ko.
export function chunk(items, size) {
  const list = Array.from(items || []);
  const n = Math.max(1, Math.floor(size) || 1);
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}
