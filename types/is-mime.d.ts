declare module "is-mime" {
  import type { PassThrough } from "stream"
  export function checkStream(mimes: string[]): PassThrough
}
