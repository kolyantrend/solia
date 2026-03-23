// @ts-nocheck — This file runs on Deno (Supabase Edge Functions), not Node.js
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { wallet, twitter_username, verification_code } = await req.json();

    if (!wallet || !twitter_username || !verification_code) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let bioText = '';
    let displayName = '';
    const logs: string[] = [];

    // Strategy 1: Fetch x.com directly (server-side = no CORS!)
    try {
      logs.push('Trying x.com direct...');
      const res = await fetch(`https://x.com/${twitter_username}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
      });
      if (res.ok) {
        const html = await res.text();
        logs.push(`x.com returned ${html.length} chars`);

        // Bio is in og:description meta tag
        const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"[^>]*>/i)
          || html.match(/<meta\s+name="description"\s+content="([^"]*)"[^>]*>/i);
        if (descMatch) {
          bioText = descMatch[1].trim();
          logs.push(`Bio from meta: "${bioText.slice(0, 100)}"`);
        }

        // Display name from og:title: "Name (@username) / X"
        const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"[^>]*>/i);
        if (titleMatch) {
          displayName = titleMatch[1].replace(/\s*\(@[^)]+\).*/, '').trim();
          logs.push(`Name from og:title: "${displayName}"`);
        }

        // Also check full HTML for code (Twitter may embed bio in JSON)
        if (!bioText && html.includes(verification_code)) {
          bioText = verification_code;
          logs.push('Code found in raw HTML');
        }
      } else {
        logs.push(`x.com HTTP ${res.status}`);
      }
    } catch (e) {
      logs.push(`x.com error: ${e}`);
    }

    // Strategy 2: Twitter syndication (official, lightweight)
    if (!bioText) {
      try {
        logs.push('Trying syndication...');
        const res = await fetch(
          `https://syndication.twitter.com/srv/timeline-profile/screen-name/${twitter_username}`,
          { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) },
        );
        if (res.ok) {
          const html = await res.text();
          logs.push(`Syndication returned ${html.length} chars`);
          if (html.includes(verification_code)) {
            bioText = verification_code;
            logs.push('Code found in syndication HTML');
          }
        }
      } catch (e) {
        logs.push(`Syndication error: ${e}`);
      }
    }

    // Strategy 3: Nitter fallback
    if (!bioText) {
      const nitterUrls = [
        `https://nitter.net/${twitter_username}`,
        `https://nitter.poast.org/${twitter_username}`,
      ];
      for (const url of nitterUrls) {
        try {
          logs.push(`Trying ${url}...`);
          const res = await fetch(url, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) { logs.push(`HTTP ${res.status}`); continue; }
          const html = await res.text();
          const bioMatch = html.match(/<p class="bio-text"[^>]*>([\s\S]*?)<\/p>/i);
          if (bioMatch) {
            bioText = bioMatch[1].replace(/<[^>]+>/g, '').trim();
            logs.push(`Nitter bio: "${bioText.slice(0, 80)}"`);
          }
          const nameMatch = html.match(/<a class="profile-card-fullname"[^>]*>([^<]+)<\/a>/i);
          if (nameMatch && !displayName) displayName = nameMatch[1].trim();
          if (bioText) break;
        } catch (e) {
          logs.push(`Nitter error: ${e}`);
        }
      }
    }

    // Fallback display name from unavatar.io
    if (!displayName) {
      try {
        const uRes = await fetch(`https://unavatar.io/twitter/${twitter_username}?json`, {
          signal: AbortSignal.timeout(5000),
        });
        if (uRes.ok) {
          const uJson = await uRes.json();
          displayName = uJson.name || uJson.title || twitter_username;
        }
      } catch {}
    }
    if (!displayName) displayName = twitter_username;

    // Check if verification code is present
    const verified = bioText.includes(verification_code);
    logs.push(`Result: verified=${verified}, bio="${bioText.slice(0, 60)}", name="${displayName}"`);

    if (verified) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase
        .from('profiles')
        .update({ verified: true, display_name: displayName })
        .eq('wallet', wallet);
    }

    return new Response(
      JSON.stringify({ verified, display_name: displayName, bio_found: !!bioText, logs }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
