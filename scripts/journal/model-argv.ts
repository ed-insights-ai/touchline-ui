// The model command's arguments, kept apart from cli.ts (which runs on import)
// so a test can hold them: the prompt goes on stdin under `-p`, and a chosen
// model is passed through as the command's own `--model`, verbatim.

/** The argv the journal hands its model command (`claude` by default). */
export function modelArgv(model?: string): string[] {
  const m = model?.trim();
  return ["-p", ...(m ? ["--model", m] : [])];
}
