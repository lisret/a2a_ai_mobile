import type {AgentModeId} from '../../shared/types/Model';
import type {
  PhoneOperateApplicationPort,
  PhoneOperateFacade,
  PhoneOperateViewState,
  UiBlockerCode,
} from './UiRuntimeContracts';

/** Ref-free guard failure whose message is the stable blocker code. */
class PhoneOperateGuardError extends Error {
  readonly code: UiBlockerCode;
  constructor(code: UiBlockerCode) {
    super(code);
    this.name = 'PhoneOperateGuardError';
    this.code = code;
  }
}

export class DefaultPhoneOperateFacade implements PhoneOperateFacade {
  constructor(private readonly port: PhoneOperateApplicationPort) {}

  getViewState(): Promise<PhoneOperateViewState> {
    return this.port.read();
  }

  selectDraftMode(mode: AgentModeId): Promise<PhoneOperateViewState> {
    return this.port.setDraft(mode);
  }

  async activateDraftMode(expectedRevision: number): Promise<PhoneOperateViewState> {
    const state = await this.port.read();
    if (state.revision !== expectedRevision) {
      throw new PhoneOperateGuardError('config_revision_conflict');
    }
    const option = state.modes[state.draftMode];
    if (!option || !option.runnable) {
      throw new PhoneOperateGuardError(
        option?.blockers[0]?.code ?? 'phone_operate_disabled',
      );
    }
    return this.port.activate(state.draftMode, expectedRevision);
  }

  setAdbFallbackEnabled(enabled: boolean): Promise<PhoneOperateViewState> {
    return this.port.setAdbFallback(enabled);
  }
}
