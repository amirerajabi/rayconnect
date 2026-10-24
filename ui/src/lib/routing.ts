import type { RoutingMode, RoutingRule, RuleOutbound } from '../../../shared/protocol';

/** Labels in English; shown through t(). */
export const ROUTING_LABEL: Record<RoutingMode, { label: string; short: string; hint: string }> = {
  global: { label: 'Everything through the server', short: 'Everything', hint: 'Only local network addresses go direct.' },
  'iran-direct': { label: 'Iranian sites direct', short: 'Iran direct', hint: '.ir domains and Iranian IP addresses skip the server.' },
  'china-direct': { label: 'Chinese sites direct', short: 'China direct', hint: 'Chinese domains and IP addresses skip the server.' },
  'russia-direct': { label: 'Russian sites direct', short: 'Russia direct', hint: '.ru domains and Russian IP addresses skip the server.' },
};

export const ROUTING_MODES = Object.keys(ROUTING_LABEL) as RoutingMode[];

export const OUTBOUND_LABEL: Record<RuleOutbound, string> = { proxy: 'Through the server', direct: 'Direct', block: 'Block' };

/** Ready-made rules people often want, a click away. Xray's own lists (geosite / geoip) ship with it. Names go through t(). */
export const RULE_TEMPLATES: { label: string; rule: Omit<RoutingRule, 'id'> }[] = [
  { label: 'Iranian sites direct', rule: { name: 'Iranian sites', enabled: true, outbound: 'direct', entries: ['geosite:category-ir', 'domain:ir', 'geoip:ir'] } },
  { label: 'Telegram through the server', rule: { name: 'Telegram', enabled: true, outbound: 'proxy', entries: ['geosite:telegram', 'geoip:telegram'] } },
  { label: 'YouTube and Google through the server', rule: { name: 'YouTube and Google', enabled: true, outbound: 'proxy', entries: ['geosite:youtube', 'geosite:google'] } },
  { label: 'Block ads and trackers', rule: { name: 'Ads', enabled: true, outbound: 'block', entries: ['geosite:category-ads-all'] } },
];

export function newRuleId(): string {
  return Math.random().toString(36).slice(2, 10);
}
