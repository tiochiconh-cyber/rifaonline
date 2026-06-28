import React, { useEffect, useRef } from "react";

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  /** Custom key to force-recreate/reset the widget if tabs switch */
  resetKey?: string | boolean;
}

// Declare turnstile globally for TypeScript
declare global {
  interface Window {
    onloadTurnstileCallback?: () => void;
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export default function Turnstile({ onVerify, onExpire, onError, resetKey }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Fallback to Cloudflare's always-passes testing sitekey for frictionless local testing and production deployment
  const sitekey = (import.meta as any).env.VITE_CLOUDFLARE_TURNSTILE_SITEKEY || "1x00000000000000000000AA";

  useEffect(() => {
    let active = true;

    // Load the Cloudflare Turnstile script if it's not already loaded
    const scriptId = "cloudflare-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    const initializeTurnstile = () => {
      if (!active || !containerRef.current || !window.turnstile) return;

      // Clean up previous widget if exists
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          console.error("Error removing previous Turnstile widget:", e);
        }
        widgetIdRef.current = null;
      }

      try {
        const id = window.turnstile.render(containerRef.current, {
          sitekey,
          theme: "light",
          callback: (token: string) => {
            if (active) onVerify(token);
          },
          "expired-callback": () => {
            if (active && onExpire) onExpire();
          },
          "error-callback": () => {
            if (active && onError) onError();
          },
        });
        widgetIdRef.current = id;
      } catch (err) {
        console.error("Turnstile render error:", err);
      }
    };

    if (window.turnstile) {
      initializeTurnstile();
    } else {
      // Poll until the global script object is available
      const checkInterval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(checkInterval);
          initializeTurnstile();
        }
      }, 100);

      return () => {
        clearInterval(checkInterval);
        active = false;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch (e) {}
        }
      };
    }

    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {}
      }
    };
  }, [sitekey, onVerify, onExpire, onError, resetKey]);

  return <div ref={containerRef} className="flex justify-center my-3 min-h-[65px] items-center" />;
}
