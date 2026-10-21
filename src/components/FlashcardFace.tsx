import { useLayoutEffect, useRef, type ReactNode } from "react";

export function FlashcardFace({
  side,
  hidden,
  fit,
  children,
  footer,
}: {
  side: "front" | "back";
  hidden: boolean;
  fit: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const face = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const viewport = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const frame = face.current,
      body = content.current;
    if (!fit || hidden || !frame || !body) return;
    const resize = () => {
      if (!frame.clientHeight || !body.offsetHeight) return;
      const style = getComputedStyle(frame);
      const footerElement = frame.querySelector<HTMLElement>(
        ".flashcard-face-footer",
      );
      const height = Math.max(
        1,
        frame.clientHeight -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom) -
          (footerElement
            ? footerElement.offsetHeight + parseFloat(style.rowGap || "0")
            : 0),
      );
      body.classList.toggle(
        "has-long-text",
        (body.querySelector(".flashcard-text")?.textContent?.length || 0) >
          250 ||
          [...body.querySelectorAll(".flashcard-option")].reduce(
            (length, option) =>
              length + (option.getAttribute("aria-label") || "").length,
            0,
          ) > 400,
      );
      const image = body.querySelector<HTMLImageElement>(".flashcard-image");
      if (image) {
        const otherContent = body.offsetHeight - image.offsetHeight;
        const maximum = `${Math.floor(Math.max(40, Math.min(160, height - otherContent)))}px`;
        if (image.style.maxHeight !== maximum) image.style.maxHeight = maximum;
      }
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
  }, [fit, hidden, !!footer]);
  return (
    <span
      ref={face}
      className={`flashcard-face flashcard-${side}${fit ? " fits-card" : ""}`}
      aria-hidden={hidden}
    >
      {fit ? (
        <>
          <span
            ref={viewport}
            className="flashcard-face-viewport"
            onFocusCapture={(event) => {
              const scroller = viewport.current;
              const control =
                event.target.closest<HTMLElement>("button, input");
              if (!scroller || !control) return;
              const frame = scroller.getBoundingClientRect(),
                box = control.getBoundingClientRect();
              if (box.bottom > frame.bottom)
                scroller.scrollTop += Math.ceil(box.bottom - frame.bottom) + 1;
              else if (box.top < frame.top)
                scroller.scrollTop -= Math.ceil(frame.top - box.top) + 1;
            }}
          >
            <span ref={content} className="flashcard-face-content">
              {children}
            </span>
          </span>
          {footer && <span className="flashcard-face-footer">{footer}</span>}
        </>
      ) : (
        children
      )}
    </span>
  );
}
