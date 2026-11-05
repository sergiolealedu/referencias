# Busca da etapa 2 — Engenharia de Software Contínua × fatores de QVT

Protocolo das tarefas 2.1 e 2.2 do [planejamento](planejamento-ecs-fatores.md).
Strings calibradas no Scopus (proxy CAPES) em 2026-11-05.

**Pergunta:** como as práticas de ESC podem reduzir os fatores negativos de QVT,
ou reforçar os positivos?

## 2.1 O que o corpus atual já tem

Varredura do texto completo dos 65 PDFs do catálogo congelado
(`server-20260924-162133`) atrás de termos de ESC (CI, CD, DevOps, *on-call*,
SRE, *pipeline*, *postmortem*, *feature toggle*…):

- 37 artigos não mencionam nenhuma prática;
- 22 mencionam só de passagem: referência bibliográfica, cargo do participante
  ("DevOps Engineer"), "Azure DevOps" como ferramenta;
- 6 tocam no elo prática → fator, sempre como evidência secundária:

| Artigo | Prática → fator |
|---|---|
| Trinkenreich et al. (2023) | *Postmortem* sem culpados e times multifuncionais → cultura generativa (Westrum/DORA) → menos *burnout* |
| Trinkenreich et al. (2025) | *Postmortem* sem culpados → segurança psicológica e pertencimento |
| Cerqueira et al. (2024) | Escalas de *on-call* equilibradas e *postmortem* honesto → menos culpa e *burnout* |
| Jafarzadeh et al. (2025) | Ciclos de entrega contínua → intensidade alta e sem pausa |
| Kumar et al. (2025) | "Automatizar tudo para a entrega contínua" → tempo para o trabalho valorizado |
| Benlian et al. (2025) | Atraso no *pipeline* de CD → estresse e sensação de fracasso |

Conclusão: o corpus da etapa 1 não cobre o elo, e a busca nova é necessária.

## 2.2 Strings

Duas buscas com o mesmo bloco de práticas (A) e de pessoas (C):

- **Busca 1 — ESC × QVT (precisa):** A AND B AND C. O bloco B tem os termos de
  bem-estar **e os dos fatores** (carga, pressão de prazo, interrupção, carga
  cognitiva, *toil*, horas de trabalho, segurança psicológica…), porque quase
  nenhum artigo de ESC fala em *well-being* no resumo.
- **Busca 2 — estudos empíricos de ESC com pessoas (abrangente):** A AND H AND E
  AND C. Pega os estudos de adoção e desafios de CI/CD/DevOps (entrevista,
  survey, estudo de caso) cujo resumo fala em "desafios sociais" ou "benefícios"
  sem usar vocabulário de bem-estar, mas cujos resultados trazem o elo (p. ex.
  Claps et al. 2015, Shahin et al. 2017, Riungu-Kalliosaari et al. 2016). A
  pergunta 4 da triagem (2.4) é que separa o que serve.

### Bloco A — práticas de ESC

```
( "continuous integration" OR "continuous delivery" OR "continuous deployment"
  OR "continuous software engineering" OR "continuous experimentation"
  OR "continuous testing" OR "rapid release*" OR "release engineering" OR "CI/CD"
  OR "deployment pipeline*" OR devops OR devsecops OR "site reliability engineering"
  OR "on-call" OR "incident response" OR "incident management" OR postmortem*
  OR "post-mortem*" OR "trunk-based" OR "feature toggle*" OR "feature flag*"
  OR "infrastructure as code" OR "platform engineering" )
```

### Bloco B — QVT e fatores (busca 1)

```
( wellbeing OR well-being OR "well being" OR burnout OR "burn out" OR "mental health"
  OR "quality of work life" OR "quality of working life" OR happiness OR morale
  OR "job satisfaction" OR "work satisfaction"
  OR (satisfaction W/3 (developer* OR engineer OR engineers))
  OR (stress W/3 (developer* OR engineer OR engineers OR work OR job OR occupational OR psychological))
  OR stressful OR anxiety OR "deployment pain" OR fatigue OR exhaustion OR "work-life"
  OR "working hours" OR "work hours" OR "work-family" OR overtime OR "work overload"
  OR (workload W/3 (developer* OR engineer OR engineers OR team* OR human OR mental OR cognitive))
  OR "cognitive load" OR "time pressure" OR "deadline pressure" OR "schedule pressure"
  OR (interrupt* W/3 (developer* OR engineer OR engineers OR work)) OR toil
  OR "psychological safety" OR blameless OR "developer experience" OR peopleware
  OR "human factors" OR "human aspects" OR "job demands" OR turnover
  OR "intention to leave" OR (motivation W/3 (developer* OR engineer OR engineers))
  OR emotion* OR sentiment* )
```

### Blocos H e E — efeito humano e método empírico (busca 2)

```
( challenge* OR benefit* OR impact* OR experience* OR perception* OR perceive*
  OR "human factor*" OR "human aspect*" OR social OR "socio-technical"
  OR sociotechnical OR culture OR adoption )
AND
( interview* OR survey* OR "case study" OR "case studies" OR "grounded theory"
  OR qualitative OR "mixed-method*" OR "multi-method" OR ethnograph* OR "focus group*" )
```

### Bloco C — pessoas que produzem software

```
( "software engineer" OR "software engineers" OR "software develop*" OR developer*
  OR programmer* OR "software professional*" OR "software practitioner*"
  OR "software team*" OR "software organi*" OR "software compan*" OR "software industry"
  OR "IT professional*" OR "site reliability engineer*" OR SREs OR "DevOps engineer*"
  OR "operations engineer*" OR "DevOps team*" OR practitioner* OR "CI users" )
```

### Montagem e filtros

```
busca 1:  TITLE-ABS-KEY( A AND B AND C ) <filtros>
busca 2:  TITLE-ABS-KEY( A AND H AND E AND C ) <filtros>

<filtros> = AND (DOCTYPE(ar) OR DOCTYPE(cp) OR DOCTYPE(re) OR DOCTYPE(ch))
            AND (LANGUAGE(english) OR LANGUAGE(portuguese))
            AND NOT (SUBJAREA(MEDI) OR SUBJAREA(NURS))
```

O `AND NOT` tem que ser o último operador: o Scopus o avalia por último, e
qualquer termo depois dele entra na exclusão.

## Calibração

| Versão | Busca 1 | Busca 1 ∪ 2 | Sementes (de 12) | Observação |
|---|--:|--:|--:|---|
| v1 (rascunho) | 275 | — | — | 86 de Medicina: *on-call* de médicos, "general practitioners" |
| v2 (C restrito) | 157 | — | 1 | Perde o estudo de *toil* |
| v2 + `engineer*` | 405 | — | — | `engineer*` casa *engineering*: mecânica de rochas, catálise |
| v3 | 147 | 780 | 8 | Filtros corretos |
| **v4 (final)** | **187** | **977** | **8** | `practitioner*` e "CI users" de volta, com Medicina excluída |

**Sementes** (todas indexadas no Scopus): Claps et al. 2015; Leppänen et al.
2015; Riungu-Kalliosaari et al. 2016; Hilton et al. 2016 e 2017; Shahin et al.
2017; Laukkanen et al. 2017; Fagerholm et al. 2017; Parry et al. 2022; Greiler
et al. 2022; Trinkenreich et al. 2023; Kafoe et al. 2026 (*toil*).

As 4 que ficam fora (Hilton 2017, Fagerholm, Greiler, Trinkenreich 2023) não
citam nenhuma prática de ESC no título, resumo ou palavras-chave. Nenhuma string
razoável as alcança; entram por *snowballing* (2.5). Trinkenreich 2023 já está
no corpus.

**Precisão observada na busca 1:** cerca de 30 de 188 títulos claramente
relevantes (~15%). O ruído que sobra é de artigos de ferramenta de CI/CD que
citam "developer experience", de cibersegurança ("incident response") e de
livros técnicos.

## Exportação (2026-11-05)

BibTeX com *Citation information* e *Abstract & keywords*, mais Publisher e
Editor(s). Para os grupos não se sobreporem, a busca 2 foi exportada **sem** o
que cai na busca 1 (`AND NOT ( … OR TITLE-ABS-KEY( A AND B AND C ) )`):

| Grupo no app | Arquivo | Registros |
|---|---|--:|
| ESC × QVT (busca 1) | `1-ESC-x-QVT.bib` | 187 |
| ESC — estudos empíricos (busca 2 − busca 1) | `2-ESC-estudos-empiricos.bib` | 790 |

Todos os registros têm abstract.

- **Export incompleto.** O primeiro export da busca 2 veio com 762 dos 790
  registros, sem nenhum aviso do Scopus. Os 28 que faltavam foram achados pela
  comparação de EIDs (lista de resultados particionada por ano, menos de 200
  por página), exportados por `EID(…)` e anexados ao arquivo. **Conferir
  sempre** o número de `@` do `.bib` contra o total da busca.
- **Chaves repetidas.** O arquivo repete chaves de registros diferentes
  (`Chen2022`, `Kumar2024`, `Agrawal2016291`…). Por isso cada grupo é importado
  de um arquivo só: dentro de uma mesma importação, o app sufixa as colisões
  (`a`, `b`…); numa segunda importação, descartaria a chave como "já existe".
- **Versão `v4`.** Os grupos ficam como versão `v4` (etapa 2), separados de
  `v2` (etapa 1) e `v3` (revisões). A detecção de duplicatas do app compara só
  dentro da mesma versão, então o cruzamento com a etapa 1 foi feito por fora,
  por DOI e título: **5** registros da busca 1 já estão no banco da etapa 1
  (Claes et al. 2017 "Abnormal Working Hours", lá marcado *não elegível* para a
  pergunta da etapa 1; Tamburri et al. 2026; Muhammad et al. 2021; Ullmann et
  al. 2022; Upeksha et al. 2025, com fatores). A busca 2 não tem nenhum.

## Próximo passo: a ligação prática → fator sai do texto completo

A busca e a triagem só selecionam candidatos. A ligação entre prática e fator
é extraída do **texto completo** de cada artigo aprovado, com localização e
citação literal, no formato da tarefa 3.1 do planejamento. Por isso o fluxo é:
triagem pelo abstract com a pergunta 4 (2.4) → PDF dos aprovados (2.6) →
extração com a skill `analise-esc-fatores` (3.2), testada antes num piloto de
3 a 5 artigos (3.4).

**Relevantes já vistos na busca 1** (para conferir na triagem): Kafoe et al.
2026 (*toil*); "Coping with Technostress in DevOps Teams" (2026); Tamburri et
al. 2026 (fadiga e empatia); "The Emotional Cost of Technical Debt" (2026);
"Socio-technical Friction: DevSecOps Challenges" (2026); Riedl et al. 2025
(ágil, estresse e satisfação); "A Taxonomy on Human Factors that Affect DevOps
Adoption" (2024) e "A theory on human factors in DevOps adoption" (2025); "The
Hidden Costs of Automation: GitHub Actions" (2024); Parry et al. 2022 (*flaky
tests*); "Orchestrating automation and sharing in DevOps teams: job satisfaction
factors" (2020); "Job satisfaction factors and risks perception: DevOps and
Agile Teams" (2018); "Abnormal Working Hours: Effect of Rapid Releases" (2017);
"Inadequate testing, time pressure, and (over)confidence: CI users" (2017);
"Sentiment Analysis of Travis CI Builds" (2017); "Exploring peopleware in
continuous delivery" (2016); "Perceived Benefits of Adopting Continuous Delivery
Practices" (2016); "Build Waiting Time in Continuous Integration" (2015);
"Shorter feedback loops by means of continuous deployment" (2015).
