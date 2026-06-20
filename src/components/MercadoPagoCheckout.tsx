import React, { useEffect, useState } from "react";
import { Ticket, Campaign, UserProfile } from "../types";
import { createMPPreference } from "../utils/mercadopago";
import { Loader2, AlertCircle } from "lucide-react";

interface MercadoPagoCheckoutProps {
  campaign: Campaign;
  tickets: Ticket[];
  userProfile: UserProfile;
  totalPrice: number;
  onSuccess?: (preferenceId: string) => void;
  onError?: (error: string) => void;
}

export default function MercadoPagoCheckout({
  campaign,
  tickets,
  userProfile,
  totalPrice,
  onSuccess,
  onError,
}: MercadoPagoCheckoutProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      const items = [
        {
          title: `Cotas da Rifa: ${campaign.title}`,
          quantity: tickets.length,
          unit_price: campaign.ticketPrice,
          description: `Números: ${tickets.map(t => t.number).join(", ")}`,
        },
      ];

      const payer = {
        name: userProfile.name,
        email: userProfile.email,
        phone: {
          area_code: userProfile.phone?.substring(0, 2) || "11",
          number: userProfile.phone?.substring(2) || "",
        },
        identification: {
          type: "CPF",
          number: userProfile.cpf?.replace(/\D/g, "") || "",
        },
      };

      const externalReference = `rifa_${campaign.id}_${userProfile.uid}_${Date.now()}`;

      const preference = await createMPPreference(items, payer, externalReference);

      if (preference.init_point) {
        // Redirecionar para o checkout do Mercado Pago
        window.location.href = preference.init_point;
        onSuccess?.(preference.id);
      } else {
        throw new Error("Falha ao obter link de pagamento");
      }
    } catch (err: any) {
      const errorMessage = err?.message || "Erro ao processar pagamento";
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">Erro ao processar pagamento</h4>
            <p className="text-xs mt-1">{error}</p>
          </div>
        </div>
      )}

      <button
        onClick={handleCheckout}
        disabled={loading}
        className={`w-full py-3 px-6 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all uppercase tracking-wider ${
          loading
            ? "bg-slate-300 text-slate-600 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 active:scale-95"
        }`}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? "Processando..." : "Pagar com Mercado Pago 💳"}
      </button>

      <p className="text-xs text-slate-500 text-center">
        Você será redirecionado para o Mercado Pago para completar o pagamento de forma segura.
      </p>
    </div>
  );
}
