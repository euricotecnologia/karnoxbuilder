export async function fetchModelList(baseUrl: string, apiKey?: string | null): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`

  const response = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  })

  if (!response.ok) {
    throw new Error(`Falha ao listar modelos (HTTP ${response.status})`)
  }

  const json = (await response.json()) as { data?: Array<{ id?: string }> }
  const list = Array.isArray(json.data) ? json.data : []

  return list
    .map((m) => m.id)
    .filter((id): id is string => !!id)
    .sort()
}
