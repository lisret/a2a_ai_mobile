import type {ActivityApplicationPort, ActivityFacade, ActivityViewState} from './UiRuntimeContracts';

export class DefaultActivityFacade implements ActivityFacade {
  constructor(private readonly port: ActivityApplicationPort) {}

  getViewState(): Promise<ActivityViewState> {
    return this.port.read();
  }

  forgetPreference(id: string): Promise<ActivityViewState> {
    return this.port.forgetPreference(id);
  }

  deleteTask(id: string): Promise<ActivityViewState> {
    return this.port.deleteTask(id);
  }
}
