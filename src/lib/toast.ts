import { create } from 'zustand';

interface ToastState {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
}

// Dark pill toast with a gold check, auto-dismiss ~2.5s (per the design).
export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    set({ message });
    setTimeout(() => set({ message: null }), 2500);
  },
  clear: () => set({ message: null }),
}));
