import { Player, Track } from 'discord-player';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import ffmpegPath from 'ffmpeg-static';

//downloads a resolved track to disk. /intro uses this so the sound is on hand and plays
//the moment someone joins, rather than being fetched from YouTube at that point.
//pass seconds to keep only the beginning of the track
export async function downloadTrack(
	player: Player,
	track: Track,
	destination: string,
	seconds?: number
): Promise<void> {
	const source = await trackStream(player, track);
	if (!seconds) {
		await pipeline(source, createWriteStream(destination));
		return;
	}

	//ffmpeg reads the download on stdin and stops once it has the seconds we asked for.
	//faststart puts the mp4 index at the front of the file: playback streams the file through
	//a pipe, which cannot seek to the end for an index, and such a file plays as silence
	const ffmpeg = spawn(
		ffmpegPath as unknown as string,
		[
			'-y',
			'-i',
			'pipe:0',
			'-t',
			String(seconds),
			'-vn',
			'-c:a',
			'aac',
			'-b:a',
			'128k',
			'-movflags',
			'+faststart',
			destination,
		],
		{ stdio: ['pipe', 'ignore', 'pipe'] }
	);
	let details = '';
	ffmpeg.stderr.on('data', (chunk) => (details += chunk.toString()));
	//ffmpeg closing its input first is expected, so neither side should throw
	source.on('error', () => ffmpeg.stdin.destroy());
	ffmpeg.stdin.on('error', () => source.destroy());
	source.pipe(ffmpeg.stdin);

	await new Promise<void>((resolve, reject) => {
		ffmpeg.on('error', reject);
		ffmpeg.on('close', (code) => {
			source.destroy();
			if (code === 0) return resolve();
			reject(new Error(`ffmpeg exited with ${code}: ${details.slice(-400)}`));
		});
	});
}

//the extractor hands back a stream, or a url to fetch one from
async function trackStream(player: Player, track: Track): Promise<Readable> {
	const extractor = player.extractors.get(YoutubeExtractor.identifier);
	if (!extractor) throw new Error('the youtube extractor is not loaded');

	const streamable = await extractor.stream(track);
	if (typeof streamable === 'string') {
		const response = await fetch(streamable);
		return Readable.fromWeb(response.body as any);
	}
	if (streamable instanceof Readable) return streamable;
	return (streamable as any).stream;
}
