/**
 * 관리 화면이 저장소에 묻고 저장하는 길. 계약 문서는 관리 서버 저장소
 * (hs-sai-lab/Signal-Augmented-Intelligence-sai-lab-admin)의 docs/ 아래 *-api-contract.md, files-and-publish.md, apps-script-transition-contract.md입니다. 관리 화면은 Apps Script 웹 앱 안에서만 돌고,
 * 요청은 모두 google.script.run으로 보냅니다(lib/appsScript.ts). 이 파일은 화면이 쓰는 모양만 정합니다.
 * - 성공은 `{ data, publish? }`, 실패는 `{ error: { code, message, fields? } }`를 ApiError로 바꿉니다.
 * - 로그인이 풀리면(UNAUTHENTICATED) setUnauthenticatedHandler로 넘긴 함수를 부르고 ApiError를 던집니다.
 *   화면은 이 오류를 팝업으로 띄우지 않습니다(signedOut). 그 자리에 Google 계정 안내가 나옵니다.
 */

import * as appsScript from './appsScript';

export type ErrorCode =
  | 'VALIDATION_FAILED' | 'UNAUTHENTICATED' | 'NOT_FOUND' | 'CONFLICT'
  | 'FILE_TOO_LARGE' | 'UNSUPPORTED_FILE' | 'STORAGE_UNAVAILABLE' | 'INTERNAL'
  | 'NETWORK' | 'FILE_FAILED'
  | 'FORBIDDEN' | 'BUSY' | 'PENDING' | 'NOT_SUPPORTED';
// NETWORK: 저장소에 닿지 않음. FILE_FAILED: 파일 처리 결과가 failed (files-and-publish.md). 둘 다 화면에서만 쓰는 코드입니다.
// FORBIDDEN·BUSY·PENDING·NOT_SUPPORTED: Apps Script 연결이 돌려주는 코드입니다 (lib/appsScript.ts).

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** 저장 응답에 붙는 공개 반영 정보 (files-and-publish.md). */
export type Publish = { id: string; state: 'queued' | 'running' | 'done' | 'failed'; message?: string | null };
export type Result<T> = { data: T; publish?: Publish };

let onUnauthenticated: () => void = () => {};
/** 로그인이 풀린 응답(UNAUTHENTICATED)을 받으면 부를 함수. Session이 넣습니다. */
export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler;
}

/** 로그인이 풀려서 난 오류인지. 이때는 오류 팝업 대신 Google 계정 안내가 나오므로 화면은 아무것도 하지 않습니다. */
export const signedOut = (err: unknown) => err instanceof ApiError && err.code === 'UNAUTHENTICATED';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<Result<T>> {
  try {
    return await appsScript.request(method, path, body) as Result<T>;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') onUnauthenticated();
    throw err;
  }
}

/** 파일 하나 올리기 (files-and-publish.md). onProgress에는 0~100을 넘깁니다. */
function upload<T>(_path: string, form: FormData, onProgress?: (percent: number) => void): Promise<Result<T>> {
  return appsScript.upload(form, onProgress) as Promise<Result<T>>;
}

export const api = {
  upload,
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};
