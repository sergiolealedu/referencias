---
name: analise-fatores-qvt
description: Extrai fatores de qualidade de vida no trabalho (QVT) de desenvolvedores de software a partir de artigos científicos e gera o delta JSON que o app Referências aceita. Use quando receber um arquivo analise-fatores-*.json, quando pedirem para analisar artigos e extrair fatores, ou para revisar/corrigir um delta antes de aplicar.
---

# Análise de fatores de QVT em artigos

Extrair, de artigos científicos, os fatores que afetam a qualidade de vida no
trabalho de quem produz software, e devolver um delta que o app aplica sem
retrabalho manual.

## Fluxo

1. O usuário exporta um pacote pelo botão **Análise** (na linha do artigo) ou
   **Exportar para análise** (aba Fatores). O arquivo traz `catalogo`,
   `artigos` (com `pdfUrl` assinado) e `formatoResposta`.
2. Você lê o PDF, extrai os fatores e devolve **apenas** o JSON do delta.
3. O usuário aplica em **Fatores → Aplicar delta em artigos**.

O arquivo exportado já contém um campo `prompt` com as regras. Ele existe para
funcionar em qualquer IA; esta skill é a versão completa, com o raciocínio por
trás das regras.

## Ler o material

Baixe o PDF de `artigos[].pdfUrl` — o link é assinado e abre sem login, mas
**expira** (veja `pdfExpiraEm`). Se não conseguir acessá-lo, **diga isso
explicitamente** em vez de analisar só pelo abstract: o abstract raramente
menciona os fatores, que aparecem em resultados e discussão. Um delta feito às
cegas parece bom e está errado.

## O que é fator, o que não é

Fator é o que **influencia** o bem-estar: práticas, condições de trabalho,
gestão, ferramentas, relações, carga, estabilidade.

Três erros recorrentes:

**Confundir desfecho com fator.** Em artigos com modelo teórico, as variáveis do
modelo são o que É AFETADO, não o fator. Num artigo de Self-Determination
Theory, autonomia/competência/pertencimento são as necessidades medidas; os
fatores são mentoria, microgerenciamento, demissões, prazos. O mesmo vale para
"bem-estar", "satisfação" e "burnout" quando são o resultado medido.

**Usar nome de produto.** "Copilot" não casa com o artigo que diz "ChatGPT".
Generalize para "Ferramentas de IA para codificação".

**Fatiar o mesmo construto.** "layoffs" e "job insecurity" no mesmo artigo
costumam ser um construto só (a insegurança é o efeito das demissões). Idem
"mentoria" e "apoio de pares", "chefe apoiador" e "microgerenciamento" — nesses
dois últimos, escolha o fator e use `polarity` para o sentido.

Só conta o que o artigo **evidencia** com dados, achados ou análise própria.
Ignore menção de passagem, referencial teórico e trabalho futuro. E o fator
precisa se referir a quem **produz** software — descarte o que é sobre
usuários, pacientes ou outras profissões.

Acima de ~8 fatores por artigo, desconfie: quase sempre é o mesmo conceito
fatiado. Melhor devolver pouco e correto.

## Os três campos

| Campo | O que é | Exemplo |
|---|---|---|
| `label` | Termo **verbatim** do artigo, sem traduzir | `constant pressure to learn new skills` |
| `canonical` | Nome curto do fator no catálogo, em português | `Pressão por atualização` |
| `aliases` | Rótulo do `catalogo` quando o fator **já existe** | `["Carga de trabalho"]` |

Por que dois nomes: `label` fica na ocorrência e permite achar o trecho no PDF
com Ctrl+F; `canonical` é o que vira entrada do catálogo. Sem essa separação,
frases longas do texto viram nome de fator e o catálogo fica ilegível.

**A regra que mais importa:** antes de propor `canonical` novo, procure em
`catalogo`. Se o fator já existir sob **qualquer** grafia — inclusive em outro
idioma — repita esse rótulo em `canonical` **e** em `aliases`. É assim que
artigos diferentes convergem no mesmo fator em vez de fragmentar o catálogo.

Não use vírgula nem ponto-e-vírgula dentro de `label` ou `canonical`: eles
separam grafias no app.

`polarity` é o efeito do fator (`positive` melhora o bem-estar, `negative`
piora), não a qualidade do artigo. `description` é uma frase com a evidência
deste artigo, de preferência citando o trecho.

## Exemplos

```jsonc
// ✘ desfecho como fator
{"label": "autonomy", "canonical": "Autonomia"}
// ✔ o que afeta a autonomia
{"label": "the leadership team dictated specific tool use",
 "canonical": "Imposição de ferramentas", "polarity": "negative"}

// ✘ nome de produto
{"label": "Copilot", "canonical": "Copilot"}
// ✔ generalizado
{"label": "AI coding tools like Copilot",
 "canonical": "Ferramentas de IA para codificação", "polarity": "positive"}

// ✘ canônico com a frase do texto
{"canonical": "task completion and delivery of results"}
// ✔ rótulo curto
{"label": "task completion and delivery of results",
 "canonical": "Senso de realização"}

// ✘ label traduzido: não acha no PDF em inglês
{"label": "Pressão por atualização"}
// ✔ verbatim
{"label": "constant pressure to learn new skills",
 "canonical": "Pressão por atualização"}

// ✔ reaproveitando o catálogo existente
// catalogo: {"label": "Carga de trabalho", "grafias": ["Workload"]}
// artigo diz "excessive workload":
{"label": "excessive workload", "canonical": "Carga de trabalho",
 "aliases": ["Carga de trabalho"], "polarity": "negative"}
```

## Saída

```json
{"items": [{"key": "<chave>", "factors": [
  {"label": "...", "canonical": "...", "aliases": [],
   "polarity": "positive", "description": "..."}]}]}
```

- `key` copiado exatamente de `chave` — nunca inventado ou alterado.
- Omita artigos sem nenhum fator evidenciado.
- Se `fatoresAtuais` já traz um fator, só o repita para corrigir polaridade ou
  descrição: o envio **sobrescreve** o que existe naquele fator.
- Vários artigos e vários grupos cabem no mesmo `items`.
- Responda apenas com o JSON, sem texto em volta.

Antes de entregar, liste em uma linha por artigo: chave, quantos fatores e se
conseguiu ler o PDF. O usuário precisa disso para saber se um retorno curto foi
"artigo sem fatores" ou "não consegui abrir o PDF".

## Conferir antes de aplicar

- Toda `key` existe no arquivo de entrada.
- Todo `label` é localizável no PDF.
- Todo fator que já existia no `catalogo` traz `aliases` preenchido — este é o
  erro que mais custa caro, porque fragmenta o catálogo silenciosamente.
- Nenhum `canonical` é frase longa ou nome de produto.
- Nenhum fator é o desfecho medido pelo artigo.

Depois de aplicar, vale abrir a aba Fatores e checar se surgiram entradas quase
duplicadas — sinal de que `aliases` faltou.
