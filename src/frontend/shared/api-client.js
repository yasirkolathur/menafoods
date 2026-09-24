export class MenaApi {
  constructor({ baseUrl = "/mf-api", tokenProvider }) {
    this.baseUrl = baseUrl;
    this.tokenProvider = tokenProvider;
  }

  async request(path, options = {}) {
    const token = await this.tokenProvider?.();
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    if (!res.ok) throw new Error(`api_error_${res.status}`);
    return res.json();
  }

  bootstrap() { return this.request("/bootstrap"); }
  products(params="") { return this.request(`/products${params}`); }
  exposure(id) { return this.request(`/finops/customers/${id}/exposure`); }
  creditDecision(body) {
    return this.request("/finops/credit/decision", { method:"POST", body:JSON.stringify(body) });
  }
}
