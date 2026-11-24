/**
 * Lookup index over ONE canonical dataset, plus PRD wording helpers.
 * The visual model for the approved design lives in `atlas.ts`.
 */
import type { Channel, Dataset, Flow, Integration, System } from './schema.ts';

export type Index = {
  systems: Map<string, System>;
  integrations: Map<string, Integration>;
  channels: Map<string, Channel>;
  flows: Map<string, Flow>;
  flowsByChannel: Map<string, Flow[]>;
  channelsBySystem: Map<string, Channel[]>;
  claimsBySystem: Map<string, Integration[]>;   // claims reported by the system
  systemByKey: Map<string, System>;
};

export function buildIndex(d: Dataset): Index {
  const flowsByChannel = new Map<string, Flow[]>();
  for (const f of d.flows) flowsByChannel.set(f.channelId, [...(flowsByChannel.get(f.channelId) ?? []), f]);
  const channelsBySystem = new Map<string, Channel[]>();
  for (const c of d.channels) for (const s of [c.systemA, c.systemB]) channelsBySystem.set(s, [...(channelsBySystem.get(s) ?? []), c]);
  const claimsBySystem = new Map<string, Integration[]>();
  for (const x of d.integrations) claimsBySystem.set(x.reportedBySystemId, [...(claimsBySystem.get(x.reportedBySystemId) ?? []), x]);
  return {
    systems: new Map(d.systems.map((s) => [s.id, s])),
    integrations: new Map(d.integrations.map((x) => [x.id, x])),
    channels: new Map(d.channels.map((c) => [c.id, c])),
    flows: new Map(d.flows.map((f) => [f.id, f])),
    flowsByChannel, channelsBySystem, claimsBySystem,
    systemByKey: new Map(d.systems.map((s) => [s.key, s])),
  };
}

/** Display language controlled by audit coverage (PRD §7.2, scenario 7). */
export function isolationLabel(s: System, connected: boolean): string | null {
  if (connected) return null;
  if (s.coverage === 'not_audited') return s.layer === 'external' ? 'مزوّد خارجي — لا اتصالات موثقة' : 'لم يُفحص بعد';
  if (s.coverage === 'partial') return 'تدقيق جزئي — لا اتصالات موثقة حتى الآن';
  return 'لا توجد اتصالات موثقة';
}

/** Coverage wording shown on every system regardless of connections (PRD §7.2). */
export function coverageNote(s: System): string | null {
  if (s.coverage === 'not_audited') return s.layer === 'external' ? null : 'لم يُفحص بعد';
  if (s.coverage === 'partial') return 'تدقيق جزئي';
  return null;
}

/** Hover description: max 20 words (PRD D-004). */
export function tooltipWords(s: System, max = 20): string {
  const src = s.shortDescription ?? s.description ?? '';
  const words = src.replace(/…$/, '').split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(' ') : `${words.slice(0, max).join(' ')}…`;
}
