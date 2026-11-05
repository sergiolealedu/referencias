---
name: analise-esc-fatores
description: Extrai do texto completo de artigos científicos como práticas de Engenharia de Software Contínua (CI, CD, DevOps, on-call, postmortem, feature toggles…) aumentam ou reduzem os fatores de QVT do catálogo, com mecanismo e citação verbatim, e gera o JSON de efeitos prática → fator da etapa 2. Use quando pedirem para analisar artigos dos grupos de ESC (versão v4, "ESC × QVT" ou "ESC — estudos empíricos"), para extrair efeitos de práticas de ESC/DevOps sobre fatores, ou para revisar um arquivo efeitos-esc-*.json. Para extrair fatores de QVT da etapa 1, use analise-fatores-qvt.
---

# Efeitos das práticas de ESC sobre os fatores de QVT

Etapa 2 do doutorado ([planejamento](../../../docs/planejamento-ecs-fatores.md),
tarefa 3). A etapa 1 levantou os **fatores** de QVT e a polaridade de cada um.
Esta skill extrai o **primeiro elo**: se uma prática de ESC aumenta ou reduz a
presença de um fator, por qual mecanismo e com que evidência.

```
prática de ESC ──(efeito + mecanismo)──▶ fator do catálogo ──(polaridade da etapa 1)──▶ bem-estar
```

Registre só o primeiro elo. "CI **reduz** *Interrupções no trabalho*" é o
registro; que isso faz bem vem da polaridade do fator, calculada depois (tarefa
4.2). Misturar os dois elos é o erro que esta etapa existe para evitar:
"a prática aumenta o fator" não é o mesmo que "a prática faz bem".

## Fluxo

1. O usuário exporta o pacote pelo botão **Análise** (um artigo) ou
   **Exportar para análise** (lote dos usados sem fatores). É o mesmo arquivo
   `analise-fatores-*.json` da etapa 1: `catalogo`, `artigos` (com `pdfUrl`
   assinado) e `formatoResposta`.
2. **Ignore o `prompt` e o `formatoResposta` do pacote.** Eles são da etapa 1 e
   pedem um delta de fatores, que não é o que se quer aqui. Use o pacote só
   pelo `catalogo` e pelos `artigos`.
3. O lote pode trazer artigos da etapa 1 junto. Analise só os dos grupos de ESC
   (`grupo` começando com "ESC") e liste os demais à parte, como fora do lote.
4. Leia o PDF de cada artigo, faça a triagem e extraia os efeitos.
5. Entregue o arquivo `efeitos-esc-*.json` e um resumo curto por artigo.

O app ainda não tem entidade de prática (decisão 0.4 do planejamento). O
arquivo de efeitos fica **fora do app** e é consolidado na matriz prática ×
fator na tarefa 4. **Não gere delta de fatores** para o app a partir destes
artigos.

## Ler o material: só o texto completo

**Sem PDF, o artigo sai da análise.** O elo prática → fator quase nunca está no
abstract: ele aparece nos resultados, nas falas dos participantes e na
discussão. O abstract serviu para a triagem da busca; a extração é sempre do
texto completo. Se o artigo vier sem `pdfUrl`, ou o link não abrir, não gere
nada para ele e liste-o à parte como "sem PDF", separado dos reprovados.

O `pdfUrl` é assinado e abre sem login, mas **expira** (`pdfExpiraEm`).

Leia o artigo inteiro antes de extrair. Os efeitos costumam estar em:

- citações de participantes ("since we moved to CI, …", "being on call
  means…");
- tabelas de desafios e benefícios de adoção (cada linha é um candidato);
- modelos estatísticos com a prática como variável (coeficiente e p-valor
  são a evidência);
- seções *Implications for practice* e *Discussion* — mas aí só conta o que os
  autores tiram **dos próprios dados** (ver evidência `inferida`).

**Recomendação não é evidência.** Seções de *takeaways*, *guidelines* e
*recommendations* costumam listar práticas de ESC ("hold blameless
postmortems", "balance on-call schedules"). Só contam quando o artigo mostra
que o elo prática → fator saiu dos seus dados. Não contam:

- a recomendação que o próprio texto apresenta como **além** da análise ("in
  addition to this analysis, we provide the following insights");
- a recomendação cujo elo prática → fator vem de **trabalho citado**, mesmo que
  o fator em si tenha sido medido pelo artigo. Ex.: o estudo mede *Cultura
  organizacional generativa* e mostra que ela reduz *burnout*, mas a frase
  "postmortems sem culpados geram cultura generativa" vem de Westrum (2004).
  O elo é de Westrum, e Westrum é que é candidato ao corpus.

## Triagem: o artigo entra?

As perguntas 1 e 2 são as da etapa 1. A pergunta 3 da etapa 1 ("é de QVT?")
**não** se aplica: um estudo de desafios de CI pode não medir bem-estar e ainda
assim mostrar que o *pipeline* quebrado gera *Interrupções no trabalho*, e o
fator já carrega a polaridade. No lugar dela entra a pergunta 4.

1. **É da área de engenharia de software?**
2. **Fala de desenvolvimento de software?** O objeto é o trabalho de construir
   e operar software.
3. *(não se aplica nesta etapa)*
4. **O artigo relaciona uma prática de ESC a algo que afeta quem produz
   software?** Precisa haver as duas pontas: uma prática do catálogo abaixo
   **e** um efeito sobre as pessoas (carga, ritmo, interrupção, horário,
   relações, cultura, emoções…). Reprova o artigo que só trata de desempenho
   técnico do *pipeline* (tempo de build, taxa de falha, cobertura) sem nenhuma
   consequência para quem trabalha. Também reprova o que só descreve a adoção
   ("70% usam CI") sem efeito.

Critérios de inclusão, iguais aos da etapa 1:

- **Veículo:** literatura branca entra; cinza de 1º nível (livro acadêmico,
  IEEE Software, relatório institucional) entra com aviso; blog, preprint sem
  revisão e similares reprovam.
- **Estudo secundário não entra** (revisão, mapeamento, survey de
  literatura). Mas liste no resumo os **primários** que ele resenha e que
  ligam prática de ESC a pessoas, com autor e ano: são candidatos ao
  *snowballing* (tarefa 2.5).
- **Protocolo ou plano de pesquisa:** elegível, mas sem achado próprio. Diga
  isso e não extraia nada.

Quem reprova não entra no arquivo. No resumo, diga em uma frase qual pergunta
ou critério reprovou. O app não tem botão para a pergunta 4: o usuário marca o
artigo como descartado, com motivo "sem elo ESC → pessoas". **Não sugira o
botão "Não é QVT"**, que tem outro significado e sujaria a triagem da etapa 1.

## Práticas

Use o nome **em português** da coluna "Prática". Nunca nome de produto: Jenkins,
GitHub Actions ou GitLab CI viram "Integração contínua" ou "Pipeline de CI/CD",
e PagerDuty vira "On-call".

| Grupo | Prática | Inclui |
|---|---|---|
| Núcleo técnico | Integração contínua | build e testes a cada *commit*, *merge* frequente |
| | Pipeline de CI/CD | o *pipeline* como artefato: manter, esperar, consertar |
| | Entrega contínua | sempre pronto para *release*, *deploy* sob demanda |
| | Implantação contínua | *deploy* automático em produção a cada mudança |
| | Releases frequentes | *rapid releases*, ciclos curtos de *release* |
| | Automação de testes | teste contínuo, suíte automatizada, *flaky tests* |
| | Desenvolvimento baseado em tronco | *trunk-based*, ramos de vida curta |
| | Feature toggles | *feature flags*, *dark launches* |
| | Infraestrutura como código | IaC, ambientes efêmeros e reproduzíveis |
| Operação | Responsabilidade de operação pelo time | DevOps no sentido "you build it, you run it" |
| | On-call | escalas de plantão, alertas fora de hora |
| | Gestão de incidentes | resposta a incidente, *runbooks*, *rollback* |
| | Postmortem sem culpados | *blameless postmortem*, revisão pós-incidente |
| | Monitoramento e observabilidade | métricas, *logs*, alertas, SLOs |
| | Site Reliability Engineering | SRE como papel ou prática, *error budgets*, *toil* |
| Negócio | Experimentação contínua | testes A/B, experimentos em produção |
| | Planejamento contínuo | *roadmap* e priorização revistos continuamente |
| Transversais | DevSecOps | segurança no *pipeline*, *shift-left* |
| | Engenharia de plataforma | plataforma interna, *golden paths*, autoatendimento |
| | Métricas de entrega | DORA, *lead time*, frequência de *deploy* usadas na gestão |
| | Times multifuncionais Dev–Ops | colaboração e fusão dos papéis Dev e Ops |
| Agregado | ESC/DevOps em geral | só quando o artigo não separa as práticas |

Use **ESC/DevOps em geral** só como último recurso. Se o participante diz
"since we adopted DevOps, I'm on call every other week", a prática é **On-call**,
não DevOps em geral.

**Prática nova:** se o artigo evidencia uma prática de ESC que não cabe na
tabela, proponha um nome curto em português e marque `"praticaNova": true`.
A tabela cresce por decisão do usuário, não por acúmulo.

## Fatores

O fator vem do `catalogo` do pacote: use o `label` **exatamente** como está
lá. Leia a `descricao` do fator antes de escolher; é ela que diz se "pressão
para entregar rápido" é *Pressão de prazos* ou *Carga de trabalho*.

**Fator emergente** (tarefa 3.3): se o artigo mostra a prática afetando algo
que **não está no catálogo** (p. ex. "Fadiga de alertas" em *on-call*,
"Ansiedade de implantação" em *release*), proponha um nome curto em português,
marque `"fatorEmergente": true` e dê uma `categoria` das seis do catálogo. Não
encaixe à força num fator que só parece: um fator emergente bem nomeado vale
mais que um elo errado na matriz.

**Desfecho não é fator.** *Burnout*, estresse, satisfação, bem-estar e
*turnover* são o que É AFETADO. Quando o artigo liga a prática **direto** ao
desfecho ("continuous deployment reduced deployment anxiety"), procure no texto
o fator que faz a ponte (frequência de *release* → *Pressão de prazos*). Se o
texto não mostrar nenhum fator intermediário, registre com `"fator": null` e o
desfecho em `"desfecho"`. Esse registro direto prática → bem-estar é raro e
valioso; não o descarte nem invente o fator do meio.

## Efeito, mecanismo e evidência

**`efeito`** — o que a prática faz com a **presença** do fator, nunca com o
bem-estar:

- `aumenta` — a prática faz o fator aparecer mais ou ficar mais forte;
- `reduz` — a prática faz o fator aparecer menos ou ficar mais fraco;
- `ambivalente` — o mesmo artigo mostra os dois sentidos para o mesmo par.
  Explique em `condicoes` o que decide o sentido.

Fator positivo também pode ser aumentado ou reduzido. "Entregas frequentes
tornam o trabalho visível" é `aumenta` *Reconhecimento no trabalho*.

Não registre "sem efeito" como item. Se o artigo testou e não achou efeito,
diga isso no resumo: é dado para as lacunas (tarefa 4.4), não um elo.

**`mecanismo`** — uma frase em português dizendo **como** a prática mexe no
fator, segundo o artigo. Ex.: "*pipeline* quebrado por outro time interrompe o
trabalho até alguém consertar". É o campo que a tarefa 5.5 agrupa em temas
(*feedback*, previsibilidade, interrupção, autonomia, visibilidade…). Escreva o
mecanismo **do artigo**, não o que você acha plausível.

**`condicoes`** — de que o efeito depende, segundo o artigo: contexto
(tamanho do projeto, maturidade da automação, cultura) **e modo de adoção**
(escala de *on-call* dividida, suíte de testes estável, *postmortem*
conduzido sem culpados). Vazio (`""`) se o artigo não diz.

O modo de adoção é o centro da pergunta desta etapa: como usar a prática para
atenuar o fator negativo ou reforçar o positivo. Registre o efeito **da
prática** e ponha o modo em `condicoes`. "*On-call* aumenta *Conflito
trabalho-família*, menos quando a escala é dividida" é um registro de
*On-call* com `efeito: aumenta` e a escala dividida em `condicoes`. Se o
artigo compara dois modos com efeitos opostos, use `ambivalente` e descreva
os dois em `condicoes`.

**`evidencia`** — a força do elo:

| Valor | Quando |
|---|---|
| `empírica direta` | Os dados do próprio estudo ligam a prática ao fator: participante relatando a relação, modelo estatístico com a prática como preditor do fator, comparação antes/depois |
| `empírica indireta` | Os dados mostram prática e fator juntos, mas a ligação é dos autores ao interpretar: co-ocorrência na mesma categoria, correlação sem modelo causal, percepção sobre terceiros |
| `inferida` | Conclusão dos autores na discussão, apoiada nos próprios achados mas sem dado que ligue diretamente a prática ao fator |

Citação de **outro** trabalho no referencial teórico ou na discussão não é
evidência deste artigo: ignore. Se o elo só aparece assim, o artigo citado é
candidato ao corpus.

**`trecho`** — referência (seção, participante, tabela) seguida da citação
**verbatim** em inglês, entre aspas curvas, sem tradução nem resumo. Ex.:
`Seção 5.2 (P7): “when the build is red nobody can merge, so you drop
whatever you were doing”.` Mais de um trecho pode ir no mesmo campo, separados
por ponto-e-vírgula.

**`termoPratica`** — o termo verbatim que o artigo usa para a prática
("CI pipeline", "on-call rotation"), para achar no PDF com Ctrl+F.

## Saída

```json
{
  "versao": 1,
  "geradoEm": "2026-11-05",
  "items": [
    {
      "key": "Benlian20252253",
      "groupId": 1783072880903,
      "efeitos": [
        {
          "pratica": "Entrega contínua",
          "termoPratica": "continuous delivery pipeline",
          "fator": null,
          "desfecho": "estresse e sensação de fracasso",
          "efeito": "aumenta",
          "mecanismo": "em projeto grande, o pipeline de entrega contínua interliga o trabalho de muitos, e um atraso pequeno de um desenvolvedor se propaga e é vivido como falha em escala maior",
          "condicoes": "projetos ágeis de larga escala, com muitas interdependências; em projeto pequeno o participante I30 não relata o efeito",
          "evidencia": "empírica direta",
          "trecho": "Supplementary Qualitative Insights (I15): “it creates extra stress because even minor delays have ripple effects on our continuous delivery pipeline and feel like a failure on a much larger scale”."
        }
      ]
    }
  ]
}
```

Campos opcionais por efeito: `"praticaNova": true`; `"fatorEmergente": true`
com `"categoria"`; `"fator": null` com `"desfecho"`.

- `key` e `groupId` copiados de `chave` e `grupoId` do pacote. `groupId` é
  número, sem aspas.
- Um item por artigo aprovado e com pelo menos um efeito. Artigo aprovado sem
  efeito evidenciado fica fora do arquivo e vai para o resumo.
- Um efeito por par prática × fator **por artigo**. Se o artigo traz o mesmo
  par em várias seções, junte os trechos num registro só. Contar duas vezes
  infla a célula da matriz.
- Acima de ~6 efeitos por artigo, desconfie: costuma ser o mesmo mecanismo
  repetido em fatores vizinhos. Melhor pouco e correto.

**Entregue como arquivo**, UTF-8 sem BOM e sem comentários, para as aspas
curvas sobreviverem:

- um artigo: `efeitos-esc-<chave>.json`
- lote: `efeitos-esc-lote-<AAAAMMDD>.json`

**Fora** do arquivo, uma linha por artigo: chave, quantos efeitos, se leu o
PDF e o veredito (aprovado, ou qual pergunta ou critério reprovou). Depois,
separados, os artigos sem PDF, os fora do lote (grupo da etapa 1) e os
primários sugeridos pelos secundários. Seja curto: não repita a tabela de
efeitos no chat.

## Calibração (piloto de 2026-11-05)

Três artigos do corpus da etapa 1 que mencionam práticas de ESC no texto
completo:

| Artigo | Veredito | Por quê |
|---|---|---|
| Benlian et al. 2025 | 1 efeito | Fala de participante (I15) liga o *pipeline* de entrega contínua ao estresse, condicionado à escala do projeto (o exemplo da Saída). A menção do I4 a "continuous delivery" é só exemplo de prática ágil e não gera efeito |
| Cerqueira et al. 2024 | 0 | *On-call* equilibrado e *postmortem* honesto aparecem em "Takeaways for practitioners", apresentados como "in addition to this analysis" |
| Trinkenreich et al. 2023 | 0 | Mede a cultura generativa → *burnout*, mas a ligação *postmortem* → cultura vem de Westrum (2004), citado. Westrum e o relatório DORA são candidatos ao corpus |

Esperado: o corpus da etapa 1 quase não evidencia o elo, e é por isso que a
etapa tem busca própria. Num artigo da busca de ESC, o mesmo rigor vale.

## Conferir antes de entregar

Mecânico:

- Toda `pratica` está na tabela, ou tem `praticaNova: true`.
- Todo `fator` é um `label` do `catalogo` (comparação exata), ou tem
  `fatorEmergente: true` com `categoria`, ou é `null` com `desfecho`.
- `efeito` é exatamente `aumenta`, `reduz` ou `ambivalente`; `evidencia` é
  exatamente um dos três valores.
- Nenhum `mecanismo` ou `trecho` vazio; todo `trecho` tem citação entre aspas
  curvas.
- Todo `groupId` é número.

De conteúdo:

- Nenhum par prática × fator repetido no mesmo artigo.
- O `efeito` descreve o fator, não o bem-estar. Releia cada registro como
  "a prática **aumenta/reduz** [fator]" e veja se a frase é o que o trecho diz.
- Nenhum `fator` é desfecho (*burnout*, estresse, satisfação).
- Nenhuma prática é nome de produto.
- Todo `trecho` é dos dados ou da análise do próprio artigo, não de trabalho
  citado.
- Todo `termoPratica` e o trecho entre aspas são localizáveis no PDF.
