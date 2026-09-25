/**
 * Vercel Image Optimization wrapper.
 *
 * Assets in Supabase storage are stored at their original upload size — some
 * team avatars are multi-megabyte PNGs rendered at 30px. Routing them through
 * the Image Optimization API resizes and re-encodes at the edge so the
 * browser downloads something close to the rendered size.
 *
 * Unlike Netlify's Image CDN, Vercel's endpoint only takes `url`/`w`/`q` —
 * there's no server-side height/crop. Callers that need a square avatar rely
 * on CSS (`object-cover`) for the crop; this only controls download size.
 */
export function getResizedImageUrl(src: string, { width }: { width: number }) {
  if (!src.startsWith("/") || src.startsWith("/_vercel/")) {
    return src;
  }

  const params = new URLSearchParams({
    url: src,
    w: String(width),
    q: "75",
  });

  return `/_vercel/image?${params.toString()}`;
}

/**
 * Retina-ready `srcset` for a fixed-size image.
 */
export function getResizedImageSrcSet(src: string, size: number) {
  if (!src.startsWith("/") || src.startsWith("/_vercel/")) {
    return undefined;
  }

  return [1, 2]
    .map((dpr) => `${getResizedImageUrl(src, { width: size * dpr })} ${dpr}x`)
    .join(", ");
}
