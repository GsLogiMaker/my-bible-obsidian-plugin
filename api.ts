
import { DEFAULT_NAME_MAP, getPlugin, is_alpha, is_alphanumeric, is_numeric } from "main";

export module mb {
	export type BookID = number
	export type ChapterID = number
	export type VerseID = number
	export type TranslationID = string
	class ReferenceError extends Error {
		constructor(message?:string) {
			super(message)
			this.name = "Scripture Reference Error"
		}
	}

	/** A reference to a scripture verse or verses
	 * @example
	 * ```ts
	 * new Reference("Genesis", 1, 1)
	 * ```
	 */
	export class Reference {
		book: BookID
		chapter: ChapterID
		verseStart?: VerseID
		verseEnd?: VerseID
		translation?: TranslationID

		constructor(
			book:BookID|string,
			chapter:ChapterID,
			verseStart?:VerseID,
			verseEnd?:VerseID,
			translation?:TranslationID,
		) {
			if (typeof(book) === "string") {
				this.book = DEFAULT_NAME_MAP[book]
					?? getPlugin()
						.bible_api
						.book_id(book, translation ?? "YLT")
			} else {
				this.book = book
			}
			this.chapter = chapter
			this.verseStart = verseStart
			this.verseEnd = verseEnd
			this.translation = translation
		}
		
		/** Constructs a new {@link Reference} from text.
		 * @example
		 * ```ts
		 * let ref = Reference.fromString("Genesis 1:1")
		 * ```
		 * @throws {@link ReferenceError} if ending verse is before starting verse.
		 * @throws {@link ReferenceError} if the book name does not exist in the current translation (See {Reference.getTranslation}.)
		 */
		static fromString(text:string):Reference {
			const ref = text.trim().replace(/[:-]/g, " ").split(" ")

			let book:string|undefined = undefined
			let book_id = undefined
			let chapter = undefined
			let verse = undefined
			let verse_end = undefined
			let maybe_translation:string|undefined = undefined
			let i = 0

			while (i != ref.length) {
				// Compose book name
				if (i == 0) {
					// Always add first item, no matter what it is
					book = (book || "") + ref[i];
				} else {
					// Only add items that are words, and not numbers
					if (!is_alpha(ref[i])) {
						break;
					}
					book += " " + ref[i]
				}

				i += 1;
			}
			if (is_numeric(book || "")) {
				// Compose book_id
				book_id = Number(book)
			}

			if (i != ref.length && is_numeric(ref[i])) {
				// Compose chapter
				chapter = Number(ref[i]);
				i += 1;
			} else {
				chapter = 0
			}

			if (i != ref.length && is_numeric(ref[i])) {
				// Compose verse
				verse = Number(ref[i]);
				i += 1;
			}

			if (i != ref.length && is_numeric(ref[i])) {
				// Compose range
				verse_end = Number(ref[i]);
				i += 1;
			}

			if (i != ref.length && is_alphanumeric(ref[i])) {
				// Compose translation
				maybe_translation = ref[i];
				i += 1;
			}

			if (book_id === undefined && book !== undefined) {
				book_id = DEFAULT_NAME_MAP[book]
					?? getPlugin()
						.bible_api
						.book_id(book, maybe_translation ?? "YLT")
			}

			// Errors
			if (verse !== undefined && verse_end !== undefined) {
				if ((verse_end ?? 0) < (verse ?? 0)) {
					throw new ReferenceError(
						"End of verse range must be after beginning"
					)
				}
			}
			if (book_id === undefined) {
				throw new ReferenceError(
					"Invalid book name `{0}`".format(book??"")
				)
			}

			return new Reference(
				book_id,
				chapter,
				verse,
				verse_end,
				maybe_translation,
			)
		}

		async getBookName():Promise<string> {
			let bookData = await getPlugin()
				.bible_api
				.get_book_data(this.getTranslation(), this.book)
			return bookData.name
		}

		getTranslation():TranslationID {
			return this.translation ?? getPlugin().settings.translation
		}

		setBook(book:BookID):Reference {
			this.book = book
			return this
		}

		setVerseRange(start?:VerseID, end?:VerseID):Reference {
			this.verseStart = start
			this.verseEnd = end
			return this
		}
		
		setTranslation(translation?:TranslationID):Reference {
			this.translation = translation
			return this
		}

		async text(
			withVerseNumbers?:boolean,
			separator?:string,
		):Promise<string> {
			return await scripture(
				this,
				withVerseNumbers,
				separator,
			)
		}

		async toString():Promise<string> {
			let text = await this.getBookName() + " " + this.chapter
			if (this.verseStart !== undefined) {
				text += ":" + String(this.verseStart)
			}
			if (this.verseEnd !== undefined && this.verseEnd != this.verseStart) {
				text += "-" + String(this.verseEnd)
			}
			if (this.translation !== undefined) {
				text += " " + String(this.translation)
			}
			return text
		}
	}
	
	/** Returns a random verse {@link Reference} from a pool */
	export async function randRef(seed?:string|number):Promise<Reference> {
		let verse = await getPlugin()
			.bible_api
			.pick_random_verse(String(seed))
		return Reference.fromString(verse)
	}

	export function ref(reference:string):Reference {
		return Reference.fromString(reference)
	}

	/// Returns the text of a bible verse
	export async function scripture(
		ref:Reference|string,
		withVerseNumbers?:boolean,
		separator?:string,
	):Promise<string> {
		withVerseNumbers = withVerseNumbers ?? false
		separator = separator ?? " "
		if (!(ref instanceof Reference)) {
			ref = Reference.fromString(ref)
		}
		let version = ref.translation ?? getPlugin().settings.translation

		let translation = ref.translation
			?? getPlugin().settings.reading_translation

		let bookName = (
			await getPlugin().bible_api.get_book_data(translation, ref.book)
		).name
	
		let text = "";
		if (bookName.length === 0) {
			text = "\n> [!ERROR] Book and chapter must be provided\n"
		} else if (ref.verseStart === undefined || ref.verseStart <= 0) {
			// Whole chapter
			let verses = await getPlugin().bible_api.get_chapter(
				translation,
				ref.book,
				ref.chapter,
			);
			for (const verse_i_ of Object.keys(verses)) {
				const verse_i = Number(verse_i_)
				let verse = verses[verse_i];
				text += "<sup>" + (verse_i) + "</sup> " + verse;
				if (verse_i != Object.keys(verses).length+1) {
					text += " ";
					// text += "<br>";
				}
			}
			if (text.length === 0) {
				text = "\n> [!WARNING] No text found for {0} in translation {2}\n"
					.format(String(ref), translation)
			}
		} else if (ref.verseEnd === undefined || ref.verseEnd < ref.verseStart) {
			// Single verse
			text = await getPlugin().bible_api.get_verse(
				translation,
				ref.book,
				ref.chapter,
				ref.verseStart,
			)
			if (text.length === 0) {
				text = "\n> [!WARNING] No text found for {1} {0}:{2} in translation {3}\n"
					.format(
						String(ref.chapter),
						bookName,
						String(ref.verseStart),
						translation,
					)
			}
		} else {
			// Verse range
			let verses = await getPlugin().bible_api.get_chapter(
				translation,
				ref.book,
				ref.chapter,
			);
			let j = ref.verseStart;
			while (j < ref.verseEnd + 1 && j < Object.keys(verses).length) {
				if (withVerseNumbers) {
					text += "<sup>" + j + "</sup> " + verses[j];
					if (j != ref.verseEnd) {
						text += separator
					}
				} else {
					text += verses[j] + separator
				}
				j += 1;
			}
			if (text.length === 0) {
				text = "\n> [!WARNING] No text found for {1} {0}:{2}-{3} in translation {4}\n"
					.format(
						String(ref.chapter),
						bookName,
						String(ref.verseStart),
						String(ref.verseEnd),
						translation,
					)
			}
		}

		return getPlugin().bible_api.parse_html(text)
	}

}