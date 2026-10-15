import {
  assertVisualAgentImageConsent,
  projectCompanionRequest,
} from '@core/engine/capabilities/shared/CapabilityPrivacy';

describe('Capability privacy projection', () => {
  it('requires enabled profile, image capability, and per-task consent', () => {
    expect(() =>
      assertVisualAgentImageConsent({
        profileEnabled: true,
        imageInputNegotiated: false,
        sharingConfirmed: true,
      }),
    ).toThrow('visual_agent_capability_unsupported');
    expect(() =>
      assertVisualAgentImageConsent({
        profileEnabled: true,
        imageInputNegotiated: true,
        sharingConfirmed: false,
      }),
    ).toThrow('privacy_blocked');
  });

  it('projects no image, credential, or action history into Companion', () => {
    const safe = projectCompanionRequest({
      conversationId: 'c1',
      text: '附近的咖啡店',
      recentReplies: ['你好'],
      confirmedPreferenceSummaries: ['少糖'],
      untrusted: {imageBase64: 'raw', secretRef: 'ref', actionHistory: ['tap']},
    });
    expect(safe).toEqual({
      conversationId: 'c1',
      text: '附近的咖啡店',
      recentReplies: ['你好'],
      confirmedPreferenceSummaries: ['少糖'],
    });
    expect(JSON.stringify(safe)).not.toMatch(/image|secretRef|actionHistory/i);
  });
});
