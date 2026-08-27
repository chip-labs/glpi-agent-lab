import { criarCliente } from './cliente'
import { criarAleatorio } from './aleatorio'
import { criarCalendario } from './datas'
import { CATEGORIAS } from './catalogo/categorias'
import { USUARIOS } from './catalogo/usuarios'
import { ARTIGOS } from './catalogo/artigos'
import { gerarChamados } from './chamados'

// Rotas confirmadas ao vivo — ver
// .superpowers/sdd/2026-08-26-glpi-agent-lab/correcoes-para-task-7.md.
// O brief original desta task errava as três primeiras.
const ROTA_KB = '/Knowledgebase/Article'
const ROTA_CATEGORIA = '/Dropdowns/ITILCategory'
const ROTA_USUARIO = '/Administration/User'
const SEMENTE = 2026
const QUANTIDADE_CHAMADOS = 300

function exigir(nome: string): string {
  const valor = process.env[nome]
  if (!valor) throw new Error(`variável de ambiente ${nome} é obrigatória`)
  return valor
}

async function principal(): Promise<void> {
  const inicio = Date.now()

  const cliente = await criarCliente({
    base: process.env.GLPI_BASE ?? 'http://localhost:8080',
    clientId: exigir('CLIENT_ID'),
    clientSecret: exigir('CLIENT_SECRET'),
    usuario: 'glpi',
    senha: 'glpi',
  })

  const aleatorio = criarAleatorio(SEMENTE)
  // Âncora explícita: as datas do corpus são relativas ao momento da regeneração.
  const calendario = criarCalendario(new Date())

  console.log('criando categorias...')
  const idCategoria = new Map<string, number>()
  for (const c of CATEGORIAS) {
    const r = await cliente.post<{ id: number }>(ROTA_CATEGORIA, { name: c.nome })
    idCategoria.set(c.chave, r.id)
  }

  console.log('criando usuários...')
  const idUsuario = new Map<string, number>()
  for (const u of USUARIOS) {
    // Campo de login é "username", não "name" (brief original errava isso
    // — confirmado ao vivo pelo schema de /Administration/User no doc.json
    // e pela resposta 500 "O login não é válido" ao usar "name").
    const r = await cliente.post<{ id: number }>(ROTA_USUARIO, {
      username: u.login,
      firstname: u.nome,
      realname: u.sobrenome,
      password: 'laboratorio',
      password2: 'laboratorio',
    })
    idUsuario.set(u.login, r.id)
  }

  console.log(`criando ${ARTIGOS.length} artigos de KB...`)
  for (const a of ARTIGOS) {
    // Campo de conteúdo é "content", não "answer" (brief original errava isso).
    await cliente.post(ROTA_KB, { name: a.titulo, content: a.corpo })
  }

  const chamados = gerarChamados({ quantidade: QUANTIDADE_CHAMADOS, aleatorio, calendario })
  console.log(`criando ${chamados.length} chamados...`)

  const STATUS_GLPI: Record<string, number> = {
    novo: 1,
    em_atendimento: 2,
    solucionado: 5,
    fechado: 6,
  }

  for (const [i, c] of chamados.entries()) {
    const criado = await cliente.post<{ id: number }>('/Assistance/Ticket', {
      name: c.titulo,
      content: c.descricao,
      priority: c.prioridade,
      // O campo é "category: {id}" (objeto), não "itilcategories_id" — a v2
      // expande dropdowns inline nas respostas e espera o mesmo na escrita
      // (confirmado ao vivo; nem o brief nem as correções documentavam isso).
      category: { id: idCategoria.get(c.categoria) },
      date: c.criadoEm,
    })

    // O gerador da Task 6 sorteia um solicitante para cada chamado (ver
    // seed/src/chamados.ts); o brief original desta task não o consumia,
    // deixando o campo sem uso — corrigido aqui gravando-o como TeamMember
    // com role "requester" (papel confirmado no plano da Task 3/4).
    await cliente.post(`/Assistance/Ticket/${criado.id}/TeamMember`, {
      type: 'User',
      id: idUsuario.get(c.solicitante),
      role: 'requester',
    })

    if (c.tecnico) {
      await cliente.post(`/Assistance/Ticket/${criado.id}/TeamMember`, {
        type: 'User',
        id: idUsuario.get(c.tecnico),
        role: 'assigned',
      })
    }

    for (const item of c.timeline) {
      const sub = item.tipo === 'solucao' ? 'Solution' : 'Followup'
      await cliente.post(`/Assistance/Ticket/${criado.id}/Timeline/${sub}`, {
        content: item.conteudo,
      })
    }

    // O status vai por último: o GLPI recalcula status ao adicionar solução.
    // A v2 usa PATCH para atualização (confirmado ao vivo — ver correções).
    await cliente.patch(`/Assistance/Ticket/${criado.id}`, { status: STATUS_GLPI[c.status] })

    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${chamados.length} chamados criados...`)
    }
  }

  const duracaoMs = Date.now() - inicio
  console.log(`pronto. duração: ${(duracaoMs / 1000).toFixed(1)}s`)
}

principal().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
