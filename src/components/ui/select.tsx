import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const id = useId();
  const selected = options.findIndex((option) => option.value === value);
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }
  function show(index = Math.max(0, selected)) {
    setActive(index);
    search.current = { text: "", time: 0 };
    setOpen(true);
  }
  function choose(index: number) {
    if (options[index]) onChange(options[index].value);
    close(true);
  }
  useLayoutEffect(() => {
    if (!open) return;
    let upwards = false;
    let maxHeight = 360;
    let frame = 0;
    function reposition(chooseSide = false) {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
        close();
        return;
      }
      const dialog = trigger.current?.closest<HTMLElement>('[role="dialog"]');
      const dialogRect = dialog?.getBoundingClientRect();
      const dialogStyle = dialog ? getComputedStyle(dialog) : null;
      const topEdge =
        dialogRect && dialog && dialogStyle
          ? dialogRect.top +
            dialog.clientTop +
            parseFloat(dialogStyle.paddingTop)
          : 12;
      const bottomEdge =
        dialogRect && dialog && dialogStyle
          ? dialogRect.bottom -
            dialog.clientTop -
            parseFloat(dialogStyle.paddingBottom)
          : window.innerHeight - 12;
      if (chooseSide) {
        const below = bottomEdge - rect.bottom - 6;
        const above = rect.top - topEdge - 6;
        upwards = below < 180 && above > below;
        maxHeight = Math.max(44, Math.min(360, upwards ? above : below));
      }
      const viewportWidth = document.documentElement.clientWidth;
      const leftEdge =
        dialogRect && dialog && dialogStyle
          ? dialogRect.left +
            dialog.clientLeft +
            parseFloat(dialogStyle.paddingLeft)
          : 0;
      const rightEdge =
        dialogRect && dialog && dialogStyle
          ? dialogRect.right -
            dialog.clientLeft -
            parseFloat(dialogStyle.paddingRight)
          : viewportWidth;
      const width = Math.min(rect.width, rightEdge - leftEdge);
      const viewportLeft = Math.max(
        leftEdge,
        Math.min(rect.left, rightEdge - width),
      );
      const viewportTop = upwards ? rect.top - 6 : rect.bottom + 6;
      const next: CSSProperties = {
        position: "absolute",
        width,
        maxHeight,
        left:
          dialog && dialogRect
            ? viewportLeft -
              dialogRect.left -
              dialog.clientLeft +
              dialog.scrollLeft
            : window.scrollX + viewportLeft,
        top:
          dialog && dialogRect
            ? viewportTop - dialogRect.top - dialog.clientTop + dialog.scrollTop
            : window.scrollY + viewportTop,
        transform: upwards ? "translateY(-100%)" : undefined,
      };
      setPosition((current) =>
        current.width === next.width &&
        current.maxHeight === next.maxHeight &&
        current.left === next.left &&
        current.top === next.top &&
        current.transform === next.transform
          ? current
          : next,
      );
    }
    const resize = () => reposition(true);
    const scroll = (event: Event) => {
      if (menu.current?.contains(event.target as Node)) return;
      // Absolute positioning follows document scrolling without a React update.
      if (event.target === document) {
        const rect = trigger.current?.getBoundingClientRect();
        if (rect && (rect.bottom <= 0 || rect.top >= window.innerHeight))
          close();
        return;
      }
      // Nested scrolling containers move the control within the document.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => reposition());
    };
    reposition(true);
    menu.current?.focus({ preventScroll: true });
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", scroll, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open, options.length]);
  useLayoutEffect(() => {
    if (!open) return;
    const container = menu.current;
    const option = document.getElementById(`${id}-option-${active}`);
    if (!container || !option) return;
    const top = option.offsetTop;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (
      top + option.offsetHeight >
      container.scrollTop + container.clientHeight
    )
      container.scrollTop = top + option.offsetHeight - container.clientHeight;
  }, [open, active, id, position.maxHeight]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target))
        close();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  function keyDown(event: KeyboardEvent) {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : open
              ? (active +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  options.length) %
                options.length
              : Math.max(0, selected);
      if (open) setActive(next);
      else show(next);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else show();
    } else if (event.key === "Tab") {
      if (open) close(true);
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const text =
        (now - search.current.time < 600 ? search.current.text : "") +
        event.key.toLowerCase();
      search.current = { text, time: now };
      const needle = [...text].every((letter) => letter === text[0])
        ? text[0]
        : text;
      const start = open ? active : selected;
      for (let step = 1; step <= options.length; step++) {
        const index = (start + step + options.length) % options.length;
        if (options[index].label.toLowerCase().startsWith(needle)) {
          if (open) setActive(index);
          else onChange(options[index].value);
          break;
        }
      }
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        className="themed-select-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(true) : show())}
        onKeyDown={keyDown}
      >
        <span>{options[selected]?.label || value}</span>
        <span>
          <ChevronDown size={16} />
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={
              options[active] ? `${id}-option-${active}` : undefined
            }
            className="themed-select-menu"
            style={position}
            onKeyDown={keyDown}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== trigger.current
              )
                close();
            }}
          >
            <div className="themed-select-viewport">
              {options.map((option, index) => (
                <div
                  key={option.value}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={value === option.value}
                  className="themed-select-option"
                  data-state={value === option.value ? "checked" : "unchecked"}
                  data-highlighted={index === active ? "" : undefined}
                  onPointerMove={(event) => {
                    if (event.pointerType === "mouse") setActive(index);
                  }}
                  onClick={() => choose(index)}
                >
                  <span>{option.label}</span>
                  <span>{value === option.value && <Check size={16} />}</span>
                </div>
              ))}
            </div>
          </div>,
          trigger.current?.closest('[role="dialog"]') || document.body,
        )}
    </>
  );
}
