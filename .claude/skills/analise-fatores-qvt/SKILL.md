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
2. Você lê o PDF, extrai os fatores e devolve o JSON do delta acompanhado de um
   resumo de leitura por artigo, fora do bloco JSON.
3. O usuário aplica em **Fatores → Aplicar delta em artigos**.

O arquivo exportado já contém um campo `prompt` com as regras. Ele existe para
funcionar em qualquer IA; esta skill é a versão completa, com o raciocínio por
trás das regras.

**Confira a versão do pacote antes de analisar.** Se `formatoResposta` não
tiver o campo `canonical`, o arquivo foi gerado por uma versão antiga do
servidor: o schema descarta `canonical` silenciosamente e o `label` verbatim
vira nome de fator no catálogo. Avise o usuário e peça que reexporte, em vez de
gerar um delta que suja o catálogo.

## Ler o material

Baixe o PDF de `artigos[].pdfUrl` — o link é assinado e abre sem login, mas
**expira** (veja `pdfExpiraEm`). Se não conseguir acessá-lo, **diga isso
explicitamente** em vez de analisar só pelo abstract: o abstract raramente
menciona os fatores, que aparecem em resultados e discussão. Um delta feito às
cegas parece bom e está errado.

## Triagem: o artigo entra na análise?

Antes de extrair qualquer fator, responda três perguntas — as mesmas dos três
botões de triagem do app:

1. **É da área de engenharia de software?** Venue, tema e método pertencem à
   computação/ES — não a HRI clínico, medicina ou educação que citam
   "software" de passagem. (botão "Não é eng. de software")
2. **Fala de desenvolvimento de software?** O objeto é o trabalho de construir
   software, não apenas o uso de tecnologia. (botão "Não é desenvolvimento")
3. **É de QVT?** Duas condições juntas: os sujeitos estudados são quem
   **produz** software (não usuários finais, pacientes ou outras profissões)
   **e** o bem-estar deles — ou algo que o afete — é objeto de análise:
   desfecho medido, tema das entrevistas ou alvo das conclusões. Estudos que
   só **descrevem comportamento** (quando ou onde os devs trabalham, padrões
   de commits, preferência de local) reprovam aqui: sem efeito sobre
   bem-estar evidenciado, não há polaridade a atribuir. Sinal claro: o
   próprio artigo dizendo "we do not directly assess productivity or
   well-being". (botão "Não é QVT")

Se **qualquer** resposta for não, **não gere o arquivo de delta** para esse
artigo: informe no resumo qual pergunta reprovou e por quê, em uma frase, para
o usuário marcar o botão correspondente no app em vez de receber um delta
vazio. Propostas de workshop, editoriais e calls for papers tipicamente
reprovam: não têm dados próprios nem sujeitos.

Um artigo pode passar na triagem e ainda assim não ter fator evidenciado — aí
vale a regra normal: omitir o artigo do delta e dizer que foi lido e não tinha
fatores.

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

Além do rótulo do catálogo, `aliases` pode trazer outros sinônimos do fator
encontrados no artigo, em inglês ou português (ex.: `Upskilling`, `Layoffs`):
todos viram grafias do fator e ajudam os próximos artigos a convergir. O nome
do catálogo (`canonical`) é **sempre em português**.

Não use vírgula nem ponto-e-vírgula dentro de `label`, `canonical` ou de um
item de `aliases`: o app divide a grafia nesses caracteres, e você acabaria
com duas grafias truncadas. Se o trecho exato do artigo contiver vírgula,
recorte um pedaço **contíguo e sem vírgula** que ainda seja localizável com
Ctrl+F — em vez de reescrever a frase, que quebraria a busca.

`polarity` é o efeito do fator (`positive` melhora o bem-estar, `negative`
piora), não a qualidade do artigo. `description` tem duas partes: seu resumo
da evidência em português (com seção e participantes) seguido da citação
**verbatim** do trecho, entre aspas e sem traduzir. Ex.: `Seção 4.2.1: prazos
minaram a confiança de entregar a tempo (P2) — “the pressure from task urgency
and deadlines could lead to feeling a lack of competence”.` Vírgula é
permitida aqui.

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
{
  "items": [
    {
      "key": "Wong2025",
      "groupId": 1783072880903,
      "factors": [
        {
          "label": "constant pressure to learn new skills",
          "canonical": "Pressão por atualização",
          "aliases": ["Upskilling"],
          "polarity": "negative",
          "description": "Seção 4.1.1: a pressão por atualização constante minou competência e pertencimento (P9) — “This ongoing pressure to learn new skills and tools challenged their relatedness”."
        }
      ]
    }
  ]
}
```

`groupId` é **número**, copiado de `grupoId` — sem aspas, ou o app rejeita o
arquivo. Em `aliases`, o rótulo do `catalogo` é **obrigatório** quando o fator
já existe; sinônimos do artigo são bem-vindos em qualquer caso. Fator novo sem
sinônimo leva lista vazia (`[]`).

- `key` copiado exatamente de `chave` — nunca inventado ou alterado.
- `groupId`: copie o `grupoId` do artigo. É opcional, mas quando a mesma chave
  existe em mais de um grupo o app **não adivinha** — ele pula o item e o marca
  como ambíguo. Copiar sempre evita esse buraco.
- Omita artigos sem nenhum fator evidenciado.
- Se `fatoresAtuais` já traz um fator, só o repita para corrigir polaridade ou
  descrição: o envio **sobrescreve** o que existe naquele fator.
- Vários artigos e vários grupos cabem no mesmo `items`.

O delta também aceita ajustes de catálogo, numa lista `factors` no topo do
arquivo, aplicada **antes** dos artigos:

```json
{
  "factors": [
    {"match": "job insecurity", "name": "Insegurança no emprego",
     "aliases": ["Layoffs"]}
  ],
  "items": []
}
```

`match` localiza o fator por qualquer grafia atual; `name` renomeia (o nome
antigo vira grafia); `aliases` soma grafias; `spellings` substitui o conjunto
inteiro de grafias — o que ficar de fora se perde. Use para corrigir catálogo
sem mexer nos artigos, p. ex. renomear um fator que entrou com o nome errado.

Entregue o JSON em um bloco próprio (ou arquivo), sem comentários dentro dele.
**Fora** do bloco, liste uma linha por artigo: chave, quantos fatores, se
conseguiu ler o PDF e o veredito da triagem (aprovado, ou qual das três
perguntas reprovou). O usuário precisa disso para distinguir "artigo sem
fatores", "não consegui abrir o PDF" e "fora do escopo".

**Falha parcial:** se só alguns PDFs abrirem, gere o delta apenas para os
artigos que você leu e liste os não analisados no resumo externo. Nunca inclua
um item vazio ou com fatores inventados para um artigo que não foi lido — o
delta sobrescreve, e um item malfeito apaga trabalho bom.

## Conferir antes de aplicar

Mecânico, antes de responder:

- Nenhum `label`, `canonical` ou `description` está vazio.
- Nenhum `label`, `canonical` ou item de `aliases` contém vírgula ou
  ponto-e-vírgula.
- Toda `description` traz o resumo em PT **e** a citação verbatim do texto
  original.
- Todo `polarity` é exatamente `positive` ou `negative`.
- Todo `groupId` é número, sem aspas.

De conteúdo:

- Toda `key` existe no arquivo de entrada.
- Todo `label` é localizável no PDF.
- Todo fator que já existia no `catalogo` traz `aliases` preenchido — este é o
  erro que mais custa caro, porque fragmenta o catálogo silenciosamente.
- Nenhum `canonical` é frase longa ou nome de produto.
- Nenhum fator é o desfecho medido pelo artigo.

Depois de aplicar, vale abrir a aba Fatores e checar se surgiram entradas quase
duplicadas — sinal de que `aliases` faltou.

## Manutenção

Estas regras existem em dois lugares: aqui e no `prompt` embutido em
`backend/src/routes/factors.ts` (rota `export-analise`), que viaja dentro de
cada pacote para funcionar em IAs sem skills.

**Ao alterar esta skill, atualize o `prompt` no mesmo commit.** Elas já
divergiram uma vez, e a divergência é silenciosa: o resultado muda conforme o
usuário trabalhe com skill ou com o pacote exportado, sem nenhum erro visível.
