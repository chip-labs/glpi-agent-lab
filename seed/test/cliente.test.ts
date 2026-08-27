import { describe, it, expect, vi } from 'vitest'
import { criarCliente } from '../src/cliente'

const CONFIG_BASE = {
  base: 'http://lab:8080',
  clientId: 'id',
  clientSecret: 'segredo',
  usuario: 'glpi',
  senha: 'glpi',
}

const respostaToken = () =>
  new Response(JSON.stringify({ access_token: 'TOK', refresh_token: 'REF', expires_in: 3600 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

describe('criarCliente', () => {
  it('autentica no endpoint de token antes de qualquer chamada', async () => {
    const buscar = vi.fn().mockResolvedValueOnce(respostaToken())
    await criarCliente({ ...CONFIG_BASE, buscar: buscar as unknown as typeof fetch })

    expect(buscar).toHaveBeenCalledTimes(1)
    const [url, init] = buscar.mock.calls[0]!
    expect(url).toBe('http://lab:8080/api.php/token')
    expect(JSON.parse(init.body).grant_type).toBe('password')
  })

  it('manda o Bearer nas chamadas seguintes', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(respostaToken())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

    const cliente = await criarCliente({ ...CONFIG_BASE, buscar: buscar as unknown as typeof fetch })
    await cliente.get('/Assistance/Ticket')

    const [url, init] = buscar.mock.calls[1]!
    expect(url).toBe('http://lab:8080/api.php/v2/Assistance/Ticket')
    expect(init.headers.Authorization).toBe('Bearer TOK')
  })

  it('aceita HTTP 206 como sucesso — a v2 pagina com 206', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(respostaToken())
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1 }]), { status: 206 }))

    const cliente = await criarCliente({ ...CONFIG_BASE, buscar: buscar as unknown as typeof fetch })
    await expect(cliente.get('/Assistance/Ticket')).resolves.toEqual([{ id: 1 }])
  })

  it('lança erro com corpo legível quando a resposta falha', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(respostaToken())
      .mockResolvedValueOnce(new Response('campo obrigatório ausente', { status: 400 }))

    const cliente = await criarCliente({ ...CONFIG_BASE, buscar: buscar as unknown as typeof fetch })
    await expect(cliente.post('/Assistance/Ticket', {})).rejects.toThrow(
      /400.*campo obrigatório ausente/s,
    )
  })

  it('envia o corpo achatado no post, sem envelope input', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(respostaToken())
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 9 }), { status: 201 }))

    const cliente = await criarCliente({ ...CONFIG_BASE, buscar: buscar as unknown as typeof fetch })
    await cliente.post('/Assistance/Ticket', { name: 'x' })

    const corpo = JSON.parse(buscar.mock.calls[1]![1].body)
    expect(corpo).toEqual({ name: 'x' })
    expect(corpo.input).toBeUndefined()
  })
})
