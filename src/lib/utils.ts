/**
 * Get the best display name for a profile:
 * display_name → Twitter username → short wallet address
 */
export function getProfileDisplayName(profile: { display_name?: string | null; twitter?: string | null; wallet?: string } | null | undefined, wallet?: string): string {
  if (profile?.display_name) return profile.display_name;
  if (profile?.twitter) {
    const username = extractTwitterUsername(profile.twitter);
    if (username) return username;
  }
  const addr = profile?.wallet || wallet || '';
  if (addr.length <= 10) return addr;
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

/**
 * Extract Twitter/X username from various input formats:
 * - @username
 * - username
 * - https://twitter.com/username
 * - https://x.com/username
 */
export function extractTwitterUsername(input: string): string | null {
  if (!input || !input.trim()) return null;
  const s = input.trim();

  // Handle URLs
  const urlMatch = s.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/);
  if (urlMatch) return urlMatch[1];

  // Handle @username
  if (s.startsWith('@')) return s.slice(1);

  // If it looks like a plain username (no spaces, no special chars except _)
  if (/^[A-Za-z0-9_]{1,15}$/.test(s)) return s;

  return null;
}

/**
 * Build unavatar.io URL from a Twitter/X username.
 * Returns null if username is invalid.
 */
export function getTwitterAvatarUrl(twitterInput: string): string | null {
  const username = extractTwitterUsername(twitterInput);
  if (!username) return null;
  return `https://unavatar.io/twitter/${username}`;
}

/**
 * Fetch Twitter display name using unavatar.io JSON endpoint.
 * Returns display name or null if unavailable.
 */
export async function fetchTwitterDisplayName(twitterInput: string): Promise<string | null> {
  const username = extractTwitterUsername(twitterInput);
  if (!username) return null;
  try {
    const res = await fetch(`https://unavatar.io/twitter/${username}?json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.name || json.title || null;
  } catch {
    return null;
  }
}

/**
 * Verify Twitter bio contains verification code.
 * Tries multiple CORS proxy + nitter combos client-side.
 * Returns { found: boolean, displayName: string | null }
 */
export async function verifyTwitterBio(
  username: string,
  verificationCode: string,
): Promise<{ found: boolean; displayName: string | null; error?: string }> {
  console.log('[verify] Starting verification for @' + username, 'code:', verificationCode);

  // Strategy 1: Nitter instances via CORS proxies
  const nitterTargets = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://nitter.net/${username}`)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://nitter.poast.org/${username}`)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://nitter.privacydev.net/${username}`)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(`https://nitter.net/${username}`)}`,
    `https://api.codetabs.com/v1/proxy?quest=https://nitter.net/${username}`,
  ];

  for (const url of nitterTargets) {
    try {
      console.log('[verify] Trying:', url.slice(0, 60) + '...');
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) { console.log('[verify] HTTP', res.status); continue; }
      const html = await res.text();
      if (!html || html.length < 200) { console.log('[verify] Empty response'); continue; }

      // Extract bio text from nitter HTML
      const bioMatch = html.match(/<p class="bio-text"[^>]*>([\s\S]*?)<\/p>/i);
      const bioText = bioMatch ? bioMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      console.log('[verify] Bio found:', bioText ? bioText.slice(0, 80) : '(empty)');

      // Extract display name
      let displayName: string | null = null;
      const nameMatch = html.match(/<a class="profile-card-fullname"[^>]*>([^<]+)<\/a>/i);
      if (nameMatch) displayName = nameMatch[1].trim();

      if (bioText && bioText.includes(verificationCode)) {
        return { found: true, displayName };
      }
      if (bioText) {
        return { found: false, displayName };
      }
    } catch (e) {
      console.log('[verify] Error:', e);
      continue;
    }
  }

  // Strategy 2: Fetch x.com profile directly via CORS proxy
  const xTargets = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://x.com/${username}`)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(`https://x.com/${username}`)}`,
  ];

  for (const url of xTargets) {
    try {
      console.log('[verify] Trying x.com:', url.slice(0, 60) + '...');
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length < 500) continue;

      // Twitter embeds bio in meta tags or JSON-LD
      const descMatch = html.match(/<meta\s+(?:property="og:description"|name="description")\s+content="([^"]+)"/i);
      const desc = descMatch ? descMatch[1] : '';
      console.log('[verify] x.com description:', desc.slice(0, 80));

      if (desc && desc.includes(verificationCode)) {
        // Try get name from og:title
        const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
        const displayName = titleMatch ? titleMatch[1].replace(/\s*\(@[^)]+\).*/, '').trim() : null;
        return { found: true, displayName };
      }

      // Also try full HTML scan
      if (html.includes(verificationCode)) {
        return { found: true, displayName: null };
      }

      if (desc) {
        return { found: false, displayName: null };
      }
    } catch (e) {
      console.log('[verify] x.com error:', e);
      continue;
    }
  }

  // Strategy 3: Twitter syndication API
  try {
    const syndUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${username}`)}`;
    console.log('[verify] Trying syndication...');
    const res = await fetch(syndUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const html = await res.text();
      if (html.includes(verificationCode)) {
        return { found: true, displayName: null };
      }
      if (html.length > 500) {
        return { found: false, displayName: null };
      }
    }
  } catch {}

  console.log('[verify] All strategies failed');
  return { found: false, displayName: null, error: 'proxy_failed' };
}

/**
 * Add watermark to image blob
 * @param blob - original image blob
 */
export async function addWatermark(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); resolve(blob); return; }
      
      ctx.drawImage(img, 0, 0);
      
      // Add semi-transparent watermark (larger, horizontal, more visible)
      const fontSize = Math.max(canvas.width, canvas.height) * 0.12;
      ctx.font = `900 ${fontSize}px Arial`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Center watermark (horizontal)
      ctx.fillText('SOLIA', canvas.width / 2, canvas.height / 2);
      
      // Add corner watermarks for better coverage
      ctx.save();
      ctx.font = `900 ${fontSize * 0.6}px Arial`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.textAlign = 'left';
      ctx.fillText('SOLIA', 20, 40);
      ctx.textAlign = 'right';
      ctx.fillText('SOLIA', canvas.width - 20, canvas.height - 20);
      ctx.restore();
      
      // Add diagonal pattern
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 2;
      for (let i = -canvas.height; i < canvas.width + canvas.height; i += 80) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + canvas.height, canvas.height);
        ctx.stroke();
      }
      
      canvas.toBlob(
        (watermarkedBlob) => {
          URL.revokeObjectURL(url);
          resolve(watermarkedBlob || blob);
        },
        blob.type,
        0.95,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

/**
 * Convert a Blob (PNG/JPG) to WebP using canvas.
 * Falls back to original blob if conversion fails.
 * @param blob - original image blob
 * @param quality - WebP quality 0-1 (default 0.82)
 */
export async function convertToWebP(blob: Blob, quality = 0.82): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); resolve(blob); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (webpBlob) => {
          URL.revokeObjectURL(url);
          resolve(webpBlob && webpBlob.size < blob.size ? webpBlob : blob);
        },
        'image/webp',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}
