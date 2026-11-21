import { useEffect, useRef, type ReactNode } from "react";

export function Dialog(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { onClose, title, wide, children, footer } = props;
  const panelRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  }, []);

  return (
    <div className="modal-backdrop">
      <dialog
        ref={panelRef}
        open
        className="modal"
        aria-modal="true"
        aria-label={title}
        style={wide ? { width: "min(760px, 100%)" } : undefined}
      >
        <header>
          <h2>{title}</h2>
          <span className="spacer" />
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </dialog>
      <button type="button" className="backdrop-dismiss" aria-label="Close dialog" tabIndex={-1} onClick={onClose} />
    </div>
  );
}

export function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={props.title}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className={props.danger ? "btn btn-danger" : "btn btn-primary"} disabled={props.busy} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.45 }}>{props.body}</p>
    </Dialog>
  );
}
