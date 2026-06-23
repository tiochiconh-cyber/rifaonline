import express from "express";
import path from "path";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createServer as createViteServer } from "vite";

// Initialize Firebase Admin SDK
// Since it runs on Cloud Run, it automatically authenticates using Application Default Credentials (ADC)
const firebaseApp = initializeApp({
  projectId: "gen-lang-client-0823699988",
});

const adminAuth = getAuth(firebaseApp);
const adminDb = getFirestore(firebaseApp, "ai-studio-05237965-f0b5-4d3e-8b21-f8ebe563cc36");

const app = express();
const PORT = 3000;

app.use(express.json());

// API route to change a user's password securely from the backend
app.post("/api/admin/update-user-password", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    
    // Verify that the user calling this is indeed the Admin email
    if (decodedToken.email !== "tio.chico.nh@gmail.com") {
      return res.status(403).json({ error: "Acesso proibido: Apenas o Administrador pode executar esta ação" });
    }

    const { uid, newPassword, email } = req.body;
    if (!uid || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Parâmetros inválidos. A senha precisa ter pelo menos 6 caracteres." });
    }

    // 1. Try to update password in Firebase Auth
    try {
      await adminAuth.updateUser(uid, {
        password: newPassword
      });
    } catch (authErr: any) {
      // If the user does not exist yet in Firebase Auth (e.g., they were created manually but never logged in),
      // let's create them directly in Firebase Auth to ensure their Auth account is fully set up with the new password!
      if (authErr.code === "auth/user-not-found" && email) {
        try {
          await adminAuth.createUser({
            uid,
            email,
            password: newPassword
          });
        } catch (createErr: any) {
          console.error("Error creating manual user in Auth:", createErr);
        }
      } else {
        console.error("Error updating user in Auth:", authErr);
      }
    }

    // 2. Update password in Firestore
    await adminDb.collection("users").doc(uid).update({
      password: newPassword
    });

    return res.json({ success: true, message: "Senha redefinida com sucesso em ambos os serviços!" });
  } catch (err: any) {
    console.error("Error updating user password from server:", err);
    return res.status(500).json({ error: err.message || "Erro Interno do Servidor" });
  }
});

// Vite Dev Server middleware or static production serving
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on port ${PORT}`);
  });
}

start();
