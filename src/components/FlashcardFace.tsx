import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";

export function FlashcardFace({
  side,
  hidden,
  fit,
  children,
}: {
  side: "front" | "back";
  hidden: boolean;
  fit: boolean;
  children: ReactNode;
}) {
  const face = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const viewport = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [page, setPage] = useState(0);
  const [layout, setLayout] = useState({ height: 0, offsets: [0] });
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null);

  function revealControl(target: HTMLElement) {
    if (!content.current || !viewport.current?.contains(target)) return;
    const control = target.closest<HTMLElement>("button, input");
    if (!control) return;
    const body = content.current.getBoundingClientRect();
    const box = control.getBoundingClientRect();
    const top = box.top - body.top;
    const bottom = box.bottom - body.top;
    const visible = layout.offsets.findIndex(
      (offset) => top >= offset - 1 && bottom <= offset + layout.height + 1,
    );
    if (visible >= 0) setPage(visible);
  }

  useLayoutEffect(() => {
    const frame = face.current;
    const body = content.current;
    if (!fit || hidden || !frame || !body) return;
    setControlsHost(
      frame
        .closest(".flashcard")
        ?.querySelector<HTMLElement>(".flashcard-ratings") || null,
    );

    const resize = () => {
      if (!frame.clientHeight || !body.offsetHeight) return;
      const style = getComputedStyle(frame);
      const height =
        frame.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom);
      body.classList.toggle(
        "has-long-text",
        (body.querySelector(".flashcard-text")?.textContent?.length || 0) >
          250 ||
          (body.querySelector(".flashcard-options")?.textContent?.length || 0) >
            400,
      );
      const image = body.querySelector<HTMLImageElement>(".flashcard-image");
      if (image) {
        // Shrink the picture first, reserving space for the actual question and controls.
        const otherContent = body.offsetHeight - image.offsetHeight;
        const imageHeight = Math.max(32, Math.min(160, height - otherContent));
        const maximum = `${Math.floor(imageHeight)}px`;
        if (image.style.maxHeight !== maximum) image.style.maxHeight = maximum;
      }
      // Page long content at its readable font size, keeping the card stationary.
      const pageHeight = Math.max(1, height);
      const end = Math.max(0, body.offsetHeight - pageHeight);
      const step = Math.max(1, pageHeight - Math.min(32, pageHeight / 4));
      const bodyTop = body.getBoundingClientRect().top;
      const controls = [
        ...body.querySelectorAll<HTMLElement>("button, input, img"),
      ].map((control) => {
        const rect = control.getBoundingClientRect();
        return {
          top: rect.top - bodyTop,
          bottom: rect.bottom - bodyTop,
          height: rect.height,
        };
      });
      const offsets = [0];
      while (offsets[offsets.length - 1] < end) {
        const current = offsets[offsets.length - 1];
        let next = Math.min(end, current + step);
        for (const control of controls) {
          if (
            control.height <= pageHeight &&
            control.top > current + 1 &&
            control.top < current + pageHeight &&
            control.bottom > current + pageHeight
          )
            next = Math.min(next, control.top);
        }
        offsets.push(Math.min(end, Math.max(current + 1, next)));
      }
      setLayout((current) =>
        current.height === pageHeight &&
        current.offsets.length === offsets.length &&
        current.offsets.every((offset, index) => offset === offsets[index])
          ? current
          : { height: pageHeight, offsets },
      );
      setPage((current) => Math.min(current, offsets.length - 1));
    };

    resize();
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        resize();
      });
    });
    observer.observe(frame);
    observer.observe(body);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
    };
  }, [fit, hidden]);

  useLayoutEffect(() => {
    if (!hidden && document.activeElement instanceof HTMLElement)
      revealControl(document.activeElement);
  }, [layout, hidden]);

  return (
    <span
      ref={face}
      className={`flashcard-face flashcard-${side}${fit ? " has-picture" : ""}`}
      aria-hidden={hidden}
    >
      {fit ? (
        <>
          <span
            ref={viewport}
            id={id}
            className={`flashcard-face-viewport${layout.offsets.length > 1 ? " is-paged" : ""}`}
            style={{ height: layout.height || undefined }}
            onFocusCapture={(event) =>
              revealControl(event.target as HTMLElement)
            }
          >
            <span
              ref={content}
              className="flashcard-face-content"
              style={{
                transform: `translateY(-${layout.offsets[page] || 0}px)`,
              }}
            >
              {children}
            </span>
          </span>
          {layout.offsets.length > 1 &&
            !hidden &&
            controlsHost &&
            createPortal(
              <span
                className="flashcard-content-controls"
                role="group"
                aria-label="Card content pages"
              >
                <button
                  type="button"
                  aria-label="Previous card content"
                  aria-controls={id}
                  disabled={page === 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPage((current) => Math.max(0, current - 1));
                  }}
                >
                  <ChevronLeft size={16} /> Back
                </button>
                <span className="sr-only" aria-live="polite">
                  {page + 1} / {layout.offsets.length}
                </span>
                <button
                  type="button"
                  aria-label="Next card content"
                  aria-controls={id}
                  disabled={page === layout.offsets.length - 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPage((current) =>
                      Math.min(layout.offsets.length - 1, current + 1),
                    );
                  }}
                >
                  More <ChevronRight size={16} />
                </button>
              </span>,
              controlsHost,
            )}
        </>
      ) : (
        children
      )}
    </span>
  );
}
