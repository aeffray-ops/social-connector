import { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
}

export function Modal({ title, children, footer, onClose }: Props) {
  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
