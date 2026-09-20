//Call: Slash command birthday
//Saves the day and month someone was born, so Mirror can wish them a happy birthday.
//Run on its own it opens a small form to type a date into; the month and day can also be
//picked as options for anyone who prefers that
import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	CacheType,
	ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	ModalBuilder,
	ModalSubmitInteraction,
	TextInputBuilder,
	TextInputStyle,
} from 'discord.js';
import Enmap from 'enmap';
import { Bot } from '../Bot';
import { colorCheck } from '../resources/embedColorCheck';
import {
	longDate,
	months,
	monthNumber,
	parseBirthdayInput,
} from '../resources/birthdayDates';
import { Option } from './Option';
import { silencedUsers } from './SilenceMember';
import { SlashCommand } from './SlashCommand';

export let bdayDates = new Enmap({ name: 'bdayDates' });

//the form that opens when someone runs /birthday without picking a date
export const birthdayModal = 'birthday:set';
const dateField = 'date';

export class Birthday implements SlashCommand {
	name: string = 'birthday';
	description =
		'Set your birthday to recieve a special message on your birthday!';
	options = [
		new Option(
			'month',
			'Your Birth Month',
			ApplicationCommandOptionType.String,
			false,
			'may',
			months.map((month) => ({ name: month, value: month.toLowerCase() }))
		),
		new Option(
			'day',
			'The date of your birthday',
			ApplicationCommandOptionType.Integer,
			false
		),
	];
	requiredPermissions: bigint[] = [];
	//birthdays are saved for everywhere at once, but the command reads the server's silenced
	//members and color, so it belongs in a server rather than a direct message
	guildRequired?: boolean | undefined = true;
	async run(
		bot: Bot,
		interaction: ChatInputCommandInteraction<CacheType>
	): Promise<void> {
		try {
			let userArray = silencedUsers.ensure(interaction.guild!.id, []);
			if (userArray.includes(interaction.user.id)) {
				return void interaction.reply({
					content: 'Silenced users cannot use this command',
					flags: MessageFlags.Ephemeral,
				});
			}

			const month = interaction.options.getString('month');
			const day = interaction.options.getInteger('day');

			//both options given: save it straight away, the way this command always worked
			if (month && day !== null) {
				const parsed = parseBirthdayInput(`${month} ${day}`);
				if ('problem' in parsed) {
					return void interaction.reply({
						content: parsed.problem,
						flags: MessageFlags.Ephemeral,
					});
				}
				return void (await save(bot, interaction, parsed.month, parsed.day));
			}

			//otherwise ask for the date in a form, filling in whichever half was given
			const typed = [month ? months[monthNumber(month)! - 1] : '', day ?? '']
				.join(' ')
				.trim();
			const field = new TextInputBuilder()
				.setCustomId(dateField)
				.setLabel('When is your birthday?')
				.setPlaceholder('March 4, Mar 4 or 3/4')
				.setStyle(TextInputStyle.Short)
				.setMaxLength(30)
				.setRequired(true);
			if (typed) field.setValue(typed);

			await interaction.showModal(
				new ModalBuilder()
					.setCustomId(birthdayModal)
					.setTitle('Your birthday')
					.addComponents(
						new ActionRowBuilder<TextInputBuilder>().addComponents(field)
					)
			);
		} catch (err) {
			bot.logger.commandError(interaction.channel!.id, this.name, err);
			if (interaction.replied || interaction.deferred) return;
			interaction.reply({
				content: 'Error: contact a developer to investigate',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
	}
}

//the date someone typed into the form
export async function handleBirthdayModal(
	bot: Bot,
	interaction: ModalSubmitInteraction
): Promise<void> {
	const typed = interaction.fields.getTextInputValue(dateField);
	const parsed = parseBirthdayInput(typed);
	if ('problem' in parsed) {
		return void interaction.reply({
			content: `${parsed.problem}`,
			flags: MessageFlags.Ephemeral,
		});
	}
	await save(bot, interaction, parsed.month, parsed.day);
}

async function save(
	bot: Bot,
	interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
	month: number,
	day: number
): Promise<void> {
	//store the date of birth in numerical form  DD-MM
	bdayDates.set(interaction.user.id, `${day}-${month}`);
	const embed = new EmbedBuilder()
		.setDescription(
			`Successfully set your birthday to: ${longDate({
				memberId: interaction.user.id,
				month,
				day,
			})}`
		)
		.setColor(colorCheck(interaction.guild!.id));
	await interaction.reply({ embeds: [embed] });
}
