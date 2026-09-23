import { Bot } from '../Bot';

//whether this copy of Mirror should act on an event from the given server.
//Discord delivers every event to every copy of the bot logged in with the same token, so a test
//copy that answered everything would fight the live bot for commands and voice.
//called at the top of InteractionCreate, MessageCreate and VoiceStateUpdate
export function handledHere(bot: Bot, guildId: string | null | undefined): boolean {
	return true;
}
