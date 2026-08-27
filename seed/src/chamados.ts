import type { Aleatorio } from './aleatorio'
import type { Calendario } from './datas'
import { USUARIOS } from './catalogo/usuarios'

export type StatusChamado = 'novo' | 'em_atendimento' | 'solucionado' | 'fechado'

export interface ItemTimeline {
  tipo: 'followup' | 'solucao'
  autor: string
  conteudo: string
  data: string
}

export interface ChamadoGerado {
  titulo: string
  descricao: string
  categoria: string
  status: StatusChamado
  prioridade: number
  solicitante: string
  tecnico: string | null
  criadoEm: string
  timeline: ItemTimeline[]
}

export interface OpcoesChamados {
  quantidade: number
  aleatorio: Aleatorio
  calendario: Calendario
}

const DIAS_DE_HISTORICO = 540 // ~18 meses

/**
 * Categorias com peso: "rede" domina de propósito, para que perguntas
 * analíticas do enunciado tenham resposta não-óbvia.
 */
const PESO_CATEGORIA: readonly (readonly [string, number])[] = [
  ['rede', 32],
  ['acesso', 22],
  ['erp', 16],
  ['impressao', 13],
  ['email', 11],
  ['equipamento', 6],
]

const PESO_STATUS: readonly (readonly [StatusChamado, number])[] = [
  ['fechado', 58],
  ['solucionado', 17],
  ['em_atendimento', 15],
  ['novo', 10],
]

/** Tipado como tuplas: sem isso o TS infere number[][] e pesado() não compila. */
const PESO_PRIORIDADE: readonly (readonly [number, number])[] = [
  [1, 6],
  [2, 18],
  [3, 46],
  [4, 22],
  [5, 8],
]

const ASSUNTOS: Record<string, readonly (readonly [string, string])[]> = {
  rede: [
    ['VPN não conecta fora do escritório', 'Tento conectar de casa e a conexão cai após alguns segundos.'],
    ['Internet lenta no terceiro andar', 'Desde ontem as páginas demoram muito para abrir na sala 302.'],
    ['Sem acesso ao Wi-Fi de visitantes', 'O convidado da reunião não consegue autenticar na rede.'],
    ['Cabo de rede sem link', 'A luz da tomada de rede não acende na estação nova.'],
  ],
  acesso: [
    ['Usuário bloqueado após tentativas', 'Errei a senha três vezes e agora não entro mais.'],
    ['Sem permissão na pasta do setor', 'Preciso acessar a pasta de contratos e recebo acesso negado.'],
    ['Criar acesso para novo colaborador', 'Colaborador começa segunda e precisa de rede, e-mail e ERP.'],
    ['Revogar acessos de desligado', 'Encerrar todos os acessos do colaborador desligado hoje.'],
  ],
  erp: [
    ['Erro ao emitir nota fiscal', 'O sistema retorna erro de validação ao finalizar a emissão.'],
    ['Relatório mensal não carrega', 'A tela fica processando e nunca conclui.'],
    ['Liberar módulo de estoque', 'Preciso do módulo de estoque liberado no meu perfil.'],
    ['Lentidão no fechamento', 'Durante o fechamento o sistema fica muito lento.'],
  ],
  impressao: [
    ['Impressora do andar atolando papel', 'A cada duas páginas o papel enrosca.'],
    ['Toner acabou', 'A impressão está saindo falhada e o painel indica toner baixo.'],
    ['Digitalizar para e-mail não funciona', 'O scanner não envia o arquivo para o meu e-mail.'],
    ['Cota de impressão esgotada', 'Recebo aviso de cota excedida ao imprimir.'],
  ],
  email: [
    ['Caixa de e-mail cheia', 'Não consigo mais receber mensagens.'],
    ['Configurar e-mail no celular', 'Preciso do e-mail corporativo no aparelho novo.'],
    ['Muito spam na caixa de entrada', 'Aumentou bastante o volume de mensagens indesejadas.'],
    ['Incluir na lista de distribuição', 'Preciso receber os comunicados do setor.'],
  ],
  equipamento: [
    ['Solicitar notebook para novo colaborador', 'Equipamento para o colaborador que inicia no mês que vem.'],
    ['Monitor com falha de imagem', 'A tela pisca e às vezes fica preta.'],
    ['Bateria do notebook não segura carga', 'Dura menos de vinte minutos fora da tomada.'],
    ['Devolução de equipamento', 'Preciso devolver o notebook do colaborador desligado.'],
  ],
}

const RESPOSTAS_TECNICO: readonly string[] = [
  'Chamado recebido, vou verificar e retorno em seguida.',
  'Consegui reproduzir o problema aqui. Estou trabalhando na correção.',
  'Preciso de mais um dado: você consegue informar o horário exato em que ocorreu?',
  'Acionei a equipe responsável e estou acompanhando.',
]

const SOLUCOES: Record<string, readonly string[]> = {
  rede: [
    'Porta UDP 500 bloqueada na rede de origem. Orientado a usar outra rede; conexão normalizada.',
    'Switch do andar reiniciado e porta reconfigurada. Conectividade restabelecida.',
  ],
  acesso: [
    'Conta desbloqueada e senha provisória enviada. Usuário confirmou o acesso.',
    'Permissão concedida no grupo do setor. Usuário validou o acesso à pasta.',
  ],
  erp: [
    'Cadastro fiscal do produto estava incompleto. Corrigido, emissão concluída.',
    'Cache do relatório limpo e job reprocessado. Relatório voltou a carregar.',
  ],
  impressao: [
    'Rolete de tração substituído. Testes de impressão sem atolamento.',
    'Toner substituído e contador zerado. Impressão normalizada.',
  ],
  email: [
    'Caixa expandida e itens antigos arquivados. Recebimento normalizado.',
    'Perfil recriado no aplicativo. E-mails sincronizando corretamente.',
  ],
  equipamento: [
    'Equipamento substituído e termo de responsabilidade assinado.',
    'Bateria trocada em garantia. Autonomia dentro do esperado.',
  ],
}

export function gerarChamados({ quantidade, aleatorio, calendario }: OpcoesChamados): ChamadoGerado[] {
  const solicitantes = USUARIOS.map((u) => u.login)
  const tecnicos = USUARIOS.filter((u) => u.tecnico).map((u) => u.login)
  const chamados: ChamadoGerado[] = []

  for (let i = 0; i < quantidade; i++) {
    const categoria = aleatorio.pesado(PESO_CATEGORIA)
    const status = aleatorio.pesado(PESO_STATUS)
    const [titulo, descricao] = aleatorio.escolher(ASSUNTOS[categoria]!)

    const diasAtras = sortearDiaComSazonalidade(aleatorio)
    const abertura = calendario.diasAtras(diasAtras)
    const criadoEm = calendario.formatar(abertura)

    const tecnico = status === 'novo' ? null : aleatorio.escolher(tecnicos)
    const timeline: ItemTimeline[] = []

    if (tecnico !== null) {
      const quantosFollowups = aleatorio.inteiro(1, 3)
      for (let f = 0; f < quantosFollowups; f++) {
        timeline.push({
          tipo: 'followup',
          autor: tecnico,
          conteudo: aleatorio.escolher(RESPOSTAS_TECNICO),
          data: calendario.formatar(
            new Date(abertura.getTime() + (f + 1) * aleatorio.inteiro(2, 20) * 3_600_000),
          ),
        })
      }
    }

    if (status === 'solucionado' || status === 'fechado') {
      timeline.push({
        tipo: 'solucao',
        autor: tecnico!,
        conteudo: aleatorio.escolher(SOLUCOES[categoria]!),
        data: calendario.formatar(
          new Date(abertura.getTime() + aleatorio.inteiro(24, 200) * 3_600_000),
        ),
      })
    }

    chamados.push({
      titulo,
      descricao: `<p>${descricao}</p>`,
      categoria,
      status,
      prioridade: aleatorio.pesado(PESO_PRIORIDADE),
      solicitante: aleatorio.escolher(solicitantes),
      tecnico,
      criadoEm,
      timeline,
    })
  }

  return chamados
}

/**
 * Sorteia "há quantos dias" o chamado foi aberto, com dois picos sazonais.
 * Uma distribuição uniforme tornaria toda pergunta temporal do enunciado trivial.
 */
function sortearDiaComSazonalidade(aleatorio: Aleatorio): number {
  const faixa = aleatorio.pesado([
    ['pico_recente', 25],
    ['pico_antigo', 20],
    ['normal', 55],
  ] as const)

  if (faixa === 'pico_recente') return aleatorio.inteiro(20, 50)
  if (faixa === 'pico_antigo') return aleatorio.inteiro(300, 330)
  return aleatorio.inteiro(1, DIAS_DE_HISTORICO)
}
