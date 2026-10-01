export class MenaApiError extends Error {
  constructor(message, { status = 0, code = "api_error", details = null } = {}) {
    super(message);
    this.name = "MenaApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class MenaApi {
  constructor({ baseUrl = "/mf-api", tokenProvider, timeoutMs = 12000 } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.tokenProvider = tokenProvider;
    this.timeoutMs = timeoutMs;
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);

    try {
      const token = await this.tokenProvider?.();
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {})
        }
      });

      const contentType = res.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await res.json()
        : await res.text();

      if (!res.ok) {
        const code = payload && typeof payload === "object" ? payload.code : "api_error";
        throw new MenaApiError(`MENAFoods API request failed (${res.status})`, {
          status: res.status,
          code,
          details: payload
        });
      }

      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new MenaApiError("MENAFoods API request timed out", { code: "timeout" });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  bootstrap() { return this.request("/bootstrap"); }
  products(params = "") { return this.request(`/products${params}`); }
  exposure(id) { return this.request(`/finops/customers/${encodeURIComponent(id)}/exposure`); }
  creditDecision(body) {
    return this.request("/finops/credit/decision", {
      method: "POST",
      body: JSON.stringify(body)
    });
  }
}
