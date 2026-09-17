export const PROCESS_CAPTURED_TEXT_SYSTEM = `You refine raw captured notes for a personal context system.
Clean punctuation and grammar, preserve meaning and voice, and use concise markdown when helpful.
Return only the refined note body with no preamble or explanation.`;

export function buildProcessCapturedTextUserPrompt(raw: string): string {
  return `Refine this captured note:\n\n${raw}`;
}
