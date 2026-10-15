import { useLayoutEffect, useRef, type ReactNode } from "react";

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

  useLayoutEffect(() => {
    const frame = face.current;
    const body = content.current;
    if (!fit || hidden || !frame || !body) return;

    const resize = () => {
      if (!frame.clientHeight || !body.offsetHeight) return;
      const style = getComputedStyle(frame);
      const height =
        frame.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom);
      const width =
        frame.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const image = body.querySelector<HTMLImageElement>(".flashcard-image");
      if (image) {
        // Shrink the picture first, reserving space for the actual question and controls.
        const otherContent = body.offsetHeight - image.offsetHeight;
        const imageHeight = Math.max(32, Math.min(160, height - otherContent));
        const maximum = `${Math.floor(imageHeight)}px`;
        if (image.style.maxHeight !== maximum) image.style.maxHeight = maximum;
      }
      // Very short screens or unusually long text must still show the whole card.
      const scale = Math.max(
        0,
        Math.min(1, height / body.offsetHeight, width / body.scrollWidth),
      );
      body.style.setProperty("--flashcard-fit-scale", String(scale));
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

  return (
    <span
      ref={face}
      className={`flashcard-face flashcard-${side}${fit ? " has-picture" : ""}`}
      aria-hidden={hidden}
    >
      {fit ? (
        <span ref={content} className="flashcard-face-content">
          {children}
        </span>
      ) : (
        children
      )}
    </span>
  );
}
