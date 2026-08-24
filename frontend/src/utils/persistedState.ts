import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'referencias.ui.';

/**
 * Estado que sobrevive ao reload, guardado no localStorage.
 *
 * A leitura acontece uma única vez, no primeiro render: ler a cada render
 * faria o valor "pular" de volta se outra aba escrevesse no meio do uso.
 */
export function usePersistedState<T>(
  key: string,
  initial: T | (() => T),
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `${PREFIX}${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const salvo = localStorage.getItem(storageKey);
      if (salvo !== null) return JSON.parse(salvo) as T;
    } catch {
      // JSON corrompido ou storage bloqueado — cai no valor inicial.
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Modo privado ou cota estourada: seguir sem persistir é melhor que quebrar.
    }
  }, [storageKey, value]);

  return [value, setValue];
}

/**
 * `true` só no primeiro render — usado para não descartar estado restaurado.
 *
 * Sob `useCallback` porque a função entra em lista de dependência de efeito:
 * devolvendo uma nova a cada render, o efeito rodaria sempre.
 */
export function useIsFirstRender(): () => boolean {
  const primeiro = useRef(true);
  return useCallback(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return true;
    }
    return false;
  }, []);
}
