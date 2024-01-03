import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	normalizePath,
	requestUrl,
} from 'obsidian';

import { E_CANCELED, Mutex } from 'async-mutex';

const BUILD_START_TOAST = "Bible build started!";
const BUILD_END_TOAST = "Bible build finished!";

// Remember to rename these classes and interfaces!

class MyBibleSettings {
	translation: string;
	bible_folder: string;

	store_locally: boolean;

	padded_order: boolean;
	book_name_format: string;
	book_name_delimiter: string;
	book_name_capitalization: string;

	padded_chapter: boolean;
	chapter_name_format: string;
	chapter_body_format: string;

	verse_body_format: string;

	_built_translation: string;

	async set_translation(val: string, plugin: MyBible) {
		let has_translation = false;
		let translations = (await plugin.bible_api.get_translations());
		if (!(val in translations)) {
			for (let translation in translations) {
				this.translation = translation
			}
		} else {
			this.translation = val;
		}
	}
}

const DEFAULT_SETTINGS: MyBibleSettings = {
	translation: "",
	bible_folder: "/Bible/",
	book_name_format: "{order} {book}",
	book_name_delimiter: " ",
	chapter_name_format: "{book} {chapter}",
	book_name_capitalization: "name_case",
	padded_order: true,
	padded_chapter: false,
	verse_body_format: "###### {verse}\n"
		+ "``` verse\n"
		+ "{book_id} {chapter}:{verse}\n"
		+ "```",
	chapter_body_format: "\n"
		+ "###### [[{last_chapter_name}]] | [[{book}]] | [[{next_chapter_name}]]\n"
		+ "\n"
		+ "{verses}\n"
		+ "\n"
		+ "###### [[{last_chapter_name}]] | [[{book}]] | [[{next_chapter_name}]]"
		+ "\n",
	store_locally: false,

	_built_translation: "",

	set_translation: async function (val: string, plugin: MyBible): Promise<void> {
		let has_translation = false;
		let translations = (await plugin.bible_api.get_translations());
		if (!(val in translations)) {
			this.translation = await plugin.bible_api.get_default_translation();
		} else {
			this.translation = val;
		}
	}
}

function httpGet(theUrl: string): Promise<string> {
	console.log("MyBible : Fetching " + theUrl);
	return new Promise(async (ok, err) => {
		ok(await requestUrl(theUrl).text);
	});
}

function is_alpha(string: string): boolean {
	for (let char_str of string) {
		let char = char_str.charCodeAt(0);
		if ((char > 64 && char < 91) || (char > 96 && char < 123) || (char > 39 && char < 42)) {
			// Character is a capital or lowercase letter, continue
			continue;
		}
		// Character is not a capital or lowercase letter, return false
		return false;
	}
	// All characters were uppercase or lowercase letters, return true
	return true;
}

function is_alphanumeric(string: string): boolean {
	for (let char_str of string) {
		let char = char_str.charCodeAt(0);
		if ((char > 64 && char < 91) || (char > 96 && char < 123) || (char > 47 && char < 58)) {
			// Character is a capital or lowercase letter, continue
			continue;
		}
		// Character is not a capital or lowercase letter, return false
		return false;
	}
	// All characters were uppercase or lowercase letters, return true
	return true;
}

function is_numeric(string: string): boolean {
	for (let char_str of string) {
		let char = char_str.charCodeAt(0);
		if (char > 47 && char < 58) {
			// Character is a number, continue
			continue;
		}
		// Character is not number, return false
		return false;
	}
	// All characters were numbers, return true
	return true;
}



export default class MyBible extends Plugin {
	bible_api: BibleAPI;
	settings: MyBibleSettings;

	async onload() {
		await this.loadSettings();

		this.bible_api = new BollsLifeBibleAPI();
		this.bible_api.plugin = this;

		await this.settings.set_translation(this.settings.translation, this);

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'create_bible_files',
			name: 'Build bible',
			callback: async () => {
				let bible_path = normalizePath(this.settings.bible_folder);
				this.app.vault.adapter.mkdir(bible_path);
				let folders_and_files = await this.app.vault.adapter.list(bible_path);
				if (folders_and_files.files.length + folders_and_files.folders.length != 0) {
					new ClearOldBibleFilesModal(this.app, this).open();
				} else {
					new Notice(BUILD_START_TOAST);
					await this.build_bible(bible_path);
					new Notice(BUILD_END_TOAST);
				}
			}
		});

		this.addCommand({
			id: 'clear_cache',
			name: 'Clear cache',
			callback: async () => {
				new ClearCacheFilesModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'download_bible',
			name: 'Download translation',
			callback: async () => {
				// TODO: Open a dialogue to confirm downloading an entire bible
				new DownloadBibleModal(
					this.app,
					this,
				).open();
			}
		});

		this.registerMarkdownCodeBlockProcessor("verse", async (source, element, context) => {
			const ref = source.trim().replace(/[:-]/g, " ").split(" ");

			let book:string|null = null;
			let book_id = -1;
			let chapter = -1;
			let verse = -1;
			let verse_end = -1;
			let maybe_translation: string | null = null;
			let i = 0;

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
				book_id = Number(book);
				book = null;
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

			let translation = maybe_translation || this.settings.translation;
			if (book !== null) {
				book_id = await this.bible_api
					.book_id(this.settings._built_translation, book);
			}
			book = (await this.bible_api.get_book(translation, book_id)).name;
			
			let text = "";
			if (book.length === 0) {
				text = "[Book and chapter must be provided]";
			} else if (chapter === -1) {
				text = "[Chapter must be provided]";
			} else if (verse === -1) {
				// Whole chapter
				let verses = await this.bible_api.get_chapter_cached(
					translation,
					book_id,
					chapter,
				);
				for (let verse_i of verses.keys()) {
					let verse = verses[verse_i];
					text += "<sup>" + (verse_i + 1) + "</sup> " + verse;
					if (verse_i != verses.length - 1) {
						text += "<br>";
					}
				}
				if (text.length === 0) {
					text = "[Could not find text for the book '{1}', translation '{2}', chapter {0}]"
						.format(String(chapter), book, translation)
				}
			} else if (verse_end < verse) {
				// Single verse
				text = await this.bible_api.get_verse(
					translation,
					book_id,
					chapter,
					verse,
				);
				if (text.length === 0) {
					text = "[Could not find text for the book '{1}', translation '{3}', chapter {0}, verse {2}]"
						.format(String(chapter), book, String(verse), translation)
				}
			} else {
				// Verse range
				let verses = await this.bible_api.get_chapter_cached(
					translation,
					book_id,
					chapter,
				);
				let j = verse;
				while (j < verse_end + 1 && j < verses.length) {
					text += "<sup>" + j + "</sup> " + verses[j - 1];
					if (j != verse_end) {
						text += "<br>";
					}
					j += 1;
				}
				if (text.length === 0) {
					text = "[Could not find text for the book '{1}', translation '{4}', chapter {0}, verses {2}-{3}]"
						.format(String(chapter), book, String(verse), String(verse_end), translation)
				}
			}

			let span = element.createSpan({
				text: "",
			});

			let tags = text.matchAll(
				/(?:<\s*([\w]*)\s*>(.*?)<\s*\/\1\s*>)|<\s*(br|\/br)\s*>|(.+?(?:(?=<\s*[/\\\w]*\s*>)|$))/gs
			);
			for (let match of tags) {
				let tag_type = match[1];
				let tag_text = match[2];
				let lone_tag_type = match[3];
				let normal_text = match[4];
				if (normal_text !== undefined) {
					span.createSpan({
						text: normal_text,
					});
				} else if (lone_tag_type === "br") {
					span.createEl(lone_tag_type);
				} else if (lone_tag_type === "/J") {
					/* Do nothing */
				} else if (lone_tag_type === "br/") {
					/* Do nothing */
				} else if (tag_type === "sup") {
					span.createEl(tag_type, { text: tag_text });
				} else if (tag_type === "sub") {
					span.createEl(tag_type, { text: tag_text });
				} else if (tag_type === "S") {
					span.createEl(
						"sub",
						{ text: tag_text, attr: { style: "opacity: 0.5" } },
					);
				} else if (tag_type === "i") {
					span.createEl(tag_type, { text: tag_text });
				} else if (tag_type === "b") {
					span.createEl(tag_type, { text: tag_text });
				} else if (tag_type === "e") {
					/// A quote from from elsewhere in the bible.
					span.createEl("i").createEl("q", { text: tag_text });
				} else {
					span.createSpan(
						{ text: "<{0}>{1}</{0}>".format(tag_type, tag_text) },
					);
				}
			}

		});


		this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload() {

	}

	async build_bible(bible_path: string) {
		// TODO: Build bibles according to translation in settings
		this.settings._built_translation = this.settings.translation;
		await this.saveSettings();
		
		let ctx = new BuildContext;
		ctx.translation = this.settings._built_translation;
		ctx.books = await this.bible_api.get_books(
			this.settings._built_translation
		);
		ctx.translation_texts = await this.bible_api
			.get_translation(ctx.translation);

		for (let book of ctx.books) {
			ctx.set_book(book.id);

			// Book path
			let book_path = bible_path;
			if (this.settings.book_name_format.length != 0) {
				book_path += "/" + ctx.format_book_name(this);
				this.app.vault.adapter.mkdir(normalizePath(book_path));
			}

			let file_promises: Array<Promise<any>> = [];
			for (const chapter_i of Array(ctx.book.chapters).keys()) {
				ctx.set_chapter(chapter_i+1);

				// Assemble verses
				ctx.verses_text = "";
				let verse = 1;
				while (verse != ctx.get_verse_count()+1) {
					ctx.verse = verse;
					ctx.verses_text += ctx.format_verse_body(this);
					if (verse != ctx.get_verse_count()) {
						ctx.verses_text += "\n";
					}
					verse += 1;
				}

				// Chapter name
				let chapter_note_name = ctx.format_chapter_name(this);

				// Chapter body
				let note_body = ctx.format_chapter_body(this);

				// Save file
				let file_path = normalizePath(book_path + "/" + chapter_note_name + ".md");
				let file = this.app.vault.getAbstractFileByPath(file_path);
				if (file instanceof TFile) {
					file_promises.push(this.app.vault.modify(file, note_body));
				} else if (file === null) {
					file_promises.push(
						this.app.vault.create(
							file_path,
							note_body,
						)
					);
				}
			}
			await Promise.all(file_promises);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class BuildContext {
	translation: string
	translation_texts: TranslationData
	books: Array<BookData>
	book: BookData
	last_book: BookData
	next_book: BookData
	chapter: number
	last_chapter: number
	next_chapter: number
	chapters: ChapterData
	last_chapters: ChapterData
	next_chapters: ChapterData
	chapter_verse_count: number
	verses_text: string
	verse: number

	find_book(book_id:BookId):number {
		for (let i of this.books.keys()) {
			if (this.books[i].id === book_id) {
				return i;
			}
		}
		throw new Error("No book by id ${book_id}");
	}

	format_book_name(plugin:MyBible): string {
		let casing = plugin.settings.book_name_capitalization;
		let delim = plugin.settings.book_name_delimiter;
		let book_name = this.to_case(this.book.name, casing, delim);

		return plugin.settings.book_name_format
			.replace(
				/{order}/g,
				String(this.book.id)
					.padStart(2 * Number(plugin.settings.padded_order), "0")
			)
			.replace(/{book}/g, book_name)
	}
	
	format_chapter_body(plugin:MyBible): string {
		return plugin.settings.chapter_body_format
			.replace(/{verses}/g, this.verses_text)
			.replace(/{book}/g, this.book.name)
			.replace(
				/{order}/g,
				String(this.book.id)
					.padStart(2 * Number(plugin.settings.padded_order), "0")
			)
			.replace(/{chapter}/g, String(this.chapter))
			.replace(/{chapter_name}/g, this.format_chapter_name(plugin))
			.replace(/{last_chapter}/g, String(this.last_chapter))
			.replace(/{last_chapter_name}/g, this.format_chapter_name(plugin, "last"))
			.replace(/{next_chapter}/g, String(this.next_chapter))
			.replace(/{next_chapter_name}/g, this.format_chapter_name(plugin, "next"));
	}

	format_chapter_name(plugin:MyBible, tense:string="current"): string {
		let format = plugin.settings.chapter_name_format;
		if (format.length == 0) {
			format = DEFAULT_SETTINGS.chapter_name_format;
		}
		let pad_by = 3;
		if (this.get_verse_count() < 10) {
			pad_by = 1;
		} else if (this.get_verse_count() < 100) {
			pad_by = 2;
		}

		let casing = plugin.settings.book_name_capitalization;
		let delim = plugin.settings.book_name_delimiter;
		let book_name = "";
		let chapter = -1;
		switch (tense) {
			case "current": {
				book_name = this.to_case(this.book.name, casing, delim);
				chapter = this.chapter
				break;
			}
			case "last": {
				book_name = this.to_case(this.last_book.name, casing, delim);
				chapter = this.last_chapter
				break;
			}
			case "next": {
				book_name = this.to_case(this.next_book.name, casing, delim);
				chapter = this.next_chapter
				break;
			}
			default: throw new Error("Unmatched switch case at tense '{0}'".format(tense));
		}

		book_name = this.to_case(book_name, casing, delim);

		return format
			.replace(/{book}/g, book_name)
			.replace(
				/{order}/g,
				String(this.book.id)
					.padStart(2 * Number(plugin.settings.padded_order), "0")
			)
			.replace(
				/{chapter}/g,
				String(chapter)
					.padStart(pad_by * Number(plugin.settings.padded_chapter), "0"),
			);
	}

	format_verse_body(plugin:MyBible): string {
		let book_name = this.to_case(
			this.book.name,
			plugin.settings.book_name_capitalization,
			plugin.settings.book_name_delimiter,
		);

		return plugin.settings.verse_body_format
			.replace(/{verse}/g, String(this.verse))
			.replace(/{book}/g, book_name)
			.replace(/{book_id}/g, String(this.book.id))
			.replace(
				/{order}/g,
				String(this.book.id)
					.padStart(2 * Number(plugin.settings.padded_order), "0")
			)
			.replace(/{chapter}/g, String(this.chapter))
			.replace(/{chapter_name}/g, this.format_chapter_name(plugin))
	}

	set_book(book_id:BookId) {
		let book_i = this.find_book(book_id);
		this.book = this.books[book_i];

		let last_book_i = this.chapter !== 1 ? book_i : book_i-1;
		if (last_book_i === -1) {
			last_book_i = this.books.length-1
		}
		this.last_book = this.books[last_book_i];
		
		let next_book_i = this.chapter !== this.book.chapters ? book_i : book_i+1;
		if (next_book_i === this.books.length) {
			next_book_i = 0
		}
		this.next_book = this.books[next_book_i];
	}

	set_chapter(chapter:number) {
		this.chapter = chapter;
		this.set_book(this.book.id);
		this.last_chapter = chapter !== 1 ? chapter-1 : this.last_book.chapters
		this.next_chapter = chapter !== this.book.chapters ? chapter+1 : 1
	}

	// Sets the capitalization of the given name depending on *name_case*.
	to_case(name:string, name_case:string, delimeter:string): string {
		if (name_case == "lower_case") {
			return name.toLowerCase().replace(/ /g, delimeter);
		} else if (name_case == "upper_case") {
			return name.toUpperCase().replace(/ /g, delimeter);
		}
		return name.replace(/ /g, delimeter);
	}

	get_verse_count():number {
		return this.translation_texts.books[this.book.id][this.chapter-1].length;
	}
}

interface TranslationData {
	translation: string;
	books: Record<BookId, Array<ChapterData>>;
}

interface BookCache {
	translation: String;
	book_id: number;
	data: BookData | null;
	mutex: Mutex;
}

interface BookData {
	id: number;
	chapters: number;
	name: string;
}

type BookId = number;

interface ChapterCache {
	translation: String;
	book_id: number;
	chapter: Number;
	chapter_data: ChapterData | null;
	mutex: Mutex;
}

type ChapterData = Array<string>;

interface VerseData {
	pk: string,
	text: string,
	verse: number,
};

class BibleAPI {
	book_cache: Record<BookKey, BookCache> = {};
	cache_clear_timer: Promise<null> | null = null;
	cache_clear_timer_promise_err: (reason?: any) => void;
	chapter_cache: Record<ChapterKey, ChapterCache> = {};
	plugin: MyBible;

	async cache_chapter(
		translation: string,
		book_id: number,
		chapter: number,
		chapter_data: ChapterData | null,
		save_locally: boolean,
	): Promise<void> {
		let key = this.make_chapter_key(translation, book_id, chapter);
		this.chapter_cache[key] = {
			translation: translation,
			book_id: book_id,
			chapter: chapter,
			chapter_data: chapter_data,
			mutex: new Mutex,
		};

		// Save chapter to local file sytem
		if (save_locally) {
			let cache_path = this.get_cache_path();
			this.plugin.app.vault.adapter.mkdir(cache_path);
			let cached_file_name = "{0} {1} {2}.txt"
				.format(translation, String(book_id), String(chapter));
			let cached_file_path = normalizePath(
				cache_path + "/" + cached_file_name,
			);
			if (
				chapter_data != null
				&& !await this.plugin.app.vault.adapter.exists(cached_file_path)
			) {
				await this.plugin.app.vault.adapter.write(
					cached_file_path,
					JSON.stringify(chapter_data),
				);
			}
		}

		// Start/refresh cache clear timer
		if (this.cache_clear_timer !== null && this.cache_clear_timer_promise_err !== null) {
			// Clear out old promise
			this.cache_clear_timer_promise_err(null);
		}
		this.cache_clear_timer = new Promise((ok, err) => {
			this.cache_clear_timer_promise_err = err;
			setTimeout(ok, 60000 * 60) // Timeout after 1 hour
		});
		this.cache_clear_timer
			.then(() => this.clear_cache())
			.catch(err => { });
	}

	async clear_cache() {
		this.chapter_cache = {};
		this.cache_clear_timer = null;

		let cache_path = this.get_cache_path();
		if (await this.plugin.app.vault.adapter.exists(cache_path)) {
			if (!await this.plugin.app.vault.adapter.trashSystem(cache_path)) {
				await this.plugin.app.vault.adapter.trashLocal(cache_path);
			}
		}
	}


	async book_id(translation:string, book_name:string) {
		let books = await this.get_books(translation);
		for (let i of books.keys()) {
			if (books[i].name === book_name) {
				return books[i].id;
			}
		}

		if (book_name in DEFAULT_NAME_MAP) {
			return DEFAULT_NAME_MAP[book_name];
		}

		throw new Error(
			"Translation '{0}' has no book named '{1}'"
				.format(translation, book_name)
		);
	}


	async get_translation(translation: string): Promise<TranslationData> {
		throw new Error("unimplemented")
	}

	async get_book(translation: string, book_id:BookId): Promise<BookData> {
		let book_key = "{0} {1}".format(translation, String(book_id));

		if (!(book_key in this.book_cache)) {
			this.book_cache[book_key] = {
				book_id: book_id,
				translation: translation,
				data: null,
				mutex: new Mutex,
			};
		}

		var cached = this.book_cache[book_key];
		if (cached.data === null) {
			await cached.mutex
				.acquire()
				.then(async () => {
					cached.data = await this._get_book(translation, book_id);

					cached.mutex.cancel();
					cached.mutex.release();
				})
				.catch(err => {
					if (err === E_CANCELED) {

					} else {
						throw new Error(err)
					}
				});
		}

		if (cached.data == null) {
			throw new Error();
		}

		return cached.data;
	}

	async _get_book(translation: string, book_id:BookId): Promise<BookData> {
		throw new Error("unimplemented")
	}

	get_books(translation: string,): Promise<Array<BookData>> {
		throw new Error("unimplemented")
	}

	get_cache_path(): string {
		return normalizePath(this.plugin.manifest.dir + "/.mybiblecache");
	}

	async get_chapter_cached(
		translation: string,
		book_id: number,
		chapter: number,
	): Promise<ChapterData> {
		let chapter_key = this.make_chapter_key(translation, book_id, chapter);

		if (!(chapter_key in this.chapter_cache)) {
			this.cache_chapter(
				translation,
				book_id,
				chapter,
				null,
				false,
			);
		}

		var cached = this.chapter_cache[chapter_key];

		if (cached.chapter_data === null) {
			await cached.mutex
				.acquire()
				.then(async () => {
					if (this.plugin.settings.store_locally) {
						// Attempt to load chapter locally
						let cached_file_name = "{0} {1} {2}.txt"
							.format(translation, String(book_id), String(chapter));
						let cache_path = this.get_cache_path();
						this.plugin.app.vault.adapter.mkdir(cache_path);
						let cached_file_path = normalizePath(
							cache_path + "/" + cached_file_name
						);
						if (
							await this.plugin.app.vault.adapter
								.exists(cached_file_path)
						) {
							cached.chapter_data = JSON.parse(
								await this.plugin.app.vault.adapter
									.read(cached_file_path)
							);
							console.log("MyBible : Loading ", cached_file_path);
						}
					}

					if (cached.chapter_data === null) {
						// Fetch chapter from the web
						cached.chapter_data = await this.get_chapter_uncached(
							translation,
							book_id,
							chapter,
						);
					}

					cached.mutex.cancel();
					cached.mutex.release();
				})
				.catch(err => {
					if (err === E_CANCELED) {

					} else {
						throw new Error(err)
					}
				});
		}

		if (cached.chapter_data === null || cached.chapter_data.length == 0) {
			return [];
		}

		await this.cache_chapter(
			translation,
			book_id,
			chapter,
			cached.chapter_data,
			this.plugin.settings.store_locally,
		);

		return cached.chapter_data;
	}

	async get_chapter_uncached(
		translation: string,
		book_id: number,
		chapter: number,
	): Promise<ChapterData> {
		throw new Error("unimplemented")
	}

	async get_default_translation(): Promise<string> {
		throw new Error("unimplemented")
	}

	get_translations(): Promise<Translations> {
		throw new Error("unimplemented")
	}

	get_verse(
		translation: string,
		book_id: number,
		chapter: number,
		verse: number,
	): Promise<string> {
		throw new Error("unimplemented")
	}

	make_chapter_key(translation: string, book_id: number, chapter: Number) {
		return "{0}.{1}.{2}".format(translation, String(book_id), String(chapter));
	}
}

type BookKey = string;
type ChapterKey = string;

type Translations = Record<string, Translation>;
interface Translation {
	display_name: string,
	abbreviated_name: string,
	language: string,
}


class BollsLifeBibleAPI extends BibleAPI {
	plugin: MyBible;
	chapter_cache: Record<ChapterKey, ChapterCache> = {};
	translations: Translations = {};
	translation_maps: Record<string, Array<BookData>> = {};
	cache_clear_timer: Promise<null> | null = null;
	book_mutex:Mutex = new Mutex;

	_chapter_key(translation: string, book_id: number, chapter: Number) {
		return "{0}.{1}.{2}".format(translation, String(book_id), String(chapter));
	}

	async _generate_translation_map(translation: string) {
		let map: Array<Record<string, any>> = JSON.parse(await httpGet(
			"https://bolls.life/get-books/{0}/".format(translation
			)));
		let book_data: Array<BookData> = [];
		for (let item of map) {
			book_data.push({
				name: item["name"],
				chapters: item["chapters"],
				id: item["bookid"],
			});
		}
		this.translation_maps[translation] = book_data;
	}

	async _book_to_id(translation: string, book: string): Promise<number> {
		let book_ = book.toLowerCase();
		let map = await this._get_translation_map("YLT"); // TODO: Make translation according to user settings
		for (let i in map) {
			let book_data = map[i];
			if (book_ == book_data["name"].toLowerCase()) {
				return Number(i) + 1;
			}
		}
		throw new Error('No book exists by name {0}.'.format(book));
	}

	async _id_to_book(translation: string, book_id: number): Promise<string> {
		let map = await this._get_translation_map("YLT"); // TODO: Make translation according to user settings
		return map[book_id - 1]["name"];
	}

	async get_chapter_uncached(
		translation: string,
		book_id: number,
		chapter: number,
	): Promise<ChapterData> {
		// Fetch chapter from the web
		try {
			let chapter_data = JSON.parse(await httpGet(
				"https://bolls.life/get-chapter/{0}/{1}/{2}/"
					.format(translation, String(book_id), String(chapter))
			)).map((x: VerseData) => x.text);

			return chapter_data;
		} catch (e) {
			if (e instanceof Error && e.message.startsWith("No book exists by name")) {
				console.log(
					"Failed to find chapter {0} in translation {1}, returning empty."
						.format(String(book_id), translation)
				)
				return [];
			}
			throw e;
		}
	}

	async _get_translation_map(translation: string): Promise<Array<BookData>> {
		if (!(translation in this.translation_maps)) {
			await this._generate_translation_map(translation);
		}
		return this.translation_maps[translation];
	}

	async get_translation(translation: string): Promise<TranslationData> {
		let verses = JSON.parse(
			await httpGet(
				"https://bolls.life/static/translations/{0}.json".format(translation)
			)
		);

		let bible: TranslationData = {
			translation: translation,
			books: {},
		};

		await new Promise(async (ok, err) => {
			let i = 0;
			let curr_book_id = -1;
			let curr_chapter = -1;
			while (i != verses.length) {
				let verse_json = verses[i];
				if (curr_book_id != verse_json["book"]) {
					curr_book_id = verse_json["book"]
					bible.books[curr_book_id] = [];
					curr_chapter = -1
				}
				if (curr_chapter != verse_json["chapter"]) {
					curr_chapter = verse_json["chapter"];
					let book_data = bible.books[curr_book_id];
					book_data.push([]);
				}
				bible.books[curr_book_id][curr_chapter - 1].push(verse_json["text"]);
				i += 1;
			}
			ok(null);
		})

		return bible;
	}

	async _get_book(translation: string, book_id:BookId): Promise<BookData> {
		let books = await this.get_books(translation);
		for (let book of books) {
			if (book.id == book_id) {
				this.book_mutex.cancel();
				this.book_mutex.release();
				return book;
			}
		}
		throw new Error();
	}

	async get_books(translation: string): Promise<BookData[]> {
		let books = await this._get_translation_map(translation);
		books.sort(function(x, y) {
			if (x.id < y.id) {
				return -1;
			}
			if (x.id > y.id) {
				return 1;
			}
			return 0;
		});
		return books;
	}

	async get_default_translation(): Promise<string> {
		return "YLT";
	}

	async get_translations(): Promise<Translations> {
		if (Object.keys(this.translations).length === 0) {
			let list = JSON.parse(await httpGet(
				"https://bolls.life/static/bolls/app/views/languages.json"
			));
			for (let language of list) {
				for (let item of language["translations"]) {
					if (item["short_name"] in this.translations) {
						throw new Error("Translation already added to map");
					}
					this.translations[item["short_name"]] = {
						abbreviated_name: item["short_name"],
						display_name: item["full_name"],
						language: language["language"],
					};
				}
			}
		}
		return this.translations;
	}

	async get_verse(
		translation: string,
		book_id: number,
		chapter: number,
		verse: number,
	): Promise<string> {
		let chapter_data = await this.get_chapter_cached(
			translation,
			book_id,
			chapter,
		);

		return chapter_data[verse - 1] || "";
	}
}

class ClearCacheFilesModal extends Modal {
	plugin: MyBible;

	constructor(app: App, plugin: MyBible) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;

		let bible_path = this.plugin.settings.bible_folder;

		contentEl.createEl("h1", { text: "Clear cache?" });
		contentEl.createEl("span", {
			text: "You are about to clear out all cached chapters from your file system. This includes translations you manually downloaded."
				.format(bible_path)
		});
		contentEl.createEl("p", {
			text: "Do you want to clear the cache?"
		});
		contentEl.createEl("p", {});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Clear cache")
					.setCta()
					.onClick(async () => {
						this.close();
						await this.plugin.bible_api.clear_cache();
						new Notice("Cache cleared!");
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ClearOldBibleFilesModal extends Modal {
	plugin: MyBible;

	constructor(app: App, plugin: MyBible) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;

		let bible_path = this.plugin.settings.bible_folder;

		contentEl.createEl("h1", { text: "Bible folder is not empty" });
		contentEl.createEl("span", {
			text: "The Bible folder in your settings is not empty. If you built a Bible in this folder before the new bible may be interlaced with the old one."
				.format(bible_path)
		});
		contentEl.createEl("p", {
			text: "Do you want to clear the folder before building your Bible?"
		});
		contentEl.createEl("p", {});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Build without clearing")
					.setCta()
					.onClick(async () => {
						this.close();
						new Notice(BUILD_START_TOAST);
						await this.plugin.build_bible(bible_path);
						new Notice(BUILD_END_TOAST);
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Clear and build")
					.setCta()
					.onClick(async () => {
						this.close();
						new Notice(BUILD_START_TOAST);
						let list = await this.app.vault.adapter.list(bible_path);
						for (let path of list.files) {
							let abstract = this.app.vault.getAbstractFileByPath(
								path,
							);
							if (abstract != null) {
								await this.app.vault.delete(abstract, true);
							}
						}
						for (let path of list.folders) {
							let abstract = this.app.vault.getAbstractFileByPath(
								path,
							);
							if (abstract != null) {
								await this.app.vault.delete(abstract, true);
							}
						}
						await this.plugin.build_bible(bible_path);
						new Notice(BUILD_END_TOAST);
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class DownloadBibleModal extends Modal {
	plugin: MyBible;

	constructor(app: App, plugin: MyBible) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;

		let translation = this.plugin.settings.translation;

		contentEl.createEl("h1", { text: "Download bible?" });
		contentEl.createEl("span", {
			text: "You are about to download the entire {0} translation of the Bible, according to your settings."
				.format(translation)
		});
		contentEl.createEl("p", {
			text: "Do you want to continue?"
		});
		contentEl.createEl("p", {});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Download")
					.setCta()
					.onClick(() => {
						this.close();
						this.downloadBible(translation);
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	async downloadBible(translation: string) {
		new Notice(
			'Started download of the {0} translation!'
				.format(translation)
		);

		let bible = await this.plugin.bible_api.get_translation(translation);
		for (let book_name in bible.books) {
			for (let chapter of Array(bible.books[book_name].length).keys()) {
				let book_id = await this.plugin.bible_api.book_id(
					translation,
					book_name,
				);
				await this.plugin.bible_api.cache_chapter(
					translation,
					book_id,
					chapter + 1,
					bible.books[book_name][chapter],
					true,
				);
			}
		}

		new Notice(
			'Completed download of the {0} translation!'
				.format(translation)
		);
	}
}

class SettingsTab extends PluginSettingTab {
	plugin: MyBible;

	constructor(app: App, plugin: MyBible) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Translation')
			.setDesc('The version of the Bible to display.')
			.addDropdown(async drop => {
				let translations = await this.plugin.bible_api.get_translations();
				for (const key in translations) {
					drop.addOption(
						key,
						"{0} - {1} - {2}".format(
							translations[key].language,
							key,
							translations[key].display_name,
						)
					);
				}
				drop.onChange(async value => {
					this.plugin.settings.translation = value;
					await this.plugin.saveSettings();
				})
				drop.setValue(this.plugin.settings.translation);
			});

		new Setting(containerEl)
			.setName('Bible folder')
			.setDesc('A path to the folder where all the files for the bible will be placed. If the path does not exist it will be created.')
			.addText(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.bible_folder)
				.setValue(this.plugin.settings.bible_folder)
				.onChange(async (value) => {
					this.plugin.settings.bible_folder = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setHeading()
			.setName("Book Formatting")

		new Setting(containerEl)
			.setName('Book name capitalization')
			.setDesc('Capitalization for the names of the notes of each book.')
			.addDropdown(drop => drop
				.addOption("lower_case", "Lower case")
				.addOption("name_case", "Name case")
				.addOption("upper_case", "Upper case")
				.setValue(this.plugin.settings.book_name_capitalization)
				.onChange(async (value) => {
					this.plugin.settings.book_name_capitalization = value;
					await this.plugin.saveSettings();
				})
			)

		new Setting(containerEl)
			.setName('Padded order numbers')
			.setDesc('When ON, changes "{order}" in the names of book folders to be padded with extra zeros. For example, "1 Genesis" would become "01 Gensis" when turned ON.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.padded_order)
				.onChange(async (value) => {
					this.plugin.settings.padded_order = value;
					await this.plugin.saveSettings();
				}))

		new Setting(containerEl)
			.setName('Book name delimiter')
			.setDesc('The characters separating words in book names, such as the spaces in "1 John" or "Song of Solomon".')
			.addText(text => text
				.setPlaceholder('Example: "' + DEFAULT_SETTINGS.book_name_format + '"')
				.setValue(this.plugin.settings.book_name_delimiter)
				.onChange(async (value) => {
					this.plugin.settings.book_name_delimiter = value;
					await this.plugin.saveSettings();
				}))

		

		new Setting(containerEl)
			.setName('Book name format')
			.setDesc('Formatting for the names of the folders of each book of the bible. For example, "{order} {name}" would become "2 Exodus". Leave blank to not have folders for each book.')
			.addText(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.book_name_format)
				.setValue(this.plugin.settings.book_name_format)
				.onChange(async (value) => {
					this.plugin.settings.book_name_format = value;
					await this.plugin.saveSettings();
				}))

		new Setting(containerEl)
			.setHeading()
			.setName("Chapter Formatting")

		

		new Setting(containerEl)
			.setName('Padded chapter numbers')
			.setDesc('When ON, changes "{chapter}" (and related) in the names of chapters to be padded with extra zeros. For example, "Psalms 5" would become "Psalms 005" when turned ON.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.padded_chapter)
				.onChange(async (value) => {
					this.plugin.settings.padded_chapter = value;
					await this.plugin.saveSettings();
				}))

		new Setting(containerEl)
			.setName('Chapter name format')
			.setDesc('Formatting for the names of the notes of each chapter of a book. For example, "{book} {chapter}" would become "Psalms 23.md".')
			.addText(text => text
				.setPlaceholder(this.plugin.settings.chapter_name_format)
				.setValue(this.plugin.settings.chapter_name_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_name_format = value;
					await this.plugin.saveSettings();
				}))

		new Setting(containerEl)
			.setName('Chapter body format')
			.setDesc('Formatting for the body of chapter notes.')
			.addTextArea(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.chapter_body_format)
				.setValue(this.plugin.settings.chapter_body_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_body_format = value;
					await this.plugin.saveSettings();
				}))
			
		new Setting(containerEl)
			.setName('Verse body format')
			.setDesc('Formatting for the body of verses in chapters.')
			.addTextArea(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.verse_body_format)
				.setValue(this.plugin.settings.verse_body_format)
				.onChange(async (value) => {
					this.plugin.settings.verse_body_format = value;
					await this.plugin.saveSettings();
				}))

		new Setting(containerEl)
			.setHeading()
			.setName("Data")

		new Setting(containerEl)
			.setName('Save bible locally')
			.setDesc('When ON, caches viewed chapters on the local file system, so that they can be accessed without an internet connection.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.store_locally)
				.onChange(async (value) => {
					this.plugin.settings.store_locally = value;
					await this.plugin.saveSettings();
				}))

	}
}

const DEFAULT_NAME_MAP: Record<string, BookId> = {
	"Genesis": 1,
	"Exodus": 2,
	"Leviticus": 3,
	"Numbers": 4,
	"Deuteronomy": 5,
	"Joshua": 6,
	"Judges": 7,
	"Ruth": 8,
	"1 Samuel": 9,
	"2 Samuel": 10,
	"1 Kings": 11,
	"2 Kings": 12,
	"1 Chronicles": 13,
	"2 Chronicles": 14,
	"Ezra": 15,
	"Nehemiah": 16,
	"Esther": 17,
	"Job": 18,
	"Psalms": 19,
	"Psalm": 19, // Alternate spelling
	"Proverbs": 20,
	"Ecclesiastes": 21,
	"Song of Solomon": 22,
	"Isaiah": 23,
	"Jeremiah": 24,
	"Lamentations": 25,
	"Ezekiel": 26,
	"Daniel": 27,
	"Hosea": 28,
	"Joel": 29,
	"Amos": 30,
	"Obadiah": 31,
	"Jonah": 32,
	"Micah": 33,
	"Nahum": 34,
	"Habakkuk": 35,
	"Zephaniah": 36,
	"Haggai": 37,
	"Zechariah": 38,
	"Malachi": 39,
	"Matthew": 40,
	"Mark": 41,
	"Luke": 42,
	"John": 43,
	"Acts": 44,
	"Romans": 45,
	"1 Corinthians": 46,
	"2 Corinthians": 47,
	"Galatians": 48,
	"Ephesians": 49,
	"Philippians": 50,
	"Colossians": 51,
	"1 Thessalonians": 52,
	"2 Thessalonians": 53,
	"1 Timothy": 54,
	"2 Timothy": 55,
	"Titus": 56,
	"Philemon": 57,
	"Hebrews": 58,
	"James": 59,
	"1 Peter": 60,
	"2 Peter": 61,
	"1 John": 62,
	"2 John": 63,
	"3 John": 64,
	"Jude": 65,
	"Revelation": 66,
	"1 Esdras": 67,
	"Tobit": 68,
	"Judith": 69,
	"Wisdom": 70,
	"Sirach": 71,
	"Epistle of Jeremiah": 72,
	"Baruch": 73,
	"1 Maccabees": 74,
	"2 Maccabees": 75,
	"2 Esdras": 77, // Jump in number
	"Susanna": 78,
	"Bel and Dragon": 79,
	"Prayer of Manasseh": 83, // Jump in number
	"Azariah": 88, // Jump in number
}