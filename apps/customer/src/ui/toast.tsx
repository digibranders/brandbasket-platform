"use client";

import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import { Icon } from "./icon";

/*
 * One manager for the app, outside React context: useToast posts to it, so a form never depends on finding the provider
 * by context. The dev server can evaluate this module twice when routes compile concurrently (E2E-02), and a context
 * lookup then threw and answered 500; now a toast posted to the other copy is at worst not shown.
 */
const manager = BaseToast.createToastManager();

function showToast(message: string): void {
  manager.add({ title: message });
}

/**
 * Holds the toasts for the whole app. Put it once in the root layout; useToast works anywhere below it. Toasts confirm
 * something that already happened. Errors that need action are a Banner, never a toast (plan 60, Toast).
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  return (
    <BaseToast.Provider toastManager={manager} timeout={2400} limit={1}>
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
  return showToast;
}
