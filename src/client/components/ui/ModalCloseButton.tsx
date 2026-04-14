import { X } from 'lucide-react';

export function ModalCloseButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="btn-ghost size-8 inline-flex items-center justify-center rounded-full"
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
