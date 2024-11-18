
import { 
	BOOK_ID_TO_NAME,
	DEFAULT_NAME_MAP,
	getPlugin,
	is_alpha,
	is_alphanumeric,
	is_numeric,
} from "main";

export module mb {
	export type BookID = number
	export type ChapterID = number
	export type VerseID = number
	export type TranslationID = string

	/** An error when constructing a {@link Reference} */
	export class ReferenceError extends Error {
		constructor(message?:string) {
			super(message)
			this.name = "Scripture Reference Error"
		}
	}

	/** A reference to a scripture chapter, verse, or verses
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
			this.setTranslation(translation) // translation must be set before book
			this.setBook(book)
			this.chapter = chapter
			this.verseStart = verseStart
			this.verseEnd = verseEnd
		}
		
		/** Constructs a new {@link Reference} from text.
		 * @example
		 * ```ts
		 * let ref = Reference.fromString("Genesis 1:1")
		 * ```
		 * @throws
		 * - {@link ReferenceError} if no book is supplied or if no chapter is
		 * supplied.
		 * - {@link ReferenceError} if ending verse is before starting verse.
		 * - {@link ReferenceError} if the book name does not exist in
		 * the current translation (See {@link Reference.getTranslation}.)
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

			if (book === undefined) {
				throw new ReferenceError(
					"Book must be defined"
				)
			}

			if (is_numeric(book || "")) {
				// Compose book_id
				book_id = Number(book)
			}

			if (i != ref.length && is_numeric(ref[i])) {
				// Compose chapter
				chapter = Number(ref[i]);
				i += 1;
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
			if (chapter === undefined) {
				throw new ReferenceError(
					"Chapter must be supplied",
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

		/** Returns the English name of the book being referenced.
		 * @example
		 * ```ts
		 * let ref = new Reference("Malachi", 4)
		 * ref.getBookName() === "Malachi"
		 * ```
		 */
		async getBookName():Promise<string> {
			return BOOK_ID_TO_NAME[this.book]
		}

		/** Returns the name of the book being referenced according to the
		 * current translation. (See {@link Reference.getTranslation})
		 * */
		async getBookNameFromTranslation():Promise<string> {
			let bookData = await getPlugin()
				.bible_api
				.get_book_data(this.getTranslation(), this.book)
			return bookData.name
		}

		/** Returns the {@link TranslationID} being referenced.
		 * @example
		 * ```ts
		 * let ref = new Reference("Genesis", 1, 1, 2, "WEB")
		 * ref.getTranslation() === "WEB"
		 * ```
		 * @returns If the translation is not defined in the reference,
		 * then returns the reading translation from the user's settings.
		 */
		getTranslation():TranslationID {
			return this.translation ?? getPlugin().settings.translation
		}

		/** Sets the book being referenced.
		 * @example
		 * ```ts
		 * let ref = new Reference("Psalms", 1)
		 * 
		 * ref.setBook("1 John")
		 * ref.toString() === "1 John 1"
		 * 
		 * ref.setBook(1)
		 * ref.toString() === "Genesis 1"
		 * ```
		*/
		setBook(book:string|BookID):Reference {
			if (typeof(book) === "string") {
				this.book = DEFAULT_NAME_MAP[book]
					?? getPlugin()
						.bible_api
						.book_id(book, this.translation ?? "YLT")
			} else {
				this.book = book
			}
			return this
		}

		/** Sets the verse being referenced
		 * @example
		 * ```ts
		 * let ref = new Reference("Psalms", 119)
		 * 
		 * ref.setVerse(1)
		 * ref.toString() === "Psalms 119:1"
		 * 
		 * ref.setVerse()
		 * ref.toString() === "Psalms 119"
		 * ```
		*/
		setVerse(start?:VerseID):Reference {
			this.verseStart = start
			this.verseEnd = undefined
			return this
		}

		/** Sets the verse range being referenced.
		 * @example
		 * ```ts
		 * let ref = new Reference("Psalms", 119)
		 * 
		 * ref.setVerseRange(1)
		 * ref.toString() === "Psalms 119:1"
		 * 
		 * ref.setVerseRange(2, 3)
		 * ref.toString() === "Psalms 119:2-3"
		 * 
		 * ref.setVerseRange()
		 * ref.toString() === "Psalms 119"
		 * ```
		 * @throws {@link ReferenceError} if `end` is defined but `start`
		 * is undefined.
		 */
		setVerseRange(start?:VerseID, end?:VerseID):Reference {
			if (start === undefined && end !== undefined) {
				throw new ReferenceError(
					"Can't set verse range end without setting verse range start."
				)
			}
			this.verseStart = start
			this.verseEnd = end
			return this
		}
		
		/** Sets the translation of the reference. */
		setTranslation(translation?:TranslationID):Reference {
			if (translation === undefined) {
				this.translation = undefined
			} else {
				this.translation = translation.toUpperCase()
			}
			return this
		}

		/** Fetches the scripture being referenced as markdown.
		 * @example
		 * ```ts
		 * let ref = new Reference("Genesis", 1, 1)
		 * let text = await ref.text()
		 * text.startsWith("In the beginning") === true
		 * ```
		 * @see
		 * - {@link scripture}
		 */
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

		/** Converts this reference to a `string`.
		 * @example
		 * ```ts
		 * let ref = new Reference("John", 33, 3, 4, "WEB")
		 * String(ref) === "John 33:3-4 WEB"
		 * ```
		 */
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
	
	/** Returns a random verse {@link Reference} from a pool
	 * @example
	 * ```ts
	 * let ref = await randRef("seed")
	 * ```
	*/
	export async function randRef(seed?:string|number):Promise<Reference> {
		let verse = await getPlugin()
			.bible_api
			.pick_random_verse(String(seed))
		return Reference.fromString(verse)
	}

	/** Creates a reference from a `string`.
	 * @example
	 * ```ts
	 * let ref = newRef("Exodus 20")
	 * ```
	 */
	export function newRef(reference:string):Reference {
		return Reference.fromString(reference)
	}

	/** Fetches scripture by the given reference as markdown.
	 * @example
	 * ```ts
	 * let text = scripture("John 11:35 WEB")
	 * text === "Jesus wept."
	 * ```
	 * @see
	 * - {@link Reference.text}
	 */
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