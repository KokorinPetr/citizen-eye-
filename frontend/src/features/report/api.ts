import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import type { GeoPoint, ParsedReport } from "../../api/types";

export function usePreviewReport() {
  return useMutation({
    mutationFn: (text: string) => unwrap(api.POST("/reports/preview", { body: { text } })),
  });
}

interface SubmitReport {
  text: string;
  location: GeoPoint;
  contact_phone?: string;
  parsed?: ParsedReport;
}

export function useSubmitReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitReport) => unwrap(api.POST("/reports", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["incidents"] }),
  });
}
