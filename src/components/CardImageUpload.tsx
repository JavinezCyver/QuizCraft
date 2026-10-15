import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { readCoverImage } from "../lib/cover";
import { Button } from "./ui/button";

export function CardImageUpload({
  side,
  value,
  onChange,
  onBusyChange,
}: {
  side: "Question" | "Answer";
  value?: string;
  onChange: (image: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const latestChange = useRef(onChange);
  const latestBusyChange = useRef(onBusyChange);
  latestChange.current = onChange;
  latestBusyChange.current = onBusyChange;
  useEffect(
    () => () => {
      request.current++;
      latestBusyChange.current(false);
    },
    [],
  );

  return (
    <div className="card-image-upload">
      <label>
        <span className="card-image-label">
          <ImagePlus size={16} /> {side} picture (optional)
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label={`${side} picture`}
          disabled={busy}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            const current = ++request.current;
            setBusy(true);
            latestBusyChange.current(true);
            setError("");
            try {
              const image = await readCoverImage(file);
              if (current === request.current) latestChange.current(image);
            } catch (error) {
              if (current === request.current)
                setError((error as Error).message);
            } finally {
              if (current === request.current) {
                setBusy(false);
                latestBusyChange.current(false);
              }
            }
          }}
        />
      </label>
      {busy && <span role="status">Preparing picture…</span>}
      {error && (
        <span className="alert" role="alert">
          {error}
        </span>
      )}
      {value && (
        <>
          <img
            className="card-image-preview"
            src={value}
            alt={`${side} picture preview`}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              request.current++;
              setBusy(false);
              latestBusyChange.current(false);
              setError("");
              latestChange.current("");
            }}
          >
            <Trash2 size={16} /> Remove {side.toLowerCase()} picture
          </Button>
        </>
      )}
    </div>
  );
}
