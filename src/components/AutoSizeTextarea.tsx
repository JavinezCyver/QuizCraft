import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from "react";

// Grow wrapped text when either its value or available width changes.
export function AutoSizeTextarea(props: ComponentPropsWithoutRef<"textarea">) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    const resize = () => {
      const style = getComputedStyle(element);
      element.style.height = "0px";
      const border =
        parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      element.style.height = `${Math.ceil(element.scrollHeight + border)}px`;
    };
    resize();
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.value]);
  return <textarea {...props} ref={field} />;
}
