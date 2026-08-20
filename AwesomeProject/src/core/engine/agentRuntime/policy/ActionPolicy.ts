import type {ActionDecision, ObservationElement} from '../domain/AgentTypes';

const HIGH_RISK_PATTERNS: readonly RegExp[] = [
  /\b(?:pay(?:ment)?|transfer|delet(?:e|ed|ion)|remov(?:e|al)|authori[sz](?:e|ation)|grant permission|send(?:ing)? (?:a )?message|message sent)\b/i,
  /支付|付款|转账|汇款|删除|授权|发送消息|发消息|消息已发送/,
];

/**
 * Applies the common confirmation policy independently from provider-reported
 * risk. Providers may under-classify a destructive action, so semantic action
 * fields are checked as a second line of defence.
 */
export interface ActionPolicyContext {
  target?: Pick<ObservationElement, 'role' | 'text'>;
}

export const requiresUserConfirmation = (
  decision: ActionDecision,
  context: ActionPolicyContext = {},
): boolean => {
  if (decision.risk === 'high') {
    return true;
  }

  const policyText = [
    decision.subtaskId,
    decision.targetId,
    decision.text,
    decision.expectedState,
    context.target?.role,
    context.target?.text,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');

  return HIGH_RISK_PATTERNS.some(pattern => pattern.test(policyText));
};
