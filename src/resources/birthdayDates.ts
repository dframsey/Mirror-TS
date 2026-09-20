//birthdays are saved for each person as "D-M", with no year. everything that shows one reads it
//through here, so /birthdaylist and the right-click menu agree on dates and wording
import { bdayDates } from '../slashcommands/Birthday';

export const months = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

export type Birthday = { memberId: string; month: number; day: number };

//how many days a month has, counting Feb 29, which people born on it still want to save.
//2024 is a leap year, and day 0 of the next month is the last day of this one
export const daysInMonth = (month: number) => new Date(2024, month, 0).getDate();

//the month a word means, from three letters up: "mar", "march", "MARCH"
export function monthNumber(word: string): number | undefined {
	if (word.length < 3) return undefined;
	const found = months.findIndex((name) => name.toLowerCase().startsWith(word.toLowerCase()));
	return found === -1 ? undefined : found + 1;
}

export type ParsedBirthday = { month: number; day: number } | { problem: string };

//reads a birthday the way someone would write it: "March 4", "mar 4", "4 March", "3/4", "3-4".
//a year is ignored, since Mirror only keeps the day and month
export function parseBirthdayInput(input: string): ParsedBirthday {
	const cleaned = input
		.toLowerCase()
		.replace(/\b(19|20)\d{2}\b/g, ' ') //a year of birth, which isn't saved
		.replace(/(\d+)(st|nd|rd|th)\b/g, '$1') //1st, 2nd, 3rd, 4th
		.replace(/\bof\b/g, ' ')
		.replace(/[,./\\-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	const numbers: number[] = [];
	let named: number | undefined;
	for (const word of cleaned ? cleaned.split(' ') : []) {
		if (/^\d+$/.test(word)) {
			numbers.push(Number(word));
			continue;
		}
		const month = monthNumber(word);
		if (month === undefined || named) return { problem: unreadable(input) };
		named = month;
	}

	let month: number;
	let day: number;
	if (named && numbers.length === 1) {
		month = named;
		day = numbers[0];
	} else if (!named && numbers.length === 2) {
		//a day written first, as much of the world does, is taken as written: 25 12 is December 25
		const [first, second] = numbers;
		const dayFirst = first > 12 && second <= 12;
		month = dayFirst ? second : first;
		day = dayFirst ? first : second;
	} else {
		return { problem: unreadable(input) };
	}

	if (month < 1 || month > 12) return { problem: `There is no month number ${month}.` };
	const cap = daysInMonth(month);
	if (day < 1 || day > cap) {
		return { problem: `${months[month - 1]} only has ${cap} days, so ${day} isn't a date.` };
	}
	return { month, day };
}

const unreadable = (input: string) =>
	`I couldn't read "${input.slice(0, 40)}" as a date. Try **March 4**, **Mar 4** or **3/4**.`;

//the birthday someone saved, or nothing when they never set one or it was stored in an odd shape
export function savedBirthday(memberId: string): Birthday | undefined {
	const saved = bdayDates.get(memberId);
	if (typeof saved !== 'string') return undefined;
	const [day, month] = saved.split('-').map(Number);
	if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return undefined;
	return { memberId, month, day };
}

export function startOfToday(): Date {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

//the next date this birthday falls on, today included. Feb 29 falls back to Feb 28 in other years
export function nextDate(month: number, day: number, today: Date): Date {
	for (let year = today.getFullYear(); ; year++) {
		let date = new Date(year, month - 1, day);
		if (date.getMonth() !== month - 1) date = new Date(year, month, 0);
		if (date >= today) return date;
	}
}

//everyone whose birthday is the soonest one coming up
export function nextBirthdays(birthdays: Birthday[]): Birthday[] {
	const today = startOfToday();
	let soonest = Infinity;
	let found: Birthday[] = [];
	for (const birthday of birthdays) {
		const time = nextDate(birthday.month, birthday.day, today).getTime();
		if (time < soonest) {
			soonest = time;
			found = [birthday];
		} else if (time === soonest) {
			found.push(birthday);
		}
	}
	return found;
}

export function daysAway(birthday: Birthday): string {
	const today = startOfToday();
	const days = Math.round(
		(nextDate(birthday.month, birthday.day, today).getTime() - today.getTime()) / 86400000
	);
	if (days === 0) return 'today 🎉';
	if (days === 1) return 'tomorrow';
	return `in ${days} days`;
}

//"Mar 04", for lists where the dates line up under each other
export const shortDate = (birthday: Birthday) =>
	`${months[birthday.month - 1].slice(0, 3)} ${String(birthday.day).padStart(2, '0')}`;

//"March 4", for a sentence
export const longDate = (birthday: Birthday) => `${months[birthday.month - 1]} ${birthday.day}`;
