import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sin autorización');
    const token = authHeader.replace('Bearer ', '');

    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError) throw callerError;
    if (!caller) throw new Error('Usuario no autenticado');

    const body = await req.json();
    const authId = body.auth_id as string | undefined;
    const email = body.email as string | undefined;
    if (!authId || !email) throw new Error('auth_id y email son requeridos');
    if (caller.id !== authId) throw new Error('Token de usuario inválido');
    if (caller.email !== email) throw new Error('Email de usuario inválido');

    const { data: profiles, error: selectError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(2);
    if (selectError) throw selectError;
    if (!profiles || profiles.length === 0) {
      throw new Error('No se encontró un perfil de usuario para este correo.');
    }
    if (profiles.length > 1) {
      throw new Error('Se encontraron múltiples perfiles para este correo. Contacta a tu administrador.');
    }

    const profile = profiles[0];
    if (profile.auth_id && profile.auth_id !== authId) {
      // If profile already linked to different auth_id, just return it
      // This handles migration cases where user exists but wasn't linked yet
      const { data: linkedProfile, error: linkedError } = await supabaseAdmin
        .from('users')
        .select('*, company:companies(*), branch:branches(*)')
        .eq('id', profile.id)
        .single();
      if (linkedError) throw linkedError;
      return new Response(JSON.stringify(linkedProfile), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile.auth_id) {
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ auth_id: authId })
        .eq('id', profile.id);
      if (updateError) throw updateError;
    }

    const { data: linkedProfile, error: linkedError } = await supabaseAdmin
      .from('users')
      .select('*, company:companies(*), branch:branches(*)')
      .eq('id', profile.id)
      .single();
    if (linkedError) throw linkedError;

    return new Response(JSON.stringify(linkedProfile), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
