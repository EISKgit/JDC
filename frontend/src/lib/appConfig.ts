import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { PublicConfig } from "../api/types";

let cached: Promise<PublicConfig> | null = null;

/** Public app settings (is Google sign-in on? is an outside AI used?), fetched once per page load. */
export function useAppConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  useEffect(() => {
    let active = true;
    cached ??= api.get<PublicConfig>("/config");
    cached.then(
      (value) => active && isPublicConfig(value) && setConfig(value),
      () => {
        cached = null; // try again next time; meanwhile the optional UI just stays hidden
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return config;
}

function isPublicConfig(value: unknown): value is PublicConfig {
  const v = value as PublicConfig | null;
  return typeof v?.google_sign_in === "boolean" && typeof v?.ai?.external === "boolean";
}

/** Test helper: forget the cached config. */
export function resetAppConfigCache(): void {
  cached = null;
}
