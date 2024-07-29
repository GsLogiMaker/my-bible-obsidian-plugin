import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	FuzzySuggestModal,
	TFile,
	TFolder,
	normalizePath,
	requestUrl,
} from 'obsidian';

import { E_CANCELED, Mutex } from 'async-mutex';

const BUILD_END_TOAST = "Bible build finished!";
const SELECTED_TRANSLATION_OPTION = "<Selected reading translation, {0}>"
const SELECTED_TRANSLATION_OPTION_KEY = "default"

// Remember to rename these classes and interfaces!

class MyBibleSettings {
	translation: string;
	reading_translation: string
	bible_folder: string;

	store_locally: boolean;

	padded_order: boolean;
	book_folders_enabled: boolean;
	book_name_format: string;
	book_name_delimiter: string;
	book_name_capitalization: string;
	book_name_abbreviated: boolean;

	padded_chapter: boolean;
	chapter_name_format: string;
	chapter_body_format: string;

	build_with_dynamic_verses: boolean;
	verse_body_format: string;

	index_enabled: boolean
	index_name_format: string
	index_format: string
	index_link_format: string

	chapter_index_enabled: boolean
	chapter_index_name_format: string
	chapter_index_format: string
	chapter_index_link_format: string

	_built_translation: string;

	async set_translation(val: string, plugin: MyBible) {
		throw "Unimplemented"
	}
}

const DEFAULT_SETTINGS: MyBibleSettings = {
	translation: SELECTED_TRANSLATION_OPTION_KEY,
	reading_translation: "WEB",
	bible_folder: "/My Bible/",
	book_folders_enabled: true,
	book_name_format: "{order} {book}",
	book_name_delimiter: " ",
	chapter_name_format: "{book} {chapter}",
	book_name_capitalization: "name_case",
	book_name_abbreviated: false,
	padded_order: true,
	padded_chapter: false,
	build_with_dynamic_verses: true,
	verse_body_format: "###### {verse}\n"
		+ "{verse_text}"
	,
	chapter_body_format: "\n"
		+ "###### Navigation\n"
		+ "**[[{last_chapter_name}|⏪ {last_chapter_name}]] | [[{chapter_index}|Chapters]] | [[{next_chapter_name}|{next_chapter_name} ⏩]]**\n"
		+ "**[[{first_chapter_name}|First ({first_chapter})]] | [[{final_chapter_name}|Last ({final_chapter})]]**\n"
		+ "\n"
		+ "{verses}\n"
		+ "\n"
		+ "###### Navigation\n"
		+ "**[[{last_chapter_name}|⏪ {last_chapter_name}]] | [[{chapter_index}|Chapters]] | [[{next_chapter_name}|{next_chapter_name} ⏩]]**\n"
		+ "**[[{first_chapter_name}|First ({first_chapter})]] | [[{final_chapter_name}|Last ({final_chapter})]]**\n"
		+ "\n"
	,
	index_enabled: true,
	index_name_format: "-- Bible --",
	index_link_format: "- [[{book_index}|{book}]]",
	index_format: ""
		+ "### Old testament\n"
		+ "{old_testament}\n"
		+ "### New testament\n"
		+ "{new_testament}\n"
		+ "### Apocrypha\n"
		+ "{apocrypha}"
	,
	chapter_index_enabled: true,
	chapter_index_name_format: "-- {book} --",
	chapter_index_link_format: "- [[{chapter_name}|{chapter}]]",
	chapter_index_format: ""
		+ "###### Navigation\n"
		+ "*[[{index}|Books]]*\n"
		+ "\n"
		+ "### Chapters\n"
		+ "{chapters}\n"
	,
	store_locally: false,

	_built_translation: "",

	set_translation: async function (val: string, plugin: MyBible): Promise<void> {
		if (val === SELECTED_TRANSLATION_OPTION_KEY) {
			this.translation = val
			return
		}

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


async function save_file(path: string, content: string) {
	let file_path = normalizePath(path);
	let file = this.app.vault.getAbstractFileByPath(file_path)
	if (file instanceof TFile) {
		await this.app.vault.modify(file, content)
	} else if (file === null) {
		await this.app.vault.create(
			file_path,
			content,
		)
	}
}

function translation_to_display_name(translation:Translation):string {
	return "{0} - {1} - {2}"
		.format(translation.language, translation.abbreviated_name, translation.display_name)
	;
}


export default class MyBible extends Plugin {
	bible_api: BibleAPI
	settings: MyBibleSettings
	progress_notice: Notice | null

	async onload() {
		await this.loadSettings();

		this.bible_api = new BollsLifeBibleAPI();
		this.bible_api.plugin = this;

		await this.settings.set_translation(this.settings.translation, this);

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'create_bible_files',
			name: 'Build Bible',
			callback: async () => {
				new BuilderModal(this.app, this).open()
			}
		});

		this.addCommand({
			id: 'quick_change_translation',
			name: 'Change translation',
			callback: async () => {
				let modal = new QuickChangeTranslationeModal(this)
				modal.translations = await this.bible_api.get_translations()
				modal.onChose = translation => {
					this.settings.reading_translation = translation.abbreviated_name
				}
				modal.open()
			}
		});

		this.addCommand({
			id: 'clear_cache',
			name: 'Clear local files',
			callback: async () => {
				new ClearLocalFilesModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'download_bible',
			name: 'Download translation',
			callback: async () => {
				let modal = new QuickChangeTranslationeModal(this)
				modal.translations = await this.bible_api.get_translations()
				modal.onChose = async translation => {
					await this.bible_api.user_download_translation(
						translation.abbreviated_name
					)
				}
				modal.open()
				
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

			let translation = maybe_translation || this.settings.reading_translation;
			if (book !== null) {
				book_id = await this.bible_api
					.book_id(this.settings._built_translation||translation, book);
			}
			book = (await this.bible_api.get_book_data(translation, book_id)).name;
			
			let text = "";
			if (book.length === 0) {
				text = "[Book and chapter must be provided]";
			} else if (chapter === -1) {
				text = "[Chapter must be provided]";
			} else if (verse === -1) {
				// Whole chapter
				let verses = await this.bible_api.get_chapter(
					translation,
					book_id,
					chapter,
				);
				for (const verse_i_ of Object.keys(verses)) {
					const verse_i = Number(verse_i_)
					let verse = verses[verse_i];
					text += "<sup>" + (verse_i + 1) + "</sup> " + verse;
					if (verse_i != Object.keys(verses).length - 1) {
						text += "<br>";
					}
				}
				if (text.length === 0) {
					text = "<No text found for {1} {0} in translation {2}>"
						.format(String(chapter), book, translation)
				}
			} else if (verse_end < verse) {
				// Single verse
				text = await this.bible_api.get_verse(
					translation,
					book_id,
					chapter,
					verse,
				)
				if (text.length === 0) {
					text = "<No text found for {1} {0}:{2} in translation {3}>"
						.format(String(chapter), book, String(verse), translation)
				}
			} else {
				// Verse range
				let verses = await this.bible_api.get_chapter(
					translation,
					book_id,
					chapter,
				);
				let j = verse;
				while (j < verse_end + 1 && j < Object.keys(verses).length) {
					text += "<sup>" + j + "</sup> " + verses[j - 1];
					if (j != verse_end) {
						text += "<br>";
					}
					j += 1;
				}
				if (text.length === 0) {
					text = "<No text found for {1} {0}:{2}-{3} in translation {4}>"
						.format(String(chapter), book, String(verse), String(verse_end), translation)
				}
			}

			let span = element.createSpan({
				text: "",
			});

			let tags = text.matchAll(
				/(?:<\s*([\w]*)\s*>(.*?)<\s*\/\1\s*>)|<\s*(br|\/br|br\/)\s*>|(.+?(?:(?=<\s*[/\\\w]*\s*>)|$))/gs
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
				} else if (lone_tag_type === "br/" || lone_tag_type === "/br") {
					span.createEl("br");
					span.createSpan({
						text: "\n",
					});
				} else if (lone_tag_type === "/J") {
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

	async build_bible() {
		let bible_path = normalizePath(this.settings.bible_folder);

		let bible_folder = this.app.vault.getAbstractFileByPath(bible_path);
		if (bible_folder instanceof TFile) {
			// Can't handle if bible path is a file. Abort
			new ErrorModal(
				this.app,
				this,
				"Failed to build bible",
				"The bible folder defined in settings, \"{0}\", was expected to point to a folder, but it points to a file. Try changing the path to point to a folder, or change the file to a folder."
					.format(this.settings.bible_folder),
			).open();
			return;
		} else if (bible_folder === null) {
			// Bible path doesn't exist. Create it
			this.app.vault.adapter.mkdir(bible_path);
		} else {
			// Bible path is already a valid folder. No action needed
		}

		let folders_and_files = await this.app.vault.adapter.list(bible_path);
		if (folders_and_files.files.length + folders_and_files.folders.length != 0) {
			new ClearOldBibleFilesModal(this.app, this).open()
		} else {
			await this._build_bible(bible_path);
		}
	}

	async _build_bible(bible_path: string) {
		this.show_toast_progress(0, null)
		try {
			let translation = ""
			if (this.settings.translation == SELECTED_TRANSLATION_OPTION_KEY) {
				translation = this.settings.reading_translation
			} else {
				translation = this.settings.translation
			}
	
			// TODO: Build bibles according to translation in settings
			this.settings._built_translation = translation;
			await this.saveSettings();
	
			let ctx = new BuildContext;
			ctx.plugin = this
			ctx.translation = translation;
			ctx.books = await this.bible_api.get_books_data(ctx.translation);
			ctx.verse_counts = await this.bible_api.get_verse_count(ctx.translation);
	
			// Get translation texts
			ctx.translation_texts = await this.bible_api
					.get_translation(ctx.translation);

			// Remove empty chapters from books (HACK: This should be done in a better place, but this is where all the needed information is)
			if (ctx.translation_texts !== undefined) {
				for (let book of ctx.books) {
					let to_remove = []
					for (let i = 1; i != book.chapters.length+1; i++) {
						let chapter_texts = ctx.translation_texts.books[book.id]
						let verses = chapter_texts[i] || {}
						if (Object.keys(verses).length === 0) {
							to_remove.push(i)
						}
					}
					for (const i of to_remove.reverse()) {
						book.chapters.remove(i)
					}
				}
			}

			// Notify progress
			let built_chapter_count = 0
			let total_chapter_count = 0
			for (const i in ctx.books) {
				total_chapter_count += ctx.books[i].chapters.length
			}
			this.show_toast_progress(0, total_chapter_count)
	
			// Index
			if (this.settings.index_enabled) {
				await save_file(
					"{0}/{1}.md".format(bible_path, ctx.format_index_name()),
					ctx.format_index(),
				)
			}
	
			let file_promises: Array<Promise<any>> = [];
	
			for (let book of ctx.books) {
				ctx.set_book(book);
				let texts_of_book = ctx.translation_texts.books[book.id]
	
				// Book path
				let book_path = bible_path;
				if (this.settings.book_folders_enabled) {
					book_path += "/" + ctx.format_book_name(this, ctx.book, this.settings.book_name_capitalization);
					this.app.vault.adapter.mkdir(normalizePath(book_path));
				}
	
				// Chapter index
				if (this.settings.chapter_index_enabled) {
					file_promises.push(save_file(
						"{0}/{1}.md".format(book_path, ctx.format_chapter_index_name(ctx.book)),
						ctx.format_chapter_index(ctx.book),
					))
				}
				
				for (const chapter of ctx.book.chapters) {
					file_promises.push(new Promise(async () => {
						ctx.set_chapter(chapter);
						let texts_of_chapter = texts_of_book[chapter]

						// Assemble verses
						ctx.verses_text = ""
						let added_verse_count = 0
						for (const verse_key of Object.keys(texts_of_chapter)) {
							const verse = Number(verse_key)
							while (added_verse_count < verse) {
								ctx.verse = added_verse_count + 1
								let text = ctx.format_verse_body(
									this,
									this.settings.build_with_dynamic_verses,
								)
								ctx.verses_text += text
								if (
									!(text.length === 0 && !this.settings.build_with_dynamic_verses)
									&& verse_key !== Object.keys(texts_of_chapter).last())
								{
									ctx.verses_text += "\n";
								}
								added_verse_count += 1
							}
						}
		
						// Chapter name
						let chapter_note_name = ctx.format_chapter_name();
		
						// Chapter body
						let note_body = ctx.format_chapter_body(this);
		
						// Save file
						let file_path = book_path + "/" + chapter_note_name + ".md"
		
						await save_file(file_path, note_body)
						built_chapter_count += 1
						this.show_toast_progress(
							built_chapter_count,
							total_chapter_count,
						)
					}))
				}
			}
	
			await Promise.all(file_promises);
		} catch (e)  {
			this.show_toast_error(String(e))
			throw e
		}
	}

	show_toast_error(error:string) {
		if (this.progress_notice !== null) {
			this.progress_notice?.hide()
			this.progress_notice = null
		}
		new Notice("Error building bible: " + error, 0)
	}

	show_toast_progress(progress: number, finish: number|null) {
		if (progress === finish && finish != null) {
			this.progress_notice?.hide()
			this.progress_notice = null
			new Notice(BUILD_END_TOAST)
			return
		}

		if (this.progress_notice == null) {
			this.progress_notice = new Notice("", 0)
		}

		let msg = ""
		if (finish == null) {
			msg = "Building bible..."
		} else {
			msg = "Building bible... ({0}/{1})"
				.format(String(progress), String(finish))
		}
		this.progress_notice.setMessage(msg)
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		let saving:Record<string, any> = {}
		Object.assign(saving, this.settings)
		for (const key in saving) {
			let value:any = (DEFAULT_SETTINGS as Record<string, any>)[key]
			if (saving[key] === value) {
				delete saving[key]
			}
		}

		await this.saveData(saving)
	}
}

class BuildContext {
	translation: string = ""
	translation_texts: TranslationData
	books: Array<BookData> = []
	book: BookData
	prev_book: BookData
	next_book: BookData
	chapter: number = 0
	prev_chapter: number = 0
	next_chapter: number = 0
	chapters: ChapterData
	last_chapters: ChapterData
	next_chapters: ChapterData
	chapter_verse_count: number = 0
	verses_text: string = ""
	verse: number = 0
	verse_counts: VerseCounts
	plugin: MyBible

	/// Find index of book by ID
	find_book(book_id:BookId):number {
		for (let i of this.books.keys()) {
			if (this.books[i].id === book_id) {
				return i;
			}
		}
		throw new Error("No book by id ${book_id}");
	}

	abbreviate_book_name(name:string, delimeter:string): string {
		return name.replace(delimeter, "").slice(0,3);
	}

	format_book_name(plugin:MyBible, book:BookData, casing:string): string {
		let delim = plugin.settings.book_name_delimiter
		let book_name = this.to_case(book.name, casing, delim)

		if (plugin.settings.book_name_abbreviated) {
			book_name = this.abbreviate_book_name(book_name, delim)
		}

		return plugin.settings.book_name_format
			.replace(
				/{order}/g,
				String(book.id)
					.padStart(2 * Number(plugin.settings.padded_order), "0")
			)
			.replace(/{book}/g, book_name)
			.replace(/{translation}/g, String(this.translation))
	}

	format_book_name_without_order(plugin:MyBible, book:BookData, casing:string): string {
		let delim = plugin.settings.book_name_delimiter
		let book_name = this.to_case(book.name, casing, delim)

		if (plugin.settings.book_name_abbreviated) {
			book_name = this.abbreviate_book_name(book_name, delim)
		}

		return book_name
	}
	
	format_chapter_body(plugin:MyBible): string {
		let casing = plugin.settings.book_name_capitalization;
		return plugin.settings.chapter_body_format
			.replace(/{verses}/g, this.verses_text)
			.replace(/{book}/g, this.format_book_name_without_order(plugin, this.book, casing))
			.replace(
				/{order}/g,
				String(this.book.id)
					.padStart(2 * Number(plugin.settings.padded_order), "0")
			)
			.replace(/{chapter}/g, String(this.chapter))
			.replace(/{chapter_name}/g, this.format_chapter_name())
			.replace(/{chapter_index}/g, this.format_chapter_index_name(this.book))
			.replace(/{last_chapter}/g, String(this.prev_chapter))
			.replace(/{last_chapter_name}/g, this.format_chapter_name("last"))
			.replace(/{last_chapter_book}/g, this.format_book_name_without_order(plugin, this.prev_book, casing))
			.replace(/{next_chapter}/g, String(this.next_chapter))
			.replace(/{next_chapter_name}/g, this.format_chapter_name("next"))
			.replace(/{next_chapter_book}/g, this.format_book_name_without_order(plugin, this.next_book, casing))
			.replace(/{first_chapter}/g, String(this.book.chapters.first()))
			.replace(/{first_chapter_name}/g, this.format_chapter_name("first"))
			.replace(/{final_chapter}/g, String(this.book.chapters.last()))
			.replace(/{final_chapter_name}/g, this.format_chapter_name("final"))
			.replace(/{translation}/g, String(this.translation))
	}

	format_chapter_name(tense:string="current", custom_chapter:number|null = null): string {
		let format = this.plugin.settings.chapter_name_format;
		if (format.length == 0) {
			format = DEFAULT_SETTINGS.chapter_name_format;
		}
		let chapter_pad_by = 3;
		if (this.book.chapters.length < 10) {
			chapter_pad_by = 1;
		} else if (this.book.chapters.length < 100) {
			chapter_pad_by = 2;
		}

		let casing = this.plugin.settings.book_name_capitalization;
		let delim = this.plugin.settings.book_name_delimiter;
		let book_name = "";
		let order = -1;
		let chapter = custom_chapter
		switch (tense) {
			case "current": {
				book_name = this.format_book_name_without_order(this.plugin, this.book, casing);
				order = this.book.id
				chapter = this.chapter
				break;
			}
			case "last": {
				book_name = this.format_book_name_without_order(this.plugin, this.prev_book, casing);
				order = this.prev_book.id
				chapter = this.prev_chapter
				break;
			}
			case "next": {
				book_name = this.format_book_name_without_order(this.plugin, this.next_book, casing);
				order = this.next_book.id
				chapter = this.next_chapter
				break;
			}
			case "first": {
				book_name = this.format_book_name_without_order(this.plugin, this.book, casing);
				order = this.book.id
				chapter = this.book.chapters.first() || 1
				break;
			}
			case "final": {
				book_name = this.format_book_name_without_order(this.plugin, this.book, casing);
				order = this.book.id
				chapter = this.book.chapters.last() || 1
				break;
			}
			case "custom": {
				book_name = this.format_book_name_without_order(this.plugin, this.book, casing);
				order = this.book.id
				chapter = custom_chapter;
				break;
			}
			default: throw new Error("Unmatched switch case at tense '{0}'".format(tense));
		}

		if (chapter == null) {
			throw new Error("Chapter is null");
		}

		return format
			.replace(/{book}/g, book_name)
			.replace(
				/{order}/g,
				String(order)
					.padStart(2 * Number(this.plugin.settings.padded_order), "0")
			)
			.replace(
				/{chapter}/g,
				String(chapter)
					.padStart(chapter_pad_by * Number(this.plugin.settings.padded_chapter), "0"),
			)
			.replace(/{translation}/g, String(this.translation))
	}

	format_verse_body(plugin:MyBible, build_with_dynamic_verses:boolean): string {
		let book_name = this.format_book_name_without_order(
			plugin,
			this.book,
			"current",
		);

		let verse_text = ""
		if (build_with_dynamic_verses) {
			verse_text = "``` verse\n"
				+ "{book_id} {chapter} {verse} \n"
				+ "```"
		} else {
			verse_text = this.translation_texts.books[this.book.id][this.chapter][this.verse]
			if (verse_text === undefined) {
				return ""
			}
			if (verse_text.contains("<")) {
				verse_text = verse_text
					.replace(/<\s*br\s*\/?>/g, "\n") // Breakline tag
					.replace(/<\s*i*\s*>\s*/g, "*") // Italics open tag
					.replace(/\s*<\/\s*i*\s*>/g, "*") // Italics open tag
					.replace(/<\/?\s*i*\s*\/?>/g, "*") // Italics general tag
					.replace(/<\/?\s*b*\s*\/?>/g, "**") // Bold tag
					.replace(/<\s*S*\s*>/g, "<sup>*") // Strong open
					.replace(/<\/\s*S*\s*>/g, "*</sup>") // Strong close
					.replace(/<\/?\s*\w*\s*\/?>/g, "") // Any other tags
				;
			}

		}

		return plugin.settings.verse_body_format
			.replace(/{verse_text}/g, verse_text)
			.replace(/{verse}/g, String(this.verse))
			.replace(/{book}/g, book_name)
			.replace(/{book_id}/g, String(this.book.id))
			.replace(
				/{order}/g,
				String(this.book.id)
					.padStart(2 * Number(plugin.settings.padded_order), "0")
			)
			.replace(/{chapter}/g, String(this.chapter))
			.replace(/{chapter_name}/g, this.format_chapter_name())
			.replace(/{final_chapter}/g, String(this.book.chapters))
			.replace(/{translation}/g, String(this.translation))
	}

	format_chapter_index(book: BookData): string {
		let book_name = this.format_book_name_without_order(
			this.plugin,
			book,
			this.plugin.settings.book_name_capitalization,
		);

		let chapter_links = ""

		// Format chapter links
		for (let i = 0; i != book.chapters.length; i++) {
			let chapter = book.get_chapter_number(i);
			let link = this.plugin.settings.chapter_index_link_format
				.replace(/{order}/g, String(book.id).padStart(2 * Number(this.plugin.settings.padded_order), "0"))
				.replace(/{book}/g, book_name)
				.replace(/{book_index}/g, this.format_chapter_index_name(book))
				.replace(/{translation}/g, String(this.translation))
				.replace(/{chapter}/g, String(chapter))
				.replace(/{chapter_name}/g, this.format_chapter_name("custom", chapter))
			;
			if (i != book.chapters.length-1) {
				link += "\n"
			}
			chapter_links += link
		}

		return this.plugin.settings.chapter_index_format
			.replace(/{order}/g, String(book.id).padStart(2 * Number(this.plugin.settings.padded_order), "0"))
			.replace(/{book}/g, book_name)
			.replace(/{book_index}/g, this.format_chapter_index_name(book))
			.replace(/{translation}/g, String(this.translation))
			.replace(/{index}/g, this.format_index_name())
			.replace(/{chapters}/g, chapter_links)
		;
	}

	format_chapter_index_name(book: BookData): string {
		let book_name = this.format_book_name_without_order(
			this.plugin,
			book,
			this.plugin.settings.book_name_capitalization,
		);
		return this.plugin.settings.chapter_index_name_format
			.replace(/{order}/g, String(book.id).padStart(2 * Number(this.plugin.settings.padded_order), "0"))
			.replace(/{book}/g, book_name)
			.replace(/{translation}/g, String(this.translation))
	}
	
	format_index_name(): string {
		return this.plugin.settings.index_name_format
			.replace(/{translation}/g, this.translation)
	}

	format_index(): string {
		let old_t_links = ""
		let new_t_links = ""
		let apocr_links = ""

		// Format all book links
		for (const i in this.books) {
			let book_name = this.format_book_name_without_order(
				this.plugin,
				this.books[i],
				this.plugin.settings.book_name_capitalization,
			);

			let link = this.plugin.settings.index_link_format
				.replace(/{order}/g, String(this.books[i].id).padStart(2 * Number(this.plugin.settings.padded_order), "0"))
				.replace(/{book}/g, book_name)
				.replace(/{book_index}/g, this.format_chapter_index_name(this.books[i]))
				.replace(/{translation}/g, String(this.translation))
				+ '\n'

			if (this.books[i].id < 40) {
				old_t_links += link 
			} else if (this.books[i].id < 67) {
				new_t_links += link 
			} else {
				apocr_links += link 
			}
		}

		old_t_links = old_t_links.slice(0, old_t_links.length-1)
		new_t_links = new_t_links.slice(0, new_t_links.length-1)
		apocr_links = apocr_links.slice(0, apocr_links.length-1)

		return this.plugin.settings.index_format
			.replace(/{translation}/g, this.translation)
			.replace(/{old_testament}/g, old_t_links)
			.replace(/{new_testament}/g, new_t_links)
			.replace(/{apocrypha}/g, apocr_links)
	}

	set_book(book:BookData) {
		this.book = book;

		let [next_book, next_chapter] = this.next_chapter_of(this.book, this.chapter)
		let [prev_book, prev_chapter] = this.prev_chapter_of(this.book, this.chapter)
		this.next_book = next_book
		this.next_chapter = next_chapter
		this.prev_book = prev_book
		this.prev_chapter = prev_chapter
	}

	next_chapter_of(
		book: BookData,
		chapter:number,
	): [next_book:BookData, next_chapter:number] {
		let next_book:BookData = book
		if (chapter === book.chapters.last()) {
			// This is the final chapter. Next book is not the same
			// as the current book
			let book_i = this.find_book(book.id)
			if (book_i == this.books.length-1) {
				// `book` is last book. Next book is first book
				next_book = this.books[0]
			} else {
				// Set next_book to book after current
				next_book = this.books[book_i+1]
			}
		}

		let next_chapter = chapter+1
		if (next_book.id !== book.id) {
			// Get first chapter of next book
			next_chapter = next_book.chapters[0]
		}

		return [next_book, next_chapter]
	}

	prev_chapter_of(
		book: BookData,
		chapter:number,
	): [prev_book:BookData, prev_chapter:number] {
		let prev_book:BookData = book
		if (chapter === book.chapters.first()) {
			// This is the first chapter. Previous book is not the same
			// as the current book
			let book_i = this.find_book(book.id)
			if (book_i == 0) {
				// `book` is first book. Previous book is final book
				prev_book = this.books[this.books.length-1]
			} else {
				// Set prev_book to book before current
				prev_book = this.books[book_i-1]
			}
		}

		let prev_chapter = chapter-1
		if (prev_book.id !== book.id) {
			// Get last chapter of previous book
			prev_chapter = prev_book.chapters[prev_book.chapters.length-1]
		}

		return [prev_book, prev_chapter]
	}

	set_chapter(chapter:number) {
		this.chapter = chapter
		this.set_book(this.book)
	}

	// Sets the capitalization of the given name depending on *name_case*.
	to_case(name:string, name_case:string, delimeter:string): string {
		name = name.replace(/ /g, delimeter)
		if (name_case == "lower_case") {
			name = name.toLowerCase()
		} else if (name_case == "upper_case") {
			name = name.toUpperCase()
		}
		return name;
	}

	get_verse_count():number {
		return this.verse_counts.get_count_for(this.book.id, this.chapter);
	}
}

class VerseCounts {
	books: Record<BookId, Record<number, number>>

	get_count_for(book:BookId, chapter:number): number {
		return this.books[book][chapter] || 0
	}
}

interface TranslationData {
	translation: string;
	books: Record<BookId, Record<number, ChapterData>>;
}
class BookData {
	/// The Book's numeric ID
	id: number;
	/// The chapters included in this book by their numeric order
	chapters: number[];
	/// The display name for the book
	name: string;

	constructor(id:number, name:string, chapters:number[]) {
		this.id = id
		this.name = name
		this.chapters = chapters
	}

	/// Returns the number of the chapter at index
	get_chapter_number(index:number): number {
		if (index >= this.chapters.length) {
			throw new Error("")
		}
		return this.chapters[index]
	}

	has_chapter(chapter:number): boolean {
		return this.chapters.find((value, _, __) => value === chapter) !== undefined
	}
}

type BookId = number;

/// A record of verses to texts
type ChapterData = Record<number, string>;

/// Ensures all coroutines wait for the same piece of code to finish
class SyncCache {
	syncs:Record<string, SyncCacheItem> = {}

	async sync(key:string, body:() => any): Promise<any> {
		if (!(key in this.syncs)) {
			this.syncs[key] = new SyncCacheItem()
		}
		let sync_item = this.syncs[key]

		sync_item.ref_count += 1


		try {
			await sync_item.mutex
				.acquire()
				.then(async () => {
					sync_item.data = await body()
	
					sync_item.mutex.cancel()
					sync_item.mutex.release()
				})
				.catch(e => {
					if (e === E_CANCELED) {
						/*pass*/
					} else {
						throw e
					}
				})
			;

		} finally {
			sync_item.ref_count -= 1
			if (sync_item.ref_count === 0) {
				delete this.syncs[key]
			}
		}
		
		
		return sync_item.data
	}
}
class SyncCacheItem {
	mutex: Mutex = new Mutex()
	data: any = null
	ref_count: number = 0
}

class BibleAPI {
	cache_clear_timer: Promise<null> | null = null;
	cache_clear_timer_promise_err: (reason?: any) => void;
	sync_cache: SyncCache = new SyncCache();
	plugin: MyBible;

	async _get_book_data(translation: string, book_id:BookId): Promise<BookData> {
		throw new Error("unimplemented")
	}

	async _get_books_data(translation: string): Promise<Array<BookData>> {
		throw new Error("unimplemented")
	}

	async _get_chapter(
		translation: string,
		book_id: number,
		chapter: number,
	): Promise<ChapterData> {
		throw new Error("unimplemented")
	}

	async _get_translation(translation: string): Promise<TranslationData> {
		throw new Error("unimplemented")
	}

	async _get_translations(): Promise<Translations> {
		throw new Error("unimplemented")
	}

	async get_default_translation(): Promise<string> {
		throw new Error("unimplemented")
	}

	async _get_verse(
		translation: string,
		book_id: number,
		chapter: number,
		verse: number,
	): Promise<string> {
		let chapter_data = await this.get_chapter(
			translation,
			book_id,
			chapter,
		);
		return chapter_data[verse] || "";
	}

	async _get_verse_count(translation:string): Promise<VerseCounts> {
		throw new Error("unimplemented")
	}

	/// Downloads a translation and saves it locally.
	async user_download_translation(translation:string) {
		let notify = new Notice(
			"Downloading {0} translation".format(translation),
			0,
		)

		let promises = []
		let translation_data = await this.get_translation(translation)
		for (const book_id_ in translation_data.books) {
			const book_id = Number(book_id_)
			const chapters = translation_data.books[book_id]
			for (const chapter_key of Object.keys(chapters)) {
				const chapter = Number(chapter_key)
				const chapter_data = chapters[chapter]
				promises.push(this.save_chapter_data(
					chapter_data,
					translation,
					book_id,
					chapter,
				))
			}
		}

		notify.hide()
		notify = new Notice("Saving {0} translation files".format(translation), 0)
		await Promise.all(promises)

		notify.hide()
		new Notice("Download complete")
	}

	// Get book ID from translation and book name
	async book_id(translation:string, book_name:string): Promise<number> {
		let books = await this.get_books_data(translation);
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

	async get_book_data(translation: string, book_id:BookId): Promise<BookData> {
		let book_key = "{0} {1}".format(translation, String(book_id));

		let data = await this.sync_cache.sync(
			"get_book_data_" + book_key,
			() => this._get_book_data(translation, book_id),
		)

		if (data == null) {
			throw new Error();
		}

		return data;
	}

	async get_books_data(translation: string): Promise<Array<BookData>> {
		return await this.sync_cache.sync(
			"get_books_data_" + translation,
			() => this._get_books_data(translation),
		)
	}

	async cache_chapter(
		translation: string,
		book_id: number,
		chapter: number,
		chapter_data: ChapterData | null,
		save_locally: boolean,
	): Promise<void> {
		let key = this.make_chapter_key(translation, book_id, chapter);

		// Save chapter to local file sytem
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
				this.make_chapter_file(chapter_data),
			);
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
			.then(() => this.clear_local_files())
			.catch(err => { });
	}

	async get_chapter(
		translation: string,
		book_id: number,
		chapter: number,
	): Promise<ChapterData> {
		let chapter_key = this.make_chapter_key(translation, book_id, chapter);

		let file_name = this.make_chapter_file_name(translation, book_id, chapter)

		let download_path = this.get_download_path()
		this.plugin.app.vault.adapter.mkdir(download_path)
		let download_file_path = normalizePath(
			download_path + "/" + file_name
		)

		let cache_path = this.get_cache_path()
		this.plugin.app.vault.adapter.mkdir(cache_path)
		let cached_file_path = normalizePath(
			cache_path + "/" + file_name
		)

		let data = await this.sync_cache.sync(
			"get_chapter_"+chapter_key,
			async () => {
				// Attempt to load chapter locally
				if ( await this.plugin.app.vault.adapter
					.exists(download_file_path)
				) {
					// Load from download
					return await this.load_chapter_file(download_path, file_name)
				} else if ( await this.plugin.app.vault.adapter
					.exists(cached_file_path)
				) {
					// Load from cache
					return await this.load_chapter_file(cache_path, file_name)
				}

				// Fetch chapter from the web
				return await this._get_chapter(
					translation,
					book_id,
					chapter,
				);
			},
		)

		if (
			data === null
			|| Object.keys(data).length == 0
		) {
			// Failed to load or download chapter
			return [];
		}

		new Promise(async (ok, err) => {
			// Cache chapter if not downloaded
			try {
				if (
					!await this.plugin.app.vault.adapter
						.exists(download_file_path)
				) {
					this.cache_chapter(
						translation,
						book_id,
						chapter,
						data,
						this.plugin.settings.store_locally,
					);
				}
				ok(null)
			} catch (e) {
				err(e)
			}
		})

		return data;
	}

	get_cache_path(): string {
		return normalizePath(this.plugin.manifest.dir + "/.mybiblecache");
	}

	get_download_path(): string {
		return normalizePath(this.plugin.manifest.dir + "/.chapters");
	}

	async get_translation(translation: string): Promise<TranslationData> {
		return await this.sync_cache.sync(
			"get_translation_" + translation,
			() => this._get_translation(translation),
		)
	}

	async _get_default_translation(): Promise<string> {
		return await this.sync_cache.sync(
			"get_default_translation",
			() => this._get_default_translation(),
		)
	}

	async get_translations(): Promise<Translations> {
		return await this.sync_cache.sync(
			"get_translations",
			() => this._get_translations(),
		)
	}

	async get_verse(
		translation: string,
		book_id: number,
		chapter: number,
		verse: number,
	): Promise<string> {
		let key = "get_verse_{0}_{1}_{2}_{3}".format(translation, String(book_id), String(chapter), String(verse))
		return await this.sync_cache.sync(
			key,
			() => this._get_verse(
				translation,
				book_id,
				chapter,
				verse,
			),
		)
	}

	async get_verse_count(translation:string): Promise<VerseCounts> {
		return await this.sync_cache.sync(
			"get_verse_count_"+translation,
			() => this._get_verse_count(translation),
		)
	}

	async clear_local_files() {
		this.cache_clear_timer = null;

		let cache_path = this.get_cache_path();
		if (await this.plugin.app.vault.adapter.exists(cache_path)) {
			if (!await this.plugin.app.vault.adapter.trashSystem(cache_path)) {
				await this.plugin.app.vault.adapter.trashLocal(cache_path);
			}
		}

		let download_path = this.get_download_path();
		if (await this.plugin.app.vault.adapter.exists(download_path)) {
			if (!await this.plugin.app.vault.adapter.trashSystem(download_path)) {
				await this.plugin.app.vault.adapter.trashLocal(download_path);
			}
		}
	}

	async load_chapter_file(folder:string, path: string): Promise<ChapterData> {
		this.plugin.app.vault.adapter.mkdir(folder)
		let raw = await this.plugin.app.vault.adapter
			.read(folder + "/" + path)
		;
		
		let verse_list = []
		if (raw.startsWith("[")) {
			verse_list = JSON.parse(raw)
		} else {
			verse_list = raw.split("\n")
		}
		
		let verses:ChapterData = {}
		for (let i = 0; i != verse_list.length; i++) {
			if (verse_list[i].length == 0) {
				continue
			}
			verses[i+1] = verse_list[i]
		}
		return verses
	}

	make_chapter_file(chapter_data:ChapterData): string {
		let added_verse_count = 0
		let body = "";
		for (let i = 1; added_verse_count !== Object.keys(chapter_data).length; i++) {
			if (i in chapter_data) {
				body += chapter_data[i]
				added_verse_count += 1
			}
			if (added_verse_count !== Object.keys(chapter_data).length) {
				body += "\n"
			}
		}
		
		return body
	}

	/// Makes the file name for downloaded chapters
	make_chapter_file_name(translation: string, book_id: number, chapter: Number): string {
		return "{0} {1} {2}.txt".format(translation, String(book_id), String(chapter));
		
	}

	make_chapter_key(translation: string, book_id: number, chapter: Number) {
		return "{0}.{1}.{2}".format(translation, String(book_id), String(chapter));
	}

	/// Saves chapter data to local disk
	async save_chapter_data(
		chapter_data:ChapterData,
		translation:string,
		book_id:number,
		chapter:number,
	) {
		// Save chapter to local file sytem
		let path = this.get_download_path();
		this.plugin.app.vault.adapter.mkdir(path);
		let file_name = this
			.make_chapter_file_name(translation, book_id, chapter);
		let file_path = normalizePath(
			path + "/" + file_name,
		);
		if (
			!await this.plugin.app.vault.adapter.exists(file_path)
		) {
			let body = "";
			for (const i_ in chapter_data) {
				const i = Number(i_)
				body += chapter_data[i];
				if (i !== Object.keys(chapter_data).length) {
					body += "\n"
				}
			}
			await this.plugin.app.vault.adapter.write(
				file_path,
				body,
			);
		}
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
	plugin: MyBible
	translations: Translations = {}
	translation_maps: Record<string, Array<BookData>> = {}
	cache_clear_timer: Promise<null> | null = null
	sync_cache: SyncCache = new SyncCache()

	async _get_chapter(
		translation: string,
		book_id: number,
		chapter: number,
	): Promise<ChapterData> {
		// Fetch chapter from the web
		try {
			let verse_data_list = JSON.parse(await httpGet(
				"https://bolls.life/get-chapter/{0}/{1}/{2}/"
					.format(translation, String(book_id), String(chapter))
			));

			let texts:ChapterData = {}
			for (const data of verse_data_list) {
				let verse = data["verse"]
				texts[verse] = data["text"]
			}

			return texts
		} catch (e) {
			if (e instanceof Error && e.message.startsWith("No book exists by name")) {
				return [];
			}
			throw e;
		}
	}

	async _get_translation(translation: string): Promise<TranslationData> {
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
			try {
				let i = 0;
				let curr_book_id = -1;
				let curr_chapter = -1;
				for (const data of verses) {
					let verse = data["verse"]
	
					curr_book_id = data["book"]
					curr_chapter = data["chapter"]
	
					if (!(curr_book_id in bible.books)) {
						bible.books[curr_book_id] = []	
					}
					if (!(curr_chapter in bible.books[curr_book_id])) {
						bible.books[curr_book_id][curr_chapter] = {}
					}
	
					bible.books[curr_book_id][curr_chapter][verse] = data["text"]
					i += 1;
				}
				ok(null);
			} catch (e) {
				err(e)
			}
		}).catch(e => {
			throw e
		})

		return bible;
	}

	async _get_book_data(translation: string, book_id:BookId): Promise<BookData> {
		let books = await this.get_books_data(translation);
		for (let book of books) {
			if (book.id == book_id) {
				return book;
			}
		}
		throw new Error();
	}

	async _get_books_data(translation: string): Promise<BookData[]> {
		let books = await this.get_translation_map(translation);
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

	async _get_default_translation(): Promise<string> {
		return "YLT";
	}

	async _get_translations(): Promise<Translations> {
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

	async _get_verse_count(translation:string): Promise<VerseCounts> {
		let json = JSON.parse(await httpGet(
			"https://bolls.life/get-verse-counts/{0}/".format(translation)
		));
		let counts = new VerseCounts();
		counts.books = json;
		return counts
	}

	async book_to_id(translation: string, book: string): Promise<number> {
		let book_ = book.toLowerCase();
		let map = await this.get_translation_map(translation);
		for (let i in map) {
			let book_data = map[i];
			if (book_ == book_data["name"].toLowerCase()) {
				return Number(i) + 1;
			}
		}
		throw new Error('No book exists by name {0}.'.format(book));
	}

	chapter_key(translation: string, book_id: number, chapter: Number) {
		return "{0}.{1}.{2}".format(translation, String(book_id), String(chapter));
	}

	async generate_translation_map(translation: string) {
		let map: Array<Record<string, any>> = await requestUrl(
			"https://bolls.life/get-books/{0}/".format(translation)
		).json;
		let book_data: Array<BookData> = [];
		for (let item of map) {
			let chapter_list = [...Array(item["chapters"]).keys()].map(x => x+1)
			book_data.push(new BookData(
				item["bookid"],
				item["name"],
				chapter_list,
			));
		}
		this.translation_maps[translation] = book_data;
	}

	async id_to_book(translation: string, book_id: number): Promise<string> {
		let map = await this.get_translation_map(translation);
		return map[book_id - 1]["name"];
	}

	async get_translation_map(translation: string): Promise<Array<BookData>> {
		if (!(translation in this.translation_maps)) {
			await this.generate_translation_map(translation);
		}
		return this.translation_maps[translation];
	}
}

class BuilderModal extends Modal {
	plugin: MyBible

	constructor(app: App, plugin: MyBible) {
		super(app);
		this.plugin = plugin;
		this.render();
	}

	render() {
		let containerEl = this.contentEl;

		new Setting(containerEl).nameEl.createEl("h1", { text: "Book builder" })

		// Top settings

		this.renderBibleFolder(new Setting(containerEl));

		new Setting(containerEl)
			.setName('Translation')
			.setDesc('Builds your Bible according to the layout of this tranlsation. If "Build with dynamic verses" is active, then the text from this version will be built into your Bible.')
			.addDropdown(async drop => {
				drop.addOption(SELECTED_TRANSLATION_OPTION_KEY, SELECTED_TRANSLATION_OPTION.format(this.plugin.settings.reading_translation))

				let translations = await this.plugin.bible_api.get_translations();
				
				let translations_list = [];
				for (const key in translations) {
					translations_list.push(key);
				}
				translations_list = translations_list.sort((a, b) => {
					if (translations[a].language < translations[b].language) {
						return -1;
					}
					if (translations[a].language > translations[b].language) {
						return 1;
					}

					if (a < b) {
						return -1;
					}
					if (a > b) {
						return 1;
					}

					return 0;
				})

				for (const i in translations_list) {
					let key = translations_list[i];
					drop.addOption(
						key,
						translation_to_display_name(translations[key]),
					);
				}
				drop.onChange(async value => {
					await this.plugin.settings.set_translation(value, this.plugin);
					await this.plugin.saveSettings();
				})
				drop.setValue(this.plugin.settings.translation);
			})
		;

		this.renderBuildButton(new Setting(containerEl));

		// Chapters

		new Setting(containerEl).nameEl.createEl("h3", { text: "Chapters" })
		
		this.renderChapterName(new Setting(containerEl));

		this.renderChapterFormat(new Setting(containerEl));
					
		new Setting(containerEl)
			.setName('Pad numbers')
			.setDesc('When active, pads chapter numbers with extra zeros. For example, "Psalms 5" becomes "Psalms 005".')
			.addToggle(toggle => toggle
				.setTooltip("Toggle alignment padding of chapter numbers")
				.setValue(this.plugin.settings.padded_chapter)
				.onChange(async (value) => {
					this.plugin.settings.padded_chapter = value;
					await this.plugin.saveSettings();
				}))

		// Verses

		new Setting(containerEl).nameEl.createEl("h3", { text: "Verses" })

		this.renderVerseFormat(new Setting(containerEl))

		new Setting(containerEl)
			.setName('Build with dynamic verses')
			.setDesc('When active, your Bible will be built with verse references that can be quickly changed when you switch translations. When inactive, the text of the translation is built directly into your Bible.')
			.addToggle(toggle => toggle
				.setTooltip("Toggle generating with dynamic verses")
				.setValue(this.plugin.settings.build_with_dynamic_verses)
				.onChange(async (value) => {
					this.plugin.settings.build_with_dynamic_verses = value;
					await this.plugin.saveSettings();
				}))

		// Books
		let books_header = new Setting(containerEl)
		books_header.nameEl.createEl("h3", { text: "Books" })
		books_header.addToggle(toggle => {toggle
			.setTooltip("Toggle if books should generate folders")
				.setValue(this.plugin.settings.book_folders_enabled)
				.onChange(async value => {
					this.plugin.settings.book_folders_enabled = value;
					await this.plugin.saveSettings();
				})
		})
		this.renderBookFormat(new Setting(containerEl));
		this.renderNameDelimeter(new Setting(containerEl));
		this.renderBookCapitalization(new Setting(containerEl));
		this.renderBookAbbreviation(new Setting(containerEl));
		this.renderPaddedOrderNums(new Setting(containerEl));

		// Book index
		let index_header  = new Setting(containerEl)
		let index_name  = new Setting(containerEl)
		let index_links  = new Setting(containerEl)
		let index_body  = new Setting(containerEl)
		index_header
			.addToggle(toggle => {toggle
				.setTooltip("Toggle book index generation")
				.setValue(this.plugin.settings.index_enabled)
				.onChange(async value => {
					this.plugin.settings.index_enabled = value;
					await this.plugin.saveSettings();
				})
			})
			.nameEl.createEl("h3", { text: "Book index" })
		;

		this.renderIndexName(index_name)
		this.renderIndexBookLink(index_links)
		this.renderIndexBody(index_body)

		// Chapter index
		let chapter_index_header  = new Setting(containerEl)
		let chapter_index_name  = new Setting(containerEl)
		let chapter_index_links  = new Setting(containerEl)
		let chapter_index_body  = new Setting(containerEl)
		chapter_index_header
			.addToggle(toggle => {toggle
				.setTooltip("Toggle chapter index generation")
				.setValue(this.plugin.settings.chapter_index_enabled)
				.onChange(async value => {
					this.plugin.settings.chapter_index_enabled = value;
					await this.plugin.saveSettings();
				})
			})
			.nameEl.createEl("h3", { text: "Chapter indexs" })
		;
		this.renderChapterIndexName(chapter_index_name)
		this.renderChapterIndexLink(chapter_index_links)
		this.renderChapterIndexBody(chapter_index_body)

		// After

		this.renderBuildButton(new Setting(containerEl));
	}

	// Top renderers

	renderBibleFolder(setting: Setting) {
		setting.clear()
		setting
			.setName('Folder')
			.setDesc('The path to the folder where your Bible will be placed. The folder should be empty for your Bible. If the path does not exist it will be created.')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.bible_folder
						= DEFAULT_SETTINGS.bible_folder;
					this.renderBibleFolder(setting);
					await this.plugin.saveSettings();
				})
			)
			.addText(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.bible_folder)
				.setValue(this.plugin.settings.bible_folder)
				.onChange(async (value) => {
					this.plugin.settings.bible_folder = value;
					await this.plugin.saveSettings();
				})
			)
		;
	}

	renderBuildButton(setting: Setting) {
		setting
			.addButton(btn => btn
				.setButtonText("Build")
				.setTooltip("Build your bible")
				.setCta()
				.onClick(async _ => {
					this.close()
					await this.plugin.build_bible()
				})
			)
		;
	}

	// Book renderers

	renderBookFormat(setting: Setting) {
		setting.clear()
		setting
			.setName('Name format')
			.setDesc('The format for the names of the folders of each book of the bible. For example, "{order} {name}" would become "2 Exodus". Leave blank to not have folders for each book.')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.book_name_format
						= DEFAULT_SETTINGS.book_name_format;
					this.renderBookFormat(setting);
					await this.plugin.saveSettings();
				})
			)
			.addText(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.book_name_format)
				.setValue(this.plugin.settings.book_name_format)
				.onChange(async (value) => {
					this.plugin.settings.book_name_format = value;
					await this.plugin.saveSettings();
				})
			)
		;
	}

	renderBookAbbreviation(setting: Setting) {
		setting.clear()
		setting
			.setName('Abbreviate names')
			.setDesc('When active, The names of books will be abbreviated to three letters. For example, "Genesis" becomes "Gen" and "1 Kings" becomes "1Ki". (May cause issues in some translations.)')
			.addToggle(toggle => toggle
				.setTooltip("Toggle book name abbreviation")
				.setValue(this.plugin.settings.book_name_abbreviated)
				.onChange(async (value) => {
					this.plugin.settings.book_name_abbreviated = value;
					await this.plugin.saveSettings();
				})
			)
		;
	}

	renderBookCapitalization(setting: Setting) {
		setting.clear()
		setting
			.setName('Name capitalization')
			.setDesc('Dictates the capitalization of book names.')
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
		;
	}

	renderNameDelimeter(setting: Setting) {
		setting.clear()
		setting
			.setName('Name delimiter')
			.setDesc('The characters separating words in book names, such as the spaces in "1 John" or "Song of Solomon".')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.book_name_delimiter
						= DEFAULT_SETTINGS.book_name_delimiter;
					this.renderNameDelimeter(setting);
					await this.plugin.saveSettings();
				})
			)
			.addText(text => text
				.setPlaceholder('Example: "' + DEFAULT_SETTINGS.book_name_delimiter + '"')
				.setValue(this.plugin.settings.book_name_delimiter)
				.onChange(async (value) => {
					this.plugin.settings.book_name_delimiter = value;
					await this.plugin.saveSettings();
				})
			)
		;
	}

	renderPaddedOrderNums(setting: Setting) {
		setting.clear()
		setting
			.setName('Pad order numbers')
			.setDesc('When Active, pads order numbers with extra zeros. For example, "1 Genesis" would become "01 Gensis" when active.')
			.addToggle(toggle => toggle
				.setTooltip("Toggle alignment padding of book order numbers")
				.setValue(this.plugin.settings.padded_order)
				.onChange(async (value) => {
					this.plugin.settings.padded_order = value;
					await this.plugin.saveSettings();
				})
			)
		;
	}

	// Chapter renderers

	renderChapterFormat(setting: Setting) {
		setting.clear()
		setting
			.setName('Body format')
			.setDesc('The format for the contents of chapters.')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.chapter_body_format
						= DEFAULT_SETTINGS.chapter_body_format;
					this.renderChapterFormat(setting);
					await this.plugin.saveSettings();
				})
			)
			.addTextArea(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.chapter_body_format)
				.setValue(this.plugin.settings.chapter_body_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_body_format = value;
					await this.plugin.saveSettings();
					}
				)
			)
		;
	}

	renderChapterName(setting: Setting) {
		setting.clear()
		setting
			.setName('Name format')
			.setDesc('The format for the names of chapters. For example, "{book} {chapter}" would become "Psalms 23".')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.chapter_name_format
						= DEFAULT_SETTINGS.chapter_name_format;
					this.renderChapterName(setting);
					await this.plugin.saveSettings();
				})
			)
			.addText(text => text
				.setPlaceholder(this.plugin.settings.chapter_name_format)
				.setValue(this.plugin.settings.chapter_name_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_name_format = value;
					await this.plugin.saveSettings();
				})
			)
		;
	}

	// Verse renders

	renderVerseFormat(setting: Setting) {
		setting.clear()
		setting
			.setName('Format')
			.setDesc('Formatting for individual verses.')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.verse_body_format
						= DEFAULT_SETTINGS.verse_body_format;
					this.renderVerseFormat(setting);
					await this.plugin.saveSettings();
				})
			)
			.addTextArea(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.verse_body_format)
				.setValue(this.plugin.settings.verse_body_format)
				.onChange(async (value) => {
					this.plugin.settings.verse_body_format = value;
					await this.plugin.saveSettings();
				})
			)
		;
	}

	// Book index

	renderIndexName(setting: Setting) {
		setting.clear()
		setting
			.setName('Name format')
			.setDesc('The format for the name of the book index.')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.index_name_format
						= DEFAULT_SETTINGS.index_name_format;
					this.renderIndexName(setting);
					await this.plugin.saveSettings();
				})
			)
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.index_name_format)
				.setValue(this.plugin.settings.index_name_format)
				.onChange(async (value) => {
					this.plugin.settings.index_name_format = value;
					await this.plugin.saveSettings();
				})
			)
		;
	}

	renderIndexBookLink(setting: Setting) {
		setting.clear()
		setting
			.setName('Book element format')
			.setDesc('The format for each book element in a list.')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.index_link_format
						= DEFAULT_SETTINGS.index_link_format;
					this.renderIndexBookLink(setting);
					await this.plugin.saveSettings();
				})
			)
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.index_link_format)
				.setValue(this.plugin.settings.index_link_format)
				.onChange(async (value) => {
					this.plugin.settings.index_link_format = value;
					await this.plugin.saveSettings();
				})
			)
		;
		setting.setDisabled(!this.plugin.settings.index_enabled)
	}

	renderIndexBody(setting: Setting) {
		setting.clear()
		setting
			.setName('Body format')
			.setDesc('The format for the content of the book index.')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.index_format
						= DEFAULT_SETTINGS.index_format;
					this.renderIndexBody(setting);
					await this.plugin.saveSettings();
				})
			)
			.addTextArea(text => text
				.setPlaceholder(DEFAULT_SETTINGS.index_format)
				.setValue(this.plugin.settings.index_format)
				.onChange(async (value) => {
					this.plugin.settings.index_format = value;
					await this.plugin.saveSettings();
				})
			)
		;
		setting.setDisabled(!this.plugin.settings.index_enabled)
	}

	// Chapter index

	renderChapterIndexName(setting: Setting) {
		setting.clear()
		setting
			.setName('Name format')
			.setDesc('The format for the name of the chapter index.')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.chapter_index_name_format
						= DEFAULT_SETTINGS.chapter_index_name_format;
					this.renderChapterIndexName(setting);
					await this.plugin.saveSettings();
				})
			)
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.chapter_index_name_format)
				.setValue(this.plugin.settings.chapter_index_name_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_index_name_format = value;
					await this.plugin.saveSettings();
				})
			)
		;
		setting.setDisabled(!this.plugin.settings.index_enabled)
	}

	renderChapterIndexLink(setting: Setting) {
		setting.clear()
		setting
			.setName('Chapter element format')
			.setDesc('The format for each chapter element in a list.')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.chapter_index_link_format
						= DEFAULT_SETTINGS.chapter_index_link_format;
					this.renderChapterIndexLink(setting);
					await this.plugin.saveSettings();
				})
			)
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.chapter_index_link_format)
				.setValue(this.plugin.settings.chapter_index_link_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_index_link_format = value;
					await this.plugin.saveSettings();
				})
			)
		;
		setting.setDisabled(!this.plugin.settings.index_enabled)
	}

	renderChapterIndexBody(setting: Setting) {
		setting.clear()
		setting
			.setName('Chapter format')
			.setDesc('The format for the content of the chapter index.')
			.addExtraButton(btn => btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset value")
				.onClick(async () => {
					this.plugin.settings.chapter_index_format
						= DEFAULT_SETTINGS.chapter_index_format;
					this.renderChapterIndexBody(setting);
					await this.plugin.saveSettings();
				})
			)
			.addTextArea(text => text
				.setPlaceholder(DEFAULT_SETTINGS.chapter_index_format)
				.setValue(this.plugin.settings.chapter_index_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_index_format = value;
					await this.plugin.saveSettings();
				})
			)
		;
		setting.setDisabled(!this.plugin.settings.index_enabled)
	}

	refresh() {
		this.contentEl.empty()
		this.render()
	}
}

class ErrorModal extends Modal {
	plugin: MyBible
	title: string
	body: string

	constructor(app: App, plugin: MyBible, title:string, body:string) {
		super(app);
		this.plugin = plugin;
		this.title = title;
		this.body = body;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h1", { text: this.title });
		contentEl.createEl("span", { text: this.body });

		contentEl.createEl("p", {});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Close")
					.onClick(() => {
						this.close();
					})
			)
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ClearLocalFilesModal extends Modal {
	plugin: MyBible;

	constructor(app: App, plugin: MyBible) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;

		let bible_path = this.plugin.settings.bible_folder;

		contentEl.createEl("h1", { text: "Clear local files?" });
		contentEl.createEl("span", {
			text: "You are about to clear out all files added by My Bible from your file system. This includes temporay cached chapters and translations you manually downloaded."
				.format(bible_path)
		});
		contentEl.createEl("p", {
			text: "Do you want to clear these files?"
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
					.setButtonText("Clear files")
					.setCta()
					.onClick(async () => {
						this.close();
						await this.plugin.bible_api.clear_local_files();
						new Notice("Files cleared!");
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ClearOldBibleFilesModal extends Modal {
	plugin: MyBible

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
						await this.plugin._build_bible(bible_path);
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Clear and build")
					.setCta()
					.onClick(async () => {
						this.close();
						let notice = new Notice("Clearing bible folder...", 0)

						let abstract = this.app.vault.getAbstractFileByPath(
							normalizePath(bible_path,)
						);
						if (abstract != null) {
							await this.app.vault.delete(abstract, true);
						}
						this.app.vault.adapter.mkdir(normalizePath(bible_path));

						notice.hide()
						await this.plugin._build_bible(bible_path);
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
		for (const book_id in bible.books) {
			for (const chapter_key of Object.keys(bible.books[book_id])) {
				const chapter = Number(chapter_key)
				await this.plugin.bible_api.cache_chapter(
					translation,
					Number(book_id),
					chapter + 1,
					bible.books[book_id][chapter],
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
  
export class QuickChangeTranslationeModal extends FuzzySuggestModal<Translation> {
	plugin: MyBible
	translations: Translations
	onChose: (chosen:Translation) => (void|Promise<void>) | null

	constructor(plugin: MyBible) {
		super(plugin.app);
		this.plugin = plugin;
	}

	// Returns all available suggestions.
	getItems(): Translation[] {
		let translations_list = Object.keys(this.translations).map(k => this.translations[k])
		return translations_list
	}

	getItemText(item:Translation):string {
		return translation_to_display_name(item)
	}

	// Perform action on the selected suggestion.
	onChooseItem(item: Translation, evt: MouseEvent | KeyboardEvent) {
		if (this.onChose !== null) {
			this.onChose(item)
		}
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
			.setDesc('The version of the Bible that will be displayed in dynamic verses.')
			.addDropdown(async drop => {
				let translations = await this.plugin.bible_api.get_translations();
				
				let translations_list = [];
				for (const key in translations) {
					translations_list.push(key);
				}
				translations_list = translations_list.sort((a, b) => {
					if (translations[a].language < translations[b].language) {
						return -1;
					}
					if (translations[a].language > translations[b].language) {
						return 1;
					}

					if (a < b) {
						return -1;
					}
					if (a > b) {
						return 1;
					}

					return 0;
				})

				for (const i in translations_list) {
					let key = translations_list[i];
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
					this.plugin.settings.reading_translation = value;
					await this.plugin.saveSettings();
				})
				drop.setValue(this.plugin.settings.reading_translation);
			})
		;
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
	"3 Maccabees": 76,
	"2 Esdras": 77,
	"Susanna": 78,
	"Bel and Dragon": 79,
	"4 Maccabees": 80,
	"Greek Additions to Esther": 81,
	"3 Holy Children's Song": 82,
	"Prayer of Manasseh": 83,
	"Azariah": 88, // Jump in number
}