# Auditoria de consistência — fatores × PDFs (2026-09-24)

Base: backup congelado `server-20260924-121030` (ver `CONGELADO.md` na pasta).
Escopo: os 79 artigos com fatores e as 295 ocorrências de fator gravadas neles.

## Como foi feito

Para cada ocorrência, o texto do PDF vinculado foi extraído com PyMuPDF e
normalizado: ligaduras, hifenização de fim de linha, aspas, caixa e pontuação.
Depois a auditoria conferiu:

- **Citação:** cada trecho entre aspas da `description`, dividido nas
  reticências, foi procurado no PDF. A cobertura é a fração de trigramas de
  palavras do trecho que aparecem no texto.
- **`label`:** foi procurado da mesma forma.
- **Regras da skill `analise-fatores-qvt`:** o fator existe no catálogo, a
  polaridade é válida, o `label` não tem vírgula nem ponto e vírgula, a
  `description` não traz resumo em português, e o artigo não é descartado nem
  estudo secundário.

Todo caso abaixo de 90% de cobertura foi revisto manualmente, com o trecho mais
próximo do PDF ao lado. O único PDF de texto ilegível (Valovy2023385) foi
conferido pela imagem das páginas.

## Resultado em uma linha

**As citações são confiáveis:** nenhuma é inventada. Os problemas reais são de
**elegibilidade**: 14 artigos que não deveriam ter fatores têm. Aparecem ainda
3 desvios de verbatim e 26 descrições fora do formato.

| Verificação | Resultado |
|---|---|
| Fator órfão, polaridade inválida, `label`/`description` vazio, `label` com vírgula | 0 |
| Citações encontradas literalmente no PDF | 247 de 295 (84%) |
| Citações com ≥90% de cobertura | 11 |
| Citações abaixo de 90%, revisadas à mão | 37 → **3 com desvio real** (ver 3) |
| Artigos que não deveriam ter fatores | **14** (ver 1 e 2) |
| Descrições com resumo em português fora da citação | **26** em 14 artigos (ver 4) |

> **Revisão posterior (mesmo dia):** a primeira versão deste relatório tinha
> dois erros, já corrigidos abaixo. Primeiro, as palavras entre colchetes nas
> citações do Benlian20252253 e do Wong2023 (`[in our project]`, `[they]`,
> `[them]`, `[be]`, `[are]`) estão **no próprio PDF**: são inserções dos
> autores, e a auditoria as removia antes de comparar. Essas citações estão
> corretas. Segundo, Nolan202114 e Pérez2023425 também são estudos
> secundários e escaparam da primeira varredura. Os secundários passam a ser
> 10, e os artigos inelegíveis, 14.

## 1. Estudos secundários com fatores (10 artigos)

A skill exclui revisão, mapeamento e *survey* de literatura, porque a
evidência é de outro artigo e contá-la no secundário duplica essa evidência.
Nenhum destes 10 está marcado como revisão de literatura no app, e **todos
estão marcados como usados** na tese. Isso não conflita: `not_eligible` só
os tira da análise de fatores, e a lista de usados não olha o status.

| Artigo | Tipo | Fatores |
|---|---|--:|
| Godliauskas2025 | Revisão sistemática + teoria | 8 |
| Meckenstock2024 | Revisão sistemática | 5 |
| Tulili2023 | Mapeamento sistemático | 5 |
| Vellianiti2025275 | Revisão sistemática | 5 |
| Nolan202114 | Revisão multivocal da literatura | 4 |
| Pérez2023425 | Mapeamento sistemático | 4 |
| Romero2025 | Revisão sistemática (dívida social) | 4 |
| Qayum2026 | Mapeamento sistemático | 3 |
| Santana2025 | Revisão sistemática (segurança psicológica) | 3 |
| Suárez-Brieva2026 | Revisão sistemática (dívida social) | 3 |

**Ação:** marcar os 8 como `not_eligible` e remover os fatores com
`removeFactors`. Antes disso, listar os primários citados por eles, conforme a
skill: são candidatos ao corpus.

## 2. Artigos descartados que ainda têm fatores (4)

| Artigo | Situação | Fatores |
|---|---|--:|
| Graziotin2019109 | `not_eligible`, sem motivo | 5 |
| Siitonen2024310 | `not_eligible`, motivo `nao_eng_sw` | 3 |
| Santana2023503 | descartado, sem motivo | 7 |
| Silva2025168268 | descartado, sem motivo | 2 |

**Ação:** remover os fatores, ou revogar o descarte se ele foi indevido.
Graziotin2019109 é o exemplo de `removeFactors` na própria skill, o que sugere
que a migração para o primário começou e não terminou.

### Efeito no catálogo

Sem esses 14 artigos restam **65 artigos primários válidos** (a lista de
fatores afetados abaixo foi calculada com os 12 da primeira varredura). Dois fatores
ficam **sem nenhuma evidência**: *Dívida social* e *Divergências na revisão
de código*. Vários perdem peso, entre eles:

- *Relações no trabalho*: 34 → 27
- *Carga de trabalho*: 16 → 10
- *Apoio do gestor*: 17 → 12
- *Pressão de prazos*: 15 → 12
- *Desenho do trabalho*: 7 → 4
- *Adoção de métodos ágeis*: 3 → 1

A tabela do catálogo em `planejamento-ecs-fatores.md` usa as contagens com os
12 incluídos e precisa ser refeita depois da limpeza.

## 3. Citações com desvio do verbatim (3)

| Artigo · fator | Desvio |
|---|---|
| **Ralph20204927** · Preparação organizacional para crises | **Paráfrase.** O PDF diz *"the degree to which a person is ready for a natural disaster"*, e a citação diz "an individual is prepared for a disaster" |
| Nolan202114 · Suporte e treinamento de TI | "headphones" no lugar de *headsets*; omite "better internet access and hardware (…)" sem reticências. O artigo sai pelo item 1 |
| Vellianiti2025275 · Conflito trabalho-família | "difficulty in maintaining work-life balance" não está no PDF. O artigo sai pelo item 1 |

Há também desvios menores e aceitáveis: remoção de marcadores de referência
(`S65`, `[41]`) nas revisões e de anotações da tabela (Elsalmy20251,
Madampe20231171), sem reticências.

**Ação:** corrigir só a citação do Ralph; as outras duas saem junto com os
artigos.

## 4. Descrições fora do formato (26 em 14 artigos)

A skill pede que a `description` seja só a referência (seção e participantes)
mais a citação verbatim, sem resumo em português. Estas 26 trazem um resumo
antes da citação:

- Espina2026141 (5), Wong2025 (4), Gunatilake202642 (3)
- Arriel2026, Benlian20252253, Brandebusemeyer202523 (2 cada)
- Elsalmy20251, Godliauskas2025, Guenes202533, Leme2024, Massoni201985,
  Ribeiro202258, Senyer2026, Suárez-Brieva2026 (1 cada)

As citações dentro delas estão corretas. Tirando as 2 que pertencem a
artigos secundários, sobram 24.

**Não use `clean-factor-descriptions.ts` para isso.** Rodado em simulação,
ele reescreve 101 ocorrências e apaga citações boas: no Akdur2024 descarta a
segunda citação, e no Chattopadhyay2021 troca a evidência por um trecho curto
aninhado. Em vez dele, as 24 foram reescritas à mão (referência + as mesmas
citações) e conferidas por script: as citações de cada descrição nova são
idênticas às da antiga.

## 5. Observações menores

- **Valovy2023385:** o PDF tem fontes com codificação quebrada, e o texto
  extraído sai ilegível. As 11 citações foram conferidas pela imagem das
  páginas 3 e 4 e estão corretas. As descrições chamam os participantes de P2,
  P3 e P5, mas o artigo usa letras gregas (PA, PB, PΓ, PΔ, PE), então o Ctrl+F
  por participante falha.
- **Falsos alarmes descartados:**
  - "Citação traduzida" em Leme2024, Ribeiro202258 e Romero2025: os artigos
    são em português ou espanhol, e as citações estão no idioma original.
  - Rupturas de extração em Wong2025, Madampe20233325, Newman2025 e
    Graziotin2017324 (`feel ing`, `flexi ble`, cabeçalho de página no meio da
    frase): as citações estão corretas.
- **Wong2023 · `label` "find social support":** não foi localizado no PDF.
  Conferir.

## Correção aplicada (2026-09-24, 19:12 UTC)

Aplicada no servidor, com cópia de segurança em
`/opt/referencias/data/backups/referencias.2026-09-24_19-12-16.db`. Em
seguida, *Dívida social* e *Divergências na revisão de código*, que ficaram
sem artigo, foram apagados do catálogo, com cópia de segurança em
`referencias.2026-09-24_19-21-21.db`. O estado final está congelado em
`server-20260924-162133`: 64 fatores, 65 artigos com fatores e 234
ocorrências.

### O que o script fez

O script `_auditoria-20260924.ts` usa o `SqliteStore` do próprio app e faz,
numa execução:

- remove as 61 ocorrências dos 14 artigos inelegíveis;
- marca os 10 secundários com `status = not_eligible` e revisão de literatura
  (os 4 descartados continuam descartados);
- corrige a citação do Ralph;
- reescreve as 24 descrições do item 4.

Testado numa cópia do backup `server-20260924-152718`: ficam 65 artigos com
fatores e 234 ocorrências, os usados continuam 93, e o `integrity_check` dá
`ok`. A auditoria rodada de novo não acusa nenhum resumo em português, e os
avisos que restam são os casos já conferidos como corretos: colchetes dos
autores, quebras da extração e o PDF ilegível do Valovy.

A tabela do plano (`planejamento-ecs-fatores.md`) foi recontada sobre o
backup congelado.

**Ainda pendente:** listar os primários citados pelos 10 secundários, que são
candidatos ao corpus, conforme a skill.
