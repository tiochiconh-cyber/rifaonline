// functions/api/webhook.js
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // O Mercado Pago envia os dados na URL (query params) ou no corpo da requisição
    const url = new URL(request.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const id = url.searchParams.get("id") || url.searchParams.get("data.id");

    // Só nos importamos se for uma notificação de pagamento
    if (topic === 'payment' || topic === 'payment.created') {
      
      // 1. Buscamos os detalhes completos do pagamento na API do Mercado Pago
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
        headers: {
          'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`
        }
      });
      const paymentData = await mpResponse.json();

      // 2. Verificamos se foi aprovado
      if (paymentData.status === 'approved') {
        const reservaId = paymentData.external_reference; // O ID do Firebase que enviamos antes!

        // 3. AQUI ENTRA A ATUALIZAÇÃO DO FIREBASE
        // Como o Cloudflare Edge não roda o Firebase Admin padrão bem, 
        // usaremos a REST API do Firestore para mudar o status da reservaId para "pago"
        await atualizarFirestoreREST(reservaId, env);
      }
    }

    // O Mercado Pago exige que você responda com 200 OK rapidamente
    return new Response("OK", { status: 200 });

  } catch (error) {
    return new Response("Erro no Webhook", { status: 500 });
  }
}
