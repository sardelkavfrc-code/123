const cache = new Map<string, string[]>();

const FALLBACKS = [
  ["#1a8cff", "#6d3cff", "#c930ff"],
  ["#ff5e7e", "#ff8c1a", "#ffc24a"],
  ["#2bc48a", "#16d1cf", "#1e90ff"],
  ["#c930ff", "#ff2fa7", "#1a8cff"],
  ["#ffc24a", "#ff4f5e", "#ff2f7a"],
  ["#16d1cf", "#1e90ff", "#6d3cff"],
];

export function getFallbackColors(trackId: number | string): string[] {
  let hash = 0;
  const str = String(trackId);
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FALLBACKS.length;
  return FALLBACKS[index];
}

export async function extractColors(imageUrl: string): Promise<string[]> {
  if (cache.has(imageUrl)) {
    return cache.get(imageUrl)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;
    
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(["#121212", "#181818", "#1a1a1a"]);

        canvas.width = 64;
        canvas.height = 64;
        ctx.drawImage(img, 0, 0, 64, 64);

        const data = ctx.getImageData(0, 0, 64, 64).data;

        // Average a region of pixels
        const getAverage = (startX: number, startY: number, endX: number, endY: number) => {
          let r = 0, g = 0, b = 0, count = 0;
          for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
              const i = (y * 64 + x) * 4;
              // Skip transparent pixels
              if (data[i + 3] < 128) continue;
              r += data[i];
              g += data[i + 1];
              b += data[i + 2];
              count++;
            }
          }
          if (count === 0) return "rgb(30, 30, 30)";
          return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
        };

        // Extract from 3 distinct regions to create a rich gradient
        const c1 = getAverage(0, 0, 32, 32);     // Top-left
        const c2 = getAverage(32, 32, 64, 64);   // Bottom-right
        const c3 = getAverage(16, 16, 48, 48);   // Center

        const colors = [c1, c2, c3];
        cache.set(imageUrl, colors);
        resolve(colors);
      } catch (err) {
        // Likely CORS error or canvas taint
        resolve(["#121212", "#181818", "#1a1a1a"]);
      }
    };
    
    img.onerror = () => {
      resolve(["#121212", "#181818", "#1a1a1a"]);
    };
  });
}
