import type {
  CompanionProposal,
  ErrandApplicationPort,
  ErrandFacade,
  ErrandItemViewState,
  ErrandsViewState,
} from './UiRuntimeContracts';

type ErrandProposal = Extract<CompanionProposal, {kind: 'errand'}>;

const EDITABLE_STATUSES: ReadonlySet<ErrandItemViewState['status']> = new Set(['pending', 'failed']);

export class ErrandNotEditableError extends Error {
  readonly code = 'errand_not_editable' as const;

  constructor() {
    super('errand_not_editable');
  }
}

export class DefaultErrandFacade implements ErrandFacade {
  constructor(private readonly port: ErrandApplicationPort) {}

  getViewState(): Promise<ErrandsViewState> {
    return this.port.read();
  }

  setEnabled(enabled: boolean): Promise<ErrandsViewState> {
    return this.port.setEnabled(enabled);
  }

  async createFromProposal(proposal: ErrandProposal): Promise<string> {
    if (proposal.title.trim().length === 0) {
      throw new Error('errand title must not be empty');
    }
    if (proposal.errandType === 'schedule') {
      if (!proposal.when || proposal.when.trim().length === 0) {
        throw new Error('schedule errand requires a non-empty "when"');
      }
      return this.port.create(proposal);
    }
    return this.port.create({kind: 'errand', title: proposal.title, errandType: 'once'});
  }

  async update(item: ErrandItemViewState): Promise<ErrandItemViewState> {
    if (!EDITABLE_STATUSES.has(item.status)) {
      throw new ErrandNotEditableError();
    }
    return this.port.update(item);
  }

  cancel(id: string): Promise<void> {
    return this.port.cancel(id);
  }
}
