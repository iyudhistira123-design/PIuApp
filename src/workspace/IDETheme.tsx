import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
export type IDETheme = "light" | "dark";
export const IDE_THEME_KEY = "piwu-ide-theme";
const ThemeContext = createContext<{
  theme: IDETheme;
  setTheme: (theme: IDETheme) => void;
  persistenceError: boolean;
}>({ theme: "dark", setTheme: () => {}, persistenceError: false });
export function IDEThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, update] = useState<IDETheme>(() => {
    try {
      return localStorage.getItem(IDE_THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [persistenceError, setError] = useState(false);
  useLayoutEffect(() => {
    document.documentElement.dataset.ideTheme = theme;
    return () => {
      delete document.documentElement.dataset.ideTheme;
    };
  }, [theme]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (
        e.key === IDE_THEME_KEY &&
        (e.newValue === "light" || e.newValue === "dark" || e.newValue === null)
      )
        update(e.newValue === "light" ? "light" : "dark");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const setTheme = (value: IDETheme) => {
    update(value);
    try {
      localStorage.setItem(IDE_THEME_KEY, value);
      setError(false);
    } catch {
      setError(true);
    }
  };
  return (
    <ThemeContext.Provider value={{ theme, setTheme, persistenceError }}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useIDETheme = () => useContext(ThemeContext);
