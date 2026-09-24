# Planejamento — Efeito da Engenharia de Software Contínua sobre os fatores de QVT

A primeira etapa levantou, a partir do corpus, os **fatores** que afetam a
qualidade de vida no trabalho (QVT) de quem produz software, cada um com
polaridade, evidência verbatim e categoria temática (Individual, Tarefa e carga
de trabalho, Técnico e ferramentas, Equipe e relações, Processo de
desenvolvimento, Organizacional).

Esta etapa parte do outro lado: dado o catálogo de fatores, **como a adoção de
práticas de Engenharia de Software Contínua (ESC) melhora ou piora cada
fator?** O resultado esperado é uma matriz **prática × fator**. Cada célula diz
o sentido do efeito, o mecanismo e a evidência que o sustenta.

```
prática de ESC ──(mecanismo)──▶ fator de QVT ──(polaridade já levantada)──▶ bem-estar
```

A polaridade de um fator em relação ao bem-estar já vem da etapa 1. O que esta
etapa acrescenta é o **primeiro elo**: se a prática aumenta ou reduz a presença
do fator. Um exemplo: "pipeline de CI" **reduz** "Retrabalho por falhas de
integração", um fator negativo, e o efeito líquido é positivo. Registrar os dois
elos em separado evita confundir "a prática aumenta o fator" com "a prática faz
bem".

---

## 0. Decisões a tomar antes de começar

- [ ] **0.1 Definir o recorte de ESC.** Seguir a taxonomia de Fitzgerald & Stol
  (2017, *Continuous software engineering: A roadmap and agenda*) como base e
  decidir o que entra:
  - [ ] Núcleo técnico: integração contínua, entrega contínua, implantação
    contínua, teste contínuo
  - [ ] Operação: DevOps, monitoramento/observabilidade, *on-call*, SRE
  - [ ] Negócio: planejamento contínuo, BizDev, experimentação contínua
    (A/B, *feature toggles*)
  - [ ] Transversais: DevSecOps/segurança contínua, *compliance* contínuo,
    melhoria contínua, *trunk-based development*
- [ ] **0.2 Definir a unidade de análise.** Decidir se a unidade é a prática
  individual (CI, CD…) ou o "pacote ESC". Recomendação: prática individual,
  com uma linha agregada "ESC/DevOps em geral" para os artigos que não
  separam as práticas.
- [ ] **0.3 Definir a escala de efeito.** Recomendação:
  `aumenta` / `reduz` / `ambivalente` / `sem efeito evidenciado`, mais a força
  da evidência (`empírica direta`, `empírica indireta`, `inferida`).
- [ ] **0.4 Definir onde os dados vão morar.** Uma planilha/JSON fora do app
  (mais rápido) ou uma extensão do app com entidade "prática" e "efeito"
  (reaproveita a importação, a triagem e o delta). Ver a tarefa 6.

## 1. Consolidar a base de fatores (entrada desta etapa)

- [x] **1.1 Exportar o catálogo atual.** Extraído do backup do servidor
  `server-20260924-162133` (em `G:\Meu Drive\doutorado\app\backup`):
  **64 fatores** em **65 artigos**, com 234 ocorrências, distribuídos por 4
  grupos. A tabela está logo abaixo.
- [x] **1.2 Congelar uma versão do catálogo.** A base desta etapa é o backup
  `server-20260924-162133`: banco e 914 PDFs, depois da limpeza da auditoria.
  O arquivo `CONGELADO.md`, na própria pasta, tem o SHA-256 de cada arquivo
  de dados e um hash agregado dos PDFs, o que permite provar que a base não
  mudou. O estado de antes da limpeza ficou em `server-20260924-121030`.
  Fator que entrar no catálogo depois dessa data entra na matriz só por
  decisão explícita (ver 3.3).
- [ ] **1.3 Limpar pendências do catálogo.**
  - [x] Aplicar as correções da
    [auditoria de 2026-09-24](auditoria-fatores-2026-09-24.md):
    - saíram os fatores de 14 artigos inelegíveis (10 estudos secundários e 4
      descartados);
    - foi corrigida a citação do Ralph e reescritas 24 descrições;
    - *Dívida social* e *Divergências na revisão de código*, que ficaram sem
      nenhum artigo, foram apagados do catálogo
  - [ ] Listar os primários citados pelos 10 secundários removidos: são
    candidatos ao corpus
  - [ ] Preencher a `descricao` de 3 fatores: *Comunicação de más notícias*,
    *Contatos sociais fora do trabalho* e *Estruturação do processo de
    trabalho*
  - [ ] Revisar pares que podem ser um construto só: *Adoção de métodos ágeis*
    × *Alinhamento das práticas ágeis*; *Conflito de papéis* × *Ambiguidade
    de papel*; *Estigma da neurodivergência* × *Divulgação da
    neurodivergência*
  - [ ] Conferir se *Interação com clientes* (8 artigos, todos negativos)
    está bem nomeado: o fator parece ser a *pressão* ou o *conflito* com o
    cliente, não a interação em si
- [ ] **1.4 Priorizar os fatores pelo alcance da ESC.** Uma proposta inicial
  está na coluna "Alcance ESC" da tabela abaixo, como hipótese a revisar:
  - **Alto:** há um mecanismo direto e conhecido pelo qual alguma prática de
    ESC mexe no fator
  - **Médio:** o efeito é indireto ou depende de como a prática é adotada
  - **Baixo:** fora do alcance de práticas de processo. O fator sai da matriz,
    com o motivo registrado em vez de omitido
- [x] **1.5 Tabela de polaridade base.** Está nas colunas `+`/`−` da tabela
  (nº de ocorrências positivas e negativas no corpus).

### Catálogo congelado (backup `server-20260924-162133`)

Colunas: **Art.** = nº de artigos · **+/−** = ocorrências positivas/negativas ·
**Alcance ESC** = hipótese da tarefa 1.4, com a prática e o mecanismo
candidatos.

#### Tarefa e carga de trabalho

| Fator | Art. | +/− | Alcance ESC | Hipótese de mecanismo |
|---|--:|:-:|:-:|---|
| Carga de trabalho | 10 | 0/10 | Alto | Automação reduz trabalho manual; "you build it, you run it" soma operação |
| Pressão de prazos | 11 | 0/11 | Alto | Lotes pequenos tiram o *release big-bang*; entrega contínua cria ritmo sem pausa |
| Flexibilidade de horário | 12 | 12/0 | Médio | Escalas de *on-call* restringem; implantação sem janela noturna libera |
| Conflito trabalho-família | 8 | 0/8 | Alto | *On-call* e incidentes fora de hora; *deploy* em horário comercial |
| Interrupções no trabalho | 9 | 0/9 | Alto | Alertas, *pipeline* quebrado e incidentes interrompem; *feedback* rápido evita retrabalho tardio |
| Desenho do trabalho | 4 | 0/4 | Alto | DevOps amplia o escopo do papel (código + operação) |
| Pressão por atualização | 6 | 1/5 | Alto | *Toolchain* de CI/CD, nuvem e IaC muda rápido |
| Senso de realização | 4 | 3/1 | Alto | Ver o código em produção em horas, não em meses |
| Ambiguidade de papel | 4 | 0/4 | Alto | Fronteira Dev/Ops/SRE mal definida |
| Conflito de papéis | 1 | 0/1 | Alto | Dev (mudar rápido) × Ops (estabilidade) |
| Carga cognitiva | 2 | 0/2 | Alto | *Toolchain* extensa aumenta; automação e plataforma interna reduzem |

#### Técnico e ferramentas

| Fator | Art. | +/− | Alcance ESC | Hipótese de mecanismo |
|---|--:|:-:|:-:|---|
| Suporte e treinamento de TI | 4 | 4/0 | Médio | Times de plataforma e *golden paths* |
| Ferramentas de IA para codificação | 5 | 4/1 | Baixo | Independe da ESC (só na integração com o *pipeline*) |
| Manutenção do ambiente de desenvolvimento | 5 | 0/5 | Alto | IaC e ambientes efêmeros reduzem; manter o *pipeline* vira trabalho novo |
| Documentação interna | 5 | 4/1 | Médio | *Pipeline as code* documenta o processo; ritmo alto desatualiza docs |
| Dívida técnica | 2 | 0/2 | Alto | Testes automatizados e *gates* seguram; pressão por velocidade acumula |
| Imposição de ferramentas | 3 | 0/3 | Alto | Padronização da *toolchain* de CI/CD |
| Complexidade do código | 2 | 0/2 | Médio | Microsserviços e *feature toggles* aumentam a complexidade acidental |
| Ergonomia visual | 1 | 1/0 | Baixo | — |
| Qualidade dos requisitos | 1 | 1/0 | Médio | Experimentação contínua valida hipóteses no lugar de especificar |

#### Processo de desenvolvimento

| Fator | Art. | +/− | Alcance ESC | Hipótese de mecanismo |
|---|--:|:-:|:-:|---|
| Interação com clientes | 8 | 0/8 | Médio | *Feedback* contínuo muda a frequência e o tom da interação |
| Adoção de métodos ágeis | 1 | 0/1 | Alto | A ESC estende o ágil até a operação |
| Alinhamento das práticas ágeis | 1 | 1/0 | Alto | Idem |
| Gamificação no trabalho | 1 | 0/1 | Baixo | — |
| Estruturação do processo de trabalho | 1 | 1/0 | Alto | O *pipeline* explicita e padroniza o fluxo |

#### Equipe e relações

| Fator | Art. | +/− | Alcance ESC | Hipótese de mecanismo |
|---|--:|:-:|:-:|---|
| Relações no trabalho | 25 | 23/2 | Médio | Colaboração Dev–Ops; atrito quando o *pipeline* quebra por causa de outro |
| Segurança psicológica | 9 | 8/1 | Médio | *Postmortem* sem culpados; *deploy* visível expõe o erro individual |
| Empatia no trabalho | 4 | 4/0 | Baixo | — |
| Mentoria | 3 | 3/0 | Baixo | — |
| Integração de novatos | 3 | 3/0 | Médio | Ambiente reproduzível e "primeiro *deploy* no primeiro dia" |
| Competição no trabalho | 2 | 0/2 | Baixo | — |
| Diversidade de competências | 2 | 2/0 | Médio | Times multifuncionais exigidos pelo DevOps |
| Fadiga por empatia | 1 | 0/1 | Baixo | — |
| Instabilidade da equipe | 1 | 0/1 | Baixo | — |
| Comunicação de más notícias | 1 | 0/1 | Baixo | — |

#### Organizacional

| Fator | Art. | +/− | Alcance ESC | Hipótese de mecanismo |
|---|--:|:-:|:-:|---|
| Apoio do gestor | 12 | 11/1 | Baixo | — |
| Insegurança no emprego | 6 | 1/5 | Baixo | (Automação substituindo papéis de Ops, a checar) |
| Reconhecimento no trabalho | 4 | 4/0 | Médio | Entregas frequentes tornam o trabalho visível |
| Inclusão e representatividade | 5 | 5/0 | Baixo | — |
| Monitoramento no trabalho | 4 | 2/2 | Médio | Métricas DORA e de *pipeline* usadas para vigiar pessoas |
| Cultura autoritária | 4 | 0/4 | Baixo | — |
| Senso de propósito | 3 | 3/0 | Baixo | — |
| Iniciativas superficiais de bem-estar | 3 | 0/3 | Baixo | — |
| Justiça organizacional | 2 | 0/2 | Baixo | — |
| Silêncio organizacional | 1 | 0/1 | Baixo | — |
| Conformidade e sigilo de dados | 1 | 0/1 | Médio | *Compliance* contínuo e DevSecOps automatizam controles |
| Oportunidades de carreira | 1 | 1/0 | Baixo | — |
| Preparação organizacional para crises | 1 | 1/0 | Médio | *Runbooks*, *rollback* automático, gestão de incidentes |
| Treinamento de soft skills | 1 | 1/0 | Baixo | — |
| Cultura organizacional generativa | 1 | 1/0 | Alto | É a variável central do modelo DORA/*Accelerate* (Westrum) |
| Clima de aprendizagem | 1 | 1/0 | Médio | Cultura de experimentação e aprendizado com falhas |
| Estigma do uso de substâncias | 1 | 0/1 | Baixo | — |
| Política antidrogas | 1 | 0/1 | Baixo | — |
| Estigma da neurodivergência | 1 | 0/1 | Baixo | — |
| Acomodações para neurodivergência | 1 | 1/0 | Baixo | — |

#### Individual

| Fator | Art. | +/− | Alcance ESC | Hipótese de mecanismo |
|---|--:|:-:|:-:|---|
| Alinhamento do uso do tempo | 5 | 4/1 | Médio | Menos *toil* manual libera tempo para o trabalho que a pessoa valoriza |
| Práticas de mindfulness | 4 | 4/0 | Baixo | — |
| Qualidade do sono | 3 | 3/0 | Médio | *On-call* noturno e alertas de madrugada |
| Coping focado no problema | 1 | 1/0 | Baixo | — |
| Coping focado na emoção | 1 | 0/1 | Baixo | — |
| Fenômeno do impostor | 1 | 0/1 | Baixo | — |
| Uso de substâncias psicoativas | 1 | 1/0 | Baixo | — |
| Divulgação da neurodivergência | 1 | 1/0 | Baixo | — |
| Contatos sociais fora do trabalho | 1 | 1/0 | Baixo | — |

**Resumo da triagem proposta:** 17 fatores de alcance **alto**, 17
**médio** e 30 **baixo**. A matriz começa pelos 34 de alcance alto ou médio.
Os de alcance alto concentram-se em *Tarefa e carga de trabalho* e *Técnico e
ferramentas*, o que já antecipa a hipótese da tarefa 5.4.

## 2. Levantar a evidência sobre ESC × bem-estar

- [ ] **2.1 Reaproveitar o corpus atual.** Filtrar os artigos que já citam
  práticas de ESC (busca por *continuous integration*, *DevOps*, *deployment*,
  *on-call*, *pipeline*, *release*…) e reler só as seções de resultados à
  procura do elo prática → fator.
- [ ] **2.2 Montar a string de busca nova.** Combinar (ESC) AND (bem-estar/QVT)
  AND (desenvolvedores):
  - [ ] Termos de ESC: `"continuous integration" OR "continuous delivery" OR
    "continuous deployment" OR DevOps OR "continuous software engineering" OR
    "on-call" OR SRE OR "trunk-based" OR "feature toggle*"`
  - [ ] Termos de QVT: reutilizar os da etapa 1 (`well-being`, `stress`,
    `burnout`, `satisfaction`, `workload`, `developer experience`…)
  - [ ] Rodar no Scopus pelo CAPES e exportar em BibTeX com abstract
- [ ] **2.3 Importar em um grupo próprio no app** (p. ex. "ESC × QVT") e
  rodar a detecção de duplicatas contra o corpus da etapa 1.
- [ ] **2.4 Triagem.** Mesmas três perguntas e mesmos critérios de veículo e de
  estudo secundário da etapa 1, mais uma quarta: **o artigo relaciona uma
  prática de ESC a algo que afeta quem produz software?**
- [ ] **2.5 Snowballing** a partir dos secundários sobre DevOps e fatores
  humanos (listar os primários, como na skill de fatores).
- [ ] **2.6 Buscar os PDFs** dos aprovados (mesmo fluxo: sem PDF, fora da
  análise).

## 3. Extrair os efeitos prática → fator

- [ ] **3.1 Definir o formato de extração.** Um registro por par encontrado:
  ```jsonc
  {
    "key": "Chave2024",
    "practice": "Integração contínua",
    "factor": "Retrabalho",          // nome do catálogo congelado (1.2)
    "effect": "reduz",               // aumenta | reduz | ambivalente
    "mechanism": "feedback rápido evita conflitos de merge tardios",
    "conditions": "equipes com suíte de testes estável",
    "evidence": "empírica direta",
    "description": "Seção 5 (P3): “…citação verbatim…”"
  }
  ```
- [ ] **3.2 Adaptar a skill.** Criar a skill `analise-esc-fatores` a partir de
  `analise-fatores-qvt`, com as regras novas: nada de prática com nome de
  produto (Jenkins → "Pipeline de CI"), não confundir desfecho com fator, e
  exigir citação verbatim.
- [ ] **3.3 Tratar fator novo.** Quando o artigo evidenciar um fator que não
  está no catálogo (p. ex. "Fadiga de alertas" em *on-call*), decidir se ele
  volta para a etapa 1 como fator novo ou fica marcado como "fator emergente
  de ESC".
- [ ] **3.4 Piloto com 3–5 artigos** para calibrar formato, escala e regras
  antes do lote.
- [ ] **3.5 Extração em lote** dos artigos aprovados.
- [ ] **3.6 Dupla checagem** de uma amostra (p. ex. 20%) e registro das
  divergências de `effect`.

## 4. Montar a matriz prática × fator

- [ ] **4.1 Agregar por célula:** nº de artigos, contagem por sentido
  (aumenta/reduz/ambivalente) e força da evidência.
- [ ] **4.2 Calcular o efeito líquido no bem-estar** combinando o sentido da
  prática sobre o fator (etapa 3) com a polaridade do fator (etapa 1.5):
  - reduz um fator negativo → positivo
  - aumenta um fator negativo → negativo
  - aumenta um fator positivo → positivo
  - reduz um fator positivo → negativo
- [ ] **4.3 Marcar as células contraditórias**, com artigos em sentidos
  opostos, e anotar as condições que explicam a diferença (maturidade,
  automação, tamanho da equipe, cultura).
- [ ] **4.4 Marcar as lacunas:** fatores relevantes sem nenhuma evidência de
  ESC, e práticas sem evidência sobre bem-estar.

## 5. Análise e síntese

- [ ] **5.1 Efeitos positivos por prática.** O que cada prática melhora
  (hipóteses a checar: CI → menos retrabalho e ansiedade de integração; CD →
  menos estresse de *release*).
- [ ] **5.2 Efeitos negativos por prática.** O que cada prática piora
  (hipóteses: *on-call*/DevOps → interrupções, sobrecarga fora de hora;
  implantação contínua → pressão de ritmo constante; ferramental → carga
  cognitiva).
- [ ] **5.3 Efeitos ambivalentes e moderadores.** Quando a mesma prática
  ajuda ou atrapalha conforme o contexto.
- [ ] **5.4 Visão por categoria de fator.** Quais categorias a ESC mais
  alcança (espera-se *Processo*, *Técnico* e *Tarefa*) e quais quase não
  alcança (*Individual*, *Organizacional*).
- [ ] **5.5 Mecanismos recorrentes.** Agrupar os `mechanism` em poucos temas
  (feedback, previsibilidade, interrupção, autonomia, visibilidade…).
- [ ] **5.6 Ameaças à validade.** Viés de publicação a favor de DevOps,
  evidência de segunda mão, efeito da maturidade confundido com o da prática,
  e o catálogo congelado como limite.

## 6. Suporte no app (opcional, só se 0.4 decidir pela extensão)

- [ ] **6.1 Modelo de dados.** Criar as tabelas `practice` (catálogo de
  práticas com grafias, como `factor`) e `practice_effect` (artigo × prática ×
  fator × efeito × evidência).
- [ ] **6.2 Exportar para análise.** Pacote com catálogo de fatores, catálogo
  de práticas e artigos com `pdfUrl`, no mesmo molde do `export-analise`.
- [ ] **6.3 Aplicar delta de efeitos.** Mesmo mecanismo do delta de fatores
  (sobrescrever, `remove…`, resolução por grafia).
- [ ] **6.4 Tela da matriz.** Heatmap prática × fator com o efeito líquido;
  clicar na célula mostra as citações.
- [ ] **6.5 Exportação para o texto.** Tabela da matriz pronta para o Overleaf.

## 7. Entregáveis

- [ ] **7.1 Catálogo de fatores congelado** (tarefa 1.2)
- [ ] **7.2 Protocolo da busca e da triagem** (tarefa 2)
- [ ] **7.3 Base de efeitos extraídos** (JSON/planilha, tarefa 3)
- [ ] **7.4 Matriz prática × fator** com efeito líquido (tarefa 4)
- [ ] **7.5 Texto de síntese** para a tese/artigo (tarefa 5)

---

### Ordem sugerida

`0 → 1 → 2.1 → 3.4 (piloto com o corpus atual) → 2.2–2.6 → 3.5–3.6 → 4 → 5`

O piloto sobre o corpus que já existe (2.1 + 3.4) testa o formato de extração
antes de investir na busca nova, e já mostra se a matriz tende a ficar esparsa.
