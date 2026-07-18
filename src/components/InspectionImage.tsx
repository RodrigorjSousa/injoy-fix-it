import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Extrai o path relativo dentro do bucket "inspections" a partir de uma URL
// pública já salva no banco (formato .../object/public/inspections/<path>)
// ou aceita o próprio path caso já esteja assim.
export function extractInspectionPath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const marker = "/inspections/";
  const idx = stored.indexOf(marker);
  if (idx >= 0) return stored.slice(idx + marker.length).split("?")[0];
  // já é um path
  if (!stored.startsWith("http")) return stored.replace(/^\/+/, "");
  return null;
}

const signedCache = new Map<string, { url: string; expiresAt: number }>();

export async function getInspectionSignedUrl(stored: string | null | undefined): Promise<string | null> {
  const path = extractInspectionPath(stored);
  if (!path) return null;
  const cached = signedCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url;
  const { data, error } = await supabase.storage
    .from("inspections")
    .createSignedUrl(path, 60 * 60); // 1 hora
  if (error || !data?.signedUrl) return null;
  signedCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 60 * 60 * 1000 });
  return data.signedUrl;
}

interface InspectionImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  stored: string | null | undefined;
  fallback?: React.ReactNode;
}

export function InspectionImage({ stored, fallback = null, ...imgProps }: InspectionImageProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getInspectionSignedUrl(stored).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [stored]);

  if (!src) return <>{fallback}</>;
  return <img {...imgProps} src={src} />;
}
