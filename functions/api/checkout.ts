// functions/api/checkout.js
export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Recebe os dados do frontend (ex: IDs dos números e valor total)
  const body = await request.json(); 

  const preferencia = {
    items: [
      {
        title: 'Números da Rifa',
        unit_price: body.valorTotal,
        quantity: 1,
      }
    ],
    back_urls: {
      success: "https://www.rifadochiquinho.com.br/sucesso",
      failure: "https://www.rifadochiquinho.com.br/falha",
      pending: "https://www.rifadochiquinho.com.br/pendente"
    },
    auto_return: "approved",
    // external_reference é crucial: use para enviar o ID do documento da reserva no Firebase
    external_reference: body.reservaId, 
    // URL que o Mercado Pago vai chamar quando o pagamento for aprovado
    notification_url: "https://www.rifadochiquinho.com.br/api/webhook" 
  };

  try {
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preferencia)
    });

    const data = await mpResponse.json();
    
    // Retorna o link de pagamento para o frontend redirecionar o usuário
    return new Response(JSON.stringify({ init_point: data.init_point }), { status: 200 });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: "Erro ao criar pagamento" }), { status: 500 });
  }
}
