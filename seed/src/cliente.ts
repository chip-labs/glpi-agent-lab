export interface ConfigCliente {
  base: string
  clientId: string
  clientSecret: string
  usuario: string
  senha: string
  /** Injetável para teste. */
  buscar?: typeof fetch
}

export interface Cliente {
  get<T>(caminho: string): Promise<T>
  post<T>(caminho: string, corpo: unknown): Promise<T>
}

export async function criarCliente(config: ConfigCliente): Promise<Cliente> {
  const buscar = config.buscar ?? fetch
  const raiz = config.base.replace(/\/+$/, '')

  const resposta = await buscar(`${raiz}/api.php/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'password',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      username: config.usuario,
      password: config.senha,
      scope: 'api',
    }),
  })

  if (!resposta.ok) {
    throw new Error(`falha ao obter token: ${resposta.status} ${await resposta.text()}`)
  }
  const { access_token: token } = (await resposta.json()) as { access_token: string }

  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const r = await buscar(`${raiz}/api.php/v2${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    })

    // A v2 responde 206 em listagens paginadas — 2xx inteiro é sucesso.
    if (r.status < 200 || r.status > 299) {
      throw new Error(`${metodo} ${caminho} → ${r.status} ${await r.text()}`)
    }
    return (await r.json()) as T
  }

  return {
    get: (caminho) => chamar('GET', caminho),
    post: (caminho, corpo) => chamar('POST', caminho, corpo),
  }
}
