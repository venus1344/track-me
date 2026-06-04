import { useToast } from '../lib/toast';

export default function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="px-4 py-3 rounded-lg text-sm font-medium min-w-max animate-in fade-in slide-in-from-top-2"
          style={{
            background:
              toast.type === 'error'
                ? 'var(--danger)'
                : toast.type === 'success'
                  ? 'var(--success)'
                  : 'var(--accent)',
            color: '#fff',
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
