### Task 4: Errand and Activity Facades

**Mode:** Wave 1 worker C；可与 Task 2、Task 3 并行；只新增列出的文件。

**Files:**

- Create: `AwesomeProject/src/application/facades/ErrandFacade.ts`
- Create: `AwesomeProject/src/application/facades/ActivityFacade.ts`
- Test: `AwesomeProject/src/__tests__/application/facades/ErrandActivityFacades.test.ts`

**Interfaces:**

- Consumes: Task 1 已冻结的 `ErrandApplicationPort`、`ActivityApplicationPort`；这些 ports 已把 PreferenceRepository、ErrandRepository、TaskRepository 分离。
- Produces: `DefaultErrandFacade`、`DefaultActivityFacade`；禁止重新创建 `MemoryItem[]` compatibility store。

- [ ] **Step 1: Write RED tests for repository separation and refresh-after-command**

```ts
import {DefaultErrandFacade} from '../../../application/facades/ErrandFacade';
import {DefaultActivityFacade} from '../../../application/facades/ActivityFacade';

describe('errand and activity facades', () => {
  it('creates only after an explicit errand proposal is confirmed by the caller', async () => {
    const port = {read: jest.fn(), setEnabled: jest.fn(), create: jest.fn().mockResolvedValue('errand-1'), update: jest.fn(), cancel: jest.fn()};
    const facade = new DefaultErrandFacade(port);
    await expect(facade.createFromProposal({kind: 'errand', title: '交周报', errandType: 'schedule', when: '周五 18:00'})).resolves.toBe('errand-1');
    expect(port.create).toHaveBeenCalledTimes(1);
  });

  it('reloads the three-source activity projection after forgetting a preference', async () => {
    const state = {status: 'ready' as const, memoryEnabled: true, memoryLocationLabel: '仅这台手机', preferences: [], errands: [], tasks: []};
    const port = {read: jest.fn().mockResolvedValue(state), forgetPreference: jest.fn().mockResolvedValue(state), deleteTask: jest.fn()};
    const facade = new DefaultActivityFacade(port);
    await expect(facade.forgetPreference('pref-1')).resolves.toEqual(state);
    expect(port.forgetPreference).toHaveBeenCalledWith('pref-1');
  });
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/ErrandActivityFacades.test.ts --runInBand
```

Expected: FAIL with missing production modules.

- [ ] **Step 3: Implement thin validation/delegation**

`createFromProposal` 必须拒绝空 title；schedule 必须有非空 `when`；once 把 `when` 归一为 absent。`update` 只接受 `pending` 或 `failed` 项，leased/terminal 返回固定 `errand_not_editable`。`ActivityFacade` 只委托聚合 port，不按 modelId 隐式过滤任务。

- [ ] **Step 4: Verify green and ownership**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/ErrandActivityFacades.test.ts --runInBand
npx tsc --noEmit --pretty false
if rg -n "MemoryItem|NonoConfigService|AsyncStorage|react-native" src/application/facades/ErrandFacade.ts src/application/facades/ActivityFacade.ts; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: Jest/TypeScript PASS；`rg` 无输出。

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/application/facades/ErrandFacade.ts \
  AwesomeProject/src/application/facades/ActivityFacade.ts \
  AwesomeProject/src/__tests__/application/facades/ErrandActivityFacades.test.ts
git commit -m "feat: project errands and activity through facades"
```

---

