import { useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { assetName } from "../lib/assets";

const warned = new Set<string>();

/**
 * <img> for a file in /public/assets with an honest fallback. If the file is
 * missing it renders `fallback` (or a neutral "Image unavailable" tile) and,
 * in development, names the missing file so it's easy to fix.
 */
export default function AssetImage({
  src,
  alt,
  className,
  fallback,
  decorative,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div className={`asset-missing ${className ?? ""}`} role="img" aria-label={`${alt} (image unavailable)`}>
        <ImageOff size={22} />
        <span>Image unavailable</span>
        {import.meta.env.DEV && <code>public/assets/{assetName(src)}</code>}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={decorative ? "" : alt}
      aria-hidden={decorative || undefined}
      className={`${className ?? ""} ${loaded ? "is-loaded" : "is-loading"}`}
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (import.meta.env.DEV && !warned.has(src)) {
          warned.add(src);
          console.warn(`[Citizens Eye] Missing asset: public/assets/${assetName(src)}. Showing a fallback.`);
        }
        setFailed(true);
      }}
    />
  );
}
