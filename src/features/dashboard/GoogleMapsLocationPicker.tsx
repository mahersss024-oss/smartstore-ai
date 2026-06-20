'use client';

import { CheckCircle2, ExternalLink, MapPin, RefreshCw } from 'lucide-react';
import { useState } from 'react';

type GoogleMapsLocationPickerProps = {
  changeLabel: string;
  currentValue?: string;
  inputPlaceholder: string;
  locateLabel: string;
  locatingLabel: string;
  manualLabel: string;
  permissionError: string;
  selectedLabel: string;
  unsupportedError: string;
  viewLabel: string;
};

export const GoogleMapsLocationPicker = (props: GoogleMapsLocationPickerProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [mapsUrl, setMapsUrl] = useState(props.currentValue ?? '');

  const updateMapsUrl = (value: string) => {
    setMapsUrl(value);
  };

  const locateStore = () => {
    setError(null);

    if (!navigator.geolocation) {
      setError(props.unsupportedError);
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        updateMapsUrl(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
        setIsLocating(false);
      },
      () => {
        setError(props.permissionError);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 12000,
      },
    );
  };

  return (
    <div className="grid gap-3">
      <input
        id="mapsUrl"
        name="mapsUrl"
        autoComplete="url"
        value={mapsUrl}
        onChange={event => updateMapsUrl(event.target.value)}
        placeholder={props.inputPlaceholder}
        className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
      />

      <div className="
        flex dashboard-surface flex-col gap-3 rounded-xl border p-4
        md:flex-row md:items-center md:justify-between
      "
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg border bg-background/80 p-2 text-primary">
            {mapsUrl
              ? <CheckCircle2 className="size-5" />
              : <MapPin className="size-5" />}
          </div>
          <div>
            <div className="text-sm font-semibold">
              {mapsUrl ? props.selectedLabel : props.locateLabel}
            </div>
            <div className="text-xs text-muted-foreground">
              {mapsUrl ? props.viewLabel : props.manualLabel}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="
                inline-flex dashboard-pill items-center justify-center gap-2
                rounded-lg border px-3 py-2 text-sm font-semibold
                transition-opacity
                hover:opacity-85
              "
            >
              <ExternalLink className="size-4" />
              {props.viewLabel}
            </a>
          )}

          <button
            type="button"
            onClick={locateStore}
            disabled={isLocating}
            className="
              inline-flex dashboard-pill items-center justify-center gap-2
              rounded-lg border px-3 py-2 text-sm font-semibold
              transition-opacity
              hover:opacity-85
              disabled:cursor-not-allowed disabled:opacity-60
            "
          >
            {mapsUrl
              ? <RefreshCw className="size-4" />
              : <MapPin className="size-4" />}
            {isLocating
              ? props.locatingLabel
              : mapsUrl ? props.changeLabel : props.locateLabel}
          </button>

          <a
            href="https://www.google.com/maps"
            target="_blank"
            rel="noreferrer"
            className="
              inline-flex dashboard-pill items-center justify-center gap-2
              rounded-lg border px-3 py-2 text-sm font-semibold
              transition-opacity
              hover:opacity-85
            "
          >
            <ExternalLink className="size-4" />
            {props.manualLabel}
          </a>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};
