export const onRequestPost: PagesFunction = async (context) => {
  const { request, env } = context;

  try {
    const body: any = await request.json();
    const { items, payer, external_reference } = body;

    // Mercado Pago API URL
    const url = "https://api.mercadopago.com/checkout/preferences";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items,
        payer,
        external_reference,
        notification_url: env.WEBHOOK_URL, // URL para receber notificações de pagamento
        back_urls: {
          success: env.SITE_URL,
          failure: env.SITE_URL,
          pending: env.SITE_URL,
        },
        auto_return: "approved",
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
