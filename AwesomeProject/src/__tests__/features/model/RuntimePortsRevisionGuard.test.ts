import {
  RuntimeModelConfigPort,
  RuntimePhoneOperatePort,
} from '../../../application/facades/createAppFacades';
import type {ModelConfigSaveInput} from '../../../application/facades/UiRuntimeContracts';
import type {RuntimeConfigRepository} from '../../../core/engine/operateRuntime/contracts/RuntimeConfigContracts';

function repoAtRevision(revision: number): RuntimeConfigRepository {
  return {
    load: jest.fn(async () => ({schemaVersion: 1, revision, active: {}})),
    putProfile: jest.fn(),
    putBinding: jest.fn(),
    compareAndActivate: jest.fn(),
    removeProfile: jest.fn(),
  } as unknown as RuntimeConfigRepository;
}

describe('runtime config revision guards', () => {
  it('PhoneOperatePort.activate rejects a stale expectedRevision without writing', async () => {
    const repo = repoAtRevision(5);
    const port = new RuntimePhoneOperatePort(repo, {} as never);

    await expect(port.activate('cloud_direct', 4)).rejects.toMatchObject({
      code: 'runtime_config_conflict',
    });
    expect(repo.load).toHaveBeenCalledTimes(1);
  });

  it('ModelConfigPort.save rejects a stale expectedRevision without writing', async () => {
    const repo = repoAtRevision(5);
    const port = new RuntimeModelConfigPort(repo, {} as never, {} as never);
    const input: ModelConfigSaveInput = {
      list: 'unified',
      selectedModelId: 'gpt-4o',
      credential: {action: 'keep'},
      expectedRevision: 4,
      mode: 'preset',
      presetId: 'openai',
      baseUrlOverride: null,
    };

    await expect(port.save(input)).rejects.toMatchObject({
      code: 'runtime_config_conflict',
    });
    expect(repo.putProfile).not.toHaveBeenCalled();
    expect(repo.putBinding).not.toHaveBeenCalled();
    expect(repo.compareAndActivate).not.toHaveBeenCalled();
  });
});
