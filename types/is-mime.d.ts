declare module "is-mime" {
  import { PassThrough } from "stream"
  export function checkStream(mimes: string[]): PassThrough
}
