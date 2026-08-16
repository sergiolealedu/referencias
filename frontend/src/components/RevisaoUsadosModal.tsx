import { useMemo, useState } from 'react';

import { api } from '../api/client';
import type { MarcarUsadosResult } from '../types/referencias';
import { parseRevisaoResposta } from '../utils/groupExport';

interface RevisaoUsadosModalProps {
  groupId: number;
  groupTitle: string;
  onClose: () => void;
  onApplied?: (result: MarcarUsadosResult) => void;
}

/**
 * Recebe a resposta da avaliação (IA ou manual) e remarca como usados os
 * artigos apontados como descartados por engano.
 */
export function RevisaoUsadosModal({
  groupId,
  groupTitle,
  onClose,
  onApplied,
}: RevisaoUsadosModalProps) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MarcarUsadosResult | null>(null);
  const [aplicando, setAplicando] = useState(false);

  const chaves = useMemo(() => {
    if (!texto.trim()) return [];
    try {
      return parseRevisaoResposta(texto);
    } catch {
      return [];
    }
  }, [texto]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setResult(null);
    setTexto(await file.text());
  };

  const handleAplicar = async () => {
    setError(null);
    setResult(null);

    let lista: string[];
    try {
      lista = parseRevisaoResposta(texto);
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    if (lista.length === 0) {
      setError('Nenhuma chave encontrada na resposta.');
      return;
    }

    setAplicando(true);
    try {
      const res = await api.marcarArtigosComoUsados(groupId, lista);
      setResult(res);
      onApplied?.(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Aplicar revisão · {groupTitle}</h2>
        </div>

        <div className="modal-body">
          <p className="modal-subtitle">
            Cole a resposta da avaliação (ou selecione o arquivo). Os artigos
            listados voltam a ficar <strong>marcados como usado</strong> e deixam
            de estar descartados.
          </p>

          <label>
            Arquivo da resposta
            <input type="file" accept=".json,.txt,text/plain,application/json" onChange={handleFileChange} />
          </label>

          <label>
            Resposta
            <textarea
              rows={10}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setError(null);
                setResult(null);
              }}
              placeholder={'{"usar": ["chave1", "chave2"]}\n\nou uma chave por linha'}
            />
          </label>

          {chaves.length > 0 && (
            <p className="hint">
              {chaves.length} chave(s) reconhecida(s): {chaves.slice(0, 8).join(', ')}
              {chaves.length > 8 ? '…' : ''}
            </p>
          )}

          {error && <p className="error">{error}</p>}

          {result && (
            <div className="hint">
              <p>
                <strong>{result.atualizados}</strong> de {result.solicitados} artigo(s)
                marcado(s) como usado.
              </p>
              {result.naoEncontrados.length > 0 && (
                <p className="error">
                  Não encontrado(s) neste grupo: {result.naoEncontrados.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleAplicar}
            disabled={aplicando || !texto.trim()}
          >
            {aplicando ? 'Aplicando…' : 'Marcar como usados'}
          </button>
        </div>
      </div>
    </div>
  );
}
