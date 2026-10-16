import { useCallback, useState } from "react";

export interface Position {
  lat: number;
  lng: number;
  /** Metres (how sure the device is). */
  accuracy: number;
}

interface GeolocationState {
  locating: boolean;
  error: boolean;
}

/** True only if the person already allowed location for this site (so asking shows no pop-up). */
export async function isLocationAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state === "granted";
  } catch {
    return false; // Permissions API missing (older Safari): wait for a button press instead
  }
}

/** Ask the browser for the current position once. GPS is only used to centre the map. */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ locating: false, error: false });

  const locate = useCallback((onFound: (position: Position) => void) => {
    if (!("geolocation" in navigator)) {
      setState({ locating: false, error: true });
      return;
    }
    setState({ locating: true, error: false });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setState({ locating: false, error: false });
        onFound({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
      },
      () => setState({ locating: false, error: true }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  return { ...state, locate };
}
