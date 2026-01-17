'use client';

import {
  ToastProvider as RadixToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  toastIcons,
} from '@/components/ui/toast';
import { useToastStore } from '@/stores/app-store';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, removeToast } = useToastStore();

  return (
    <RadixToastProvider>
      {children}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          variant={toast.variant}
          onOpenChange={(open) => !open && removeToast(toast.id)}
        >
          <div className="flex items-start gap-3">
            {toast.variant && toast.variant !== 'default' && (
              <div className="shrink-0">
                {toastIcons[toast.variant]}
              </div>
            )}
            <div className="flex-1">
              <ToastTitle>{toast.title}</ToastTitle>
              {toast.description && (
                <ToastDescription>{toast.description}</ToastDescription>
              )}
            </div>
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </RadixToastProvider>
  );
}
