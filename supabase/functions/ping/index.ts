// Supabase Edge Function: /functions/ping
// Lightweight ping to prevent free-tier project pause
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  // Simple lightweight query
  return new Response(JSON.stringify({ 
    status: "alive", 
    timestamp: new Date().toISOString(),
    message: "Supabase free-tier ping successful"
  }), {
    headers: { "Content-Type": "application/json" },
  });
});