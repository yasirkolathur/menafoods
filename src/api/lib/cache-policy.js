export const CACHE_TTL_SECONDS = {
  products: 600,
  stock: 60,
  customerExposure: 300,
  dashboard: 60,
};

export function shouldLiveVerifyExposure({ ageSeconds, nearLimit, largeOrder }) {
  return ageSeconds > CACHE_TTL_SECONDS.customerExposure || nearLimit || largeOrder;
}
