import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { X, Check, ArrowUpRight } from "lucide-react";
import { useStore } from "../lib/store";
export function Logo({
  small = false,
  light = false,
}: {
  small?: boolean;
  light?: boolean;
}) {
  return (
    <Link
      to="/"
      className={"logo " + (light ? "logo-light" : "")}
      aria-label="PiwuApp, beranda"
    >
      <span className="logo-symbol">
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="M7 25V7h10a7.5 7.5 0 0 1 0 15h-3v-6h3a1.5 1.5 0 0 0 0-3h-4v12H7Z"
            fill="currentColor"
          />
          <circle cx="26" cy="6" r="3" fill="currentColor" />
        </svg>
      </span>
      {!small && (
        <span>
          PiwuApp<span className="logo-dot">.</span>
        </span>
      )}
    </Link>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const focusables = () =>
      ref.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]",
      );
    (
      ref.current?.querySelector<HTMLElement>(
        "input:not([disabled]),textarea:not([disabled]),select:not([disabled])",
      ) || focusables()?.[0]
    )?.focus();
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const els = focusables();
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", fn);
      document.body.style.overflow = overflow;
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header role="presentation">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Tutup" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Toast() {
  const toast = useStore((s) => s.toast);
  return toast ? (
    <div className="toast" role="status">
      <Check size={17} />
      {toast}
    </div>
  ) : null;
}
export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}
export function ArrowLink({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <a className="arrow-link" href={href}>
      {children}
      <ArrowUpRight size={16} />
    </a>
  );
}
