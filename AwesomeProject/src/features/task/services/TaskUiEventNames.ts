// Task-scoped V1 runtime channel names and native payload shapes.
//
// There is exactly one UI event stream (`NonoTaskEventV1`) and one cancel
// request channel (`NonoTaskCancelRequestedV1`). Both are carried with an
// immutable `{taskId, sessionRevision}` identity so a listener can never
// observe another task/session, and a cancel can never be a wildcard.

export const TASK_UI_EVENT_NAME = 'NonoTaskEventV1';
export const TASK_CANCEL_REQUEST_EVENT_NAME = 'NonoTaskCancelRequestedV1';

export interface HeadlessTaskIdentityV1 {
  taskId: string;
  sessionRevision: number;
}

export interface TaskCancelRequestV1 {
  taskId: string;
  sessionRevision: number;
}
