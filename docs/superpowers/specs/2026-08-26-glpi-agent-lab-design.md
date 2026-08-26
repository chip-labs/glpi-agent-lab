# GLPI Agent Lab — kit de laboratório para projeto acadêmico

**Data:** 2026-08-26
**Status:** desenho aprovado, pronto para plano de implementação

## Objetivo

Entregar um kit de laboratório que permita a alunos externos de 4º semestre
construir, ao longo de um semestre (16 semanas), um agente de IA que responde
perguntas sobre a base de conhecimento e os chamados de um GLPI 11.

O kit é composto por **ambiente + dados + enunciado**. Ele não contém código
de agente: a lógica do agente é exatamente o que se quer avaliar.

## Contexto e restrições

| Restrição | Decisão |
|---|---|
| Alunos externos à empresa | Nenhum dado real. Corpus 100% sintético, gerado do zero. |
| Stack livre (cada grupo escolhe a linguagem) | O kit é neutro de linguagem. A única fronteira entre autor e aluno é HTTP. |
| Sem frontend | A entrega do aluno é CLI ou API. Nenhum requisito de UI. |
| Cada aluno traz a própria chave de LLM | O kit não fixa provedor nem SDK. Não há custo de API para o autor. |
| Avaliação manual (código + apresentação) | Não há suíte de avaliação automatizada. O enunciado traz perguntas de referência para a demo. |
| GLPI 11 | API v2 (`/api.php/v2`) com OAuth2. A API legada v1 não é usada no kit. |

## Arquitetura do kit

Três partes independentes, que evoluem em ritmos diferentes.

### 1. `lab/` — o ambiente

`docker-compose.yml` com dois serviços:

- **MariaDB**, que carrega `seed.sql` a partir de `/docker-entrypoint-initdb.d/`.
- **GLPI 11.0.x**, imagem construída no próprio repositório a partir de
  `php:8.3-apache` mais o tarball oficial da release, com **versão fixada**.

Não se usa imagem comunitária de terceiro: são dependências não controladas que
quebram sem aviso ao longo de um semestre. A versão é fixada pelo mesmo motivo —
um bump de minor no meio do curso produziria 30 grupos com ambientes divergentes.

**O aluno nunca roda o instalador do GLPI.** O banco sobe já povoado, então
`docker compose up` entrega um GLPI utilizável em menos de um minuto.
`docker compose down -v && docker compose up` restaura o estado inicial — o que
é essencial porque o escopo inclui escrita e os alunos vão sujar a base.

**Credenciais OAuth pré-criadas.** O `seed.sql` já contém um cliente OAuth com
`client_id` e `client_secret` fixos, documentados no README. Na v2 o aluno
precisa deles para obter um Bearer em `POST /api.php/token`; sem isso, cadastrar
um client no GLPI vira uma parede no primeiro dia de aula. O aluno ainda aprende
o fluxo OAuth — apenas não gasta uma semana descobrindo onde se registra o client.

### 2. `seed/` — o gerador de dados

Script que fala com a API REST do GLPI para criar categorias, usuários,
chamados, timelines e artigos de KB.

Executado **pelo autor, uma vez**, contra um GLPI limpo; o resultado é
congelado via `mysqldump` em `lab/seed.sql`, que é o artefato versionado.
Os alunos nunca executam o gerador.

Manter o gerador no repositório importa por dois motivos: permite regenerar o
corpus quando se quiser mais volume ou uma categoria nova, em vez de editar SQL
à mão; e serve de **gabarito** — o autor sabe exatamente qual artigo responde
qual pergunta.

Duas propriedades obrigatórias:

- **Determinístico.** Semente fixa: duas execuções produzem o mesmo resultado.
  Sem isso o enunciado não pode citar "o chamado 147" e ter certeza de que ele
  existe na máquina do aluno.
- **Datas relativas ao build.** As datas são ancoradas em "hoje menos N dias" no
  momento da regeneração, não em valores absolutos. Datas absolutas fariam as
  perguntas temporais quebrarem quando a disciplina fosse oferecida de novo.

### 3. `docs/` — o enunciado

Requisitos, sprints, rubrica, perguntas de referência para a demo, e uma
**coleção de requisições HTTP** (formato `.http`, que roda em VS Code, Bruno e
IntelliJ) demonstrando autenticação OAuth e as leituras básicas de KB e chamados.

Essa coleção é a única muleta técnica fornecida: destrava a integração sem
entregar nada da lógica do agente.

Inclui também uma versão enxuta e sanitizada das notas de API v2 já levantadas
ao vivo em `ChipDash/docs/notes/glpi-v2-endpoints.md` — shape do Ticket,
`team[]` com `role: assigned`, Timeline como caminho canônico em vez de
`/Followup`, listagens retornando HTTP 206. São detalhes que travam aluno por
dias e não têm valor pedagógico.

### Fora de escopo do kit

Nenhum código de agente, nenhum esqueleto de aplicação, nenhum contrato de API
rígido para a entrega do aluno.

## Corpus sintético

| Camada | Volume | Nota de desenho |
|---|---|---|
| Artigos de KB | ~40 | Português, tamanho variado (3 parágrafos a 2 páginas). Temas: VPN, impressora, ERP, e-mail, rede, acessos. |
| Chamados | ~300 | Distribuídos em 18 meses, status/categoria/técnico/prioridade variados. |
| Timelines | nos chamados fechados | Followups + solução. |
| Usuários e categorias | ~15 e 6 | Taxonomia rasa e coerente. |

**Pares quase-duplicados são deliberados.** O corpus inclui, por exemplo, dois
artigos sobre VPN (um para Windows, outro para macOS). Sem ambiguidade na
recuperação, o RAG acerta por sorte e o aluno não aprende a lidar com ela.

**A distribuição dos chamados não é uniforme.** Há picos sazonais e uma
categoria dominante, para que perguntas analíticas ("qual categoria mais abriu
chamado no último trimestre?") tenham resposta não-óbvia.

**Decisão consciente sobre o tamanho:** o corpus cabe inteiro na janela de
contexto de um LLM moderno. Optou-se por manter pequeno e **exigir RAG pela
rubrica**, em vez de inflar o volume para forçá-lo. Ver "Rubrica" abaixo.

## Sprints

| Sprint | Semanas | Entrega |
|---|---|---|
| 0 — Reconhecimento | 1–2 | Subir o lab, autenticar via OAuth, relatório sobre o corpus e o shape dos JSONs. **Sem IA.** |
| 1 — RAG na KB | 3–6 | Ingestão, chunking, embeddings, busca semântica, resposta citando a fonte. |
| 2 — Consulta de chamados | 7–9 | Ferramenta que consulta a API e devolve dado estruturado; roteamento entre KB e ferramenta. |
| 3 — Similaridade | 10–12 | Dado um chamado novo, achar históricos parecidos e propor a solução aplicada. |
| 4 — Escrita com confirmação | 13–15 | Abrir chamado e adicionar acompanhamento, sempre sob confirmação humana explícita. |
| — | 16 | Apresentação final. |

Cada sprint é avaliável isoladamente: um grupo que empaque na 3 ainda entregou
software funcional.

Notas por sprint:

- **Sprint 0** separa quem tem Docker e HTTP funcionando de quem ainda não tem,
  antes que isso contamine o resto do semestre.
- **Sprint 1** é o coração do projeto e por isso leva quatro semanas. Critério
  duro: toda resposta cita a fonte, e quando a KB não cobre a pergunta o agente
  declara que não sabe. **Alucinar uma fonte é falha de sprint, não desconto.**
- **Sprint 2** é a virada conceitual: "quantos chamados abertos de redes?" não
  se responde com RAG. O aluno precisa descobrir a necessidade de uma ferramenta
  e de um roteamento. É onde o trabalho deixa de ser um buscador e vira agente.
- **Sprint 3** reaproveita os embeddings da Sprint 1 sobre outro corpus,
  mostrando que a técnica generaliza. Depende das timelines do seed.
- **Sprint 4** tem requisito não-negociável: nada é escrito sem confirmação
  humana, e o agente exibe o que vai gravar antes de gravar. É a lição mais
  transferível do semestre, e o lab é o lugar seguro para aprendê-la — se o
  aluno abrir 400 chamados por engano, `docker compose down -v` resolve.

## Rubrica

| Critério | Peso |
|---|---|
| Recuperação e arquitetura | 30 |
| Uso de ferramentas e roteamento | 20 |
| Tratamento de erro e recusa honesta | 15 |
| Testes | 15 |
| Documentação | 10 |
| Apresentação | 10 |

Como o corpus cabe no contexto do modelo, **o critério de recuperação é
arquitetural, não de acerto**. O grupo precisa demonstrar, no código e na demo,
que existe uma etapa de recuperação selecionando um subconjunto antes da
geração, e que o agente continuaria funcionando se o corpus crescesse 10×.
Enfiar todo o corpus no prompt e acertar as respostas **reprova o item de
recuperação mesmo com demo perfeita**.

Isso precisa estar escrito no enunciado desde a Sprint 1 — não pode aparecer
como surpresa na correção.

## Risco aberto

**O endpoint da base de conhecimento na API v2 ainda não foi confirmado.**
As notas existentes cobrem Ticket, Timeline, Entity, User, Document e escrita,
mas não `KnowbaseItem`. A KB é o núcleo do projeto: se ela não for legível pela
v2 (provavelmente sob `Assistance/` ou `Tools/`), o desenho do RAG muda.

Confirmar isso ao vivo é a **primeira tarefa da implementação**, antes de
qualquer outra coisa do kit.

## Estrutura do repositório

```
glpi-agent-lab/
├── lab/
│   ├── docker-compose.yml
│   ├── Dockerfile          # php:8.3-apache + GLPI 11.0.x fixado
│   └── seed.sql            # artefato congelado, versionado
├── seed/                   # gerador (uso do autor, não do aluno)
├── docs/
│   ├── enunciado.md
│   ├── rubrica.md
│   ├── api-glpi-v2.md      # notas enxutas e sanitizadas
│   └── glpi.http           # coleção de requisições
└── README.md
```
