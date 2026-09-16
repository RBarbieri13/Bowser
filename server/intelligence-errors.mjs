export class IntelligenceProviderError extends Error {
  constructor(code, message, status = 502, provider = null) {
    super(message);
    this.name = "IntelligenceProviderError";
    this.code = code;
    this.status = status;
    this.provider = provider;
  }
}
