import type { RoutingMode } from '../../../shared/protocol';

/** Labels in English; shown through t(). */
export const ROUTING_LABEL: Record<RoutingMode, { label: string; short: string; hint: string }> = {
  global: { label: 'Everything through the server', short: 'Everything', hint: 'Only local network addresses go direct.' },
  'iran-direct': { label: 'Iranian sites direct', short: 'Iran direct', hint: '.ir domains and Iranian IP addresses skip the server.' },
  'china-direct': { label: 'Chinese sites direct', short: 'China direct', hint: 'Chinese domains and IP addresses skip the server.' },
  'russia-direct': { label: 'Russian sites direct', short: 'Russia direct', hint: '.ru domains and Russian IP addresses skip the server.' },
};

export const ROUTING_MODES = Object.keys(ROUTING_LABEL) as RoutingMode[];
