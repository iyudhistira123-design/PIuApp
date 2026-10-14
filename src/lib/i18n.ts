export const messages = {
  id: {
    appName: "PiwuApp",
    loading: "Memuat…",
    empty: "Belum ada data",
    error: "Terjadi kesalahan. Silakan coba lagi.",
    save: "Simpan",
    cancel: "Batal",
  },
};
export const t = (key: keyof typeof messages.id) => messages.id[key];
