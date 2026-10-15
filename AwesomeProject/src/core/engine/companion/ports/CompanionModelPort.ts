import type {CompanionRequestProjection} from '@core/engine/capabilities/shared/CapabilityPrivacy';
import type {CompanionIntent, ConfirmedCompanionAction} from '../domain/CompanionTypes';

// The model only ever sees the sanitized companion projection and returns a
// classified intent, a reply, and an optional structured proposal. The service
// strictly validates this output before trusting it.
export interface CompanionModelOutput {
  readonly intent: CompanionIntent;
  readonly reply: string;
  readonly proposal?: ConfirmedCompanionAction;
}

export interface CompanionModelPort {
  complete(request: CompanionRequestProjection): Promise<CompanionModelOutput>;
}
