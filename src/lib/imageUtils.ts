export const createImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    // If it's a local data URL, load it directly without CORS attribute
    if (url.startsWith("data:")) {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", (error) => reject(error));
      image.src = url;
      return;
    }

    const tryLoad = (srcUrl: string, fallbackChain: (() => void)[]) => {
      const image = new Image();
      image.setAttribute("crossOrigin", "anonymous");
      
      image.addEventListener("load", () => resolve(image));
      
      image.addEventListener("error", () => {
        if (fallbackChain.length > 0) {
          const nextFallback = fallbackChain.shift();
          if (nextFallback) nextFallback();
        } else {
          reject(new Error(`Failed to load image even through CORS proxies: ${url}`));
        }
      });

      // Append a cache-buster query parameter to bypass potential caching issues
      // but only if it's not already proxied
      if (
        !srcUrl.includes("allorigins") && 
        !srcUrl.includes("codetabs") && 
        !srcUrl.includes("corsproxy") &&
        !srcUrl.includes("proxy-image")
      ) {
        const separator = srcUrl.includes("?") ? "&" : "?";
        image.src = `${srcUrl}${separator}cb=${Date.now()}`;
      } else {
        image.src = srcUrl;
      }
    };

    // Define the fallbacks
    const fallbackProxies = [
      // Fallback 1: Dedicated Supabase proxy-image Edge Function (highly reliable, bypasses CORS & Cloudflare)
      () => tryLoad(`https://jrmixsvdnejzfxvybmng.supabase.co/functions/v1/proxy-image?url=${encodeURIComponent(url)}`, fallbackProxies),
      // Fallback 2: AllOrigins JSON API (extremely robust, returns a data: URL in a JSON payload)
      async () => {
        try {
          const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
          if (!res.ok) throw new Error("AllOrigins error");
          const data = await res.json();
          if (data && data.contents) {
            const image = new Image();
            image.addEventListener("load", () => resolve(image));
            image.addEventListener("error", () => {
              // If the data URL fails to load for some reason, proceed to next fallback
              if (fallbackProxies.length > 0) {
                const next = fallbackProxies.shift();
                if (next) next();
              } else {
                reject(new Error(`Failed to load image via AllOrigins data URL: ${url}`));
              }
            });
            image.src = data.contents;
            return;
          }
        } catch (err) {
          console.warn("AllOrigins JSON API failed, trying next fallback...", err);
        }
        
        // If AllOrigins failed or didn't return contents, proceed to next fallback
        if (fallbackProxies.length > 0) {
          const next = fallbackProxies.shift();
          if (next) next();
        }
      },
      // Fallback 3: CodeTabs raw CORS proxy
      () => tryLoad(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, fallbackProxies),
      // Fallback 4: CORSProxy.io raw proxy
      () => tryLoad(`https://corsproxy.io/?${encodeURIComponent(url)}`, fallbackProxies),
    ];

    // Start with direct load
    tryLoad(url, fallbackProxies);
  });
};

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  format: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<Blob | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  let targetWidth = Math.round(pixelCrop.width);
  let targetHeight = Math.round(pixelCrop.height);

  // Cap canvas size to a reasonable maximum to avoid browser limits and performance issues
  const MAX_CANVAS_SIZE = 2500;
  let scale = 1;
  if (targetWidth > MAX_CANVAS_SIZE || targetHeight > MAX_CANVAS_SIZE) {
    scale = MAX_CANVAS_SIZE / Math.max(targetWidth, targetHeight);
    targetWidth = Math.round(targetWidth * scale);
    targetHeight = Math.round(targetHeight * scale);
  }

  // set canvas size to match the scaled crop size
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // Always fill canvas with solid white background to prevent transparent/margins from turning black
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Calculate the exact intersection between the image and the crop area (using precise floats)
  const ix1 = Math.max(0, pixelCrop.x);
  const iy1 = Math.max(0, pixelCrop.y);
  const ix2 = Math.min(naturalWidth, pixelCrop.x + pixelCrop.width);
  const iy2 = Math.min(naturalHeight, pixelCrop.y + pixelCrop.height);

  const sx = ix1;
  const sy = iy1;
  const sWidth = Math.max(0, ix2 - ix1);
  const sHeight = Math.max(0, iy2 - iy1);

  const dx = (ix1 - pixelCrop.x) * scale;
  const dy = (iy1 - pixelCrop.y) * scale;
  const dw = sWidth * scale;
  const dh = sHeight * scale;

  // Only draw if there's an actual intersection and valid dimensions
  if (sWidth > 0 && sHeight > 0) {
    ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dw, dh);
  }

  // as a blob
  return new Promise((resolve) => {
    canvas.toBlob((file) => {
      resolve(file);
    }, format);
  });
}
