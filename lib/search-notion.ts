import { api } from './config'

export async function searchNotion(params: { query: string }) {
  return fetch(api.searchNotion, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: { 'content-type': 'application/json' },
  })
    .then((res) => {
      if (res.ok) return res
      const error: any = new Error(res.statusText)
      error.response = res
      return Promise.reject(error)
    })
    .then((res) => res.json())
}
