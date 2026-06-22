// supabase/functions/create-user/index.ts
// Deploy: supabase functions deploy create-user
// Esta función se ejecuta en el server-side con service_role key
// para poder crear usuarios en auth.users de forma segura

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create admin client (service role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sin autorización');

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (!caller) throw new Error('Usuario no autenticado');

    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('role, company_id')
      .eq('auth_id', caller.id)
      .single();

    if (!callerProfile || !['admin', 'superadmin'].includes(callerProfile.role)) {
      throw new Error('Sin permisos para crear usuarios');
    }

    // Parse body
    const { email, password, name, role } = await req.json();
    if (!email || !password || !name || !role) throw new Error('Datos incompletos');

    // Create auth user
    const { data: newAuthUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm
    });
    if (authError) throw authError;

    // Create profile
    const { error: profileError } = await supabaseAdmin.from('users').insert({
      company_id: callerProfile.company_id,
      auth_id: newAuthUser.user.id,
      name,
      email,
      role,
      is_active: true,
    });
    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({ success: true, user_id: newAuthUser.user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
