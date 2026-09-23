import { Player, QueryType, SearchOptions } from 'discord-player';
import { User } from 'discord.js';
import { AttachmentExtractor, DefaultExtractors } from '@discord-player/extractor';
import { YoutubeExtractor } from 'discord-player-youtubei';
import config from '../../config.json';
import { Bot } from '../Bot';
import { youtubeStream } from './youtubeStream';

//these settings are optional and absent from most config.json files, so they are read defensively
function configValue(key: string): string | undefined {
	const value = (config as Record<string, unknown>)[key];
	return typeof value === 'string' && value.length ? value : undefined;
}

//discord-player 7 ships without YouTube support, so the youtubei extractor provides it.
//audio comes from youtubeStream: yt-dlp first, since YouTube serves it most reliably, then the
//extractor's other methods, falling back only when one really fails. the optional cookies in
//config.json help when YouTube asks for a sign in
export async function registerExtractors(player: Player, bot: Bot): Promise<void> {
	await player.extractors.register(YoutubeExtractor, {
		createStream: youtubeStream(bot, configValue('youtube_cookie_file')),
		cookie: configValue('youtube_cookie'),
	});
	await player.extractors.loadMulti(DefaultExtractors);
	bot.logger.info('Loaded music extractors');
}

//looks up a song name or link typed by a user (/play, /playnext, /intro).
//links from YouTube, Spotify, SoundCloud and the like go through their own extractors, but any
//other link would be downloaded by the attachment extractor straight from wherever it points.
//that would let anyone who can use the bot see the host's IP address, or make it send requests to
//devices on the host's own network, so that extractor is left out of anything a user types
export function userSearchOptions(requestedBy: User): SearchOptions {
	return {
		requestedBy,
		searchEngine: QueryType.AUTO,
		blockExtractors: [AttachmentExtractor.identifier],
	};
}

//plays a sound file from disk (intro themes, the sound effect commands).
//the youtube extractor answers file queries too and wins on priority, so it sits this one out
export function fileSearchOptions(): SearchOptions {
	return {
		searchEngine: QueryType.FILE,
		blockExtractors: [YoutubeExtractor.identifier],
	};
}
