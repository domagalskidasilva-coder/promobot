// Cliente da API do Promobot (FastAPI no backend).
async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "same-origin",
    ...options,
  })
  if (res.status === 303 || res.status === 401 || res.status === 403) {
    throw new Error("unauthorized")
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get("content-type") || ""
  return ct.includes("json") ? res.json() : res
}

export const api = {
  me: () => req("/api/me").catch(() => ({ logged: false })),
  stats: () => req("/api/stats"),
  offers: (params) => {
    const qs = new URLSearchParams()
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== "" && v != null) qs.set(k, v)
    })
    return req(`/api/offers?${qs}`)
  },
  product: (id) => req(`/api/product/${id}`),
  insights: () => req("/api/insights"),
  coupons: () => req("/api/coupons"),
  sparklines: (ids) => req(`/api/sparklines?ids=${ids}`),
  status: () => req("/api/status"),
  keywords: () => req("/api/keywords"),
  addKeyword: (keyword) =>
    req("/api/keywords", { method: "POST", body: JSON.stringify({ keyword }) }),
  toggleKeyword: (id) => req(`/api/keywords/${id}/toggle`, { method: "POST" }),
  deleteKeyword: (id) => req(`/api/keywords/${id}/delete`, { method: "POST" }),
  watchlist: () => req("/api/watchlist"),
  stores: () => req("/api/stores"),
  addStore: (payload) => req("/api/stores", { method: "POST", body: JSON.stringify(payload) }),
  toggleStore: (id) => req(`/api/stores/${id}/toggle`, { method: "POST" }),
  deleteStore: (id) => req(`/api/stores/${id}/delete`, { method: "POST" }),
  addWatch: (product_id, target_price) =>
    req("/api/watchlist", { method: "POST", body: JSON.stringify({ product_id, target_price }) }),
  deleteWatch: (id) => req(`/api/watchlist/${id}/delete`, { method: "POST" }),
  collectNow: () => req("/buscar-agora", { method: "POST" }),
  cycleStatus: () => req("/api/cycle-status"),
  login: (username, password) =>
    req("/api/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => req("/logout"),
}
