import { Bot } from '../Bot';
import { GuildNodeCreateOptions, GuildQueue, Player } from 'discord-player';
import { User, VoiceBasedChannel } from 'discord.js';
import { VoiceConnectionStatus, entersState } from 'discord-voip';
import { fileSearchOptions, registerExtractors, userSearchOptions } from './extractors';
import { playerErrors, tracksStarted } from './metrics';
import { registerNowPlaying } from './nowPlaying';

export class CustomPlayer extends Player {
	constructor(private bot: Bot) {
		super(bot.client);
	}

	//applied whenever a queue is created; Mirror stays in the channel when the queue ends
	public playOptions: GuildNodeCreateOptions = {
		leaveOnEnd: false,
		leaveOnEmpty: false,
		leaveOnStop: false,
		//a join that cannot finish should fail quickly so it can be tried again, rather than sitting
		//in a half joined state for the two minutes the player allows by default
		connectionTimeout: 20 * 1000,
	};

	//joining voice is the most fragile thing Mirror does. It opens a second connection, to one of
	//Discord's voice servers, and has to finish a handshake over it. A moment of bad network loses
	//that handshake, so the join is tried again rather than giving up on the first attempt.
	//
	//connect() comes back as soon as Discord has been asked to move the bot, long before the voice
	//server has answered, so waiting for the connection to be ready is what actually catches a
	//failed handshake. Without that wait the failure lands much later, while a song is starting,
	//where the player reports it as a broken queue and Mirror leaves the channel
	async joinVoice(
		queue: GuildQueue,
		channel: VoiceBasedChannel,
		attempts = 3,
		readyTimeout = 15 * 1000
	): Promise<void> {
		for (let attempt = 1; ; attempt++) {
			try {
				if (!queue.connection) await queue.connect(channel);
				await entersState(queue.connection!, VoiceConnectionStatus.Ready, readyTimeout);
				return;
			} catch (error) {
				if (attempt >= attempts) throw error;
				const reason = error instanceof Error ? error.message : String(error);
				this.bot.logger.warn(
					`[${queue.guild.name}] Could not join ${channel.name} (try ${attempt} of ${attempts}): ${reason}. Trying again`
				);
				//a half finished connection would be kept and reused as it is, so it goes first
				queue.dispatcher?.destroy();
				await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
			}
		}
	}

	//the extractors themselves are set up in extractors.ts
	async loadExtractors(): Promise<void> {
		//the player and extractors explain what they're doing through debug messages; listen before
		//they start up. download failures are logged as warnings by youtubeStream itself
		this.on('debug', (message) => {
			//errors come through this event too, despite the string signature
			const text =
				typeof message === 'string'
					? message
					: String((message as unknown as Error)?.message ?? message);
			this.bot.logger.debug(text);
		});
		this.on('error', (error) => this.bot.logger.error(error));
		await registerExtractors(this, this.bot);
	}

	//looks up a song name or link typed by a user (/play, /playnext, /intro)
	async searchFromUser(query: string, requestedBy: User) {
		return this.search(query, userSearchOptions(requestedBy));
	}

	//plays a sound file from disk (intro themes, the sound effect commands)
	async playFile(channel: VoiceBasedChannel, file: string) {
		//play() joins by itself if the queue isn't connected, with no second try when the handshake
		//fails, so the join happens here first where it is retried. play() then reuses it
		const queue = this.nodes.create(channel.guild, this.playOptions);
		await this.joinVoice(queue, channel);
		const result = await this.play(channel, file, {
			...fileSearchOptions(),
			nodeOptions: this.playOptions,
		});
		this.bot.logger.debug(
			`Playing ${file} in ${channel.name}: resolved as ${result.track.title}`
		);
		return result;
	}

	registerPlayerEvents() {
		//throw the queue away once Mirror is disconnected or left alone in the channel.
		//an empty queue is not a reason to leave: playOptions keeps Mirror sitting in the
		//channel after a song or sound effect finishes
		this.events.on('disconnect', (queue) => this.discardQueue(queue));
		this.events.on('emptyChannel', (queue) => this.discardQueue(queue));

		this.events.on('playerStart', (queue) => tracksStarted.inc({ guild: queue.guild.name }));

		this.events.on('error', (queue, error) => {
			playerErrors.inc({ kind: 'queue' });
			this.discardQueue(queue);
			this.bot.logger.error(
				`[${queue.guild.name}] Error emitted from the queue: ${error.message}`
			);
		});

		//the player moves on to the next song by itself after a song fails, so skipping here as well
		//would skip a second song. only a failed song that is somehow still playing gets skipped
		this.events.on('playerError', (queue, error, track) => {
			playerErrors.inc({ kind: 'track' });
			if (queue.currentTrack === track && queue.node.isPlaying()) queue.node.skip();
			this.bot.logger.error(
				`[${queue.guild.name}] Error emitted from the player: ${error.message}`
			);
		});

		registerNowPlaying(this.bot);
	}

	private discardQueue(queue: GuildQueue) {
		if (!queue.deleted) queue.delete();
	}
}
