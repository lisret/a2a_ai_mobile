// Single Errand lifecycle facade for UI and Companion confirmation flows.
// Parses and persists only a confirmed proposal; never a raw/unconfirmed one.
import type {CapabilityConfigPort, Clock} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {ErrandRepository} from '@core/engine/errand/ports/ErrandRepository';
import {parseErrandTime} from '@core/engine/errand/domain/parseErrandTime';
import {buildErrandsViewState, type ErrandsViewState} from './ErrandsViewState';

export interface ErrandProposal {
  readonly kind: 'errand';
  readonly title: string;
  readonly errandType: 'once' | 'schedule';
  readonly when: string;
}

// Narrow seam consumed by Companion after explicit user confirmation.
export interface ErrandProposalPort {
  create(proposal: ErrandProposal): Promise<string>;
}

export class ErrandFacade implements ErrandProposalPort {
  constructor(
    private readonly repository: ErrandRepository,
    private readonly clock: Clock,
    private readonly capabilityConfig: CapabilityConfigPort,
    private readonly timeZoneOffsetMinutes: () => number,
  ) {}

  async read(): Promise<ErrandsViewState> {
    const [snapshot, errands] = await Promise.all([this.capabilityConfig.read(), this.repository.list()]);
    return buildErrandsViewState(snapshot.capabilities.errands, errands);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const snapshot = await this.capabilityConfig.read();
    const {revision, ...rest} = snapshot;
    await this.capabilityConfig.compareAndSet(revision, {
      ...rest,
      capabilities: {...rest.capabilities, errands: enabled},
    });
  }

  async create(proposal: ErrandProposal): Promise<string> {
    const schedule = parseErrandTime(proposal.when, {
      nowMs: this.clock.now(),
      timeZoneOffsetMinutes: this.timeZoneOffsetMinutes(),
    });
    const errand = await this.repository.create({title: proposal.title, schedule});
    return errand.id;
  }

  async update(errandId: string, proposal: ErrandProposal): Promise<void> {
    const schedule = parseErrandTime(proposal.when, {
      nowMs: this.clock.now(),
      timeZoneOffsetMinutes: this.timeZoneOffsetMinutes(),
    });
    await this.repository.updateDraft(errandId, {title: proposal.title, schedule});
  }

  async cancel(errandId: string): Promise<void> {
    await this.repository.cancel(errandId);
  }
}
