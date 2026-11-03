"use client";

import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import { Icon } from "./icon";

/**
 * Holds the toasts for the whole app. Put it once in the root layout; useToast works anywhere below it. Toasts confirm
 * something that already happened. Errors that need action are a Banner, never a toast (plan 60, Toast).
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  return (
    <BaseToast.Provider timeout={2400} limit={1}>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className="fixed bottom-20 left-1/2 z-60 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col gap-2 outline-none md:bottom-6">
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((toast) => (
    <BaseToast.Root key={toast.id} toast={toast} className="motion-fade flex items-center gap-2 rounded-control bg-toast px-4 py-2.5 type-body text-on-primary shadow-pop">
      <Icon name="CheckCircle" size="sm" />
      <BaseToast.Title />
    </BaseToast.Root>
  ));
}

/** Shows a short confirmation: `const toast = useToast(); toast("Call booked. The video link is in your email.")`. */
export function useToast(): (message: string) => void {
  const manager = BaseToast.useToastManager();
  return (message: string) => {
    manager.add({ title: message });
  };
}
