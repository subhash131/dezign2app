"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";

interface ConvexBetterAuthProviderProps {
  children: React.ReactNode;
  client: ConvexReactClient;
  authClient: any;
  initialToken?: string | null;
}

let initialTokenUsed = false;

function useAuthFromBetterAuthWithOrg(authClient: any, initialToken?: string | null) {
  const [cachedToken, setCachedToken] = useState<string | null>(
    initialTokenUsed ? null : (initialToken ?? null),
  );
  const pendingTokenRef = useRef<Promise<string | null> | null>(null);
  const cachedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialTokenUsed) {
      initialTokenUsed = true;
    }
  }, []);

  // Listen to session and active organization
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const { data: activeOrg } =
    typeof authClient.useActiveOrganization === "function"
      ? authClient.useActiveOrganization()
      : { data: null };

  const sessionId = session?.session?.id ?? null;
  const activeOrgId =
    activeOrg?.id ??
    (typeof session?.session?.activeOrganizationId === "string"
      ? session.session.activeOrganizationId
      : null);


  const authKey = `${sessionId ?? ""}:${activeOrgId ?? "personal"}`;

  // Reset cached token whenever the auth key changes (session or active organization)
  useEffect(() => {
    if (cachedKeyRef.current !== null && cachedKeyRef.current !== authKey) {
      setCachedToken(null);
      cachedKeyRef.current = null;
    }
  }, [authKey]);

  useEffect(() => {
    if (!session && !isSessionPending && cachedToken) {
      setCachedToken(null);
      cachedKeyRef.current = null;
    }
  }, [session, isSessionPending, cachedToken]);

  // Listen to manual workspace switch events for instant invalidation
  useEffect(() => {
    const handleWorkspaceChanged = () => {
      setCachedToken(null);
      cachedKeyRef.current = null;
    };
    window.addEventListener("auth:workspace-changed", handleWorkspaceChanged);
    return () => {
      window.removeEventListener("auth:workspace-changed", handleWorkspaceChanged);
    };
  }, []);

  const { data: orgs } =
    typeof authClient.useListOrganizations === "function"
      ? authClient.useListOrganizations()
      : { data: null };

  // Smart routing: auto-select team organization on initial login if member of an org
  const autoSwitchedRef = useRef(false);
  useEffect(() => {
    if (
      !autoSwitchedRef.current &&
      session?.user &&
      !activeOrgId &&
      orgs &&
      Array.isArray(orgs) &&
      orgs.length > 0
    ) {
      const firstOrg = orgs[0];
      if (!firstOrg) return;

      if (typeof window !== "undefined") {
        const preferred = localStorage.getItem("preferred_workspace");
        if (preferred === "personal") return;
      }
      autoSwitchedRef.current = true;
      if (typeof authClient.organization?.setActive === "function") {
        authClient.organization
          .setActive({ organizationId: firstOrg.id })
          .then(() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("auth:workspace-changed", {
                  detail: { organizationId: firstOrg.id },
                }),
              );
            }
          })
          .catch(() => {});
      }
    }
  }, [session, activeOrgId, orgs]);



  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}) => {
      if (cachedToken && !forceRefreshToken && cachedKeyRef.current === authKey) {
        return cachedToken;
      }
      if (!forceRefreshToken && pendingTokenRef.current) {
        return pendingTokenRef.current;
      }

      pendingTokenRef.current = authClient.convex
        .token({ fetchOptions: { throw: false } })
        .then(({ data }: { data?: { token?: string } }) => {
          const token = data?.token || null;
          setCachedToken(token);
          cachedKeyRef.current = authKey;
          return token;
        })
        .catch(() => {
          setCachedToken(null);
          cachedKeyRef.current = null;
          return null;
        })
        .finally(() => {
          pendingTokenRef.current = null;
        });

      return pendingTokenRef.current;
    },
    // Re-create fetchAccessToken when authKey changes to force ConvexProviderWithAuth to re-authenticate
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authKey],
  );

  return useMemo(
    () => ({
      isLoading: isSessionPending && !cachedToken,
      isAuthenticated: Boolean(session?.session) || cachedToken !== null,
      fetchAccessToken,
    }),
    [isSessionPending, authKey, fetchAccessToken, cachedToken, session?.session],
  );
}

export function ConvexBetterAuthProvider({
  children,
  client,
  authClient,
  initialToken,
}: ConvexBetterAuthProviderProps) {
  const useBetterAuth = () => useAuthFromBetterAuthWithOrg(authClient, initialToken);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !window.location?.href) {
        return;
      }
      const url = new URL(window.location.href);
      const token = url.searchParams.get("ott");
      if (token) {
        const authClientWithCrossDomain = authClient;
        url.searchParams.delete("ott");
        window.history.replaceState({}, "", url);
        const result =
          await authClientWithCrossDomain.crossDomain?.oneTimeToken?.verify?.({
            token,
          });
        const session = result?.data?.session;
        if (session) {
          await authClient.getSession({
            fetchOptions: {
              headers: {
                Authorization: `Bearer ${session.token}`,
              },
            },
          });
          authClientWithCrossDomain.updateSession?.();
        }
      }
    })();
  }, [authClient]);

  return (
    <ConvexProviderWithAuth client={client} useAuth={useBetterAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
