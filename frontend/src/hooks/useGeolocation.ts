import { useCallback, useState } from "react";

interface GeolocationState {
  locating: boolean;
  error: boolean;
}

/** Ask the browser for the current position once. GPS is only used to centre the map. */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ locating: false, error: false });

  const locate = useCallback((onFound: (lat: number, lng: number) => void) => {
    if (!("geolocation" in navigator)) {
      setState({ locating: false, error: true });
      return;
    }
    setState({ locating: true, error: false });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({ locating: false, error: false });
        onFound(position.coords.latitude, position.coords.longitude);
      },
      () => setState({ locating: false, error: true }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  return { ...state, locate };
}
