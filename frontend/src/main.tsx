import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "leaflet/dist/leaflet.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ModeProvider } from "./app/ModeContext";
import { router } from "./app/routes";
import { AuthProvider } from "./features/auth/AuthProvider";
import { MapViewProvider } from "./features/map/MapViewContext";
import "./styles/tokens.css";
import "./styles/base.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ModeProvider>
          <MapViewProvider>
            <RouterProvider router={router} />
          </MapViewProvider>
        </ModeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
