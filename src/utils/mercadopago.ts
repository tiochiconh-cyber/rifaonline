export async function createMPPreference(items: any[], payer: any, externalReference: string) {
  try {
    const response = await fetch("/api/create-preference", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items,
        payer,
        external_reference: externalReference,
      }),
    });

    if (!response.ok) {
      throw new Error("Erro ao criar preferência de pagamento");
    }

    return await response.json();
  } catch (error) {
    console.error("Mercado Pago Error:", error);
    throw error;
  }
}
