import { create } from "zustand";
import type { StateStorage } from "zustand/middleware";
export const useStorageHealth = create<{ error: string | null }>(() => ({
  error: null,
}));
export const workspaceStorage: StateStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      useStorageHealth.setState({
        error:
          "Penyimpanan browser tidak dapat dibaca. Gunakan browser yang mengizinkan penyimpanan lokal.",
      });
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      if (useStorageHealth.getState().error)
        useStorageHealth.setState({ error: null });
    } catch {
      useStorageHealth.setState({
        error:
          "Penyimpanan browser penuh atau diblokir. Edit terbaru masih di memori, tetapi belum tersimpan di perangkat. Unduh cadangan sebelum menutup halaman.",
      });
    }
  },
  removeItem(key) {
    localStorage.removeItem(key);
  },
};
