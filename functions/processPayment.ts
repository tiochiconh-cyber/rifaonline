/**
 * Cloud Function do Firebase para processar pagamentos do Mercado Pago
 * 
 * Deploy: firebase deploy --only functions:processPayment
 * 
 * Esta função é chamada pelo webhook do Cloudflare Workers quando um pagamento é aprovado.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

interface PaymentData {
  campaignId: string;
  userId: string;
  paymentId: string;
  amount: number;
  status: string;
}

export const processPayment = functions.https.onRequest(async (req, res) => {
  // Validar método HTTP
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const { campaignId, userId, paymentId, amount, status } = req.body as PaymentData;

    // Validar dados
    if (!campaignId || !userId || !paymentId) {
      res.status(400).send("Missing required fields");
      return;
    }

    // Apenas processar pagamentos aprovados
    if (status !== "approved") {
      res.status(200).send("Payment not approved");
      return;
    }

    // Buscar tickets reservados do usuário para esta campanha
    const ticketsSnapshot = await db
      .collection("campaigns")
      .doc(campaignId)
      .collection("tickets")
      .where("buyerUid", "==", userId)
      .where("status", "==", "reserved")
      .get();

    if (ticketsSnapshot.empty) {
      console.log(`[processPayment] Nenhum ticket reservado encontrado para user=${userId}, campaign=${campaignId}`);
      res.status(200).send("No reserved tickets found");
      return;
    }

    // Atualizar status de todos os tickets para "confirmed"
    const batch = db.batch();
    const now = new Date().toISOString();

    ticketsSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: "confirmed",
        confirmedAt: now,
        mercadoPagoPaymentId: paymentId,
      });
    });

    // Registrar o pagamento no Firestore
    const paymentRecord = {
      campaignId,
      userId,
      paymentId,
      amount,
      status: "approved",
      ticketCount: ticketsSnapshot.size,
      processedAt: now,
    };

    batch.set(
      db.collection("payments").doc(paymentId),
      paymentRecord
    );

    // Executar todas as atualizações
    await batch.commit();

    console.log(`[processPayment] Pagamento processado com sucesso: ${paymentId}`);
    res.status(200).send({
      success: true,
      message: `${ticketsSnapshot.size} tickets confirmados`,
      paymentId,
    });
  } catch (error) {
    console.error("[processPayment] Erro:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

/**
 * Função alternativa: Processar pagamento via HTTP trigger
 * Pode ser chamada diretamente do webhook do Cloudflare
 */
export const webhookMercadoPago = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const { topic, id } = req.query;

    if (topic !== "payment" || !id) {
      res.status(200).send("OK");
      return;
    }

    // Buscar detalhes do pagamento no Mercado Pago
    const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: {
        "Authorization": `Bearer ${mpAccessToken}`,
      },
    });

    const payment = await mpResponse.json() as any;

    if (payment.status === "approved") {
      const externalReference = payment.external_reference;
      const refParts = externalReference?.split("_") || [];
      const campaignId = refParts[1];
      const userId = refParts[2];

      if (campaignId && userId) {
        // Buscar tickets reservados
        const ticketsSnapshot = await db
          .collection("campaigns")
          .doc(campaignId)
          .collection("tickets")
          .where("buyerUid", "==", userId)
          .where("status", "==", "reserved")
          .get();

        if (!ticketsSnapshot.empty) {
          const batch = db.batch();
          const now = new Date().toISOString();

          ticketsSnapshot.docs.forEach((doc) => {
            batch.update(doc.ref, {
              status: "confirmed",
              confirmedAt: now,
              mercadoPagoPaymentId: id,
            });
          });

          batch.set(
            db.collection("payments").doc(id as string),
            {
              campaignId,
              userId,
              paymentId: id,
              amount: payment.transaction_amount,
              status: "approved",
              ticketCount: ticketsSnapshot.size,
              processedAt: now,
            }
          );

          await batch.commit();
          console.log(`[webhookMercadoPago] Pagamento processado: ${id}`);
        }
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("[webhookMercadoPago] Erro:", error);
    res.status(200).send("OK"); // Sempre retornar 200 para o Mercado Pago
  }
});
