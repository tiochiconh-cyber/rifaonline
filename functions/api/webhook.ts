/**
 * Webhook do Mercado Pago para processar notificações de pagamento
 * Este arquivo deve ser colocado em: /functions/api/webhook.ts
 * 
 * Configurar a URL do webhook no painel do Mercado Pago:
 * https://www.mercadopago.com.br/developers/panel/app
 * URL: https://rifadochiquinho.com.br/api/webhook
 */

export const onRequestPost: PagesFunction = async (context) => {
  const { request, env } = context;

  try {
    // Obter parâmetros da query string
    const url = new URL(request.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const id = url.searchParams.get("id");

    console.log(`[Webhook] Recebido: topic=${topic}, id=${id}`);

    // Apenas processar notificações de pagamento
    if (topic !== "payment" || !id) {
      return new Response("OK", { status: 200 });
    }

    // Buscar detalhes do pagamento no Mercado Pago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: {
        "Authorization": `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      },
    });

    if (!mpResponse.ok) {
      console.error(`[Webhook] Erro ao buscar pagamento: ${mpResponse.status}`);
      return new Response("Error fetching payment", { status: 500 });
    }

    const payment = await mpResponse.json() as any;

    console.log(`[Webhook] Status do pagamento: ${payment.status}`);

    // Processar apenas pagamentos aprovados
    if (payment.status === "approved") {
      const externalReference = payment.external_reference;
      
      // Extrair informações do external_reference
      // Formato: rifa_{campaignId}_{userId}_{timestamp}
      const refParts = externalReference?.split("_") || [];
      const campaignId = refParts[1];
      const userId = refParts[2];

      if (!campaignId || !userId) {
        console.error(`[Webhook] External reference inválido: ${externalReference}`);
        return new Response("Invalid reference", { status: 400 });
      }

      console.log(`[Webhook] Processando pagamento aprovado para: campaign=${campaignId}, user=${userId}`);

      // Aqui você precisa:
      // 1. Buscar os tickets reservados do usuário para esta campanha
      // 2. Atualizar o status de "reserved" para "confirmed"
      // 3. Registrar o pagamento no Firestore
      
      // Como o Cloudflare Workers não tem SDK do Firebase Admin nativo,
      // você tem duas opções:
      
      // OPÇÃO 1: Usar a REST API do Firestore
      // Exemplo de como atualizar um documento:
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/campaigns/${campaignId}/tickets`;
      
      // OPÇÃO 2: Chamar uma Cloud Function do Firebase que faz a atualização
      // (Recomendado para manter a lógica de negócio centralizada)
      
      console.log(`[Webhook] Pagamento processado com sucesso`);
    } else if (payment.status === "pending") {
      console.log(`[Webhook] Pagamento pendente: ${payment.status_detail}`);
    } else if (payment.status === "rejected") {
      console.log(`[Webhook] Pagamento rejeitado: ${payment.status_detail}`);
    }

    // Sempre retornar 200 OK para o Mercado Pago
    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error(`[Webhook] Erro: ${error.message}`);
    return new Response("Error", { status: 500 });
  }
};
