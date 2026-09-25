/**
 * Every server action resolves to one of these — actions never throw at the
 * client, so a network hiccup or a policy rejection always has a sentence the
 * UI can show next to the button the user pressed.
 */
export type ActionFailure = { ok: false; error: string; fieldErrors?: Record<string, string[]> };
export type ActionResult<T = undefined> = { ok: true; data: T } | ActionFailure;

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function okVoid(): ActionResult<undefined> {
  return { ok: true, data: undefined };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionFailure {
  return { ok: false, error, fieldErrors };
}

