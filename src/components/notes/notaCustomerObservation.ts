export const CUSTOMER_OBSERVATION_MAX_LENGTH = 700;

/** Preserva parágrafos curtos, mas remove espaços acidentais de cada linha. */
export function normalizeCustomerObservation(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitCustomerObservationLines(value: string | null | undefined) {
  return normalizeCustomerObservation(value).split('\n').filter(Boolean);
}
