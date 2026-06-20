import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

// Load Firebase Config to retrieve database ID and project parameters
import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase Admin with Application Default Credentials or standard config
try {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
} catch (error) {
  console.log("Firebase Admin already initialized or fallback setup:", error);
}

const app = express();
const PORT = 3000;

// Enable JSON parser for requests
app.use(express.json());

// API route 1: Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// API route 2: Create Mercado Pago Checkout Preference
app.post("/api/payment/create-preference", async (req, res) => {
  try {
    const { campaignId, batchId, title, unitPrice, quantity, userName, userEmail, userPhone } = req.body;

    if (!campaignId || !batchId || !unitPrice || !quantity) {
      return res.status(400).json({ error: "Faltam parâmetros obrigatórios para criar preferência." });
    }

    // Retrieve active access token from backend environment secrets
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) {
      console.warn("API Mercado Pago: MERCADO_PAGO_ACCESS_TOKEN não configurado no painel do servidor.");
      return res.status(500).json({
        error: "O administrador ainda não configurou a credencial de integração com o Mercado Pago. Entre em contato com o suporte."
      });
    }

    const host = process.env.APP_URL || "http://localhost:3000";

    const payload = {
      items: [
        {
          id: `${campaignId}_${batchId}`,
          title: `Cotas de Rifa - ${title || "Campanha Ativa"}`,
          quantity: Number(quantity),
          unit_price: Number(unitPrice),
          currency_id: "BRL"
        }
      ],
      payer: {
        name: userName || "Comprador de Cotas",
        email: userEmail || "comprador@exemplo.com.br",
        phone: {
          number: userPhone || ""
        }
      },
      external_reference: `${campaignId}____${batchId}`,
      back_urls: {
        success: `${host}/?mp_status=approved&batchId=${batchId}&campaignId=${campaignId}`,
        failure: `${host}/?mp_status=rejected&batchId=${batchId}&campaignId=${campaignId}`,
        pending: `${host}/?mp_status=pending&batchId=${batchId}&campaignId=${campaignId}`
      },
      auto_return: "approved"
    };

    console.log(`Gerando preferência de compra para Lote: ${batchId}, Quantidade: ${quantity}, Preço Total: R$ ${unitPrice * quantity}`);

    const response = await fetch("https://api.mercadopago.com/v1/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erro da API do Mercado Pago na resposta:", errText);
      return res.status(500).json({ error: "Erro na comunicação com a API do Mercado Pago", details: errText });
    }

    const data = await response.json();
    return res.json({
      id: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point
    });
  } catch (error: any) {
    console.error("Exceção criada ao tentar faturar cota:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido" });
  }
});

// API route 3: Callback Webhook / IPN from Mercado Pago
app.post("/api/payment/webhook", async (req, res) => {
  try {
    const { type, action, data } = req.body;
    console.log("Recebido Webhook webhook do Mercado Pago:", { type, action, data });

    // Mercado Pago notifies on payment topic (or search parameters topic)
    const paymentId = data?.id || req.body.id;
    const isPaymentTopic = type === "payment" || req.query.topic === "payment";

    if (!isPaymentTopic || !paymentId) {
      // Return 200 to acknowledge generic notifications immediately
      return res.sendStatus(200);
    }

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) {
      console.error("Status Webhook abortado: MERCADO_PAGO_ACCESS_TOKEN não está definido no backend.");
      return res.sendStatus(400);
    }

    // Read live confirmation status from Mercado Pago Gateway API
    const mpUrl = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    const mpRes = await fetch(mpUrl, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!mpRes.ok) {
      console.error(`Erro de leitura do pagamento ${paymentId} na API MP: Status ${mpRes.status}`);
      return res.sendStatus(400);
    }

    const payload = await mpRes.json();
    console.log(`Detalhamento do pagamento via MP: ID [${payload.id}], Status [${payload.status}], Ref [${payload.external_reference}]`);

    if (payload.status === "approved") {
      const extRef = payload.external_reference;
      if (extRef && extRef.includes("____")) {
        const [campaignId, batchId] = extRef.split("____");
        console.log(`Iniciando homologação automática das cotas. Rifa: ${campaignId}, Lote de Cotas: ${batchId}`);

        const databaseId = firebaseConfig.firestoreDatabaseId;
        const firestoreDb = getFirestore(databaseId);

        // Fetch all matching unconfirmed tickets under campaigns/{campaignId}/tickets
        const ticketsRef = firestoreDb.collection("campaigns").doc(campaignId).collection("tickets");
        const snapshot = await ticketsRef.where("batchId", "==", batchId).get();

        if (snapshot.empty) {
          console.warn(`Nenhuma cota encontrada no banco referente ao lote de reservas ${batchId}.`);
        } else {
          const batchWriter = firestoreDb.batch();
          const nowIso = new Date().toISOString();

          snapshot.docs.forEach((doc) => {
            const item = doc.data();
            if (item.status !== "confirmed") {
              batchWriter.update(doc.ref, {
                status: "confirmed",
                confirmedAt: nowIso,
                mpPaymentId: String(paymentId)
              });
            }
          });

          await batchWriter.commit();
          console.log(`Homologado! Com sucesso, as ${snapshot.size} cotas do lote ${batchId} foram confirmadas via Mercado Pago.`);
        }
      } else {
        console.warn(`Aviso de external_reference sem formato válido de partição: ${extRef}`);
      }
    }

    return res.status(200).send("Webhook Processado com sucesso");
  } catch (error) {
    console.error("Falha ao responder webhook de checkout do Mercado Pago:", error);
    return res.status(500).send("Internal Server Error");
  }
});

// Configure Vite middleware in developmental container or Static serving in production
async function start() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Servindo aplicação híbrida React no modo DEVELOPMENT via Vite Middleware.");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    console.log("Servindo aplicação híbrida React no modo PRODUCTION.");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FULLSTACK CONTAINER] Servidor ativo e operando em http://localhost:${PORT}`);
  });
}

start();
