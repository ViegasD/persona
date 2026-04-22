import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('video-prompt-engine');

export interface VideoPromptParams {
  /** The character speaking (used as a speaker tag in the prompt). */
  characterName: string;
  /** Optional personality / style hint. */
  characterPersonality?: string;
  /** The actual lines/dialogue the character speaks. This is the core of the prompt. */
  script: string;
}

export interface PerVideoPromptInput {
  characterName: string;
  characterPersonality?: string;
  script: string;
}

/**
 * Build a Veo video prompt that is essentially the dialogue script the
 * character speaks. Veo 3.x produces best results when the prompt contains
 * a generous, natural script â€” even when the actual rendered video is only
 * 6-8 seconds, longer prompts give the model better context for tone, pacing
 * and lip-sync, and the rendered output looks much more natural than when
 * the script is artificially trimmed to fit.
 *
 * The reference character image is supplied separately (as the image-to-video
 * starting frame), so we don't describe the character visually here.
 */
export function buildVideoPrompt(params: VideoPromptParams): string {
  const speakerTag = params.characterPersonality
    ? `${params.characterName} (${params.characterPersonality})`
    : params.characterName;

  const script = params.script.trim();
  const prompt = `${speakerTag} speaks the following lines naturally, with matching facial expressions and lip-sync:\n\n"${script}"`;

  log.debug(
    { character: params.characterName, scriptLength: script.length, promptLength: prompt.length },
    'Video prompt built',
  );
  return prompt;
}

/**
 * Build per-video prompts when the user has chosen a different character
 * and/or script for each video in their package.
 */
export function buildVideoPromptVariations(videos: PerVideoPromptInput[]): string[] {
  return videos.map((v) => buildVideoPrompt(v));
}
