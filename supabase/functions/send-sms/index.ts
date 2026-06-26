import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

interface SendSmsRequest {
  to: string
  body: string
  organization_id: string
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: SendSmsRequest
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { to, body, organization_id } = payload

  if (!to || !body || !organization_id) {
    return new Response(
      JSON.stringify({
        error: 'Missing required fields: to, body, organization_id',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // TODO: initialize Twilio client with env vars TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
  // const client = twilio(Deno.env.get('TWILIO_ACCOUNT_SID'), Deno.env.get('TWILIO_AUTH_TOKEN'))
  // const message = await client.messages.create({
  //   to,
  //   from: Deno.env.get('TWILIO_FROM_NUMBER'),
  //   body,
  // })
  // return new Response(JSON.stringify({ sid: message.sid, status: message.status }))

  return new Response(
    JSON.stringify({
      sid: 'stub_sid',
      status: 'sent',
      to,
      organization_id,
      body_length: body.length,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
})
