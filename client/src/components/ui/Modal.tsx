import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Button from './Button';

interface ModalProps {
  open: boolean;
  title?: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  width?: number;
}

export default function Modal({ open, title, onClose, footer, children, width }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        {title !== undefined && (
          <div className="modal__head">
            <h3 className="modal__title">{title}</h3>
            {onClose && (
              <div className="modal__close">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  ✕
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="modal__body">{children}</div>
        {footer !== undefined && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}